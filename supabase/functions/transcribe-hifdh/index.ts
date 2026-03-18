import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')
    if (!DEEPGRAM_API_KEY) throw new Error("Missing DEEPGRAM_API_KEY in Supabase secrets")

    const { audio, mimeType } = await req.json()
    if (!audio) throw new Error('No audio data received')

    const binary = atob(audio)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&language=ar&smart_format=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': mimeType || 'audio/webm',
        },
        body: bytes,
      }
    )

    const result = await response.json()
    if (!response.ok) throw new Error(result.err_msg || 'Deepgram failed')

    const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || ""
    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    })

  } catch (error) {
    console.error("transcribe-hifdh error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }
})