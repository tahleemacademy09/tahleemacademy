import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Get your Deepgram API Key from your Supabase Secrets
    const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY");

    // 2. Receive the audio file from your HifdhRevision component
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const arrayBuffer = await audioFile.arrayBuffer();

    // 3. Send it to Deepgram's Nova-2 Arabic model
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&smart_format=true",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": audioFile.type,
        },
        body: arrayBuffer,
      }
    );

    const data = await response.json();
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
