#!/bin/bash
set -e
cd /workspaces/tahleemacademy

echo "── Patching supabase/functions/livekit-token/index.ts ──────────────"
python3 - << 'PYEOF'
path = "supabase/functions/livekit-token/index.ts"
with open(path) as f:
    content = f.read()

if "screen_share_identity" in content:
    print("Already patched — skipping.")
    raise SystemExit

# 1) Read the new flag out of the request body.
old_body_line = "const { subject_id, action, room_name } = body;"
new_body_line = "const { subject_id, action, room_name, screen_share } = body;"
if old_body_line not in content:
    print("WARNING: body-destructure line not found — aborting, no changes made.")
    raise SystemExit
content = content.replace(old_body_line, new_body_line)

# 2) After finalRoomName/roleLabel are resolved (end of the subject_id branch,
#    right before the closing "} else {" for the "neither provided" error),
#    branch off into a screen-share token instead of a normal participant one.
anchor = "    } else {\n      return new Response(JSON.stringify({ error: 'subject_id or room_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });\n    }"
if anchor not in content:
    print("WARNING: anchor block not found — aborting, no changes made.")
    raise SystemExit

screen_share_note = '''    } else {
      return new Response(JSON.stringify({ error: 'subject_id or room_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Screen-share bot identity ────────────────────────────────────────
    // A second, publish-only participant joining the SAME room as the
    // caller's own separate identity — required because a native Android
    // MediaProjection capture has to connect to LiveKit as its own
    // participant (it can't share the WebView's existing JS SDK connection).
    // Only allowed once the caller already resolved a valid room above
    // (screen_share is only meaningful for the live-class flow, i.e.
    // subject_id was provided, not the Musabaqah room_name flow).
    let screenShareIdentity: string | null = null;
    let screenShareName: string | null = null;
    if (screen_share) {
      if (!subject_id) {
        return new Response(JSON.stringify({ error: 'screen_share requires subject_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      screenShareIdentity = `${user.id}::screen`;
      screenShareName = `${participantName} (Screen)`;
    }'''

content = content.replace(anchor, screen_share_note)

# 3) Override the JWT claims for the screen-share case, right before the
#    JWT-building section begins.
claims_anchor = "    const now    = Math.floor(Date.now() / 1000);\n    const exp    = now + 28800; // 8 hours\n\n    const header = { alg: 'HS256', typ: 'JWT' };\n    const claims: any = {\n      iss:  LIVEKIT_API_KEY,\n      sub:  user.id,\n      nbf:  now,\n      exp,\n      // FIX: jti must always be globally unique. Using user.id + timestamp +\n      // random suffix ensures no two tokens share the same jti, preventing\n      // potential replay-rejection by the LiveKit server.\n      jti:  `${user.id}-${now}-${Math.random().toString(36).slice(2, 9)}`,\n      name: participantName,\n      video: {\n        roomJoin:       true,\n        room:           finalRoomName,\n        canPublish:     true,\n        canSubscribe:   true,\n        canPublishData: true,\n        // Lets a participant push a fresh metadata JSON (name/avatar_url) for\n        // themselves mid-call — e.g. changing their profile picture — without\n        // needing to reconnect. Everyone else's client already listens for\n        // participantMetadataChanged and re-renders that tile automatically.\n        canUpdateOwnMetadata: true,\n      },\n      metadata: JSON.stringify({ role: roleLabel, user_id: user.id, name: participantName, avatar_url: profile?.avatar_url || null }),\n    };\n\n    if (isPrivileged) {\n      claims.video.roomAdmin  = true;\n      claims.video.roomRecord = true;\n    }"

if claims_anchor not in content:
    print("WARNING: claims block not found — aborting, no changes made.")
    raise SystemExit

new_claims = '''    const now    = Math.floor(Date.now() / 1000);
    const exp    = now + 28800; // 8 hours

    const header = { alg: 'HS256', typ: 'JWT' };
    const claims: any = screen_share
      ? {
          iss:  LIVEKIT_API_KEY,
          sub:  screenShareIdentity,
          nbf:  now,
          exp,
          jti:  `${screenShareIdentity}-${now}-${Math.random().toString(36).slice(2, 9)}`,
          name: screenShareName,
          video: {
            roomJoin:       true,
            room:           finalRoomName,
            canPublish:     true,
            canSubscribe:   false,
            canPublishData: false,
            canUpdateOwnMetadata: false,
          },
          metadata: JSON.stringify({ screen_share_identity: true, owner_user_id: user.id, name: screenShareName }),
        }
      : {
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
            // Lets a participant push a fresh metadata JSON (name/avatar_url) for
            // themselves mid-call — e.g. changing their profile picture — without
            // needing to reconnect. Everyone else's client already listens for
            // participantMetadataChanged and re-renders that tile automatically.
            canUpdateOwnMetadata: true,
          },
          metadata: JSON.stringify({ role: roleLabel, user_id: user.id, name: participantName, avatar_url: profile?.avatar_url || null }),
        };

    if (!screen_share && isPrivileged) {
      claims.video.roomAdmin  = true;
      claims.video.roomRecord = true;
    }'''

content = content.replace(claims_anchor, new_claims)

with open(path, "w") as f:
    f.write(content)
print("Patched livekit-token/index.ts")
PYEOF

echo "── Deploying ──────────────────────────────────────────────────────"
supabase functions deploy livekit-token || echo "Deploy failed or not configured — check above."

echo "── Done ────────────────────────────────────────────────────────────"
