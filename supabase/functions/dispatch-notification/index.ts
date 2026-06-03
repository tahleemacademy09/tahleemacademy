/*
  dispatch-notification — universal notification fan-out.
  Triggered by Postgres on every INSERT into public.notifications.

  Sends:
    1) Web Push (VAPID)
    2) Telegram via Lovable gateway
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; message: string; title_ar?: string; message_ar?: string; url: string; tag: string }
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
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) throw new Error("Telegram gateway not configured");

  const text =
    `🕌 <b>Tahleem Academy</b>\n` +
    `<b>${title}</b>\n\n${message}` +
    (link ? `\n\n🔗 <a href="${link}">Open Academy</a>` : "");

  const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      "Authorization":         `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key":  TELEGRAM_API_KEY,
      "Content-Type":          "application/json",
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
        .select("user_id, title, message, title_ar, message_ar, link, type")
        .eq("id", body.notification_id)
        .maybeSingle();
      if (n) {
        user_id = n.user_id; title = n.title; message = n.message;
        link = n.link ?? undefined; type = n.type ?? undefined;
        if ((n as any).title_ar)   body.title_ar   = (n as any).title_ar;
        if ((n as any).message_ar) body.message_ar = (n as any).message_ar;
      }
    }

    let title_ar: string | undefined  = body.title_ar;
    let message_ar: string | undefined = body.message_ar;

    if (!user_id || !title || !message) {
      return new Response(JSON.stringify({ error: "user_id, title, message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullUrl = absUrl(link);
    const results: Record<string, string> = {};

    // ── 1. Web Push — fan out to ALL of the user's devices ──
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (subs && subs.length > 0) {
      let sent = 0, failed = 0;
      await Promise.all(
        subs.map(async (sub: any) => {
          try {
            await sendWebPush(sub, {
              title, message,
              title_ar,
              message_ar,
              url: fullUrl,
              tag: `${type ?? "notif"}-${user_id}-${Date.now()}`,
            });
            sent++;
          } catch {
            failed++;
          }
        })
      );
      results.web_push = `sent ${sent}/${subs.length}${failed ? ` (${failed} failed)` : ""}`;
    } else {
      results.web_push = "no_subscription";
    }

    // ── 2. Telegram ──
    // FIXED: profiles use user_id as the lookup key, not id
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
