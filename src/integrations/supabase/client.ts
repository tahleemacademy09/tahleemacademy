import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

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

const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryStore[key] ?? null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStore[key] = value;
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      delete memoryStore[key];
    }
  },
};

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
