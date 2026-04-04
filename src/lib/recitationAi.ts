// src/lib/recitationAi.ts
// Transcribes Arabic Quran recitation using Groq Whisper-large-v3
// Replaces the old Supabase edge-function (Qwen) which did NOT support Arabic.

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

/**
 * Send an audio Blob to Groq Whisper and return the Arabic transcript.
 * Throws if the API returns an error; returns "" if no key is configured.
 */
export const transcribeRecitationAudio = async (blob: Blob): Promise<string> => {
  if (!GROQ_KEY) {
    console.warn("[recitationAi] VITE_GROQ_API_KEY not set — transcription skipped.");
    return "";
  }

  // Pick a supported extension from the MIME type
  const ext = blob.type.includes("mp4")
    ? "mp4"
    : blob.type.includes("ogg")
    ? "ogg"
    : "webm";

  const fd = new FormData();
  fd.append("file", new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
  fd.append("model", "whisper-large-v3");
  fd.append("language", "ar");          // Force Arabic — no auto-detect
  fd.append("response_format", "json");
  fd.append("temperature", "0");        // Deterministic
  // Quran primer primes Whisper toward Quranic vocabulary & diacritics
  fd.append(
    "prompt",
    "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين"
  );

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    throw new Error(`Groq Whisper ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return typeof data.text === "string" ? data.text.trim() : "";
};
