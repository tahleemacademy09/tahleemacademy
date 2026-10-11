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
