/*
  storageClient.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Uses a SEPARATE Supabase project for storage operations only.
  
  Projects:
    • Main:    https://wvqeubhupkddtkcdwqcm.supabase.co (auth, database)
    • Storage: https://ovgsleayannsxifhiraw.supabase.co (files only)
  
  Buckets required in STORAGE project (Supabase Storage → New bucket):
    • recordings    — stores live-class audio/video recordings
    • subject-files — stores materials uploaded by teachers/admins
  
  Both buckets should have:
    • "Public bucket" toggle ON (for direct public URLs) OR
    • RLS policies allowing public/authenticated access
*/

import { createClient } from "@supabase/supabase-js";

// ── Credentials — STORAGE PROJECT ONLY ───────────────────────────────
const STORAGE_URL =
  import.meta.env.VITE_STORAGE_SUPABASE_URL ||
  "https://ovgsleayannsxifhiraw.supabase.co";  // ← ✅ Correct storage project

const STORAGE_KEY =
  import.meta.env.VITE_STORAGE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";

// ── Startup diagnostics (dev only) ────────────────────────────────────
if (import.meta.env.DEV) {
  console.group("[StorageClient] 🔧 Startup check");
  console.log("URL :", STORAGE_URL);
  console.log(
    "KEY :",
    STORAGE_KEY
      ? `${STORAGE_KEY.slice(0, 20)}… (${STORAGE_KEY.length} chars)`
      : "❌ EMPTY — uploads will fail with 401"
  );
  
  if (!STORAGE_KEY) {
    console.error(
      "[StorageClient] ❌ No anon key found!\n\n" +
      "Add ONE of these to .env.local OR Vercel Environment Variables:\n" +
      "  VITE_STORAGE_SUPABASE_ANON_KEY=your-key-here\n" +
      "  VITE_SUPABASE_PUBLISHABLE_KEY=your-key-here\n" +
      "  VITE_SUPABASE_ANON_KEY=your-key-here\n\n" +
      "Get key from: https://supabase.com/dashboard/project/ovgsleayannsxifhiraw/settings/api"    );
  }
  
  // Verify URL is correct
  if (STORAGE_URL.includes("wvqeubhupkddtkcdwqcm")) {
    console.warn(
      "[StorageClient] ⚠️  URL still points to MAIN project!\n" +
      "Set VITE_STORAGE_SUPABASE_URL=https://ovgsleayannsxifhiraw.supabase.co"
    );
  }
  console.groupEnd();
}

// ── Create the storage client ────────────────────────────────────────
export const storageSupabase = createClient(STORAGE_URL, STORAGE_KEY, {
  auth: { 
    persistSession: false, 
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'x-client-info': 'tahleem-storage-client',
    },
  },
});

// ── Helper: get a signed URL for any storage path ─────────────────────
export async function getSignedUrl(
  fileUrl: string,
  expiresInSeconds = 7200
): Promise<string | null> {
  if (!fileUrl) return null;

  // Already a full URL — return as-is
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  // Determine bucket from path prefix
  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? "recordings"
      : "subject-files";

  try {
    const { data, error } = await storageSupabase.storage
      .from(bucket)
      .createSignedUrl(fileUrl, expiresInSeconds);
    if (error) {
      console.error(`[StorageClient] ❌ createSignedUrl failed:`, {
        bucket,
        path: fileUrl,
        error: error.message,
        status: error.status,
      });
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error(`[StorageClient] ❌ Exception in getSignedUrl:`, err);
    return null;
  }
}

// ── Helper: remove a file from storage ───────────────────────────────
export async function removeStorageFile(fileUrl: string): Promise<void> {
  if (!fileUrl) return;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return;

  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? "recordings"
      : "subject-files";

  try {
    const { error } = await storageSupabase.storage.from(bucket).remove([fileUrl]);
    if (error) {
      console.error(`[StorageClient] ❌ remove failed:`, {
        bucket,
        path: fileUrl,
        error: error.message,
      });
    }
  } catch (err) {
    console.error(`[StorageClient] ❌ Exception in removeStorageFile:`, err);
  }
}

// ── Helper: upload a file with error handling ────────────────────────
export async function uploadStorageFile(
  bucket: 'subject-files' | 'recordings',
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
) {
  try {
    const { data, error } = await storageSupabase.storage
      .from(bucket)      .upload(path, file, {
        upsert: options?.upsert ?? false,
        contentType: options?.contentType,
        cacheControl: '3600',
      });

    if (error) {
      console.error(`[StorageClient] ❌ Upload failed:`, {
        bucket,
        path,
        error: error.message,
        status: error.status,
        hint: error.hint,
      });
      return { success: false, error };
    }
    
    console.log(`[StorageClient] ✅ Upload success:`, data);
    return { success: true, data };
  } catch (err) {
    console.error(`[StorageClient] ❌ Exception in uploadStorageFile:`, err);
    return { success: false, error: err };
  }
}

// ── Diagnostic: test storage connection ──────────────────────────────
export async function testStorageConnection() {
  console.group("[StorageClient] 🔍 Running full diagnostic...");

  // 1. Check key
  if (!STORAGE_KEY) {
    console.error("❌ No anon key. Set VITE_STORAGE_SUPABASE_ANON_KEY in env vars.");
    console.groupEnd();
    return { success: false, error: "Missing anon key" };
  }
  console.log("✅ Anon key is present");

  // 2. Check URL
  if (!STORAGE_URL.includes("ovgsleayannsxifhiraw")) {
    console.warn(`⚠️  URL may be wrong: ${STORAGE_URL}`);
  }

  // 3. List buckets
  try {
    const { data: buckets, error: bucketErr } = await storageSupabase.storage.listBuckets();
    if (bucketErr) {
      console.error("❌ Cannot connect to storage project:", bucketErr.message);
      console.groupEnd();
      return { success: false, error: bucketErr.message };
    }
    const names = (buckets || []).map((b: any) => b.name);
    console.log("✅ Connected. Buckets:", names.length ? names.join(", ") : "(none)");

    if (!names.includes("recordings")) {
      console.warn("⚠️  'recordings' bucket missing — create in Supabase Storage");
    }
    if (!names.includes("subject-files")) {
      console.warn("⚠️  'subject-files' bucket missing — create in Supabase Storage");
    }

    // 4. Quick upload test (only in dev)
    if (import.meta.env.DEV && names.includes("subject-files")) {
      const blob = new Blob(["tahleem-test"], { type: "text/plain" });
      const path = `test/connection-check-${Date.now()}.txt`;
      
      const { error: upErr } = await storageSupabase.storage
        .from("subject-files")
        .upload(path, blob, { upsert: true });
      
      if (upErr) {
        console.error("❌ Upload blocked:", upErr.message);
        console.groupEnd();
        return { success: false, error: upErr.message };
      }
      
      // Cleanup
      await storageSupabase.storage.from("subject-files").remove([path]);
      console.log("✅ Upload test passed — storage is fully operational!");
    }

    console.groupEnd();
    return { success: true, buckets: names };
    
  } catch (err) {
    console.error("❌ Exception during diagnostic:", err);
    console.groupEnd();
    return { success: false, error: err };
  }
}

// ── Expose test function to window for debugging ─────────────────────
if (typeof window !== "undefined") {
  (window as any).testStorage = testStorageConnection;
  (window as any).storageSupabase = storageSupabase;
}