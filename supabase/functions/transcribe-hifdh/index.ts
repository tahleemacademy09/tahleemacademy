import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')
    if (!DEEPGRAM_API_KEY) throw new Error("Missing DEEPGRAM_API_KEY")

    // Read the raw binary data from the request
    const arrayBuffer = await req.arrayBuffer()
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('No audio data received')
    }

    console.log(`Processing audio: ${arrayBuffer.byteLength} bytes`)

    // Call Deepgram with Nova-2 for Arabic
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=ar&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm', // Deepgram auto-detects, but we provide a hint
      },
      body: arrayBuffer,
    })

    const result = await response.json()

    if (!response.ok) {
      console.error("Deepgram Error:", result)
      throw new Error(result.err_msg || 'Deepgram transcription failed')
    }

    const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || ""
    
    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("Function Error:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
