import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";

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
