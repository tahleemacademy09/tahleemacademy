import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { subject_id, action, room_name } = body;

    const LIVEKIT_API_KEY    = Deno.env.get('LIVEKIT_API_KEY');
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const LIVEKIT_URL        = Deno.env.get('LIVEKIT_URL');

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(JSON.stringify({ error: 'LiveKit not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get user role
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roles } = await serviceClient.from('user_roles').select('role').eq('user_id', user.id);
    const userRoles    = roles?.map((r: any) => r.role) || [];
    const isPrivileged = userRoles.includes('admin') || userRoles.includes('teacher');

    // Get display name
    const { data: profile } = await serviceClient
      .from('profiles').select('full_name').eq('user_id', user.id).single();
    const participantName = profile?.full_name || user.email || 'Anonymous';

    let finalRoomName: string;
    let roleLabel: string;

    // ── MODE A: Musabaqah room (room_name provided directly) ──────────────
    if (room_name) {
      finalRoomName = room_name;
      roleLabel     = isPrivileged ? 'judge' : 'participant';

    // ── MODE B: Live class (subject_id — existing behaviour) ──────────────
    } else if (subject_id) {
      const { data: subject, error: subjectError } = await serviceClient
        .from('subjects').select('*').eq('id', subject_id).single();

      if (subjectError || !subject) {
        return new Response(JSON.stringify({ error: 'Subject not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!subject.is_active && !isPrivileged) {
        return new Response(JSON.stringify({ error: 'Subject is not active' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      finalRoomName = subject.livekit_room_name || `subject-${subject.id}`;
      roleLabel     = isPrivileged ? 'teacher' : 'student';

      // Handle start_session action
      //
      // FIX: this used to ONLY check for a row already marked "live" — if none
      // existed it always INSERTed a brand-new live_sessions row, even when a
      // "scheduled" placeholder for this exact class already existed (created
      // ahead of time via the admin's Schedule form, or by the recurring
      // timetable). That left two disconnected rows behind: the original
      // "scheduled" row (which some views later flip to "completed"/"done"
      // purely because its time passed, without it ever actually being used)
      // and a brand-new row that the real attendance_logs/manual_attendance
      // rows for the class actually pointed to. Whoever opened the OLD
      // scheduled row afterwards to check attendance saw "No students found"
      // even though people genuinely attended — their data was just sitting
      // under the other, hidden row.
      //
      // Now: reuse the nearest not-yet-started scheduled session for this
      // subject (if one exists) by flipping IT to live, so the row the admin
      // already sees in their Sessions list is the same row attendance gets
      // recorded against. Only create a new row if no scheduled placeholder
      // exists at all. Also set actual_start_time here (previously only set
      // by the client-side "instant class" path) so every code path that
      // creates/starts a session sorts consistently by the same column.
      if (action === 'start_session' && isPrivileged) {
        const { data: existingLive } = await serviceClient
          .from('live_sessions').select('id')
          .eq('subject_id', subject_id).eq('status', 'live').maybeSingle();

        if (!existingLive) {
          const nowIso = new Date().toISOString();
          const { data: existingScheduled } = await serviceClient
            .from('live_sessions').select('id')
            .eq('subject_id', subject_id).eq('status', 'scheduled')
            .order('scheduled_at', { ascending: true })
            .limit(1).maybeSingle();

          if (existingScheduled) {
            await serviceClient.from('live_sessions')
              .update({ status: 'live', started_at: nowIso, actual_start_time: nowIso })
              .eq('id', existingScheduled.id);
          } else {
            await serviceClient.from('live_sessions').insert({
              subject_id,
              host_id:           user.id,
              status:            'live',
              started_at:        nowIso,
              actual_start_time: nowIso,
            });
          }
        }
      }

      // Log activity
      await serviceClient.from('activity_logs').insert({
        user_id:     user.id,
        action:      action === 'start_session' ? 'start_live_class' : 'join_live_class',
        entity_type: 'subject',
        entity_id:   subject_id,
        metadata:    { room: finalRoomName, role: roleLabel },
      });

    } else {
      return new Response(JSON.stringify({ error: 'subject_id or room_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Build JWT ─────────────────────────────────────────────────────────
    const enc = new TextEncoder();

    // FIX: b64url for binary (signature) — unchanged
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    // FIX: b64urlStr now uses TextEncoder so Arabic/Unicode names are handled
    // correctly. The old btoa(str) would throw a DOMException for any character
    // outside Latin-1 (e.g. Arabic full_name values), silently returning a 500
    // and leaving the client stuck in the "Reconnecting..." loop.
    const b64urlStr = (str: string) => {
      const bytes = enc.encode(str);           // UTF-8 encode
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const now    = Math.floor(Date.now() / 1000);
    const exp    = now + 28800; // 8 hours

    const header = { alg: 'HS256', typ: 'JWT' };
    const claims: any = {
      iss:  LIVEKIT_API_KEY,
      sub:  user.id,
      nbf:  now,
      exp,
      // FIX: jti must always be globally unique. Using user.id + timestamp +
      // random suffix ensures no two tokens share the same jti, preventing
      // potential replay-rejection by the LiveKit server.
      jti:  `${user.id}-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: participantName,
      video: {
        roomJoin:       true,
        room:           finalRoomName,
        canPublish:     true,
        canSubscribe:   true,
        canPublishData: true,
      },
      metadata: JSON.stringify({ role: roleLabel, user_id: user.id, name: participantName }),
    };

    if (isPrivileged) {
      claims.video.roomAdmin  = true;
      claims.video.roomRecord = true;
    }

    const headerB64 = b64urlStr(JSON.stringify(header));
    const claimsB64 = b64urlStr(JSON.stringify(claims));
    const sigInput  = `${headerB64}.${claimsB64}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(LIVEKIT_API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig   = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(JSON.stringify({
      token,
      url:              LIVEKIT_URL,
      room:             finalRoomName,
      role:             roleLabel,
      participant_name: participantName,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
