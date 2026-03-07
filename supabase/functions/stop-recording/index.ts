import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session_id, subject_id, duration_seconds, teacher_name } = await req.json();

    const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get egress_id we stored in file_url field
    const { data: recording } = await supabase
      .from("session_recordings")
      .select("file_url")
      .eq("session_id", session_id)
      .single();

    const egressId = recording?.file_url?.replace("EGRESS:", "");

    if (egressId && egressId.startsWith("EGRESS:") === false && egressId.length > 5) {
      // Create JWT
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
        "HMAC", key, encoder.encode(`${header}.${payload}`)
      );
      const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const jwt = `${header}.${payload}.${sig}`;

      // Stop Egress
      await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StopEgress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`
        },
        body: JSON.stringify({ egress_id: egressId })
      });
    }

    // Final file URL in Supabase storage
    const file_url = `${SUPABASE_URL}/storage/v1/object/public/recordings/${session_id}.mp4`;

    // Update recording with real URL
    await supabase
      .from("session_recordings")
      .update({
        file_url,
        duration_seconds,
        teacher_name: teacher_name || "Teacher",
      })
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
