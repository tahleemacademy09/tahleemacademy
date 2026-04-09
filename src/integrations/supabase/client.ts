import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Reads from Vercel env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
// Falls back to hardcoded values so local dev still works without a .env file
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://ovgsleayannsxifhiraw.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!SUPABASE_ANON_KEY) {
  console.error(
    "[Supabase] VITE_SUPABASE_ANON_KEY is not set. " +
    "Add it to your Vercel environment variables."
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
