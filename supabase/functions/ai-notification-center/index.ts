// supabase/functions/ai-notification-center/index.ts
// FIX v3: Edge functions cannot call other edge functions via fetch() on free/pro plans.
// Web Push and Telegram are now handled DIRECTLY inside this function — no dispatch hop.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY   = Deno.env.get("LOVABLE_API_KEY")!;
const TELEGRAM_GATEWAY  = "https://connector-gateway.lovable.dev/telegram/sendMessage";

// ── Base64 → Base64url (required by web-push) ────────────────────────────────
const toBase64url = (b64: string) =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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
async function sendTelegram(chatId: string, title: string, message: string): Promise<void> {
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;
  const text = `🕌 <b>Tahleem Academy</b>\n<b>${title}</b>\n\n${message}`;
  const res = await fetch(TELEGRAM_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization":        `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type":         "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

// ── Dispatch push + telegram for one user ────────────────────────────────────
async function dispatchToUser(
  adminClient: any,
  userId: string,
  title: string,
  message: string
): Promise<void> {
  const pushPayload = {
    title, body: message, message,
    url: "https://tahleemacademy.vercel.app",
    tag: `notif-${userId}-${Date.now()}`,
    vibrate: [200, 100, 200],
  };

  // Web Push — all devices
  const { data: subs } = await adminClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  let pushSent = 0;
  for (const sub of (subs ?? []) as any[]) {
    const result = await sendWebPush(sub, pushPayload);
    if (result === "ok") pushSent++;
    if (result === "expired") {
      await adminClient.from("push_subscriptions")
        .delete().eq("user_id", userId).eq("endpoint", sub.endpoint);
    }
  }
  console.log(`[dispatch] user=${userId} push=${pushSent}/${(subs??[]).length}`);

  // Telegram
  const { data: prof } = await adminClient
    .from("profiles").select("telegram_chat_id")
    .eq("user_id", userId).maybeSingle();
  const chatId = (prof as any)?.telegram_chat_id;
  if (chatId) {
    try {
      await sendTelegram(String(chatId), title, message);
      console.log(`[dispatch] user=${userId} telegram=sent`);
    } catch (e: any) {
      console.warn(`[dispatch] user=${userId} telegram=failed:`, e.message);
    }
  }
}

// ── Bilingual columns check ───────────────────────────────────────────────────
let bilingualColumnsExist: boolean | null = null;
async function checkBilingualColumns(adminClient: any): Promise<boolean> {
  if (bilingualColumnsExist !== null) return bilingualColumnsExist;
  try {
    const { error } = await adminClient.from("notifications").select("title_ar").limit(1);
    bilingualColumnsExist = !error;
  } catch { bilingualColumnsExist = false; }
  return bilingualColumnsExist!;
}

// ── AI call ───────────────────────────────────────────────────────────────────
async function callAI(systemPrompt: string, userContent: string, json = true): Promise<any> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (json) { try { return JSON.parse(text); } catch { return { raw: text }; } }
  return text;
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: caller } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRow } = await adminClient.from("user_roles").select("role")
      .eq("user_id", caller.id).in("role", ["admin", "teacher"]).maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { action } = body;

    // ── compose ───────────────────────────────────────────────────────────────
    if (action === "compose") {
      const { idea, target_hint } = body;
      const result = await callAI(
        `You are a notification composer for Tahleem Academy (أكاديمية التعليم), an Islamic online learning platform.
Given a rough idea from an admin, write a professional notification in BOTH English and Arabic.
Return JSON: { "title_en": "short title (max 60 chars)", "title_ar": "العنوان", "message_en": "body (max 200 chars)", "message_ar": "الرسالة", "suggested_target": "all | students | teachers", "suggested_type": "announcement | reminder | achievement | warning | info" }`,
        `Rough idea: "${idea}"\nTarget hint: "${target_hint || "all users"}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── auto ──────────────────────────────────────────────────────────────────
    if (action === "auto") {
      const { event_type, context } = body;
      const result = await callAI(
        `You are an automatic notification generator for Tahleem Academy (أكاديمية التعليم).
Generate a warm notification. Return JSON: { "title_en": "title", "title_ar": "العنوان", "message_en": "message", "message_ar": "الرسالة", "type": "achievement | reminder | announcement | info" }`,
        `Event: ${event_type}\nContext: ${JSON.stringify(context || {})}`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── moderate ──────────────────────────────────────────────────────────────
    if (action === "moderate") {
      const { content, content_type, author_name } = body;
      const result = await callAI(
        `You are a content moderator for Tahleem Academy Islamic platform.
Return JSON: { "verdict": "approve | warn | remove", "confidence": 0.0-1.0, "reason_en": "reason", "reason_ar": "السبب", "suggested_warning_en": "warning or null", "suggested_warning_ar": "التحذير", "is_spam": true/false, "is_inappropriate": true/false, "severity": "none | low | medium | high" }`,
        `Content type: ${content_type}\nAuthor: ${author_name}\nContent: "${content}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (action === "send") {
      const { title_en, title_ar, message_en, message_ar, target, type, reference_id, link } = body;
      if (!title_en || !message_en) {
        return new Response(JSON.stringify({ error: "title_en and message_en required" }), { status: 400, headers: corsHeaders });
      }

      // Resolve users
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

      if (userIds.length === 0) {
        return new Response(JSON.stringify({ error: "No target users found", sent: 0 }), { status: 400, headers: corsHeaders });
      }

      const hasBilingualCols = await checkBilingualColumns(adminClient);
      const records = userIds.map((uid: string) => ({
        user_id:      uid,
        title:        title_en,
        message:      message_en,
        ...(hasBilingualCols ? { title_ar: title_ar || null, message_ar: message_ar || null } : {}),
        type:         type || "announcement",
        sent_by:      caller.id,
        reference_id: reference_id || null,
        link:         link || null,
        is_read:      false,
        created_at:   new Date().toISOString(),
      }));

      // Insert notifications
      let sent = 0;
      for (let i = 0; i < records.length; i += 100) {
        const { error } = await adminClient.from("notifications").insert(records.slice(i, i + 100));
        if (!error) sent += Math.min(100, records.length - i);
      }

      // Dispatch push + telegram DIRECTLY (no HTTP hop to dispatch-notification)
      for (const uid of userIds) {
        await dispatchToUser(adminClient, uid, title_en, message_en);
      }

      console.log(`[ai-notification-center] sent=${sent} to ${userIds.length} users`);

      await adminClient.from("ai_query_logs").insert({
        user_id: caller.id, intent_type: "ai_notification", created_at: new Date().toISOString(),
      }).then(() => {});

      return new Response(
        JSON.stringify({ success: true, sent, bilingual_ready: hasBilingualCols }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── flag ──────────────────────────────────────────────────────────────────
    if (action === "flag") {
      const { content, content_type, content_id, author_id, reason } = body;
      await adminClient.from("moderation_queue" as any).insert({
        content, content_type: content_type || "chat_message",
        content_id: content_id || null, author_id: author_id || null,
        flagged_by: caller.id, reason: reason || "manual_flag",
        status: "pending", created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error("ai-notification-center error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
