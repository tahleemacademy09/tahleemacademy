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
