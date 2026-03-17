import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('DEEPGRAM_API_KEY')
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY is missing in Supabase Secrets')

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File

    const arrayBuffer = await audioFile.arrayBuffer()

    // Calling Deepgram Nova-3 Arabic
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=ar&smart_format=true&diarize=false",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": audioFile.type || "audio/webm",
        },
        body: arrayBuffer,
      }
    )

    const data = await response.json()
    // Deepgram returns text in this specific path
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || ""

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
