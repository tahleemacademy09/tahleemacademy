// start-recording — begins a server-side LiveKit Egress recording of a live
// class. Unlike the old client-side MediaRecorder approach, this recording
// lives on LiveKit's infrastructure: it keeps going even if the teacher's
// device disconnects, sleeps, or the app crashes.
//
// The finished file is written straight to Supabase Storage's S3-compatible
// endpoint under the SAME "recordings" bucket / "sessions/<id>/..." path
// convention already used elsewhere in the app, so the existing playback
// code (SubjectRecordings.tsx → getSignedUrl) needs no changes.
//
// Finalization (the real download-ready file_url + duration) is written by
// the livekit-egress-webhook function when LiveKit calls us back — this
// function only starts the job and records that it's in progress.

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { session_id, subject_id } = await req.json();
    if (!session_id || !subject_id) {
      return new Response(JSON.stringify({ error: "session_id and subject_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LIVEKIT_API_KEY      = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET   = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL          = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");

    // S3-compatible destination — Supabase Storage's S3 connection details.
    // Set these via `supabase secrets set` (see project README / setup notes).
    const S3_ENDPOINT    = Deno.env.get("RECORDINGS_S3_ENDPOINT")!;
    const S3_REGION      = Deno.env.get("RECORDINGS_S3_REGION") || "us-east-1";
    const S3_ACCESS_KEY  = Deno.env.get("RECORDINGS_S3_ACCESS_KEY")!;
    const S3_SECRET_KEY  = Deno.env.get("RECORDINGS_S3_SECRET_KEY")!;
    const S3_BUCKET      = Deno.env.get("RECORDINGS_S3_BUCKET") || "recordings";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Only teachers/admins may start a recording.
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isPrivileged = (roles || []).some((r: any) => r.role === "admin" || r.role === "teacher");
    if (!isPrivileged) {
      return new Response(JSON.stringify({ error: "Not authorized to record" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve the room name EXACTLY the way livekit-token does — this is the
    // bug that would have silently broken the old version of this function:
    // it recorded `room_name: subject_id`, which never matched the room the
    // class actually connects to (`subject.livekit_room_name || subject-<id>`).
    const { data: subject, error: subjectErr } = await admin
      .from("subjects").select("id, livekit_room_name").eq("id", subject_id).single();
    if (subjectErr || !subject) {
      return new Response(JSON.stringify({ error: "Subject not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const roomName = subject.livekit_room_name || `subject-${subject.id}`;

    // Guard against double-starting a recording for the same session.
    const { data: existing } = await admin
      .from("session_recordings").select("id, status")
      .eq("session_id", session_id).in("status", ["recording", "processing"]).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "A recording is already in progress for this session" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jwt = await makeJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const filepath = `sessions/${session_id}/${session_id}.mp4`;

    const res = await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        room_name: roomName,
        layout: "speaker-dark",
        file_outputs: [{
          filepath,
          s3: {
            access_key: S3_ACCESS_KEY,
            secret: S3_SECRET_KEY,
            bucket: S3_BUCKET,
            region: S3_REGION,
            endpoint: S3_ENDPOINT,
            force_path_style: true,
          },
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to start recording");

    // Insert a fresh row tracking this job (the webhook will fill in the
    // final duration/file size and flip status to "completed" once LiveKit
    // finishes writing the file).
    await admin.from("session_recordings").insert({
      subject_id,
      session_id,
      egress_id: data.egress_id,
      file_url: filepath,
      teacher_name: user.email || "Teacher",
      status: "recording",
    });

    await admin.from("live_sessions").update({ is_recording: true }).eq("id", session_id);

    return new Response(
      JSON.stringify({ success: true, egress_id: data.egress_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
