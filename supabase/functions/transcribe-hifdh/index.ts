import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as Blob

    if (!audioFile) {
      throw new Error('No audio file provided')
    }

    // Convert Blob to ArrayBuffer for Deepgram
    const arrayBuffer = await audioFile.arrayBuffer()

    // Call Deepgram API
    // We use model: 'whisper-large' and language: 'ar' for best results with Quranic Arabic
    const response = await fetch('https://api.deepgram.com/v1/listen?model=whisper-large&language=ar&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm',
      },
      body: arrayBuffer,
    })

    const result = await response.json()
    const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || ""

    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
