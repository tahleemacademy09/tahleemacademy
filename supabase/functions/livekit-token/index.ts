import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      if (action === 'start_session' && isPrivileged) {
        const { data: existingSession } = await serviceClient
          .from('live_sessions').select('id')
          .eq('subject_id', subject_id).eq('status', 'live').maybeSingle();

        if (!existingSession) {
          await serviceClient.from('live_sessions').insert({
            subject_id,
            host_id:    user.id,
            status:     'live',
            started_at: new Date().toISOString(),
          });
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
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const b64urlStr = (str: string) =>
      btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const header = { alg: 'HS256', typ: 'JWT' };
    const now    = Math.floor(Date.now() / 1000);
    const exp    = now + 28800; // 8 hours

    const claims: any = {
      iss:  LIVEKIT_API_KEY,
      sub:  user.id,
      nbf:  now,
      exp,
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
