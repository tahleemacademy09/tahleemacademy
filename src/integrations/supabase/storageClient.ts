/*
storageClient.ts — Tahleem Academy [R2 migration]
─────────────────────────────────────────────────────────────────────
Recordings moved from Supabase Storage to Cloudflare R2 (egress cost).
"sessions/" and "recordings/" paths now resolve through the recording-url
edge function (signed R2 URL) instead of supabase.storage. Everything
else (subject-materials, legacy subject-files) is unchanged.
*/

import { supabase } from "./client";

export const storageSupabase = supabase;
export const BUCKET_MATERIALS = "subject-materials";
export const BUCKET_RECORDINGS = "recordings"; // legacy Supabase bucket name, kept as read fallback only
// Legacy bucket some older student-submission uploads mistakenly wrote to.
// Kept only as a read fallback so previously-submitted files still resolve.
const LEGACY_SUBMISSION_BUCKET = "subject-files";

function isRecordingPath(fileUrl: string): boolean {
  return fileUrl.startsWith("sessions/") || fileUrl.startsWith("recordings/");
}

async function getR2SignedUrl(fileUrl: string, expiresInSeconds: number): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.functions.invoke("recording-url", {
    body: { path: fileUrl, action: "sign", expiresIn: expiresInSeconds },
  });
  if (error || !data?.url) {
    console.error("[StorageClient] R2 sign failed:", error || data);
    return null;
  }
  return data.url as string;
}

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

  if (isRecordingPath(fileUrl)) {
    const r2Url = await getR2SignedUrl(fileUrl, expiresInSeconds);
    if (r2Url) return r2Url;

    // Fallback: file hasn't been migrated to R2 yet (or migration script
    // hasn't run for it) — check the old Supabase bucket before giving up.
    // Safe to delete this fallback once the one-time migration is confirmed
    // complete for all rows in session_recordings.
    const legacyRecording = await resolveInBucket(BUCKET_RECORDINGS, fileUrl, expiresInSeconds);
    if (legacyRecording) return legacyRecording;

    console.error("[StorageClient] Could not resolve recording in R2 or legacy Supabase bucket:", fileUrl);
    return null;
  }

  const primary = await resolveInBucket(BUCKET_MATERIALS, fileUrl, expiresInSeconds);
  if (primary) return primary;

  // Fallback: older student-submission files may still live in the legacy bucket.
  const legacy = await resolveInBucket(LEGACY_SUBMISSION_BUCKET, fileUrl, expiresInSeconds);
  if (legacy) return legacy;

  console.error("[StorageClient] Could not resolve signed URL in any bucket:", { bucket: BUCKET_MATERIALS, path: fileUrl });
  return null;
}

export async function uploadStorageFile(
  bucket: "subject-materials" | "recordings", path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Recordings are no longer uploaded from the client — LiveKit Egress
  // writes them straight to R2 server-side (see start-recording function).
  // This path stays for subject-materials uploads only.
  if (bucket === "recordings") {
    return { success: false, error: "Recordings are written by the server-side egress job, not uploaded from the client." };
  }

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

  if (isRecordingPath(fileUrl)) {
    const { error } = await supabase.functions.invoke("recording-url", {
      body: { path: fileUrl, action: "delete" },
    });
    if (error) console.error("[StorageClient] R2 delete failed:", error);
    return;
  }

  await supabase.storage.from(BUCKET_MATERIALS).remove([fileUrl]);
}

export async function testStorageConnection() {
  console.group("[StorageClient] Diagnostic");

  const { data: { session } } = await supabase.auth.getSession();
  console.log(session ? `Signed in as ${session.user.email}` : "NOT signed in — uploads require auth");

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
    console.log("Recordings now live in Cloudflare R2 — not a Supabase bucket. Check R2 dashboard for that bucket's status.");

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
