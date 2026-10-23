// stop-recording — tells LiveKit to stop the egress job for this session.
//
// Important: this function does NOT wait for or fetch the final file. That
// used to be a fixed 3-second wait + a single check for the download URL,
// which is exactly why recordings sometimes came back blank on longer
// classes — 3 seconds isn't always enough for LiveKit to finish uploading.
// Finalization now happens reliably in livekit-egress-webhook, which
// LiveKit calls the moment the file is actually ready, however long that
// takes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const b64url = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlStr = (str: string) => {
  const enc = new TextEncoder();
  const bytes = enc.encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const makeJwt = async (apiKey: string, apiSecret: string) => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: apiKey, exp: now + 3600, nbf: now, video: { roomRecord: true } };
  const sigInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(sigInput));
  return `${sigInput}.${b64url(sig)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LIVEKIT_API_KEY      = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET   = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL          = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: rec } = await admin
      .from("session_recordings").select("id, egress_id")
      .eq("session_id", session_id).eq("status", "recording").maybeSingle();

    if (!rec?.egress_id) {
      // Nothing actively recording for this session — not an error, just a no-op.
      return new Response(JSON.stringify({ success: true, note: "No active recording found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jwt = await makeJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StopEgress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ egress_id: rec.egress_id }),
    });

    // Mark as "processing" — the webhook flips this to "completed" (or
    // "failed") once LiveKit confirms the file is written.
    await admin.from("session_recordings").update({ status: "processing" }).eq("id", rec.id);
    await admin.from("live_sessions").update({ is_recording: false }).eq("id", session_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
