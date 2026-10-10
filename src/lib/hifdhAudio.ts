/*
  hifdhAudio.ts
  Hifdh daily-revision recordings live in Cloudflare R2 (private bucket).
  The database stores only the R2 path (session_data.audio_path, e.g.
  "hifdh-daily/<uid>/2026-10-07_1730000000.webm"); a fresh playback link is
  requested whenever someone plays it, so links never expire on teachers.

  Older logs keep working: they have session_data.audio_url (a Supabase link)
  and/or a legacy audio_path in the Supabase "recitation-audio" bucket.
*/
import { supabase } from "@/integrations/supabase/client";

export const HIFDH_R2_PREFIX = "hifdh-daily/";

export const isHifdhR2Path = (p?: string | null): boolean =>
  !!p && p.startsWith(HIFDH_R2_PREFIX);

/** Uploads a recording straight to R2. Returns the stored path, or null on failure. */
export async function uploadHifdhAudio(path: string, blob: Blob): Promise<string | null> {
  const contentType = blob.type || "audio/webm";
  const { data, error } = await supabase.functions.invoke("hifdh-audio-url", {
    body: { path, action: "upload", contentType },
  });
  if (error || !data?.url) throw new Error(error?.message || "Could not get an upload URL");
  const put = await fetch(data.url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
  return path;
}

/** Fresh playback URL for an R2 path (default valid for 1 hour). */
export async function getHifdhAudioUrl(path: string, expiresIn = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("hifdh-audio-url", {
      body: { path, action: "sign", expiresIn },
    });
    if (error || !data?.url) {
      console.error("[hifdh audio] sign failed:", error || data);
      return null;
    }
    return data.url as string;
  } catch (e) {
    console.error("[hifdh audio] sign failed:", e);
    return null;
  }
}

/**
 * Works out a playable URL from a log's session_data:
 *  - new logs  -> signs the R2 path
 *  - old logs  -> returns the stored Supabase audio_url as-is
 */
export async function resolveHifdhSessionAudio(
  sd?: { audio_url?: string | null; audio_path?: string | null } | null,
): Promise<string | null> {
  if (!sd) return null;
  if (isHifdhR2Path(sd.audio_path)) return getHifdhAudioUrl(sd.audio_path!);
  return sd.audio_url ?? null;
}

/**
 * Saves a student's recording so staff can always hear it: straight to R2 (6 tries, growing back-off),
 * then — only if R2 keeps failing — to the Supabase "recitation-audio" bucket (admins/teachers can play
 * both). Returns the stored path, or null if nothing could be saved (the caller then keeps the recording
 * on the device and retries later).
 */
export async function saveHifdhRecording(userId: string, day: string, blob: Blob): Promise<string | null> {
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${HIFDH_R2_PREFIX}${userId}/${day}_${Date.now()}.${ext}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await uploadHifdhAudio(path, blob); }
    catch (e: any) {
      console.warn(`[hifdh audio] R2 upload attempt ${attempt}/6 failed:`, e?.message ?? e);
      if (attempt < 6) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  try {
    const fallback = `${userId}/hifdh-daily/${day}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recitation-audio").upload(fallback, blob, { contentType: blob.type || "audio/webm", upsert: true });
    if (!error) return fallback;
    console.error("[hifdh audio] fallback upload failed:", error.message);
  } catch (e) { console.error("[hifdh audio] fallback upload failed:", e); }
  return null;
}

/**
 * Removes a recording once staff have reviewed it (R2 recordings only; the function checks the caller
 * is an admin or teacher). Returns true when the file is gone.
 */
export async function deleteHifdhAudio(path?: string | null): Promise<boolean> {
  if (!isHifdhR2Path(path)) return false;
  try {
    const { data, error } = await supabase.functions.invoke("hifdh-audio-url", { body: { path, action: "delete" } });
    return !error && !!data?.ok;
  } catch { return false; }
}

/** Reviewed → delete the stored recording and clear the pointer on the log, so nothing is kept needlessly. */
export async function discardReviewedAudio(logId: string, sessionData: any): Promise<any | null> {
  const path = sessionData?.audio_path;
  if (!path) return null;
  if (isHifdhR2Path(path)) {
    if (!(await deleteHifdhAudio(path))) return null;
  } else if (path.includes("/hifdh-daily/")) {
    // recording saved by the Supabase fallback
    try { const { error } = await supabase.storage.from("recitation-audio").remove([path]); if (error) return null; } catch { return null; }
  } else return null;                                    // older recordings are left alone
  const next = { ...sessionData, audio_path: null, audio_deleted_at: new Date().toISOString() };
  try { await (supabase as any).from("hifdh_daily_logs").update({ session_data: next }).eq("id", logId); } catch { /* file is gone either way */ }
  return next;
}
