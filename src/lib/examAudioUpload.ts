/*
  examAudioUpload.ts
  ─────────────────────────────────────────────────────────────────────
  Uploads student exam-answer audio recordings straight to Cloudflare R2,
  via the "exam-audio-url" edge function for presigning. Used by
  ExamTaking.tsx and EntranceExamTaking.tsx for "audio"/"dictation"
  questions.

  Replaces the old direct-to-Supabase-storage upload against the
  "exam-media" bucket. Recordings already submitted before this change
  stay in Supabase and keep playing normally — only new recordings go
  through this path.
*/

import { supabase } from "@/integrations/supabase/client";

type UploadResult = { url: string; storagePath: string } | { error: string };

export async function uploadExamAudioToR2(path: string, blob: Blob): Promise<UploadResult> {
  const contentType = blob.type || "audio/mp4";

  try {
    const { data: uploadData, error: uploadErr } = await supabase.functions.invoke("exam-audio-url", {
      body: { path, action: "upload", contentType },
    });
    if (uploadErr || !uploadData?.url) {
      return { error: uploadErr?.message || "Could not get an upload URL" };
    }

    const putRes = await fetch(uploadData.url, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType },
    });
    if (!putRes.ok) {
      return { error: `Upload to storage failed (${putRes.status})` };
    }

    const { data: signData, error: signErr } = await supabase.functions.invoke("exam-audio-url", {
      body: { path, action: "sign", expiresIn: 604800 }, // 7 days, matches prior behaviour
    });
    if (signErr || !signData?.url) {
      return { error: signErr?.message || "Uploaded, but could not get a playback URL" };
    }

    return { url: signData.url, storagePath: path };
  } catch (e: any) {
    return { error: e?.message || "Upload failed" };
  }
}

// Playback URL for an audio file stored in R2 (e.g. "recitation-test/<uid>/<file>.webm").
export async function getR2AudioUrl(path: string, expiresIn = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("exam-audio-url", {
      body: { path, action: "sign", expiresIn },
    });
    if (error || !data?.url) {
      console.error("[R2 audio] sign failed:", error || data);
      return null;
    }
    return data.url as string;
  } catch (e) {
    console.error("[R2 audio] sign failed:", e);
    return null;
  }
}

// Resolves a stored recitation-test audio_path to a playable URL.
// New recordings live in R2; older ones are still in the Supabase "recitation-audio" bucket.
export async function resolveRecitationAudioUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("http")) return path;
  if (path.startsWith("recitation-test/")) return getR2AudioUrl(path);
  const { data } = await supabase.storage.from("recitation-audio").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
