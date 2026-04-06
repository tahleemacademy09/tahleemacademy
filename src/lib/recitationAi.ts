// src/lib/recitationAi.ts
// Arabic Quran recitation transcription
// Primary:  Qwen / DashScope paraformer-v2  (VITE_DASHSCOPE_API_KEY)
// Fallback: Groq Whisper-large-v3           (VITE_GROQ_API_KEY)

const DASHSCOPE_KEY = import.meta.env.VITE_DASHSCOPE_API_KEY || "";
const GROQ_KEY      = import.meta.env.VITE_GROQ_API_KEY      || "";

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
async function transcribeWithGroq(blob: Blob): Promise<string> {
  if (!GROQ_KEY) throw new Error("no-key");

  const ext = blob.type.includes("mp4") ? "mp4"
            : blob.type.includes("ogg") ? "ogg"
            : "webm";

  const fd = new FormData();
  fd.append("file",            new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
  fd.append("model",           "whisper-large-v3");
  fd.append("language",        "ar");
  fd.append("response_format", "json");
  fd.append("temperature",     "0");
  fd.append("prompt",
    "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين"
  );

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body:    fd,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  return typeof data.text === "string" ? data.text.trim() : "";
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
