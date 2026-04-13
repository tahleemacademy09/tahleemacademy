/*
  storageClient.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Connects to the dedicated storage Supabase project.

  To diagnose issues, open browser DevTools console and run:
    testStorage()

  (The function is exposed on window automatically in dev mode)
*/
import { createClient } from '@supabase/supabase-js';

const STORAGE_URL =
  import.meta.env.VITE_STORAGE_SUPABASE_URL ||
  "https://ovgsleayannsxifhiraw.supabase.co";

const STORAGE_KEY =
  import.meta.env.VITE_STORAGE_SUPABASE_ANON_KEY || "";

// ── Startup diagnostics ────────────────────────────────────────────────
console.group("[StorageClient] Startup check");
console.log("URL :", STORAGE_URL);
console.log(
  "KEY :",
  STORAGE_KEY
    ? `${STORAGE_KEY.slice(0, 20)}…  (${STORAGE_KEY.length} chars)`
    : "❌ EMPTY — every upload will fail with 401 Unauthorized"
);
if (!STORAGE_KEY) {
  console.error(
    "[StorageClient] VITE_STORAGE_SUPABASE_ANON_KEY is not set.\n\n" +
    "To fix on Vercel (live site):\n" +
    "  1. Go to Vercel → your project → Settings → Environment Variables\n" +
    "  2. Add: VITE_STORAGE_SUPABASE_ANON_KEY = <anon key from ovgsleayannsxifhiraw>\n" +
    "  3. Click Save, then Redeploy\n\n" +
    "To fix locally (Termux):\n" +
    "  Add the same line to your .env file and restart the dev server."
  );
}
console.groupEnd();

export const storageSupabase = createClient(STORAGE_URL, STORAGE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── testStorageConnection ──────────────────────────────────────────────
// Runs 4 checks and prints exactly what is broken.
export async function testStorageConnection() {
  console.group("[StorageClient] 🔍 Running full diagnostic...");

  // Check 1 — key present
  if (!STORAGE_KEY) {
    console.error("❌ CHECK 1 FAILED: No anon key. Set VITE_STORAGE_SUPABASE_ANON_KEY in Vercel and redeploy.");
    console.groupEnd();
    return;
  }
  console.log("✅ CHECK 1: Anon key is present");

  // Check 2 — can reach project and list buckets
  const { data: buckets, error: bucketErr } = await storageSupabase.storage.listBuckets();
  if (bucketErr) {
    const hint =
      bucketErr.message.includes("Invalid API key") || bucketErr.message.includes("401")
        ? "Your anon key is wrong or belongs to a different project."
        : bucketErr.message.includes("fetch") || bucketErr.message.includes("network")
        ? "Cannot reach the Supabase URL. Check VITE_STORAGE_SUPABASE_URL."
        : "Unknown — see raw error below.";
    console.error("❌ CHECK 2 FAILED: Cannot connect to storage project.", { error: bucketErr.message, hint });
    console.groupEnd();
    return;
  }
  const names = (buckets || []).map((b: any) => b.name);
  if (names.length === 0) {
    console.warn("⚠️  CHECK 2: Connected but NO buckets found. Run 01_create_buckets.sql in your Supabase SQL Editor.");
  } else {
    console.log("✅ CHECK 2: Connected. Buckets:", names.join(", "));
  }

  // Check 3 — subject-files bucket exists
  if (!names.includes("subject-files")) {
    console.error("❌ CHECK 3 FAILED: 'subject-files' bucket missing. Run 01_create_buckets.sql.");
    console.groupEnd();
    return;
  }
  console.log("✅ CHECK 3: subject-files bucket exists");

  // Check 4 — can actually upload
  const blob = new Blob(["tahleem-test"], { type: "text/plain" });
  const path = `test/connection-check-${Date.now()}.txt`;
  const { error: upErr } = await storageSupabase.storage
    .from("subject-files")
    .upload(path, blob, { upsert: true });

  if (upErr) {
    const hint =
      upErr.message.includes("row-level security") || upErr.message.includes("policy") || upErr.message.includes("403")
        ? "RLS policy is blocking uploads. Re-run 01_create_buckets.sql to reset the policies."
        : upErr.message.includes("quota") || upErr.message.includes("exceeded") || upErr.message.includes("413")
        ? "Storage is FULL. Upgrade your Supabase plan or delete old files from the bucket."
        : upErr.message.includes("too large")
        ? "File exceeds the bucket size limit."
        : "Unknown — see raw error below.";
    console.error("❌ CHECK 4 FAILED: Upload blocked.", { error: upErr.message, hint });
    console.groupEnd();
    return;
  }

  await storageSupabase.storage.from("subject-files").remove([path]);
  console.log("✅ CHECK 4: Upload test passed — storage is working!");
  console.log("🎉 All checks passed. Storage is fully operational.");
  console.groupEnd();
}

// Expose in browser console for easy debugging
if (typeof window !== "undefined") {
  (window as any).testStorage = testStorageConnection;
}
