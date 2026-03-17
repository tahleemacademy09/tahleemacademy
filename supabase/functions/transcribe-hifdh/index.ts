import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; // Fixed uppercase "Import"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate environment variables
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) {
      throw new Error("GROQ API key not set");
    }

    // Process request
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    // Type-safe form data validation
    if (!(audioFile instanceof File)) {
      return new Response(JSON.stringify({ 
        error: "Invalid audio file in request" 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // FIX 1: Reconstruct the audio file into a fresh Blob. 
    // This prevents Deno from corrupting the stream when forwarding it.
    const arrayBuffer = await audioFile.arrayBuffer();
    const mimeType = audioFile.type || "audio/webm";
    const audioBlob = new Blob([arrayBuffer], { type: mimeType });

    // Create request to transcribe audio
    const groqForm = new FormData();
    groqForm.append("file", audioBlob, "recitation.webm");
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("language", "ar");
    groqForm.append("response_format", "json");
    groqForm.append("prompt", "Quranic Arabic recitation. Transcribe in Arabic script with diacritics.");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${groqApiKey}` 
        // Note: Do NOT add 'Content-Type': 'multipart/form-data' here. 
        // fetch will automatically set it with the correct boundary.
      },
      body: groqForm,
    });

    // FIX 2: Actually catch and throw Groq API errors
    if (!res.ok) {
      const errorData = await res.text();
      console.error("Groq API Error Details:", errorData);
      throw new Error(`Groq rejected the request (${res.status}): ${errorData}`);
    }

    // Handle transcription response
    const data = await res.json();
    return new Response(JSON.stringify({ 
      transcript: data.text || "No transcription found" 
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error(`Server error: ${e.message}`);
    
    // Better error handling that passes the actual error back to your frontend
    return new Response(JSON.stringify({ 
      error: e.message || "Internal server error" 
    }), { 
      status: e.message.includes("GROQ API key") ? 500 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
