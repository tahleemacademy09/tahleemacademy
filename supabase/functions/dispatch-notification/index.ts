/*
  dispatch-notification — universal notification fan-out.
  Triggered by Postgres trigger on every INSERT into public.notifications.

  Sends:
    1) Web Push to ALL user devices (VAPID)  — works when browser/app closed
    2) Telegram via Lovable gateway

  FIX (v2): Uses SUPABASE_SERVICE_ROLE_KEY (not anon) so it can read
  push_subscriptions even though the trigger fires from a pg_net HTTP call.
  The anon key could not read push_subscriptions with the service-role RLS
  policy — so no pushes were ever delivered from triggers.
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

// ── Web Push ──────────────────────────────────────────────────────────────────

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
    // Convert standard base64 (stored in DB) to base64url (required by web-push)
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
    console.error("[dispatch-notification] push error:", err?.message ?? err);
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
    // Always use service role — this function reads push_subscriptions
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

    // Resolve from notification row if notification_id supplied
    if (body.notification_id) {
      const { data: n, error: nErr } = await supabase
        .from("notifications")
        .select("user_id, title, message, title_ar, message_ar, link, type")
        .eq("id", body.notification_id)
        .maybeSingle();

      if (nErr) {
        console.error("[dispatch-notification] notification lookup failed:", nErr.message);
      }

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

    // ── 1. Web Push — fan out to ALL devices for this user ───────────────────
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (subsErr) {
      console.error("[dispatch-notification] push_subscriptions read error:", subsErr.message);
      results.web_push = `db_error: ${subsErr.message}`;
    } else if (!subs || subs.length === 0) {
      results.web_push = "no_subscription";
      console.warn("[dispatch-notification] no push subscription for user_id:", user_id);
    } else {
      let sent = 0, failed = 0, expired = 0;
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
          const result = await sendWebPush(sub, pushPayload);
          if (result === "expired") {
            expired++;
            expiredEndpoints.push(sub.endpoint);
          } else if (result === "ok") {
            sent++;
          } else {
            failed++;
          }
        })
      );

      // Clean up expired subscriptions
      if (expiredEndpoints.length > 0) {
        await supabase.from("push_subscriptions")
          .delete()
          .eq("user_id", user_id)
          .in("endpoint", expiredEndpoints);
        console.warn(`[dispatch-notification] cleaned ${expiredEndpoints.length} expired sub(s) for user:`, user_id);
      }

      results.web_push = `sent ${sent}/${subs.length}${expired ? ` (${expired} expired/cleaned)` : ""}${failed ? ` (${failed} failed)` : ""}`;
    }

    // ── 2. Telegram ──────────────────────────────────────────────────────────
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
