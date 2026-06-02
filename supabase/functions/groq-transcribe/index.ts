/*
  groq-transcribe — Tarteel-style live Quran transcription.
  Proxies audio to Groq Whisper large-v3-turbo using the server-side
  GROQ_API_KEY (the client must NEVER hold this key).

  Request:  multipart/form-data with "file" (audio blob).
  Response: { text: string }
*/

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured", text: "" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ct = req.headers.get("content-type") || "";
    let file: File | null = null;
    let prompt = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (f instanceof File) file = f;
      const p = form.get("prompt");
      if (typeof p === "string" && p.length) prompt = p;
    } else {
      // JSON fallback: { audio: base64, mimeType }
      const { audio, mimeType } = await req.json();
      if (!audio) throw new Error("missing audio");
      const bin = atob(audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      file = new File([bytes], "audio.webm", { type: mimeType || "audio/webm" });
    }

    if (!file) throw new Error("no audio file received");

    const fd = new FormData();
    fd.append("file", file, file.name || "audio.webm");
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("language", "ar");
    fd.append("response_format", "json");
    fd.append("temperature", "0");
    fd.append("prompt", prompt);

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: fd,
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || `groq ${r.status}`, text: "" }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = (data?.text || "").trim();
    return new Response(JSON.stringify({ text, transcript: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, text: "" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});