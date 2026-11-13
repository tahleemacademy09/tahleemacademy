// src/lib/whisperCloud.ts
// Transcribe one recording with Whisper-large-v3-turbo on Cloudflare Workers AI (the `recitation-check` worker).
// Same call the Ramadan checker makes: decode → 16 kHz mono WAV → POST with the user's Supabase JWT.
// Long recordings are cut at natural pauses into chunks of at most ~2.5 minutes (≈ 4.8 MB of WAV) and sent 3 at a time:
// one giant upload is rejected by the worker (HTTP 413) and is slow on a phone connection. Short recordings are sent whole.
// On any problem it returns { error } and the caller falls back to the on-device engines.
import { supabase } from "@/integrations/supabase/client";
import { decodeToPcm16k, pcm16kToWav } from "@/lib/toWav16k";
import { splitAtPauses } from "@/lib/tarteelOnDevice";
import { WHISPER_ENDPOINT } from "@/lib/asrSettings";

export interface WhisperResult { text: string; ms: number; error?: string }

// A safety net so a hung request can never freeze the result screen — generous, it is not a recording-length limit.
const REQUEST_TIMEOUT_MS = 240_000;
const SR = 16000;
const MAX_CHUNK_SECS = 150;      // ≈ 4.8 MB WAV per request
const PARALLEL = 3;
const OVERLAP_SAMPLES = 75 * 320; // splitAtPauses restarts a forced cut 1.5 s early; that overlap is dropped when joining

/** Group the pause-split pieces into chunks of ≤ MAX_CHUNK_SECS (no duplicated audio). */
function chunkPcm(pcm: Float32Array): Float32Array[] {
  if (pcm.length <= MAX_CHUNK_SECS * SR) return [pcm];
  const chunks: Float32Array[] = [];
  let cur: Float32Array[] = [];
  let len = 0;
  const flush = () => {
    if (!cur.length) return;
    const out = new Float32Array(len); let o = 0;
    for (const p of cur) { out.set(p, o); o += p.length; }
    chunks.push(out); cur = []; len = 0;
  };
  for (const seg of splitAtPauses(pcm, SR)) {
    const d = seg.overlapped ? seg.data.subarray(Math.min(OVERLAP_SAMPLES, seg.data.length)) : seg.data;
    if (len + d.length > MAX_CHUNK_SECS * SR) flush();
    cur.push(d); len += d.length;
  }
  flush();
  return chunks;
}

async function postChunk(wav: Blob, token: string): Promise<{ text: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
      body: wav,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try { const j: any = await res.json(); detail = String(j?.error || j?.detail || "").slice(0, 60); } catch { /* not json */ }
      return { error: `http_${res.status}${detail ? ` ${detail}` : ""}` };
    }
    const data = (await res.json()) as { text?: string };
    return { text: String(data?.text ?? "").trim() };
  } catch (e: any) {
    return { error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

export async function whisperTranscribe(blob: Blob): Promise<WhisperResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  if (!WHISPER_ENDPOINT) return { text: "", ms: 0, error: "not_configured" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { text: "", ms: ms(), error: "auth" };
    const chunks = chunkPcm(await decodeToPcm16k(blob));
    const texts: string[] = new Array(chunks.length).fill("");
    let next = 0;
    let failure = "";
    const worker = async () => {
      while (!failure) {
        const i = next++;
        if (i >= chunks.length) return;
        const r = await postChunk(pcm16kToWav(chunks[i]), session.access_token);
        if ("error" in r) { failure = chunks.length > 1 ? `${r.error} (part ${i + 1}/${chunks.length})` : r.error; return; }
        texts[i] = r.text;
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
    if (failure) return { text: "", ms: ms(), error: failure };
    return { text: texts.filter(Boolean).join(" ").trim(), ms: ms() };
  } catch (e: any) {
    return { text: "", ms: ms(), error: String(e?.message ?? e).slice(0, 80) };
  }
}
