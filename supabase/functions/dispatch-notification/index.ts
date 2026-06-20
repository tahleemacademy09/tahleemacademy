/*
  dispatch-notification — universal notification fan-out.
  Triggered by Postgres trigger on every INSERT into public.notifications.

  Sends:
    1) Web Push (VAPID) — browser subscriptions (PWA / web)
    2) FCM HTTP v1     — native Android/iOS via Capacitor
    3) Telegram

  FIX: Native Capacitor tokens (endpoint starts with "native:") were being
  passed to sendWebPush() which crashed because they are FCM tokens, not
  VAPID endpoints. Now routed to sendFCM() which uses Google FCM HTTP v1.
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  ttl = 60 * 30
): Promise<"ok" | "expired" | "error"> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.error("[dispatch-notification] VAPID keys not configured");
    return "error";
  }

  try {
    const webpush: any = await import("https://esm.sh/web-push@3.6.7");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const toBase64url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: toBase64url(sub.p256dh), auth: toBase64url(sub.auth) } },
      JSON.stringify(payload),
      { TTL: ttl }
    );
    return "ok";
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status ?? 0;
    if (status === 404 || status === 410) return "expired";
    console.error("[dispatch-notification] web push error:", err?.message ?? err);
    return "error";
  }
}

// ── FCM HTTP v1 (native Android / iOS via Capacitor) ─────────────────────────
// Uses a Google service-account JSON stored in env GOOGLE_SERVICE_ACCOUNT_JSON.
// To get this: Firebase Console → Project Settings → Service Accounts → Generate new private key

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import RSA private key for signing
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("FCM token exchange failed: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

async function sendFCM(
  fcmToken: string,
  payload: { title: string; message: string; url: string; type: string },
  serviceAccountJson: string,
  projectId: string
): Promise<"ok" | "expired" | "error"> {
  try {
    const accessToken = await getGoogleAccessToken(serviceAccountJson);

    const body = {
      message: {
        token: fcmToken,
        notification: {
          title: payload.title,
          body:  payload.message,
        },
        data: {
          url:  payload.url,
          type: payload.type,
        },
        android: {
          priority: "high",
          notification: {
            sound:        "default",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            channel_id:   "tahleem_class",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      },
    };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) return "ok";
    const errData = await res.json();
    const errCode = errData?.error?.details?.[0]?.errorCode ?? errData?.error?.status ?? "";
    // UNREGISTERED or INVALID_ARGUMENT = token expired/revoked
    if (["UNREGISTERED", "INVALID_ARGUMENT"].includes(errCode) || res.status === 404) return "expired";
    console.error("[dispatch-notification] FCM error:", errData);
    return "error";
  } catch (err: any) {
    console.error("[dispatch-notification] FCM exception:", err?.message ?? err);
    return "error";
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(
  chatId: string,
  title: string,
  message: string,
  link?: string,
  title_ar?: string,
  message_ar?: string
): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  const enBlock = `<b>${title}</b>\n${message}`;
  const arBlock = (title_ar || message_ar)
    ? `\n\n— — —\n<b>${title_ar || title}</b>\n${message_ar || message}`
    : "";
  const text =
    `🕌 <b>Tahleem Academy</b>\n\n` +
    enBlock + arBlock +
    (link ? `\n\n🔗 <a href="${link}">Open Academy</a>` : "");

  const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      "Authorization":        `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type":         "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

function absUrl(link: string | null | undefined): string {
  const base = "https://tahleemacademy.vercel.app";
  if (!link) return base;
  if (link.startsWith("http")) return link;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    let user_id: string | undefined    = body.user_id;
    let title: string | undefined      = body.title;
    let message: string | undefined    = body.message;
    let link: string | undefined       = body.link;
    let type: string | undefined       = body.type;
    let title_ar: string | undefined   = body.title_ar;
    let message_ar: string | undefined = body.message_ar;

    if (body.notification_id) {
      const { data: n, error: nErr } = await supabase
        .from("notifications")
        .select("user_id, title, message, title_ar, message_ar, link, type")
        .eq("id", body.notification_id)
        .maybeSingle();

      if (nErr) console.error("[dispatch-notification] notification lookup failed:", nErr.message);

      if (n) {
        user_id    = n.user_id;
        title      = n.title;
        message    = n.message;
        link       = n.link ?? undefined;
        type       = n.type ?? undefined;
        title_ar   = (n as any).title_ar   ?? undefined;
        message_ar = (n as any).message_ar ?? undefined;
      }
    }

    if (!user_id || !title || !message) {
      return new Response(JSON.stringify({ error: "user_id, title, message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullUrl = absUrl(link);
    const results: Record<string, string> = {};

    // ── FCM config (for native Capacitor tokens) ──────────────────────────────
    const SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const FCM_PROJECT_ID       = Deno.env.get("FCM_PROJECT_ID");

    // ── Fan out to ALL subscriptions for this user ────────────────────────────
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, keys")
      .eq("user_id", user_id);

    if (subsErr) {
      console.error("[dispatch-notification] push_subscriptions read error:", subsErr.message);
      results.push = `db_error: ${subsErr.message}`;
    } else if (!subs || subs.length === 0) {
      results.push = "no_subscription";
      console.warn("[dispatch-notification] no push subscription for user_id:", user_id);
    } else {
      let webSent = 0, webFailed = 0, webExpired = 0;
      let fcmSent = 0, fcmFailed = 0, fcmExpired = 0;
      const expiredEndpoints: string[] = [];

      const pushPayload = {
        title,
        message,
        body:       message_ar ? `${message}\n\n${message_ar}` : message,
        title_ar,
        message_ar,
        url:        fullUrl,
        tag:        `${type ?? "notif"}-${user_id}`,
        type:       type ?? "announcement",
        requireInteraction: type === "class_ring",
        vibrate:    type === "class_ring"
          ? [800, 400, 800, 400, 800, 1500, 800, 400, 800]
          : [200, 100, 200],
      };

      await Promise.all(
        subs.map(async (sub: any) => {
          const isNative = sub.endpoint?.startsWith("native:");

          if (isNative) {
            // ── Native Capacitor token → FCM HTTP v1 ─────────────────────────
            // endpoint format: "native:android:FCM_TOKEN" or "native:ios:APNs_TOKEN"
            const parts    = sub.endpoint.split(":");
            const platform = parts[1]; // "android" | "ios"
            const token    = parts.slice(2).join(":"); // rest is the token (may contain colons)

            if (!SERVICE_ACCOUNT_JSON || !FCM_PROJECT_ID) {
              console.warn("[dispatch-notification] FCM not configured — skipping native token");
              fcmFailed++;
              return;
            }

            // iOS APNs tokens via FCM are supported if the iOS app is linked in Firebase
            const result = await sendFCM(
              token,
              { title, message, url: fullUrl, type: type ?? "announcement" },
              SERVICE_ACCOUNT_JSON,
              FCM_PROJECT_ID
            );

            if (result === "ok")      { fcmSent++; }
            else if (result === "expired") { fcmExpired++; expiredEndpoints.push(sub.endpoint); }
            else                      { fcmFailed++; }

            console.log(`[dispatch-notification] FCM ${platform} → ${result}`);
          } else {
            // ── Web Push (VAPID) ──────────────────────────────────────────────
            if (!sub.p256dh || !sub.auth) {
              // Malformed web subscription — clean it up
              expiredEndpoints.push(sub.endpoint);
              webExpired++;
              return;
            }

            const result = await sendWebPush(sub, pushPayload);
            if (result === "ok")           { webSent++; }
            else if (result === "expired") { webExpired++; expiredEndpoints.push(sub.endpoint); }
            else                           { webFailed++; }
          }
        })
      );

      // Clean up expired subscriptions
      if (expiredEndpoints.length > 0) {
        await supabase.from("push_subscriptions")
          .delete()
          .eq("user_id", user_id)
          .in("endpoint", expiredEndpoints);
        console.warn(`[dispatch-notification] cleaned ${expiredEndpoints.length} expired sub(s)`);
      }

      results.web_push = `sent ${webSent}${webExpired ? ` (${webExpired} expired)` : ""}${webFailed ? ` (${webFailed} failed)` : ""}`;
      results.fcm      = `sent ${fcmSent}${fcmExpired ? ` (${fcmExpired} expired)` : ""}${fcmFailed ? ` (${fcmFailed} failed)` : ""}`;
    }

    // ── Telegram ──────────────────────────────────────────────────────────────
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", user_id)
      .maybeSingle();

    const chatId = (prof as any)?.telegram_chat_id;
    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, fullUrl, title_ar, message_ar);
        results.telegram = "sent";
      } catch (e: any) {
        results.telegram = `failed: ${e.message}`;
      }
    } else {
      results.telegram = "not_linked";
    }

    console.log("[dispatch-notification] done for user:", user_id, results);
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[dispatch-notification] fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
