const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { room_code, guest_name, guest_email, password } = await req.json();

    if (!room_code) {
      return new Response(JSON.stringify({ error: 'room_code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get public class
    const { data: publicClass, error: classError } = await supabase
      .from('public_classes')
      .select('*')
      .eq('room_code', room_code)
      .single();

    if (classError || !publicClass) {
      return new Response(JSON.stringify({ error: 'Class not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if user is authenticated (registered user or host)
    let isRegisteredUser = false;
    let userId: string | null = null;
    let isHost = false;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader !== 'Bearer null' && authHeader !== 'Bearer undefined') {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        isRegisteredUser = true;
        userId = user.id;
        isHost = publicClass.host_id === user.id;

        // Check if user is admin or teacher
        if (!isHost) {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);
          const userRoles = roles?.map((r: any) => r.role) || [];
          if (userRoles.includes('admin') || userRoles.includes('teacher')) {
            isHost = true; // Admins and teachers get host-level access
          }
        }
      }
    }

    // For non-host users, enforce live status and other checks
    if (!isHost) {
      if (publicClass.status !== 'live') {
        return new Response(JSON.stringify({ error: 'Class is not live', status: publicClass.status }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!guest_name) {
        return new Response(JSON.stringify({ error: 'guest_name is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check password
      if (publicClass.password_enabled && publicClass.password) {
        if (password !== publicClass.password) {
          return new Response(JSON.stringify({ error: 'Invalid password' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Check max guests
      if (publicClass.guest_count >= publicClass.max_guests) {
        return new Response(JSON.stringify({ error: 'Class is full' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const guestId = crypto.randomUUID();
    const participantName = isHost 
      ? (guest_name || 'Teacher')
      : (guest_name || 'Guest');
    const identity = isHost 
      ? `host_${userId}` 
      : isRegisteredUser 
        ? `user_${userId}` 
        : `guest_${guestId}`;

    // Save guest record for non-host users
    if (!isHost) {
      await supabase.from('public_class_guests').insert({
        class_id: publicClass.id,
        guest_name: participantName,
        guest_email: guest_email || null,
        is_registered_user: isRegisteredUser,
        user_id: userId,
        device_info: req.headers.get('User-Agent') || null,
      });

      // Increment guest count
      await supabase.from('public_classes')
        .update({ guest_count: (publicClass.guest_count || 0) + 1 })
        .eq('id', publicClass.id);
    }

    // Generate LiveKit token
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!;

    const roomName = publicClass.livekit_room_name || `public-${publicClass.room_code}`;

    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 7200; // 2 hours

    const videoGrant: Record<string, unknown> = {
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublishData: true,
    };

    if (isHost) {
      // Host gets full permissions
      videoGrant.canPublish = true;
      videoGrant.roomAdmin = true;
      videoGrant.roomRecord = true;
    } else {
      // Guests get limited permissions based on class settings
      videoGrant.canPublish = publicClass.allow_guest_camera || publicClass.allow_guest_mic;
    }

    const claims: Record<string, unknown> = {
      iss: LIVEKIT_API_KEY,
      sub: identity,
      nbf: now,
      exp,
      jti: identity,
      name: participantName,
      video: videoGrant,
      metadata: JSON.stringify({
        role: isHost ? 'host' : 'guest',
        guest_id: isHost ? null : guestId,
        class_id: publicClass.id,
        is_registered: isRegisteredUser,
        is_host: isHost,
      }),
    };

    const enc = new TextEncoder();
    const b64url = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const b64urlStr = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const headerB64 = b64urlStr(JSON.stringify(header));
    const claimsB64 = b64urlStr(JSON.stringify(claims));
    const sigInput = `${headerB64}.${claimsB64}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(LIVEKIT_API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(JSON.stringify({
      token,
      url: LIVEKIT_URL,
      room: roomName,
      role: isHost ? 'host' : 'guest',
      participant_name: participantName,
      class_id: publicClass.id,
      class_title: publicClass.title,
      class_title_ar: publicClass.title_ar,
      is_host: isHost,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
