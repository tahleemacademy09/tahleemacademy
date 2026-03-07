import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const makeJwt = async (apiKey: string, apiSecret: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss: apiKey, exp: now + 3600, nbf: now,
    video: { roomRecord: true }
  }));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  const sigStr = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${header}.${payload}.${sigStr}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id, duration_seconds, teacher_name } = await req.json();

    const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const jwt = await makeJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    // Get egress_id from file_url
    const { data: rec } = await supabase
      .from("session_recordings")
      .select("file_url")
      .eq("session_id", session_id)
      .single();

    const egressId = rec?.file_url?.replace("pending:", "");

    let file_url = "";

    if (egressId) {
      // Stop egress
      await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StopEgress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ egress_id: egressId })
      });

      // Wait 3 seconds for LiveKit to finish saving
      await new Promise(r => setTimeout(r, 3000));

      // Get egress info to find download URL
      const infoRes = await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/ListEgress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ egress_id: egressId })
      });

      const infoData = await infoRes.json();
      const egress = infoData.items?.[0];
      file_url = egress?.file?.download_url || egress?.file_results?.[0]?.download_url || "";
    }

    // Update recording with real download URL
    await supabase.from("session_recordings")
      .update({ file_url, duration_seconds, teacher_name })
      .eq("session_id", session_id);

    return new Response(
      JSON.stringify({ success: true, file_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
