import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { logDiag } from '@/lib/diagnostics';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://wvqeubhupkddtkcdwqcm.supabase.co";

// Supports both env var names. VITE_SUPABASE_ANON_KEY is the standard name;
// VITE_SUPABASE_PUBLISHABLE_KEY is an alias some setups use.
// If both are missing, throw early so the problem is obvious in the console.
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!SUPABASE_ANON_KEY) {
  console.error(
    "[Supabase] VITE_SUPABASE_ANON_KEY is not set. " +
    "Add it to your Vercel environment variables. " +
    "All edge function calls will fail with 401/403 until this is fixed."
  );
}

// ── iOS-safe storage adapter ──────────────────────────────────────────────
// iOS Safari in Private/Incognito mode throws QuotaExceededError on any
// localStorage.setItem() call (storage quota is 0 in private mode).
// This crashes the Supabase auth initialisation and produces a white screen.
// We wrap every operation in try/catch and fall back to an in-memory store
// so the app always loads — sessions just won't persist across tabs in
// private mode, which is expected behaviour.
const memoryStore: Record<string, string> = {};

// Logged at most once per session — setItem fires constantly (every token
// refresh etc.), so this only needs to flag THAT real localStorage is
// unavailable, not spam an entry for every call.
let loggedStorageFallback = false;
function flagStorageFallback(op: string, err: unknown) {
  if (loggedStorageFallback) return;
  loggedStorageFallback = true;
  logDiag("supabase_storage_fallback_to_memory", {
    op,
    errName: err instanceof Error ? err.name : typeof err,
    errMessage: err instanceof Error ? err.message : String(err),
  });
}

// ── IndexedDB mirror ──────────────────────────────────────────────────────
// Some phones / in-app browsers / "clean up" apps wipe localStorage while the app is closed, which
// silently logs the student out. The session is therefore ALSO kept in IndexedDB and restored from
// there if localStorage comes back empty. It is removed from both only on a real sign-out.
const IDB_NAME = "tahleem-auth";
const IDB_STORE = "kv";
let idbPromise: Promise<IDBDatabase | null> | null = null;
function idbOpen(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return idbPromise;
}
async function idbGet(key: string): Promise<string | null> {
  const db = await idbOpen();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbSet(key: string, value: string): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
async function idbDel(key: string): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}

const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch (err) {
      flagStorageFallback("getItem", err);
      if (memoryStore[key] != null) return memoryStore[key];
    }
    // localStorage empty (wiped?) -> restore from the IndexedDB mirror
    const mirrored = await idbGet(key);
    if (mirrored != null) {
      try { localStorage.setItem(key, mirrored); } catch { memoryStore[key] = mirrored; }
    }
    return mirrored;
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      flagStorageFallback("setItem", err);
      memoryStore[key] = value;
    }
    void idbSet(key, value);
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      flagStorageFallback("removeItem", err);
      delete memoryStore[key];
    }
    void idbDel(key);
  },
};

// ── "Was this sign-out the student's own choice?" ──────────────────────────
// A SIGNED_OUT event can also come from a failed background token refresh or another tab. Only an
// explicit Sign out should end the session; AuthContext uses these to tell the two apart.
let userInitiatedSignOut = false;
export const markUserSignOut = () => { userInitiatedSignOut = true; };
export const clearUserSignOutMark = () => { userInitiatedSignOut = false; };
export const wasUserSignOut = () => userInitiatedSignOut;

// Last known-good refresh token, kept separately so an unexpected sign-out can be recovered from.
const SESSION_BACKUP_KEY = "tahleem-session-backup";
export async function backupSession(refreshToken: string | null | undefined): Promise<void> {
  if (!refreshToken) return;
  safeStorage.setItem(SESSION_BACKUP_KEY, refreshToken);
}
export async function readSessionBackup(): Promise<string | null> {
  return safeStorage.getItem(SESSION_BACKUP_KEY);
}
export function clearSessionBackup(): void {
  safeStorage.removeItem(SESSION_BACKUP_KEY);
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: safeStorage,   // ← was: localStorage (crashes iOS Private mode)
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);

// ── Detect a persisted-but-not-yet-resolved session ─────────────────────────
// Supabase-js stores the session under a key shaped "sb-<project-ref>-auth-token".
// Used by AuthContext's safety timeout: if this returns true, the person WAS
// signed in on this device (the token is sitting right there in storage) and
// we're just waiting on a slow network/auth check — not a real logged-out
// state — so we must not bounce them to /login just because that check is
// running late.
export function hasPersistedSupabaseSession(): boolean {
  try {
    return Object.keys(localStorage).some(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
  } catch {
    return false;
  }
}
