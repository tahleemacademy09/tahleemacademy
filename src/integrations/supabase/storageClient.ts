/*
  storageClient.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  This client connects to the SECOND Supabase project used exclusively
  for file storage (buckets, uploads, downloads).

  First Supabase (client.ts)  → database tables, auth, realtime
  This client (storageClient) → ALL supabase.storage.from(...) calls

  SETUP: Add to Vercel env vars:
    VITE_STORAGE_SUPABASE_URL      = https://ovgsleayannsxifhiraw.supabase.co
    VITE_STORAGE_SUPABASE_ANON_KEY = your-second-project-anon-key
*/
import { createClient } from '@supabase/supabase-js';

const STORAGE_URL =
  import.meta.env.VITE_STORAGE_SUPABASE_URL ||
  "https://ovgsleayannsxifhiraw.supabase.co";

const STORAGE_ANON_KEY =
  import.meta.env.VITE_STORAGE_SUPABASE_ANON_KEY || "";

if (!STORAGE_ANON_KEY) {
  console.warn("[StorageClient] VITE_STORAGE_SUPABASE_ANON_KEY not set — uploads will fail");
}

export const storageSupabase = createClient(STORAGE_URL, STORAGE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
