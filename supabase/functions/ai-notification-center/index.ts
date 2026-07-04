// supabase/functions/ai-notification-center/index.ts
// v4 — complete rewrite
//   • AI switched from Lovable gateway → Anthropic API (claude-sonnet-5)
//   • All AI-generated/rephrased notifications are Islamically toned
//     (Salam opening, In sha Allah, duas, Islamic emoji)
//   • sanitiseUrl() strips Lovable preview domains from every push payload
//   • New "rephrase" action for on-demand Islamic rephrasing of existing text
//   • auto_rephrase flag on "send" action runs content through Islamic rephraser
//     before dispatching to users

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_KEY  = Deno.env.get("ANTHROPIC_API_KEY")!;
const LOVABLE_KEY    = Deno.env.get("LOVABLE_API_KEY");   // still used for Telegram only
const TELEGRAM_GW    = "https://connector-gateway.lovable.dev/telegram/sendMessage";

const APP_BASE_URL   = "https://tahleemacademy.vercel.app";

// ── URL sanitiser ─────────────────────────────────────────────────────────────
// Strips any non-production host (e.g. Lovable preview domain) from a URL.

function sanitiseUrl(raw: string | null | undefined): string {
  if (!raw) return APP_BASE_URL;
  if (raw.startsWith(APP_BASE_URL)) return raw;
  if (raw.startsWith("/")) return APP_BASE_URL + raw;
  try {
    const { pathname, search, hash } = new URL(raw);
    return APP_BASE_URL + pathname + search + hash;
  } catch {
    return APP_BASE_URL;
  }
}

// ── Base64 → Base64url ────────────────────────────────────────────────────────

const toBase64url = (b64: string) =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── Anthropic API call ────────────────────────────────────────────────────────

