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
    const { session_id, subject_id, room_name } = await req.json();

    const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create JWT for LiveKit API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(LIVEKIT_API_SECRET);
    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = btoa(JSON.stringify({
      iss: LIVEKIT_API_KEY,
      exp: now + 3600,
      nbf: now,
      video: { roomRecord: true }
    }));

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${header}.${payload}`)
    );

    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const jwt = `${header}.${payload}.${sig}`;

    // Start Egress recording
    const egressRes = await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`
      },
      body: JSON.stringify({
        room_name: room_name || subject_id,
        layout: "speaker-dark",
        file: {
          filepath: `recordings/${session_id}.mp4`,
          s3: {
            access_key: Deno.env.get("S3_ACCESS_KEY") || "",
            secret: Deno.env.get("S3_SECRET_KEY") || "",
            region: Deno.env.get("S3_REGION") || "us-east-1",
            bucket: Deno.env.get("S3_BUCKET") || "recordings",
            endpoint: `${SUPABASE_URL}/storage/v1/s3`,
            force_path_style: true,
          }
        }
      })
    });

    const egressData = await egressRes.json();

    if (!egressRes.ok) {
      throw new Error(egressData.message || "Failed to start egress");
    }

    // Save egress_id to database
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    await supabase.from("session_recordings").update({
      egress_id: egressData.egress_id
    }).eq("session_id", session_id);

    return new Response(
      JSON.stringify({ success: true, egress_id: egressData.egress_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
