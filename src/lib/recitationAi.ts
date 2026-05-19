// src/lib/recitationAi.ts
// Arabic Quran recitation transcription
// Primary:  Qwen / DashScope paraformer-v2  (VITE_DASHSCOPE_API_KEY)
// Fallback: Groq Whisper-large-v3           (VITE_GROQ_API_KEY)

const DASHSCOPE_KEY = import.meta.env.VITE_DASHSCOPE_API_KEY || "";
const GROQ_KEY      = import.meta.env.VITE_GROQ_API_KEY      || "";

// ── Quran style prompt ───────────────────────────────────────────────────────
// CRITICAL: must NOT contain full Quranic verses.
// Whisper treats the prompt as "what was said immediately before this audio"
// and will CONTINUE / hallucinate those exact verses instead of transcribing
// what the student actually recited.
// This short style hint is enough to:
//   1. Activate Whisper's Arabic diacritics (تشكيل) output mode
//   2. Bias towards Uthmani script spelling conventions
//   3. Show emphatic / hamza letter forms so they are recognised correctly
export const QURAN_STYLE_PROMPT =
  "قرآن كريم بالتشكيل الكامل. تلاوة قرآنية بالرسم العثماني. صَ ضَ طَ ظَ إِ أَ ئَ ؤَ";

/* ── Qwen / DashScope paraformer-v2 ────────────────────────────── */
async function transcribeWithQwen(blob: Blob): Promise<string> {
  if (!DASHSCOPE_KEY) throw new Error("no-key");

  const ext = blob.type.includes("mp4") ? "mp4"
            : blob.type.includes("ogg") ? "ogg"
            : "webm";

  const fd = new FormData();
  fd.append("file",  new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
  fd.append("model", "paraformer-v2");
  fd.append("language", "ar");

  const res = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions",
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${DASHSCOPE_KEY}` },
      body:    fd,
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`DashScope ${res.status}: ${err}`);
  }

  const data = await res.json();
  return typeof data.text === "string" ? data.text.trim() : "";
}

/* ── Groq Whisper-large-v3 (fallback) ──────────────────────────── */
// Uses verbose_json so we get per-segment no_speech_prob and can reject
// silence / background-noise recordings before they produce garbage output.
async function transcribeWithGroq(blob: Blob): Promise<string> {
  if (!GROQ_KEY) throw new Error("no-key");

  const ext = blob.type.includes("mp4") ? "mp4"
            : blob.type.includes("ogg") ? "ogg"
            : "webm";

  const fd = new FormData();
  fd.append("file",            new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
  fd.append("model",           "whisper-large-v3");
  fd.append("language",        "ar");
  fd.append("response_format", "verbose_json"); // ← segments + no_speech_prob
  fd.append("temperature",     "0");
  fd.append("prompt",          QURAN_STYLE_PROMPT); // ← style hint only, no verses

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body:    fd,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const json = await res.json();

  // ── Silence / noise gate ─────────────────────────────────────────────────
  // If the majority of segments are flagged as non-speech, return empty so
  // the caller can show a "speak clearly" prompt instead of garbage Arabic.
  // Threshold 0.55 is intentionally lenient — Quranic tajweed with long
  // pauses (madd) can slightly elevate no_speech_prob on short segments.
  const segs: { no_speech_prob?: number }[] = json.segments ?? [];
  const avgNoSpeech = segs.length > 0
    ? segs.reduce((sum, g) => sum + (g.no_speech_prob ?? 0), 0) / segs.length
    : 0;
  const txt = (json.text ?? "").trim();

  if (avgNoSpeech >= 0.55) return ""; // mostly noise/silence — reject
  if (txt.length < 2)      return ""; // nothing meaningful captured

  return txt;
}

/* ── Public API ─────────────────────────────────────────────────── */
export const transcribeRecitationAudio = async (blob: Blob): Promise<string> => {
  if (DASHSCOPE_KEY) {
    try { return await transcribeWithQwen(blob); }
    catch (e) { console.warn("[recitationAi] Qwen failed, trying Groq:", e); }
  }
  if (GROQ_KEY) {
    try { return await transcribeWithGroq(blob); }
    catch (e) { console.warn("[recitationAi] Groq failed:", e); }
  }
  console.warn("[recitationAi] No API key (VITE_DASHSCOPE_API_KEY or VITE_GROQ_API_KEY).");
  return "";
};
