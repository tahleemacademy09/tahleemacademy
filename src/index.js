/*
  groq-transcribe (Cloudflare Worker) — same contract as the old Supabase edge function.

  Request:  multipart/form-data with "file" (audio blob); optional "prompt", "model", "timestamps=word".
  Response: { text, transcript, words, model }
  Secret:   GROQ_API_KEY  (npx wrangler secret put GROQ_API_KEY)
  Optional: ALLOWED_ORIGINS (comma-separated) to override the default list below.
*/

const DEFAULT_ORIGINS = [
  "https://tahleemacademy.vercel.app",
  "https://localhost",            // Capacitor Android
  "capacitor://localhost",        // Capacitor iOS
  "http://localhost:5173",
  "http://localhost:3000",
];

// Segments Groq itself is fairly sure are silence are dropped (kept permissive so quiet recitation survives).
const NO_SPEECH_THRESHOLD = 0.6;

function cors(origin, env) {
  const list = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
  const allowed = origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-warmup",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}


// Last-resort backup: Cloudflare Workers AI (Whisper large-v3-turbo). Free daily allowance, no API key — it uses the
// `AI` binding from wrangler.toml. Returns { text } or null if unavailable / failed / empty.
async function workersAiTranscribe(env, file, prompt) {
  if (!env.AI) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: btoa(bin),
      task: "transcribe",
      language: "ar",
      initial_prompt: prompt,
      condition_on_previous_text: false, // avoids repetition loops on chunked recitation
    });
    const text = (out?.text || "").trim();
    return text ? { text } : null;
  } catch (e) {
    console.warn("workers-ai fallback failed:", String(e?.message || e));
    return null;
  }
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const hdrs = cors(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") return new Response("ok", { headers: hdrs });
    if (req.method !== "POST") return json({ error: "method not allowed", text: "" }, 405, hdrs);
    if (req.headers.get("x-warmup") === "1") return json({ warm: true }, 200, hdrs);

    try {
      if (!env.GROQ_API_KEY) return json({ error: "GROQ_API_KEY not configured", text: "" }, 500, hdrs);

      let file = null;
      let prompt = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
      let model = "whisper-large-v3";
      let wantWords = false;

      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data")) {
        const form = await req.formData();
        const f = form.get("file");
        if (f && typeof f !== "string") file = f;
        const p = form.get("prompt");
        if (typeof p === "string" && p.length) prompt = p;
        const m = form.get("model");
        if (typeof m === "string" && m.startsWith("whisper-")) model = m;
        wantWords = form.get("timestamps") === "word";
      } else {
        const { audio, mimeType } = await req.json();
        if (!audio) throw new Error("missing audio");
        const bin = atob(audio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        file = new File([bytes], "audio.webm", { type: mimeType || "audio/webm" });
      }
      if (!file) throw new Error("no audio file received");

      const buildForm = (m) => {
        const fd = new FormData();
        fd.append("file", file, file.name || "audio.webm");
        fd.append("model", m);
        fd.append("language", "ar");
        fd.append("response_format", "verbose_json");
        fd.append("temperature", "0");
        fd.append("prompt", prompt);
        if (wantWords) fd.append("timestamp_granularities[]", "word");
        return fd;
      };
      const callGroq = (m) =>
        fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: buildForm(m),
        });

      // Limits are counted per model: if one is rate-limited (429) or Groq is overloaded (5xx), retry on the other.
      let used = model;
      let r = await callGroq(used);
      if (r.status === 429 || r.status >= 500) {
        const alt = used === "whisper-large-v3" ? "whisper-large-v3-turbo" : "whisper-large-v3";
        const r2 = await callGroq(alt);
        if (r2.ok) { r = r2; used = alt; }
      }

      const data = await r.json().catch(() => ({}));
      if (!r.ok && (r.status === 429 || r.status >= 500) && !wantWords) {
        // Both Groq models are limited/unavailable: try Cloudflare Workers AI before giving up.
        const alt = await workersAiTranscribe(env, file, prompt);
        if (alt) return json({ text: alt.text, transcript: alt.text, words: [], model: "workers-ai" }, 200, hdrs);
      }
      if (!r.ok) return json({ error: data?.error?.message || `groq ${r.status}`, text: "" }, r.status, hdrs);

      const segments = Array.isArray(data?.segments) ? data.segments : null;
      const text = segments
        ? segments
            .filter((s) => !((s?.no_speech_prob ?? 0) >= NO_SPEECH_THRESHOLD && (s?.avg_logprob ?? 0) < -1))
            .map((s) => (s?.text ?? "").trim())
            .filter(Boolean)
            .join(" ")
        : (data?.text || "").trim();
      const words = wantWords && Array.isArray(data?.words)
        ? data.words.map((w) => ({ word: String(w?.word ?? "").trim(), start: Number(w?.start ?? 0), end: Number(w?.end ?? 0) }))
        : [];

      return json({ text, transcript: text, words, model: used }, 200, hdrs);
    } catch (e) {
      return json({ error: String(e?.message || e), text: "" }, 400, hdrs);
    }
  },
};
