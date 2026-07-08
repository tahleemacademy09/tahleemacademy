/*
  groq-transcribe — Tarteel-style live Quran transcription.
  Proxies audio to Groq Whisper using the server-side GROQ_API_KEY
  (the client must NEVER hold this key).

  Request:  multipart/form-data with "file" (audio blob).
            Optional "model" field to override the default.
  Response: { text: string }

  CHANGES (accuracy fix — see rollingTranscription.ts for the full story):
  - Default model is now whisper-large-v3 (not "-turbo"). Turbo trades
    accuracy for speed, which made sense when one call had to cover an
    entire multi-minute recording under time pressure. Now that both the
    Quran Hifdh page recorder and the Daily Hifdh recorder send short
    (~18-20s) overlapping chunks in the background WHILE the student is
    still reciting, the per-chunk latency difference is invisible to the
    student — so there's no reason to give up accuracy for it anymore.
  - response_format is now verbose_json, and this function filters at the
    SEGMENT level using no_speech_prob before joining text. The old code
    just returned whatever `.text` Groq handed back — but Groq's own
    internal no-speech detection can occasionally misjudge a real (if
    quiet/breathy) span of recitation as silence internally; there was no
    way to catch that from the plain `json` format. verbose_json exposes
    each segment's own no_speech_prob, so segments Groq was actually
    confident were silence get dropped, while everything else is kept —
    instead of an all-or-nothing decision on the whole response.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-warmup",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Segments with no_speech_prob at/above this are treated as non-speech and
// excluded from the joined transcript. Kept deliberately permissive (0.6,
// same threshold already used client-side in HifdhRevision.tsx) so quiet
// but real recitation isn't discarded — only segments Groq itself is fairly
// confident contain no speech at all.
const NO_SPEECH_THRESHOLD = 0.6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Lightweight warm-up ping — spins up this isolate without touching Groq
  // (and without burning a Groq call/quota). The client fires this the
  // instant a mic session starts, so the FIRST real repetition doesn't
  // pay a cold-start tax on top of the unavoidable network round trip.
  if (req.headers.get("x-warmup") === "1") {
    return new Response(JSON.stringify({ warm: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    let model = "whisper-large-v3";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (f instanceof File) file = f;
      const p = form.get("prompt");
      if (typeof p === "string" && p.length) prompt = p;
      const m = form.get("model");
      if (typeof m === "string" && m.length) model = m;
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
    fd.append("model", model);
    fd.append("language", "ar");
    fd.append("response_format", "verbose_json"); // gives per-segment no_speech_prob
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

    // Filter segment-by-segment instead of trusting the whole-response
    // `.text` field. Falls back to `.text` if this model/response somehow
    // didn't return segments (e.g. a future model without verbose_json
    // support), so nothing breaks if Groq's response shape shifts.
    const segments = Array.isArray(data?.segments) ? data.segments : null;
    const text = segments
      ? segments
          .filter((s: any) => (s?.no_speech_prob ?? 0) < NO_SPEECH_THRESHOLD)
          .map((s: any) => (s?.text ?? "").trim())
          .filter(Boolean)
          .join(" ")
      : (data?.text || "").trim();

    return new Response(JSON.stringify({ text, transcript: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, text: "" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});