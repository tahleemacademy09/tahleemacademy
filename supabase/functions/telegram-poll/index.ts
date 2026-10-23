/*
  telegram-poll — long-polls Telegram getUpdates for ~55s per invocation.
  Run on a 1-minute pg_cron schedule.

  Behaviour:
   • If a message is "/start <code>" (or "/link <code>"), it looks up
     profiles.telegram_link_code and sets profiles.telegram_chat_id.
   • Replies confirming the link.
   • Persists the offset to telegram_bot_state so updates aren't replayed.
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tg(method: string, body: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const r = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const start = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: state } = await sb
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .maybeSingle();

  let offset = (state as any)?.update_offset ?? 0;
  let processed = 0;

  while (true) {
    const elapsed = Date.now() - start;
    const remaining = MAX_RUNTIME_MS - elapsed;
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const r = await tg("getUpdates", { offset, timeout, allowed_updates: ["message"] });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.data }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const updates: any[] = r.data.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;
      const text: string = msg.text ?? "";
      const chatId = String(msg.chat.id);
      const m = text.match(/^\/(start|link)\s+([A-Za-z0-9-]{4,})/);
      if (m) {
        const code = m[2];
        const { data: prof } = await sb
          .from("profiles")
          .select("id, full_name")
          .eq("telegram_link_code", code)
          .maybeSingle();

        if (prof) {
          await sb.from("profiles")
            .update({ telegram_chat_id: chatId, telegram_link_code: null })
            .eq("id", (prof as any).id);
          await tg("sendMessage", {
            chat_id: chatId,
            text: `✅ <b>Tahleem Academy</b> — your Telegram is now linked${(prof as any).full_name ? `, ${(prof as any).full_name}` : ""}.\n\nYou will receive class reminders and announcements here.`,
            parse_mode: "HTML",
          });
        } else {
          await tg("sendMessage", {
            chat_id: chatId,
            text: `⚠️ Invalid or expired link code. Open Tahleem Academy → <i>Profile Settings → Notifications</i> to get a fresh code.`,
            parse_mode: "HTML",
          });
        }
      } else if (text === "/start") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `🕌 <b>Tahleem Academy Notifications Bot</b>\n\nTo link your account, open the academy app → <i>Profile Settings → Notifications → Link Telegram</i>, copy your code, and send it back here as <code>/start YOUR_CODE</code>.`,
          parse_mode: "HTML",
        });
      }
      processed++;
    }

    offset = Math.max(...updates.map((x: any) => x.update_id)) + 1;
    await sb.from("telegram_bot_state")
      .upsert({ id: 1, update_offset: offset, updated_at: new Date().toISOString() });
  }

  return new Response(JSON.stringify({ ok: true, processed, offset }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});