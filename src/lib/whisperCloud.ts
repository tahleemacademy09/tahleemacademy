// src/lib/whisperCloud.ts
// Transcribe one recording with Whisper-large-v3-turbo on Cloudflare Workers AI (the `recitation-check` worker).
// Same call the Ramadan checker makes: decode → 16 kHz mono WAV → POST with the user's Supabase JWT.
// There is NO length cap here. On any problem it returns { error } and the caller falls back to the on-device engines.
import { supabase } from "@/integrations/supabase/client";
import { blobToWav16k } from "@/lib/toWav16k";
import { WHISPER_ENDPOINT } from "@/lib/asrSettings";

export interface WhisperResult { text: string; ms: number; error?: string }

// A safety net so a hung request can never freeze the result screen — generous, it is not a recording-length limit.
const REQUEST_TIMEOUT_MS = 240_000;

export async function whisperTranscribe(blob: Blob): Promise<WhisperResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  if (!WHISPER_ENDPOINT) return { text: "", ms: 0, error: "not_configured" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { text: "", ms: ms(), error: "auth" };
    const wav = await blobToWav16k(blob);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(WHISPER_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "audio/wav" },
        body: wav,
        signal: ctrl.signal,
      });
      if (!res.ok) return { text: "", ms: ms(), error: `http_${res.status}` };
      const data = (await res.json()) as { text?: string };
      return { text: String(data?.text ?? "").trim(), ms: ms() };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    return { text: "", ms: ms(), error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e).slice(0, 80) };
  }
}
