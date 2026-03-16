import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File;

    if (!audio) {
      return new Response(JSON.stringify({ error: "No audio file" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const groqForm = new FormData();
    groqForm.append("file", audio, "recitation.webm");
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("language", "ar");
    groqForm.append("response_format", "json");
    groqForm.append("prompt", "Quranic Arabic recitation. Transcribe in Arabic script with diacritics.");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
      body: groqForm,
    });

    const data = await res.json();
    return new Response(JSON.stringify({ transcript: data.text || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
