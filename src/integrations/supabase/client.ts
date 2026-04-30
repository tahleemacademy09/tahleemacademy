import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY 
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || "";

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
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: safeStorage,   // ← was: localStorage (crashes iOS Private mode)
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);
