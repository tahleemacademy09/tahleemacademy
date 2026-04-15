/*
storageClient.ts — Tahleem Academy [FIXED]
─────────────────────────────────────────────────────────────────────
Root cause of upload failures:
The old code created a client for a SEPARATE Supabase project
(ovgsleayannsxifhiraw) but passed the MAIN project's anon key.
Each project has its own JWT signing secret — cross-project keys
always return 401 "Invalid API key".

Fix: export the MAIN supabase client as storageSupabase.
The main client already carries the user's auth session, so every
upload/signed-URL call is properly authenticated automatically.

Buckets needed in the MAIN project (wvqeubhupkddtkcdwqcm):
• subject-files  – materials, assignments, announcements
• recordings     – live-class audio/video

One-time SQL to run in Supabase SQL editor (main project):
──────────────────────────────────────────────────────────
-- Allow authenticated users to upload any file
CREATE POLICY "Auth upload subject-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'subject-files');

CREATE POLICY "Auth upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'recordings');

-- Allow everyone to read (makes previews/downloads work)
CREATE POLICY "Public read subject-files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'subject-files');

CREATE POLICY "Public read recordings"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'recordings');

-- Allow owner to update/delete
CREATE POLICY "Owner delete subject-files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'subject-files' AND auth.uid() = owner);
──────────────────────────────────────────────────────────
*/

import { supabase } from "./client";

// Re-export main client — all existing imports keep working unchanged
export const storageSupabase = supabase;
export const BUCKET_MATERIALS = "subject-files";
export const BUCKET_RECORDINGS = "recordings";
/**
 * Resolve a storage path → a usable URL.
 * Tries public URL first (no round-trip, no expiry), then signed URL.
 */
export async function getSignedUrl(
  fileUrl: string,
  expiresInSeconds = 7200
): Promise<string | null> {
  if (!fileUrl) return null;
  
  // If it's already a full URL, return it
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? BUCKET_RECORDINGS
      : BUCKET_MATERIALS;

  // 1. Public URL (instant, no expiry — works when bucket is public)
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fileUrl);
  if (pub?.publicUrl) {
    try {
      const r = await fetch(pub.publicUrl, { method: "HEAD" });
      if (r.ok || r.status === 304) return pub.publicUrl;
    } catch {
      // fall through to signed URL
    }
  }

  // 2. Signed URL (private bucket — requires authenticated session)
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileUrl, expiresInSeconds);
      
    if (error) {
      console.error("[StorageClient] createSignedUrl failed:", error.message, { 
        bucket, 
        path: fileUrl 
      });
      return pub?.publicUrl ?? null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error("[StorageClient] getSignedUrl threw:", err);
    return pub?.publicUrl ?? null;
  }}

/**
 * Upload a file with auth check and friendly error messages.
 */
export async function uploadStorageFile(
  bucket: "subject-files" | "recordings",
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ success: boolean; path?: string; error?: string }> {
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { 
      success: false, 
      error: "Not signed in — please log in and try again." 
    };
  }

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: options?.upsert ?? false,
    contentType: options?.contentType || (file instanceof File ? file.type : "application/octet-stream"),
    cacheControl: "3600",
  });

  if (error) {
    const msg = error.message || " ";
    const friendly =
      msg.includes("row-level security") || msg.includes("policy") || (error as any).status === 403
        ? `Permission denied on '${bucket}'. Add an INSERT policy in Supabase Storage settings.`
        : msg.includes("already exists")
        ? "File already exists. It will be replaced."
        : msg.includes("Payload too large") || msg.includes("413")
        ? "File is too large."
        : msg.includes("Invalid API key") || (error as any).status === 401
        ? "Invalid API key. Check VITE_SUPABASE_PUBLISHABLE_KEY."
        : `Upload failed: ${msg}`;
        
    return { success: false, error: friendly };
  }
  
  return { success: true, path: data?.path || path };
}

/**
 * Remove a file from storage by its stored path.
 */
export async function removeStorageFile(fileUrl: string): Promise<void> {
  if (!fileUrl || fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return;  
  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? BUCKET_RECORDINGS
      : BUCKET_MATERIALS;

  await supabase.storage.from(bucket).remove([fileUrl]);
}

/**
 * Diagnostic — call from browser console: window.testStorage()
 */
export async function testStorageConnection() {
  console.group("[StorageClient] 🔍 Diagnostic");
  
  const { data: { session } } = await supabase.auth.getSession();
  console.log(
    session 
      ? `✅ Signed in as ${session.user.email}` 
      : "❌ NOT signed in — uploads require auth"
  );

  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) { 
      console.error("❌ List buckets failed:", error.message); 
      console.groupEnd(); 
      return { success: false }; 
    }
    
    const names = (buckets || []).map((b: any) => b.name);
    console.log("Buckets:", names.join(", ") || "(none)");
    
    if (!names.includes("subject-files")) {
      console.warn("⚠️ Create 'subject-files' bucket in Supabase Dashboard → Storage");
    }
    if (!names.includes("recordings")) {
      console.warn("⚠️ Create 'recordings' bucket in Supabase Dashboard → Storage");
    }
    
    console.groupEnd();
    return { success: true, buckets: names };
  } catch (e) { 
    console.error(e); 
    console.groupEnd(); 
    return { success: false }; 
  }
}

// Expose to window for debuggingif (typeof window !== "undefined") {
  (window as any).testStorage = testStorageConnection;
  (window as any).storageSupabase = storageSupabase;
}