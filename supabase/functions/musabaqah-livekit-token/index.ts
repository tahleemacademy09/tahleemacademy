/*
  supabase/functions/musabaqah-livekit-token/index.ts
  ─────────────────────────────────────────────────────
  Generates a LiveKit JWT for the musabaqah competition rooms.
  Unlike the subject-based livekit-token function, this one
  accepts a room_code and creates a token for musabaqah-{room_code}.

  POST body:
    { room_code: string, is_judge?: boolean }
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  // Only allow requests from the production domain (and local dev)
  "Access-Control-Allow-Origin":
    ["https://tahleemacademy.vercel.app", "http://localhost:5173"].includes(
      new URL(req.url).searchParams.get("_origin") ?? ""
    )
      ? (new URL(req.url).searchParams.get("_origin") as string)
      : "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey  = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LIVEKIT_API_KEY    = Deno.env.get("LIVEKIT_API_KEY");
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET");
    const LIVEKIT_URL        = Deno.env.get("LIVEKIT_URL");

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { room_code } = await req.json();
    if (!room_code) {
      return new Response(JSON.stringify({ error: "room_code required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user role
    const { data: roles } = await serviceClient
      .from("user_roles").select("role").eq("user_id", user.id);
    const userRoles   = roles?.map((r: any) => r.role) || [];
    const isPrivileged = userRoles.includes("admin") || userRoles.includes("teacher");

    // Get display name
    const { data: profile } = await serviceClient
      .from("profiles").select("full_name").eq("user_id", user.id).single();
    const participantName = profile?.full_name || user.email || "Anonymous";

    const roomName = `musabaqah-${room_code.toUpperCase()}`;

    // Build JWT
    const enc = new TextEncoder();
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const b64urlStr = (str: string) =>
      btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 28800; // 8 hours

    const claims: any = {
      iss: LIVEKIT_API_KEY,
      sub: user.id,
      nbf: now,
      exp,
      jti: `${user.id}-musabaqah-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: participantName,
      video: {
        roomJoin:     true,
        room:         roomName,
        canPublish:   true,   // all can publish; layout controls visibility
        canSubscribe: true,
        canPublishData: true,
      },
      metadata: JSON.stringify({
        role:    isPrivileged ? "judge" : "participant",
        user_id: user.id,
        name:    participantName,
      }),
    };

    if (isPrivileged) {
      claims.video.roomAdmin  = true;
      claims.video.roomRecord = true;
    }

    const headerB64  = b64urlStr(JSON.stringify(header));
    const claimsB64  = b64urlStr(JSON.stringify(claims));
    const sigInput   = `${headerB64}.${claimsB64}`;

    const key = await crypto.subtle.importKey(
      "raw", enc.encode(LIVEKIT_API_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig   = await crypto.subtle.sign("HMAC", key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(
      JSON.stringify({ token, url: LIVEKIT_URL, room: roomName, role: isPrivileged ? "judge" : "participant", participant_name: participantName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
