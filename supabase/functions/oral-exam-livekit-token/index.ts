/*
  supabase/functions/oral-exam-livekit-token/index.ts
  ─────────────────────────────────────────────────────
  Generates a LiveKit JWT for a shared oral-exam room (one room per exam,
  room name `oral-exam-{exam_id}`). Mirrors musabaqah-livekit-token's
  turn-gating: the teacher/admin can always publish; a student can only
  publish (camera/mic) while THEY are the exam's current on-stage slot
  (oral_exam_sessions.current_slot_id) — every other waiting/admitted
  student connects subscribe-only, enforced here in the token itself so it
  can't be bypassed client-side.

  POST body: { exam_id: string }
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const { exam_id } = await req.json();
    if (!exam_id) {
      return new Response(JSON.stringify({ error: "exam_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: roles }, { data: profile }] = await Promise.all([
      serviceClient.from("user_roles").select("role").eq("user_id", user.id),
      serviceClient.from("profiles").select("full_name, avatar_url").eq("user_id", user.id).single(),
    ]);
    const userRoles      = roles?.map((r: any) => r.role) || [];
    const isPrivileged    = userRoles.includes("admin") || userRoles.includes("teacher");
    const participantName = profile?.full_name || user.email || "Anonymous";

    // Turn-gating: a student can only publish while it's their turn on stage.
    let canPublish = true;
    if (!isPrivileged) {
      const { data: session } = await serviceClient
        .from("oral_exam_sessions")
        .select("current_slot_id")
        .eq("exam_id", exam_id)
        .maybeSingle();

      canPublish = false;
      if (session?.current_slot_id) {
        const { data: mySlot } = await serviceClient
          .from("oral_exam_slots")
          .select("id")
          .eq("id", session.current_slot_id)
          .eq("student_id", user.id)
          .maybeSingle();
        canPublish = !!mySlot;
      }
    }

    const roomName = `oral-exam-${exam_id}`;

    const enc = new TextEncoder();
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const b64urlStr = (str: string) => {
      const bytes = enc.encode(str); // UTF-8 first — Arabic-safe (see livekit-token fix)
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
      jti: `${user.id}-oralexam-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: participantName,
      video: {
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
      metadata: JSON.stringify({
        role: isPrivileged ? "examiner" : "student",
        user_id: user.id,
        name: participantName,
        avatar_url: profile?.avatar_url || null,
      }),
    };

    if (isPrivileged) {
      claims.video.roomAdmin = true;
      claims.video.roomRecord = true;
    }

    const headerB64 = b64urlStr(JSON.stringify(header));
    const claimsB64 = b64urlStr(JSON.stringify(claims));
    const sigInput = `${headerB64}.${claimsB64}`;

    const key = await crypto.subtle.importKey(
      "raw", enc.encode(LIVEKIT_API_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(
      JSON.stringify({
        token,
        url: LIVEKIT_URL,
        room: roomName,
        role: isPrivileged ? "examiner" : "student",
        can_publish: canPublish,
        participant_name: participantName,
      }),
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
