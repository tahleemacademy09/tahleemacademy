<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FIXED: livekit-token_index.ts</title>
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
  <h2>📄 livekit-token_index.ts</h2>
  <button onclick="copy()">Copy All</button>
</div>
<div id="code">import { createClient } from &quot;https://esm.sh/@supabase/supabase-js@2&quot;;

const corsHeaders = {
  &#x27;Access-Control-Allow-Origin&#x27;: &#x27;*&#x27;,
  &#x27;Access-Control-Allow-Headers&#x27;: &#x27;authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version&#x27;,
  &#x27;Access-Control-Allow-Methods&#x27;: &#x27;POST, OPTIONS&#x27;,
};

Deno.serve(async (req) =&gt; {
  if (req.method === &#x27;OPTIONS&#x27;) {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get(&#x27;Authorization&#x27;);
    if (!authHeader) {
      return new Response(JSON.stringify({ error: &#x27;Not authenticated&#x27; }), { status: 401, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    const supabaseUrl = Deno.env.get(&#x27;SUPABASE_URL&#x27;)!;
    const supabaseKey = Deno.env.get(&#x27;SUPABASE_ANON_KEY&#x27;)!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: &#x27;Invalid token&#x27; }), { status: 401, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    const body = await req.json();
    const { subject_id, action, room_name } = body;

    const LIVEKIT_API_KEY    = Deno.env.get(&#x27;LIVEKIT_API_KEY&#x27;);
    const LIVEKIT_API_SECRET = Deno.env.get(&#x27;LIVEKIT_API_SECRET&#x27;);
    const LIVEKIT_URL        = Deno.env.get(&#x27;LIVEKIT_URL&#x27;);

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(JSON.stringify({ error: &#x27;LiveKit not configured&#x27; }), { status: 500, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    // Get user role
    const serviceClient = createClient(supabaseUrl, Deno.env.get(&#x27;SUPABASE_SERVICE_ROLE_KEY&#x27;)!);
    const { data: roles } = await serviceClient.from(&#x27;user_roles&#x27;).select(&#x27;role&#x27;).eq(&#x27;user_id&#x27;, user.id);
    const userRoles    = roles?.map((r: any) =&gt; r.role) || [];
    const isPrivileged = userRoles.includes(&#x27;admin&#x27;) || userRoles.includes(&#x27;teacher&#x27;);

    // Get display name
    const { data: profile } = await serviceClient
      .from(&#x27;profiles&#x27;).select(&#x27;full_name&#x27;).eq(&#x27;user_id&#x27;, user.id).single();
    const participantName = profile?.full_name || user.email || &#x27;Anonymous&#x27;;

    let finalRoomName: string;
    let roleLabel: string;

    // ── MODE A: Musabaqah room (room_name provided directly) ──────────────
    if (room_name) {
      finalRoomName = room_name;
      roleLabel     = isPrivileged ? &#x27;judge&#x27; : &#x27;participant&#x27;;

    // ── MODE B: Live class (subject_id — existing behaviour) ──────────────
    } else if (subject_id) {
      const { data: subject, error: subjectError } = await serviceClient
        .from(&#x27;subjects&#x27;).select(&#x27;*&#x27;).eq(&#x27;id&#x27;, subject_id).single();

      if (subjectError || !subject) {
        return new Response(JSON.stringify({ error: &#x27;Subject not found&#x27; }), { status: 404, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
      }
      if (!subject.is_active &amp;&amp; !isPrivileged) {
        return new Response(JSON.stringify({ error: &#x27;Subject is not active&#x27; }), { status: 403, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
      }

      finalRoomName = subject.livekit_room_name || `subject-${subject.id}`;
      roleLabel     = isPrivileged ? &#x27;teacher&#x27; : &#x27;student&#x27;;

      // Handle start_session action
      if (action === &#x27;start_session&#x27; &amp;&amp; isPrivileged) {
        const { data: existingSession } = await serviceClient
          .from(&#x27;live_sessions&#x27;).select(&#x27;id&#x27;)
          .eq(&#x27;subject_id&#x27;, subject_id).eq(&#x27;status&#x27;, &#x27;live&#x27;).maybeSingle();

        if (!existingSession) {
          await serviceClient.from(&#x27;live_sessions&#x27;).insert({
            subject_id,
            host_id:    user.id,
            status:     &#x27;live&#x27;,
            started_at: new Date().toISOString(),
          });
        }
      }

      // Log activity
      await serviceClient.from(&#x27;activity_logs&#x27;).insert({
        user_id:     user.id,
        action:      action === &#x27;start_session&#x27; ? &#x27;start_live_class&#x27; : &#x27;join_live_class&#x27;,
        entity_type: &#x27;subject&#x27;,
        entity_id:   subject_id,
        metadata:    { room: finalRoomName, role: roleLabel },
      });

    } else {
      return new Response(JSON.stringify({ error: &#x27;subject_id or room_name required&#x27; }), { status: 400, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
    }

    // ── Build JWT ─────────────────────────────────────────────────────────
    const enc = new TextEncoder();

    // FIX: b64url for binary (signature) — unchanged
    const b64url = (buf: ArrayBuffer) =&gt; {
      const bytes = new Uint8Array(buf);
      let binary = &#x27;&#x27;;
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, &#x27;-&#x27;).replace(/\//g, &#x27;_&#x27;).replace(/=+$/, &#x27;&#x27;);
    };

    // FIX: b64urlStr now uses TextEncoder so Arabic/Unicode names are handled
    // correctly. The old btoa(str) would throw a DOMException for any character
    // outside Latin-1 (e.g. Arabic full_name values), silently returning a 500
    // and leaving the client stuck in the &quot;Reconnecting...&quot; loop.
    const b64urlStr = (str: string) =&gt; {
      const bytes = enc.encode(str);           // UTF-8 encode
      let binary = &#x27;&#x27;;
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, &#x27;-&#x27;).replace(/\//g, &#x27;_&#x27;).replace(/=+$/, &#x27;&#x27;);
    };

    const now    = Math.floor(Date.now() / 1000);
    const exp    = now + 28800; // 8 hours

    const header = { alg: &#x27;HS256&#x27;, typ: &#x27;JWT&#x27; };
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
      &#x27;raw&#x27;, enc.encode(LIVEKIT_API_SECRET),
      { name: &#x27;HMAC&#x27;, hash: &#x27;SHA-256&#x27; }, false, [&#x27;sign&#x27;]
    );
    const sig   = await crypto.subtle.sign(&#x27;HMAC&#x27;, key, enc.encode(sigInput));
    const token = `${sigInput}.${b64url(sig)}`;

    return new Response(JSON.stringify({
      token,
      url:              LIVEKIT_URL,
      room:             finalRoomName,
      role:             roleLabel,
      participant_name: participantName,
    }), { headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : &#x27;Unknown error&#x27;;
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, &#x27;Content-Type&#x27;: &#x27;application/json&#x27; } });
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