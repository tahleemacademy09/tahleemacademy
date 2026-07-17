/*
  send-notification — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Replaces the old `dispatch-notification` function. Fans a single row from
  `public.notifications` out to whatever push channels the user has:

    1) Web Push (VAPID)  — browsers / installed PWA
    2) FCM HTTP v1        — native Android/iOS via Capacitor

  Deliberately NOT included (kept simple on purpose — add back if/when
  needed): Telegram, per-channel delivery logging, class-type special-casing.
  Every notification is treated the same way; event-specific behaviour
  belongs in whatever trigger inserts the row, not in dispatch.

  Called by: trg_dispatch_notification (AFTER INSERT ON public.notifications)
  Body: { notification_id: string }
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Web Push (VAPID) ────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  ttl = 60 * 30,
): Promise<"ok" | "expired" | "error"> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.error("[send-notification] VAPID keys not configured");
    return "error";
  }

  try {
    const webpush: any = await import("https://esm.sh/web-push@3.6.7");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const toBase64url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: toBase64url(sub.p256dh), auth: toBase64url(sub.auth) } },
      JSON.stringify(payload),
      { TTL: ttl },
    );
    return "ok";
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status ?? 0;
    if (status === 404 || status === 410) return "expired";
    console.error("[send-notification] web push error:", err?.message ?? err);
    return "error";
  }
}

// ── FCM HTTP v1 (native Android/iOS via Capacitor) ──────────────────────────

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj: object) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  projectId: string,
): Promise<"ok" | "expired" | "error"> {
  try {
    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    const body = {
      message: {
        token: fcmToken,
        notification: { title: payload.title, body: payload.message },
        data: { url: payload.url, type: payload.type },
        android: { priority: "high", notification: { sound: "default", click_action: "FLUTTER_NOTIFICATION_CLICK", channel_id: "tahleem_default" } },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      },
    };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return "ok";
    const errData = await res.json();
    const errCode = errData?.error?.details?.[0]?.errorCode ?? errData?.error?.status ?? "";
    if (["UNREGISTERED", "INVALID_ARGUMENT"].includes(errCode) || res.status === 404) return "expired";
    console.error("[send-notification] FCM error:", errData);
    return "error";
  } catch (err: any) {
    console.error("[send-notification] FCM exception:", err?.message ?? err);
    return "error";
  }
}

function absUrl(link: string | null | undefined): string {
  const base = "https://tahleemacademy.vercel.app";
  if (!link) return base;
  if (link.startsWith("http")) return link;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

// ── Preferences ──────────────────────────────────────────────────────────────

type Prefs = {
  push_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  muted_types: string[];
};
const DEFAULT_PREFS: Prefs = { push_enabled: true, quiet_hours_start: null, quiet_hours_end: null, muted_types: [] };

async function getPrefs(supabase: ReturnType<typeof createClient>, user_id: string): Promise<Prefs> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("push_enabled, quiet_hours_start, quiet_hours_end, muted_types")
    .eq("user_id", user_id)
    .maybeSingle();
  return data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS;
}

// Types that already self-push web+Telegram (ring-live-class, schedule-
// class-reminders — both call their own sendWebPush/sendTelegram directly,
// with a richer, purpose-built payload: loud vibration pattern,
// requireInteraction, Join/Dismiss actions). If this generic dispatcher also
// sent web push for these types, every class ring/reminder would arrive
// twice on web. BUT — both of those functions explicitly skip any
// subscription whose endpoint starts with "native:" (their filters:
// `!sub.endpoint.startsWith("native:")`), meaning FCM (native Android/iOS
// app) users currently get NO push at all for class rings/reminders. So for
// these types: skip web push (already covered), still send FCM (the gap).
const SELF_DISPATCHED_WEB_TYPES = new Set([
  "class_ring", "admin_class_ring", "class_reminder", "admin_class_reminder", "ring",
]);

function inQuietHours(prefs: Prefs): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [sh, sm] = prefs.quiet_hours_start.split(":").map(Number);
  const [eh, em] = prefs.quiet_hours_end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins === endMins) return false;
  return startMins < endMins ? nowMins >= startMins && nowMins < endMins : nowMins >= startMins || nowMins < endMins;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const { notification_id } = body;
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: n, error: nErr } = await supabase
      .from("notifications")
      .select("user_id, title, message, title_ar, message_ar, link, type, priority")
      .eq("id", notification_id)
      .maybeSingle();

    if (nErr || !n) {
      return new Response(JSON.stringify({ error: nErr?.message ?? "notification not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, title, message, link, type, priority, title_ar, message_ar } = n as any;
    const skipWebPush = !!(type && SELF_DISPATCHED_WEB_TYPES.has(type));

    const prefs = await getPrefs(supabase, user_id);
    const results: Record<string, string> = {};

    // Muted type
    if (type && prefs.muted_types.includes(type)) {
      return new Response(JSON.stringify({ ok: true, results: { push: "skipped_muted_type" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quiet hours — urgent priority always bypasses (same idea as a phone
    // call). "Starting now" ring types bypass too, matching the same
    // distinction ring-live-class/schedule-class-reminders draw themselves
    // (class_ring/ring bypass; class_reminder — the 15-min heads-up — does not).
    const isRingType = type === "class_ring" || type === "admin_class_ring" || type === "ring";
    const bypassQuietHours = priority === "urgent" || isRingType;

    if (!bypassQuietHours && !prefs.push_enabled) {
      return new Response(JSON.stringify({ ok: true, results: { push: "skipped_preference" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!bypassQuietHours && inQuietHours(prefs)) {
      return new Response(JSON.stringify({ ok: true, results: { push: "skipped_quiet_hours" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (subsErr) {
      return new Response(JSON.stringify({ error: subsErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, results: { push: "no_subscription" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    const FCM_PROJECT_ID = (() => {
      try { return JSON.parse(SERVICE_ACCOUNT_JSON ?? "{}").project_id ?? ""; } catch { return ""; }
    })();

    const fullUrl = absUrl(link);
    const pushPayload = {
      title,
      message,
      body: message_ar ? `${message}\n\n${message_ar}` : message,
      title_ar,
      message_ar,
      url: fullUrl,
      tag: `${type ?? "notif"}-${user_id}`,
      type: type ?? "general",
      requireInteraction: priority === "urgent",
      vibrate: priority === "urgent" ? [800, 400, 800, 400, 800] : [200, 100, 200],
    };

    let webSent = 0, webFailed = 0, fcmSent = 0, fcmFailed = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(subs.map(async (sub: any) => {
      const isNative = sub.endpoint?.startsWith("native:");
      const hasVapidKeys = !!(sub.p256dh && sub.auth);

      if (isNative) {
        const parts = sub.endpoint.split(":");
        const token = parts.slice(2).join(":");
        if (!SERVICE_ACCOUNT_JSON || !FCM_PROJECT_ID) { fcmFailed++; return; }
        const result = await sendFCM(token, { title, message, url: fullUrl, type: type ?? "general" }, SERVICE_ACCOUNT_JSON, FCM_PROJECT_ID);
        if (result === "ok") fcmSent++;
        else if (result === "expired") expiredEndpoints.push(sub.endpoint);
        else fcmFailed++;
      } else if (hasVapidKeys) {
        if (skipWebPush) { return; } // already sent directly by ring-live-class / schedule-class-reminders
        const result = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, pushPayload);
        if (result === "ok") webSent++;
        else if (result === "expired") expiredEndpoints.push(sub.endpoint);
        else webFailed++;
      } else {
        // malformed / legacy row with neither native prefix nor VAPID keys
        expiredEndpoints.push(sub.endpoint);
      }
    }));

    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().eq("user_id", user_id).in("endpoint", expiredEndpoints);
    }

    results.web_push = skipWebPush
      ? "handled_by_source_function"
      : `sent ${webSent}${webFailed ? ` (${webFailed} failed)` : ""}`;
    results.fcm = `sent ${fcmSent}${fcmFailed ? ` (${fcmFailed} failed)` : ""}`;

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[send-notification] fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
