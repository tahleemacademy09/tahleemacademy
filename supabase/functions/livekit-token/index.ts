// moderate-participant — Tahleem Academy
//
// Backs every host moderation action in the live classroom: Admit/Deny (the
// Waiting Room prompt in JoinRequestBanner) and Remove/Ban/Unban (the
// Participants panel in ClassParticipants.tsx). All five already called this
// exact function name from the client — it just didn't exist yet, so every
// one of those buttons failed silently. This is that function.
//
// "remove" and "ban" also force-disconnect the person from the live LiveKit
// room right now, via LiveKit's server-side RoomService API (the only way to
// drop someone else's connection — the client SDK can only manage your own).
// That's a plain HTTPS call signed with a short-lived admin JWT built the
// same way livekit-token already builds participant JWTs, just with a
// `roomAdmin` grant instead of `roomJoin`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── LiveKit RoomService admin call (same raw-JWT approach livekit-token uses,
// just with roomAdmin instead of roomJoin, and no participant identity). ────
async function removeParticipantFromRoom(livekitUrl: string, apiKey: string, apiSecret: string, room: string, identity: string) {
  const enc = new TextEncoder();
  const b64url = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64urlStr = (str: string) => {
    const bytes = enc.encode(str);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = { iss: apiKey, sub: apiKey, nbf: now, exp: now + 600, video: { roomAdmin: true, room } };
  const headerB64 = b64urlStr(JSON.stringify(header));
  const claimsB64 = b64urlStr(JSON.stringify(claims));
  const sigInput = `${headerB64}.${claimsB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput));
  const adminToken = `${sigInput}.${b64url(sig)}`;

  const httpUrl = livekitUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  try {
    const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/RemoveParticipant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, identity }),
    });
    // Not fatal if this fails (e.g. they'd already left) — the DB side below
    // still records the ban/removal either way, so moderation never gets
    // stuck waiting on LiveKit's own connection state.
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[moderate-participant] RemoveParticipant failed:', res.status, t);
    }
  } catch (e) {
    console.warn('[moderate-participant] RemoveParticipant request failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const { session_id, student_id, action, identity: identityFromClient } = body;
    if (!session_id || !student_id || !action) return json({ error: 'session_id, student_id and action are required' }, 400);
    if (!['admit', 'deny', 'remove', 'ban', 'unban'].includes(action)) return json({ error: 'Unknown action' }, 400);

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Only an admin/teacher may moderate anyone — self-service students never
    // reach this far usefully since the client only exposes these buttons to
    // a privileged host, but the check is enforced here regardless of what
    // the client sends.
    const { data: roles } = await serviceClient.from('user_roles').select('role').eq('user_id', user.id);
    const isPrivileged = (roles || []).some((r: any) => r.role === 'admin' || r.role === 'teacher');
    if (!isPrivileged) return json({ error: 'Not authorized' }, 403);

    const { data: session, error: sessErr } = await serviceClient
      .from('live_sessions').select('id, subject_id').eq('id', session_id).single();
    if (sessErr || !session) return json({ error: 'Session not found' }, 404);

    // Force-disconnect right now for the two actions that end someone's
    // current connection outright — resolved via the same subject →
    // livekit_room_name mapping livekit-token itself uses.
    if (action === 'remove' || action === 'ban') {
      const LIVEKIT_API_KEY    = Deno.env.get('LIVEKIT_API_KEY');
      const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
      const LIVEKIT_URL        = Deno.env.get('LIVEKIT_URL');
      if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL) {
        const { data: subject } = await serviceClient
          .from('subjects').select('livekit_room_name').eq('id', session.subject_id).single();
        const roomName = subject?.livekit_room_name || `subject-${session.subject_id}`;
        await removeParticipantFromRoom(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, roomName, identityFromClient || student_id);
      }
    }

    const nowIso = new Date().toISOString();
    switch (action) {
      case 'remove':
        // Free to rejoin right away — clear any pending/ban flags so a fresh
        // livekit-token call issues a token normally instead of re-queuing them.
        await serviceClient.from('class_participants')
          .update({ is_banned: false, join_request_status: null })
          .eq('session_id', session_id).eq('student_id', student_id);
        break;
      case 'ban':
        await serviceClient.from('class_participants')
          .upsert({ session_id, student_id, is_banned: true, banned_at: nowIso, banned_by: user.id, join_request_status: null },
                  { onConflict: 'session_id,student_id' });
        break;
      case 'unban':
        await serviceClient.from('class_participants')
          .update({ is_banned: false, join_request_status: null, banned_at: null, banned_by: null })
          .eq('session_id', session_id).eq('student_id', student_id);
        break;
      case 'admit':
        await serviceClient.from('class_participants')
          .update({ is_banned: false, join_request_status: 'admitted' })
          .eq('session_id', session_id).eq('student_id', student_id);
        break;
      case 'deny':
        await serviceClient.from('class_participants')
          .update({ join_request_status: 'denied' })
          .eq('session_id', session_id).eq('student_id', student_id);
        break;
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});
