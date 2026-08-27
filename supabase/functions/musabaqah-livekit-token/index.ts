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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // PERF FIX: mirrors the same fix already applied in livekit-token/index.ts
    // ("takes ~16s before my details show up") — these two lookups (my roles,
    // my profile) don't depend on each other at all, but were being awaited
    // one after another, stacking two full Postgres round trips before the
    // token could be returned. Running them together with Promise.all cuts
    // that to the cost of the single slowest query instead of the sum of both.
    const [{ data: roles }, { data: profile }] = await Promise.all([
      serviceClient.from("user_roles").select("role").eq("user_id", user.id),
      serviceClient.from("profiles").select("full_name").eq("user_id", user.id).single(),
    ]);
    const userRoles      = roles?.map((r: any) => r.role) || [];
    const isPrivileged    = userRoles.includes("admin") || userRoles.includes("teacher");
    const participantName = profile?.full_name || user.email || "Anonymous";

    // General-subject Musabaqah rooms are shared by three pages (this
    // function's room naming is generic), so only tighten publish rights
    // when room_code actually resolves to a general_musabaqah_events row —
    // any other caller (e.g. the Qur'an Musabaqah) falls through to the
    // pre-existing "everyone can publish" behavior untouched.
    //
    // Within a general_musabaqah event: the judge can always publish; a
    // student can only publish if THEY are event.current_participant_id
    // (i.e. it's actually their turn on stage). Every other admitted/
    // waiting student who has joined to watch connects subscribe-only —
    // enforced here in the token, not just hidden client-side, so a student
    // can't just flip a client toggle to broadcast over someone else's turn.
    let canPublish = true;
    if (!isPrivileged) {
      const { data: gmEvent } = await serviceClient
        .from("general_musabaqah_events")
        .select("id, current_participant_id")
        .eq("room_code", room_code.toUpperCase())
        .maybeSingle();
      if (gmEvent) {
        const { data: myParticipant } = await serviceClient
          .from("general_musabaqah_participants")
          .select("id")
          .eq("event_id", gmEvent.id)
          .eq("user_id", user.id)
          .maybeSingle();
        canPublish = !!myParticipant && myParticipant.id === gmEvent.current_participant_id;
      }
    }

    const roomName = `musabaqah-${room_code.toUpperCase()}`;

    // Build JWT
    const enc = new TextEncoder();
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const b64urlStr = (str: string) => {
      // FIX: the old code here was `btoa(str)` directly — btoa() throws a
      // DOMException for any character outside Latin-1. participantName
      // comes from the user's profile full_name, which on this platform is
      // very often Arabic. Any participant with an Arabic name would hit
      // this throw inside JSON.stringify(claims) → b64urlStr(...), get
      // caught by the outer try/catch, and receive a silent 500 — leaving
      // them stuck on "Reconnecting…" when trying to join a Musabaqah room.
      // Same fix already applied in livekit-token and public-class-token.
      const bytes = enc.encode(str);           // UTF-8 encode first
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

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
        canPublish,           // gated above for general_musabaqah spectators; unchanged (true) for everyone else
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