async function callAI(system: string, user: string): Promise<any> {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({
      // BUG FIX: "claude-sonnet-4-6" is not a real Anthropic model string —
      // it doesn't match any released model, so every call here was getting
      // rejected by the API with a non-2xx response, which is exactly the
      // "AI compose failed — Edge Function returned a non-2xx status code"
      // error shown in the admin panel. This affected EVERY action in this
      // file (compose, rephrase, auto, moderate) since they all funnel
      // through callAI(). Using the current Sonnet model string instead.
      model:      "claude-sonnet-5",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").replace(/```json\n?|```\n?/g, "").trim();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Islamic system prompts ────────────────────────────────────────────────────

const COMPOSE_SYSTEM = `\
You are a bilingual Islamic notification writer for Tahleem Academy (أكاديمية التعليم), \
an online Quran and Islamic sciences platform.

Rules:
- Every English body MUST open with "Assalamu Alaikum" or "As-Salamu Alaykum wa Rahmatullahi wa Barakatuh".
- Every Arabic body MUST open with "السلام عليكم ورحمة الله وبركاته".
- Class reminders must include "In sha Allah" / "بإذن الله" naturally.
- Achievement messages must include "Ma sha Allah" / "ماشاء الله" and a short dua.
- Titles: concise (≤55 chars EN / ≤45 chars AR) with a relevant Islamic emoji (🕌📚🌙✨🤲📿).
- Bodies: warm, encouraging, Islamically appropriate (≤180 chars EN / ≤160 chars AR).
- NEVER use generic corporate language. Write as a caring teacher.
- Return ONLY valid JSON — no markdown, no preamble.

Schema:
{
  "title_en":         "short title ≤55 chars",
  "title_ar":         "العنوان ≤45 حرفاً",
  "message_en":       "body ≤180 chars, opens with salam",
  "message_ar":       "الرسالة ≤160 حرفاً، تبدأ بالسلام",
  "suggested_target": "all | students | teachers",
  "suggested_type":   "announcement | reminder | achievement | warning | info"
}`;

const AUTO_SYSTEM = `\
You are an automatic Islamic notification generator for Tahleem Academy (أكاديمية التعليم).

Rules:
- Class start/reminder: open with salam, include "In sha Allah" / "بإذن الله".
- Achievement: include "Ma sha Allah" / "ماشاء الله" and a short dua.
- Titles: concise with Islamic emoji (🕌📚🌙✨🤲📿), ≤55 chars EN / ≤45 chars AR.
- Bodies: warm, ≤180 chars EN / ≤160 chars AR.
- Return ONLY valid JSON — no markdown, no preamble.

Schema:
{
  "title_en":   "title",
  "title_ar":   "العنوان",
  "message_en": "message opening with salam",
  "message_ar": "الرسالة تبدأ بالسلام",
  "type":       "achievement | reminder | announcement | info"
}`;

const REPHRASE_SYSTEM = `\
You are an Islamic copywriter for Tahleem Academy (أكاديمية التعليم). \
Rephrase the given notification to be warm, Islamic, and bilingual. \
Preserve the core meaning exactly.

Rules:
- Open EN body with "Assalamu Alaikum".
- Open AR body with "السلام عليكم".
- Use "In sha Allah" / "بإذن الله" where naturally applicable.
- Achievement messages: add "Ma sha Allah" / "ماشاء الله".
- Keep title ≤55 chars EN / ≤45 chars AR.
- Keep body ≤180 chars EN / ≤160 chars AR.
- Return ONLY valid JSON — no markdown, no preamble.

Schema: { "title_en": "...", "title_ar": "...", "message_en": "...", "message_ar": "..." }`;

// ── Web Push ──────────────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<"ok" | "expired" | "error"> {
  const pvt  = Deno.env.get("VAPID_PRIVATE_KEY");
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!pvt || !pub) { console.error("[push] VAPID keys missing"); return "error"; }
  try {
    const wp: any = await import("https://esm.sh/web-push@3.6.7");
    wp.setVapidDetails(subj, pub, pvt);
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: toBase64url(sub.p256dh), auth: toBase64url(sub.auth) } },
      JSON.stringify(payload),
      { TTL: 60 * 30 }
    );
    return "ok";
  } catch (e: any) {
    if (e?.statusCode === 410 || e?.statusCode === 404) return "expired";
    console.error("[push] error:", e?.statusCode, e?.message);
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
  const TG_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_KEY || !TG_KEY) return;

  const ar = (title_ar || message_ar)
    ? `\n\n— — —\n<b>${title_ar || title}</b>\n${message_ar || message}`
    : "";

  const text =
    `🕌 <b>Tahleem Academy</b>\n\n<b>${title}</b>\n${message}` +
    ar +
    (link ? `\n\n🔗 <a href="${sanitiseUrl(link)}">Open Academy</a>` : "");

  const res = await fetch(TELEGRAM_GW, {
    method: "POST",
    headers: {
      "Authorization":        `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": TG_KEY,
      "Content-Type":         "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

// ── Dispatch push + telegram for one user ─────────────────────────────────────

async function dispatchToUser(
  adminClient: any,
  userId: string,
  title: string,
  message: string,
  opts?: { title_ar?: string; message_ar?: string; link?: string; type?: string }
): Promise<void> {
  const safeUrl = sanitiseUrl(opts?.link);

  const pushPayload = {
    title,
    body:       opts?.message_ar ? `${message}\n\n${opts.message_ar}` : message,
    message,
    title_ar:   opts?.title_ar,
    message_ar: opts?.message_ar,
    url:        safeUrl,
    tag:        `notif-${userId}-${Date.now()}`,
    type:       opts?.type ?? "announcement",
    vibrate:    opts?.type === "class_ring"
      ? [800, 400, 800, 400, 800, 1500, 800, 400, 800]
      : [200, 100, 200],
    requireInteraction: opts?.type === "class_ring",
  };

  // Web push — all devices
  const { data: subs } = await adminClient
    .from("push_subscriptions").select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  let sent = 0;
  for (const sub of (subs ?? []) as any[]) {
    const r = await sendWebPush(sub, pushPayload);
    if (r === "ok") sent++;
    if (r === "expired") {
      await adminClient.from("push_subscriptions")
        .delete().eq("user_id", userId).eq("endpoint", sub.endpoint);
    }
  }
  console.log(`[dispatch] user=${userId} push=${sent}/${(subs ?? []).length}`);

  // Telegram
  const { data: prof } = await adminClient
    .from("profiles").select("telegram_chat_id").eq("user_id", userId).maybeSingle();
  const chatId = (prof as any)?.telegram_chat_id;
  if (chatId) {
    try {
      await sendTelegram(String(chatId), title, message, safeUrl, opts?.title_ar, opts?.message_ar);
      console.log(`[dispatch] user=${userId} telegram=sent`);
    } catch (e: any) {
      console.warn(`[dispatch] user=${userId} telegram=${e.message}`);
    }
  }
}

// ── Bilingual columns probe ───────────────────────────────────────────────────

let _bilingualReady: boolean | null = null;
async function hasBilingualCols(adminClient: any): Promise<boolean> {
  if (_bilingualReady !== null) return _bilingualReady;
  const { error } = await adminClient.from("notifications").select("title_ar").limit(1);
  _bilingualReady = !error;
  return _bilingualReady!;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user: caller } } = await anonClient.auth.getUser(auth.replace("Bearer ", ""));
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRow } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", caller.id).in("role", ["admin", "teacher"]).maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { action } = body;

    // ── compose ───────────────────────────────────────────────────────────────
    if (action === "compose") {
      const result = await callAI(
        COMPOSE_SYSTEM,
        `Rough idea: "${body.idea}"\nTarget hint: "${body.target_hint || "all students"}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── rephrase ──────────────────────────────────────────────────────────────
    if (action === "rephrase") {
      const { title_en, title_ar, message_en, message_ar, type } = body;
      const result = await callAI(
        REPHRASE_SYSTEM,
        `Type: ${type || "announcement"}\nEN title: "${title_en}"\nAR title: "${title_ar || ""}"\nEN body: "${message_en}"\nAR body: "${message_ar || ""}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── auto ──────────────────────────────────────────────────────────────────
    if (action === "auto") {
      const result = await callAI(
        AUTO_SYSTEM,
        `Event: ${body.event_type}\nContext: ${JSON.stringify(body.context || {})}`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── moderate ──────────────────────────────────────────────────────────────
    if (action === "moderate") {
      const result = await callAI(
        `You are a content moderator for Tahleem Academy, an Islamic learning platform.
Determine whether the content is appropriate for an Islamic educational context.
Return ONLY valid JSON — no markdown, no preamble.
Schema: { "verdict": "approve | warn | remove", "confidence": 0.0-1.0, "reason_en": "...", "reason_ar": "...", "suggested_warning_en": "string or null", "suggested_warning_ar": "string or null", "is_spam": true/false, "is_inappropriate": true/false, "severity": "none | low | medium | high" }`,
        `Content type: ${body.content_type}\nAuthor: ${body.author_name}\nContent: "${body.content}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (action === "send") {
      const {
        title_en, title_ar, message_en, message_ar,
        target, type, reference_id, link, auto_rephrase,
      } = body;

      if (!title_en || !message_en) {
        return new Response(
          JSON.stringify({ error: "title_en and message_en are required" }),
          { status: 400, headers: corsHeaders }
        );
      }

      let fTitleEn = title_en, fTitleAr = title_ar;
      let fMsgEn   = message_en, fMsgAr  = message_ar;

      // Optionally Islamic-rephrase before sending
      if (auto_rephrase) {
        try {
          const r = await callAI(
            REPHRASE_SYSTEM,
            `Type: ${type || "announcement"}\nEN title: "${title_en}"\nAR title: "${title_ar || ""}"\nEN body: "${message_en}"\nAR body: "${message_ar || ""}"`
          );
          if (r.title_en)   fTitleEn = r.title_en;
          if (r.title_ar)   fTitleAr = r.title_ar;
          if (r.message_en) fMsgEn   = r.message_en;
          if (r.message_ar) fMsgAr   = r.message_ar;
        } catch (e: any) {
          console.warn("[send] rephrase failed, using original:", e.message);
        }
      }

      const safeLink = sanitiseUrl(link);

      // Resolve target user IDs
      let userIds: string[] = [];
      if (target === "all") {
        const { data } = await adminClient.from("profiles").select("user_id");
        userIds = (data || []).map((p: any) => p.user_id);
      } else if (target === "students") {
        const { data } = await adminClient.from("user_roles").select("user_id").eq("role", "student");
        userIds = (data || []).map((r: any) => r.user_id);
      } else if (target === "teachers") {
        const { data } = await adminClient.from("user_roles").select("user_id").eq("role", "teacher");
        userIds = (data || []).map((r: any) => r.user_id);
      } else if (target?.startsWith("user:")) {
        userIds = [target.replace("user:", "")];
      } else if (Array.isArray(body.user_ids)) {
        userIds = body.user_ids;
      } else if (target) {
        const { data } = await adminClient.from("profiles").select("user_id").eq("level", target);
        userIds = (data || []).map((p: any) => p.user_id);
      }

      if (!userIds.length) {
        return new Response(
          JSON.stringify({ error: "No target users found", sent: 0 }),
          { status: 400, headers: corsHeaders }
        );
      }

      const bilingual = await hasBilingualCols(adminClient);
      const records = userIds.map((uid: string) => ({
        user_id:      uid,
        title:        fTitleEn,
        message:      fMsgEn,
        ...(bilingual ? { title_ar: fTitleAr || null, message_ar: fMsgAr || null } : {}),
        type:         type || "announcement",
        sent_by:      caller.id,
        reference_id: reference_id || null,
        link:         safeLink,
        is_read:      false,
        created_at:   new Date().toISOString(),
      }));

      let sent = 0;
      for (let i = 0; i < records.length; i += 100) {
        const { error } = await adminClient.from("notifications").insert(records.slice(i, i + 100));
        if (!error) sent += Math.min(100, records.length - i);
      }

      // Push delivery is handled automatically by the Postgres trigger
      // on the notifications table, which calls dispatch-notification for each row.
      // No manual dispatchToUser loop needed here.

      console.log(`[ai-notification-center] sent=${sent} to ${userIds.length} users`);

      await adminClient.from("ai_query_logs").insert({
        user_id: caller.id, intent_type: "ai_notification",
        created_at: new Date().toISOString(),
      }).then(() => {});

      return new Response(
        JSON.stringify({ success: true, sent, bilingual_ready: bilingual }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── flag ──────────────────────────────────────────────────────────────────
    if (action === "flag") {
      await adminClient.from("moderation_queue" as any).insert({
        content:       body.content,
        content_type:  body.content_type || "chat_message",
        content_id:    body.content_id || null,
        author_id:     body.author_id || null,
        flagged_by:    caller.id,
        reason:        body.reason || "manual_flag",
        status:        "pending",
        created_at:    new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error("[ai-notification-center] fatal:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
