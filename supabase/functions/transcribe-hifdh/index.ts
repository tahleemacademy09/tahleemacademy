import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')
    const formData = await req.formData()
    const audioFile = formData.get('audio') as Blob
    
    if (!audioFile) throw new Error('No audio file provided')

    const arrayBuffer = await audioFile.arrayBuffer()

    // We use Nova-2 (Arabic) with no fixed Content-Type 
    // Deepgram will auto-detect if it's WebM (Android) or MP4 (iOS)
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=ar&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      },
      body: arrayBuffer,
    })

    const result = await response.json()
    
    if (!response.ok) throw new Error(result.err_msg || 'Deepgram API Error')

    return new Response(
      JSON.stringify({ transcript: result.results?.channels[0]?.alternatives[0]?.transcript || "" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
