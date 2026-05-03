/*
  dispatch-notification — universal notification fan-out.
  Called by a Postgres trigger on every INSERT into public.notifications,
  and also invokable manually from the client.

  For the target user it sends:
    1) Web Push  (works when browser/phone is closed — VAPID)
    2) Telegram  (if telegram_chat_id is linked on profile)

  Body shape: { notification_id?: uuid }  OR
              { user_id, title, message, link?, type? }

  Required env vars:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    TELEGRAM_BOT_TOKEN   (from @BotFather)
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  (for web push)
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; message: string; url: string; tag: string; minutes_left?: number }
): Promise<void> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) throw new Error("VAPID not configured");

  const webpush: any = await import("https://esm.sh/web-push@3.6.7");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 30 }
  );
}

async function sendTelegram(chatId: string, title: string, message: string, link?: string): Promise<void> {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  const text =
    `🕌 <b>Tahleem Academy</b>\n` +
    `<b>${title}</b>\n\n${message}` +
    (link ? `\n\n🔗 <a href="${link}">Open Academy</a>` : "");

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

function absUrl(link: string | null | undefined, baseHost: string): string {
  if (!link) return baseHost;
  if (link.startsWith("http")) return link;
  return `${baseHost}${link.startsWith("/") ? "" : "/"}${link}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any = {};
    try { body = await req.json(); } catch {}

    let user_id: string | undefined = body.user_id;
    let title: string | undefined   = body.title;
    let message: string | undefined = body.message;
    let link: string | undefined    = body.link;
    let type: string | undefined    = body.type;

    if (body.notification_id) {
      const { data: n } = await supabase
        .from("notifications")
        .select("user_id, title, message, link, type")
        .eq("id", body.notification_id)
        .maybeSingle();
      if (n) {
        user_id = n.user_id; title = n.title; message = n.message;
        link = n.link ?? undefined; type = n.type ?? undefined;
      }
    }

    if (!user_id || !title || !message) {
      return new Response(JSON.stringify({ error: "user_id, title, message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseHost = "https://tahleemacademy.vercel.app";
    const fullUrl  = absUrl(link, baseHost);
    const results: Record<string, string> = {};

    // ── 1. Web Push ──
    const { data: sub } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id)
      .maybeSingle();

    if (sub) {
      try {
        await sendWebPush(sub as any, {
          title, message, url: fullUrl,
          tag: `${type ?? "notif"}-${user_id}-${Date.now()}`,
        });
        results.web_push = "sent";
      } catch (e: any) {
        results.web_push = `failed: ${e.message}`;
      }
    } else {
      results.web_push = "no_subscription";
    }

    // ── 2. Telegram ──
    // FIX: profiles are keyed by user_id, not id
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", user_id)
      .maybeSingle();

    const chatId = (prof as any)?.telegram_chat_id;
    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, fullUrl);
        results.telegram = "sent";
      } catch (e: any) {
        results.telegram = `failed: ${e.message}`;
      }
    } else {
      results.telegram = "not_linked";
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[dispatch-notification]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});