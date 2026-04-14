/*
  storageClient.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Uses the SAME Supabase project as the main client so that storage
  buckets, auth, and the database all share one project with one set
  of credentials.

  Buckets required (create once in Supabase Storage → New bucket):
    • recordings   — stores live-class audio/video recordings
    • subject-files — stores materials uploaded by teachers/admins

  Both buckets should be PRIVATE (RLS) so signed URLs are required for
  playback. Set the bucket policy to allow authenticated users to read.
*/
import { createClient } from "@supabase/supabase-js";

// ── Credentials — same project as src/integrations/supabase/client.ts ──
const STORAGE_URL =
  import.meta.env.VITE_STORAGE_SUPABASE_URL ||
  "https://wvqeubhupkddtkcdwqcm.supabase.co";          // ← main project

const STORAGE_KEY =
  import.meta.env.VITE_STORAGE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";

// ── Startup diagnostics ───────────────────────────────────────────────
if (import.meta.env.DEV) {
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
      "[StorageClient] No anon key found.\n\n" +
      "Add one of these to your .env / Vercel environment variables:\n" +
      "  VITE_STORAGE_SUPABASE_ANON_KEY\n" +
      "  VITE_SUPABASE_PUBLISHABLE_KEY\n" +
      "  VITE_SUPABASE_ANON_KEY"
    );
  }
  console.groupEnd();
}

export const storageSupabase = createClient(STORAGE_URL, STORAGE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helper: get a signed URL for any storage path ─────────────────────
// Automatically picks the right bucket based on the path prefix.
// Returns null if the file cannot be found.
export async function getSignedUrl(
  fileUrl: string,
  expiresInSeconds = 7200
): Promise<string | null> {
  if (!fileUrl) return null;

  // Already a full URL — return as-is (legacy manual uploads)
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  // Determine bucket from path prefix
  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? "recordings"
      : "subject-files";

  const { data, error } = await storageSupabase.storage
    .from(bucket)
    .createSignedUrl(fileUrl, expiresInSeconds);

  if (error) {
    console.error(`[StorageClient] createSignedUrl failed for ${bucket}/${fileUrl}:`, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

// ── Helper: remove a file from storage ───────────────────────────────
export async function removeStorageFile(fileUrl: string): Promise<void> {
  if (!fileUrl) return;
  // Already a full URL — we can't easily remove it, skip
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return;

  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? "recordings"
      : "subject-files";

  const { error } = await storageSupabase.storage.from(bucket).remove([fileUrl]);
  if (error) {
    console.error(`[StorageClient] remove failed for ${bucket}/${fileUrl}:`, error.message);
  }
}

// ── testStorageConnection ─────────────────────────────────────────────
export async function testStorageConnection() {
  console.group("[StorageClient] 🔍 Running full diagnostic...");

  if (!STORAGE_KEY) {
    console.error("❌ No anon key. Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.");
    console.groupEnd();
    return;
  }
  console.log("✅ Anon key is present");

  const { data: buckets, error: bucketErr } = await storageSupabase.storage.listBuckets();
  if (bucketErr) {
    console.error("❌ Cannot connect to storage project:", bucketErr.message);
    console.groupEnd();
    return;
  }

  const names = (buckets || []).map((b: any) => b.name);
  console.log("✅ Connected. Buckets:", names.length ? names.join(", ") : "(none — create recordings + subject-files)");

  if (!names.includes("recordings")) console.warn("⚠️  'recordings' bucket missing — create it in Supabase Storage");
  if (!names.includes("subject-files")) console.warn("⚠️  'subject-files' bucket missing — create it in Supabase Storage");

  // Quick upload test
  const blob = new Blob(["tahleem-test"], { type: "text/plain" });
  const path = `test/connection-check-${Date.now()}.txt`;
  const bucket = names.includes("subject-files") ? "subject-files" : names[0];
  if (!bucket) { console.warn("No buckets to test upload against."); console.groupEnd(); return; }

  const { error: upErr } = await storageSupabase.storage.from(bucket).upload(path, blob, { upsert: true });
  if (upErr) {
    console.error("❌ Upload blocked:", upErr.message);
    console.groupEnd();
    return;
  }
  await storageSupabase.storage.from(bucket).remove([path]);
  console.log("✅ Upload test passed — storage is fully operational!");
  console.groupEnd();
}

if (typeof window !== "undefined") {
  (window as any).testStorage = testStorageConnection;
}
