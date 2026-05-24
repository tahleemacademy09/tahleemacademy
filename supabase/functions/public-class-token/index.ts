<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FIXED: public-class-token_index.ts</title>
<style>
  body{margin:0;background:#1e1e2e;color:#cdd6f4;font-family:monospace;font-size:13px}
  #bar{position:sticky;top:0;background:#181825;padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:10;border-bottom:1px solid #313244}
  #bar h2{margin:0;font-size:14px;color:#89b4fa;flex:1}
  button{background:#89b4fa;color:#1e1e2e;border:none;padding:8px 18px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}
  button:active{background:#74c7ec}
  #code{white-space:pre-wrap;word-break:break-all;padding:16px;line-height:1.55}
</style>
</head>
<body>
<div id="bar">
  <h2>📄 public-class-token_index.ts</h2>
  <button onclick="copy()">Copy All</button>
</div>
<div id="code">const corsHeaders = {
  &#x27;Access-Control-Allow-Origin&#x27;: &#x27;*&#x27;,
  &#x27;Access-Control-Allow-Headers&#x27;: &#x27;authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version&#x27;,
  &#x27;Access-Control-Allow-Methods&#x27;: &#x27;POST, OPTIONS&#x27;,
};

import { createClient } from &quot;https://esm.sh/@supabase/supabase-js@2&quot;;

Deno.serve(async (req) =&gt; {
  if (req.method === &#x27;OPTIONS&#x27;) {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { room_code, guest_name, guest_email, password } = await req.json();

    if (!room_code) {
      return new Response(JSON.stringify({ error: &#x27;room_code is required&#x27; }),
        { status: 400, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    const supabaseUrl = Deno.env.get(&#x27;SUPABASE_URL&#x27;)!;
    const serviceKey = Deno.env.get(&#x27;SUPABASE_SERVICE_ROLE_KEY&#x27;)!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get public class
    const { data: publicClass, error: classError } = await supabase
      .from(&#x27;public_classes&#x27;)
      .select(&#x27;*&#x27;)
      .eq(&#x27;room_code&#x27;, room_code)
      .single();

    if (classError || !publicClass) {
      return new Response(JSON.stringify({ error: &#x27;Class not found&#x27; }),
        { status: 404, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    // Check if user is authenticated (registered user or host)
    let isRegisteredUser = false;
    let userId: string | null = null;
    let isHost = false;
    const authHeader = req.headers.get(&#x27;Authorization&#x27;);
    if (authHeader &amp;&amp; authHeader !== &#x27;Bearer null&#x27; &amp;&amp; authHeader !== &#x27;Bearer undefined&#x27;) {
      const anonClient = createClient(supabaseUrl, Deno.env.get(&#x27;SUPABASE_ANON_KEY&#x27;)!, {
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
            .from(&#x27;user_roles&#x27;)
            .select(&#x27;role&#x27;)
            .eq(&#x27;user_id&#x27;, user.id);
          const userRoles = roles?.map((r: any) =&gt; r.role) || [];
          if (userRoles.includes(&#x27;admin&#x27;) || userRoles.includes(&#x27;teacher&#x27;)) {
            isHost = true; // Admins and teachers get host-level access
          }
        }
      }
    }

    // For non-host users, enforce live status and other checks
    if (!isHost) {
      if (publicClass.status !== &#x27;live&#x27;) {
        return new Response(JSON.stringify({ error: &#x27;Class is not live&#x27;, status: publicClass.status }),
          { status: 400, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
      }

      if (!guest_name) {
        return new Response(JSON.stringify({ error: &#x27;guest_name is required&#x27; }),
          { status: 400, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
      }

      // Check password
      if (publicClass.password_enabled &amp;&amp; publicClass.password) {
        if (password !== publicClass.password) {
          return new Response(JSON.stringify({ error: &#x27;Invalid password&#x27; }),
            { status: 403, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
        }
      }

      // Check max guests
      if (publicClass.guest_count &gt;= publicClass.max_guests) {
        return new Response(JSON.stringify({ error: &#x27;Class is full&#x27; }),
          { status: 400, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
      }
    }

    const guestId = crypto.randomUUID();
    const participantName = isHost
      ? (guest_name || &#x27;Teacher&#x27;)
      : (guest_name || &#x27;Guest&#x27;);
    const identity = isHost
      ? `host_${userId}`
      : isRegisteredUser
        ? `user_${userId}`
        : `guest_${guestId}`;

    // Save guest record for non-host users
    if (!isHost) {
      await supabase.from(&#x27;public_class_guests&#x27;).insert({
        class_id: publicClass.id,
        guest_name: participantName,
        guest_email: guest_email || null,
        is_registered_user: isRegisteredUser,
        user_id: userId,
        device_info: req.headers.get(&#x27;User-Agent&#x27;) || null,
      });

      // Increment guest count
      await supabase.from(&#x27;public_classes&#x27;)
        .update({ guest_count: (publicClass.guest_count || 0) + 1 })
        .eq(&#x27;id&#x27;, publicClass.id);
    }

    // Generate LiveKit token
    const LIVEKIT_API_KEY = Deno.env.get(&#x27;LIVEKIT_API_KEY&#x27;)!;
    const LIVEKIT_API_SECRET = Deno.env.get(&#x27;LIVEKIT_API_SECRET&#x27;)!;
    const LIVEKIT_URL = Deno.env.get(&#x27;LIVEKIT_URL&#x27;)!;

    const roomName = publicClass.livekit_room_name || `public-${publicClass.room_code}`;

    const enc = new TextEncoder();

    // FIX: b64url for binary (signature) — unchanged
    const b64url = (buf: ArrayBuffer) =&gt; {
      const bytes = new Uint8Array(buf);
      let binary = &#x27;&#x27;;
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, &#x27;-&#x27;).replace(/\//g, &#x27;_&#x27;).replace(/=+$/, &#x27;&#x27;);
    };

    // FIX: b64urlStr now uses TextEncoder so Arabic/Unicode names don&#x27;t cause
    // a btoa() DOMException and a silent 500 response. Previously, any guest
    // or host whose display name contained non-Latin-1 characters (Arabic,
    // Urdu, etc.) would receive a 500, leaving the room stuck &quot;Reconnecting&quot;.
    const b64urlStr = (str: string) =&gt; {
      const bytes = enc.encode(str);           // UTF-8 encode
      let binary = &#x27;&#x27;;
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, &#x27;-&#x27;).replace(/\//g, &#x27;_&#x27;).replace(/=+$/, &#x27;&#x27;);
    };

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 7200; // 2 hours

    const header = { alg: &#x27;HS256&#x27;, typ: &#x27;JWT&#x27; };
    const videoGrant: Record&lt;string, unknown&gt; = {
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

    const claims: Record&lt;string, unknown&gt; = {
      iss: LIVEKIT_API_KEY,
      sub: identity,
      nbf: now,
      exp,
      // FIX: jti must be globally unique per token. The old code set jti=identity
      // which is the same across re-joins for the same participant, risking replay
      // rejection by the LiveKit server on rapid reconnects.
      jti: `${identity}-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: participantName,
      video: videoGrant,
      metadata: JSON.stringify({
        role: isHost ? &#x27;host&#x27; : &#x27;guest&#x27;,
        guest_id: isHost ? null : guestId,
        class_id: publicClass.id,
        is_registered: isRegisteredUser,
        is_host: isHost,
      }),
    };

    const headerB64 = b64urlStr(JSON.stringify(header));
    const claimsB64 = b64urlStr(JSON.stringify(claims));
    const sigInput = `${headerB64}.${claimsB64}`;

    const key = await crypto.subtle.importKey(
      &#x27;raw&#x27;, enc.encode(LIVEKIT_API_SECRET),
      { name: &#x27;HMAC&#x27;, hash: &#x27;SHA-256&#x27; }, false, [&#x27;sign&#x27;]
    );
    const sig = await crypto.subtle.sign(&#x27;HMAC&#x27;, key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(JSON.stringify({
      token,
      url: LIVEKIT_URL,
      room: roomName,
      role: isHost ? &#x27;host&#x27; : &#x27;guest&#x27;,
      participant_name: participantName,
      class_id: publicClass.id,
      class_title: publicClass.title,
      class_title_ar: publicClass.title_ar,
      is_host: isHost,
    }), { headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : &#x27;Unknown error&#x27;;
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
  }
});
</div>
<script>
function copy(){
  const text=document.getElementById('code').innerText;
  if(navigator.clipboard){navigator.clipboard.writeText(text).then(()=>alert('Copied!'));}
  else{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('Copied!');}
}
</script>
</body>
</html>