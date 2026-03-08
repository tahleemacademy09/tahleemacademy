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

    if (!room_code || !guest_name) {
      return new Response(JSON.stringify({ error: 'room_code and guest_name are required' }),
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

    if (publicClass.status !== 'live') {
      return new Response(JSON.stringify({ error: 'Class is not live', status: publicClass.status }),
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

    // Check if user is authenticated (registered user joining)
    let isRegisteredUser = false;
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader !== 'Bearer null') {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        isRegisteredUser = true;
        userId = user.id;
      }
    }

    const guestId = crypto.randomUUID();
    const identity = isRegisteredUser ? `user_${userId}` : `guest_${guestId}`;

    // Save guest record
    await supabase.from('public_class_guests').insert({
      class_id: publicClass.id,
      guest_name,
      guest_email: guest_email || null,
      is_registered_user: isRegisteredUser,
      user_id: userId,
      device_info: req.headers.get('User-Agent') || null,
    });

    // Increment guest count
    await supabase.from('public_classes')
      .update({ guest_count: (publicClass.guest_count || 0) + 1 })
      .eq('id', publicClass.id);

    // Generate LiveKit token
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!;

    const roomName = publicClass.livekit_room_name || `public-${publicClass.room_code}`;

    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 7200; // 2 hours

    const claims: Record<string, unknown> = {
      iss: LIVEKIT_API_KEY,
      sub: identity,
      nbf: now,
      exp,
      jti: identity,
      name: guest_name,
      video: {
        roomJoin: true,
        room: roomName,
        canPublish: publicClass.allow_guest_camera || publicClass.allow_guest_mic,
        canSubscribe: true,
        canPublishData: true,
      },
      metadata: JSON.stringify({
        role: 'guest',
        guest_id: guestId,
        class_id: publicClass.id,
        is_registered: isRegisteredUser,
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
      role: 'guest',
      participant_name: guest_name,
      class_id: publicClass.id,
      class_title: publicClass.title,
      class_title_ar: publicClass.title_ar,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
