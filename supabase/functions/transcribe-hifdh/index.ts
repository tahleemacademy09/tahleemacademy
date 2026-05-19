import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// ── CORS is computed per-request (req is available inside the handler) ────────
const ALLOWED_ORIGINS = [
  "https://tahleemacademy.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : "https://tahleemacademy.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const hdrs = corsHeaders(origin);

  // Pre-flight
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: hdrs });

  try {
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    if (!DEEPGRAM_API_KEY)
      throw new Error("Missing DEEPGRAM_API_KEY in Supabase secrets");

    const { audio, mimeType } = await req.json();
    if (!audio) throw new Error("No audio data received");

    // base64 → bytes
    const binary = atob(audio);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // ── Deepgram – Arabic Quranic transcription ──────────────────────────────
    // smart_format=false  → no non-Arabic punctuation / numeral reformatting
    // punctuate=false     → no injected punctuation marks
    // filler_words=false  → strip ums / uhs
    // numerals=false      → keep Arabic-script numbers
    // detect_language=false → we know it's Arabic; skipping detection is faster
    const dgResp = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&smart_format=false&filler_words=false&numerals=false&detect_language=false",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType || "audio/webm",
        },
        body: bytes,
      }
    );

    const result = await dgResp.json();
    if (!dgResp.ok) throw new Error(result.err_msg || "Deepgram failed");

    const transcript =
      result.results?.channels[0]?.alternatives[0]?.transcript || "";

    return new Response(JSON.stringify({ transcript, text: transcript }), {
      headers: { ...hdrs, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("transcribe-hifdh error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message, transcript: "", text: "" }),
      {
        headers: { ...hdrs, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
