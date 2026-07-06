// supabase/functions/tajweed-check/index.ts
//
// Proxies a student's recitation recording + the expected ayah text to the
// Modal-hosted Muaalem tajweed model (see modal_app.py), and returns its
// pronunciation-error breakdown — including ghunnah-specific flags — to the
// client. This is a SECOND, optional pass alongside your existing
// groq-transcribe function: keep Groq for word-accuracy scoring, add this
// for tajweed/articulation feedback.
//
// Set the deployed Modal URL as a Supabase secret:
//   supabase secrets set TAJWEED_SERVICE_URL=https://your-app--fastapi-app.modal.run

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const TAJWEED_SERVICE_URL = Deno.env.get("TAJWEED_SERVICE_URL");
    if (!TAJWEED_SERVICE_URL) {
      return new Response(
        JSON.stringify({ error: "TAJWEED_SERVICE_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ct = req.headers.get("content-type") || "";
    let audioBytes: Uint8Array;
    let mimeType = "audio/webm";
    let expectedText = "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File)) throw new Error("no audio file received");
      audioBytes = new Uint8Array(await f.arrayBuffer());
      mimeType = f.type || mimeType;
      expectedText = String(form.get("expected_text") || "");
    } else {
      // JSON fallback: { audio: base64, mimeType, expected_text } — same
      // shape your client already uses for groq-transcribe / transcribe-hifdh.
      const { audio, mimeType: mt, expected_text } = await req.json();
      if (!audio) throw new Error("missing audio");
      const bin = atob(audio);
      audioBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) audioBytes[i] = bin.charCodeAt(i);
      mimeType = mt || mimeType;
      expectedText = expected_text || "";
    }

    if (!expectedText) throw new Error("missing expected_text (the ayah being recited)");

    // Forward to the Modal FastAPI endpoint as multipart/form-data.
    const fd = new FormData();
    fd.append("file", new File([audioBytes], "audio.webm", { type: mimeType }));
    fd.append("expected_text", expectedText);

    // Give the model service a generous timeout — cold GPU starts on Modal
    // can take a few seconds the first time.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const r = await fetch(`${TAJWEED_SERVICE_URL}/analyze`, {
      method: "POST",
      body: fd,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: data?.error || `tajweed service ${r.status}` }),
        { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("tajweed-check error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
