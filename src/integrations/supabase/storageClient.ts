/*
storageClient.ts — Tahleem Academy [FIXED]
─────────────────────────────────────────────────────────────────────
Fix: Use the MAIN supabase client for storage operations.
The main client already carries the user's auth session.
*/

import { supabase } from "./client";

export const storageSupabase = supabase;
export const BUCKET_MATERIALS = "subject-materials";
export const BUCKET_RECORDINGS = "recordings";
// Legacy bucket some older student-submission uploads mistakenly wrote to.
// Kept only as a read fallback so previously-submitted files still resolve.
const LEGACY_SUBMISSION_BUCKET = "subject-files";

async function resolveInBucket(bucket: string, fileUrl: string, expiresInSeconds: number): Promise<string | null> {
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fileUrl);
  if (pub?.publicUrl) {
    try {
      const r = await fetch(pub.publicUrl, { method: "HEAD" });
      if (r.ok || r.status === 304) return pub.publicUrl;
    } catch {}
  }
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(fileUrl, expiresInSeconds);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {}
  return null;
}

export async function getSignedUrl(
  fileUrl: string,
  expiresInSeconds = 7200
): Promise<string | null> {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;

  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? BUCKET_RECORDINGS
      : BUCKET_MATERIALS;

  const primary = await resolveInBucket(bucket, fileUrl, expiresInSeconds);
  if (primary) return primary;

  // Fallback: older student-submission files may still live in the legacy bucket.
  if (bucket === BUCKET_MATERIALS) {
    const legacy = await resolveInBucket(LEGACY_SUBMISSION_BUCKET, fileUrl, expiresInSeconds);
    if (legacy) return legacy;
  }

  console.error("[StorageClient] Could not resolve signed URL in any bucket:", { bucket, path: fileUrl });
  return null;
}

export async function uploadStorageFile(
  bucket: "subject-materials" | "recordings",  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ success: boolean; path?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: "Not signed in — please log in and try again." };
  }

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: options?.upsert ?? false,
    contentType: options?.contentType || (file instanceof File ? file.type : "application/octet-stream"),
    cacheControl: "3600",
  });

  if (error) {
    const msg = error.message || "";
    let friendly = `Upload failed: ${msg}`;
    
    if (msg.includes("row-level security") || msg.includes("policy") || (error as any).status === 403) {
      friendly = `Permission denied on '${bucket}'. Add an INSERT policy in Supabase Storage settings.`;
    } else if (msg.includes("already exists")) {
      friendly = "File already exists. It will be replaced.";
    } else if (msg.includes("Payload too large") || msg.includes("413")) {
      friendly = "File is too large.";
    } else if (msg.includes("Invalid API key") || (error as any).status === 401) {
      friendly = "Invalid API key. Check VITE_SUPABASE_PUBLISHABLE_KEY.";
    }
    
    return { success: false, error: friendly };
  }
  
  return { success: true, path: data?.path || path };
}

export async function removeStorageFile(fileUrl: string): Promise<void> {
  if (!fileUrl || fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return;
  
  const bucket =
    fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/")
      ? BUCKET_RECORDINGS
      : BUCKET_MATERIALS;

  await supabase.storage.from(bucket).remove([fileUrl]);
}

export async function testStorageConnection() {
  console.group("[StorageClient] Diagnostic");
  
  const { data: { session } } = await supabase.auth.getSession();  console.log(session ? `Signed in as ${session.user.email}` : "NOT signed in — uploads require auth");

  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) { 
      console.error("List buckets failed:", error.message); 
      console.groupEnd(); 
      return { success: false }; 
    }
    
    const names = (buckets || []).map((b: any) => b.name);
    console.log("Buckets:", names.join(", ") || "(none)");
    
    if (!names.includes("subject-materials")) {
      console.warn("Create 'subject-materials' bucket in Supabase Dashboard → Storage");
    }
    if (!names.includes("recordings")) {
      console.warn("Create 'recordings' bucket in Supabase Dashboard → Storage");
    }
    
    console.groupEnd();
    return { success: true, buckets: names };
  } catch (e) { 
    console.error(e); 
    console.groupEnd(); 
    return { success: false }; 
  }
}

if (typeof window !== "undefined") {
  (window as any).testStorage = testStorageConnection;
  (window as any).storageSupabase = storageSupabase;
}
