import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) throw new Error("No audio file provided");

    // Convert File to ArrayBuffer for Deepgram
    const arrayBuffer = await audioFile.arrayBuffer();

    const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=ar&smart_format=true", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": audioFile.type,
      },
      body: arrayBuffer,
    });

    const data = await response.json();
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
