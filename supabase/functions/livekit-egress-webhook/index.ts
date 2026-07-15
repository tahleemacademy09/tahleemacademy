// livekit-egress-webhook — receives server-to-server callbacks from LiveKit
// itself (not from the app), so this is the piece that makes recordings
// reliable regardless of what happens to the teacher's device:
//
//   • "egress_ended"   → the recording finished (or failed). We confirm the
//                        file and flip the session_recordings row to
//                        "completed" (or "failed"). This is the definitive
//                        source of truth — no more guessing with a fixed
//                        wait-then-poll like the old stop-recording did.
//   • "room_finished"  → safety net. If a class's LiveKit room closes while
//                        we still show a recording as "in progress" (e.g.
//                        the teacher's app crashed before pressing Stop),
//                        we tell LiveKit to stop that egress so it doesn't
//                        run forever and the file still gets finalized.
//
// You must register this function's URL in your LiveKit project's webhook
// settings for these events to ever arrive — see setup notes at the end of
// this file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Verify the request really came from LiveKit ────────────────────────────
// LiveKit signs webhooks with a JWT (in the Authorization header) whose
// payload includes a base64 sha256 hash of the raw request body. We verify
// both the signature (using your LiveKit API key/secret — no separate
// webhook secret needed) and that the hash matches the body we received.
async function verifyLiveKitWebhook(rawBody: string, authHeader: string | null, apiKey: string, apiSecret: string): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts;

  const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
  const b64urlToBytes = (s: string) => Uint8Array.from(atob(pad(s.replace(/-/g, "+").replace(/_/g, "/"))), c => c.charCodeAt(0));

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return false;
  }
  if (payload.iss !== apiKey) return false;
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigOk = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sigB64), enc.encode(`${headerB64}.${payloadB64}`));
  if (!sigOk) return false;

  if (payload.sha256) {
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(rawBody));
    const digestB64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    if (digestB64 !== payload.sha256) return false;
  }
  return true;
}

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
  const key = await crypto.subtle.importKey("raw", enc.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: apiKey, exp: now + 3600, nbf: now, video: { roomRecord: true } };
  const sigInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(sigInput));
  return `${sigInput}.${b64url(sig)}`;
};

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();

    const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LIVEKIT_API_KEY      = Deno.env.get("LIVEKIT_API_KEY")!;
    const LIVEKIT_API_SECRET   = Deno.env.get("LIVEKIT_API_SECRET")!;
    const LIVEKIT_URL          = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");

    const ok = await verifyLiveKitWebhook(rawBody, req.headers.get("Authorization"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (event.event === "egress_ended") {
      const info = event.egressInfo || event.egress_info || {};
      const egressId = info.egressId || info.egress_id;
      if (!egressId) return new Response("ok");

      const status: string = String(info.status || "");
      const failed = /FAIL|ABORT/i.test(status);

      const fileResult = (info.fileResults || info.file_results || [])[0] || {};
      const startedAtNs = Number(info.startedAt || info.started_at || 0);
      const endedAtNs   = Number(info.endedAt || info.ended_at || 0);
      let durationSeconds = 0;
      if (fileResult.duration) durationSeconds = Math.round(Number(fileResult.duration) / 1e9);
      else if (startedAtNs && endedAtNs) durationSeconds = Math.round((endedAtNs - startedAtNs) / 1e9);
      const fileSize = fileResult.size ? Number(fileResult.size) : null;

      const { data: rec } = await admin
        .from("session_recordings").select("id, file_url")
        .eq("egress_id", egressId).maybeSingle();

      if (rec) {
        await admin.from("session_recordings").update({
          status: failed ? "failed" : "completed",
          duration_seconds: durationSeconds || null,
          file_size: fileSize,
        }).eq("id", rec.id);
      }
    }

    // Safety net: a class's room closed (teacher app crashed, connection
    // dropped, whatever) while we still thought a recording was active.
    // Stop the egress so LiveKit finalizes the file instead of it running
    // indefinitely / never getting confirmed.
    if (event.event === "room_finished") {
      const room = event.room || {};
      const roomName: string = room.name || "";
      if (roomName) {
        let subject: any = null;
        const bySlug = await admin.from("subjects").select("id").eq("livekit_room_name", roomName).maybeSingle();
        subject = bySlug.data;
        if (!subject && roomName.startsWith("subject-")) {
          const id = roomName.slice("subject-".length);
          const byId = await admin.from("subjects").select("id").eq("id", id).maybeSingle();
          subject = byId.data;
        }
        if (subject) {
          const { data: stillRecording } = await admin
            .from("session_recordings").select("id, egress_id")
            .eq("subject_id", subject.id).eq("status", "recording");
          for (const r of stillRecording || []) {
            if (!r.egress_id) continue;
            try {
              const jwt = await makeJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
              await fetch(`${LIVEKIT_URL}/twirp/livekit.Egress/StopEgress`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
                body: JSON.stringify({ egress_id: r.egress_id }),
              });
              await admin.from("session_recordings").update({ status: "processing" }).eq("id", r.id);
            } catch (e) {
              console.error("[webhook] failed to stop orphaned egress:", e);
            }
          }
        }
      }
    }

    return new Response("ok");
  } catch (err: any) {
    console.error("[livekit-egress-webhook] error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

/* ── Setup notes (one-time, manual) ──────────────────────────────────────
1. Deploy this function:
     supabase functions deploy livekit-egress-webhook --no-verify-jwt
   (--no-verify-jwt is required — this endpoint is called by LiveKit, not
   by a logged-in Supabase user, so Supabase's own JWT check must be off;
   our own signature check above replaces it.)

2. In your LiveKit project dashboard → Settings → Webhooks, add:
     URL: https://<your-project-ref>.functions.supabase.co/livekit-egress-webhook
   and enable at least: egress_ended, room_finished.

3. Register the same in supabase/config.toml so future deploys keep the
   no-verify-jwt setting:
     [functions.livekit-egress-webhook]
     verify_jwt = false
──────────────────────────────────────────────────────────────────────── */