// supabase/functions/ai-notification-center/index.ts
// FIX: After inserting notification rows, directly calls dispatch-notification
// for each user instead of relying on the DB trigger (which times out via pg_net).

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

let bilingualColumnsExist: boolean | null = null;

async function checkBilingualColumns(adminClient: any): Promise<boolean> {
  if (bilingualColumnsExist !== null) return bilingualColumnsExist;
  try {
    const { error } = await adminClient.from("notifications").select("title_ar").limit(1);
    bilingualColumnsExist = !error;
  } catch {
    bilingualColumnsExist = false;
  }
  return bilingualColumnsExist!;
}

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

// ── Direct dispatch — bypasses DB trigger ────────────────────────────────────
// Calls dispatch-notification edge function directly for each notification row.
// This is reliable unlike the pg_net trigger which times out.

async function dispatchToUser(notificationId: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ notification_id: notificationId }),
    });
  } catch (e: any) {
    console.warn("[ai-notification-center] dispatch failed for:", notificationId, e.message);
  }
}

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

    const body   = await req.json();
    const { action } = body;

    // ── compose ───────────────────────────────────────────────────────────────
    if (action === "compose") {
      const { idea, target_hint } = body;
      const result = await callAI(
        `You are a notification composer for Tahleem Academy (أكاديمية التعليم), an Islamic online learning platform.
Given a rough idea from an admin, write a professional notification in BOTH English and Arabic.
IMPORTANT: The academy name in Arabic is always "أكاديمية التعليم" — never invent another Arabic translation.
Return JSON:
{
  "title_en": "short title (max 60 chars)",
  "title_ar": "العنوان بالعربي (max 60 chars)",
  "message_en": "body text (max 200 chars, warm Islamic tone)",
  "message_ar": "نص الرسالة (max 200 chars)",
  "suggested_target": "all | students | teachers | beginners | intermediate | advanced",
  "suggested_type": "announcement | reminder | achievement | warning | info"
}
Use بسم الله style greetings only when genuinely appropriate. Keep it concise and actionable.`,
        `Rough idea: "${idea}"\nTarget hint: "${target_hint || "all users"}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── auto ──────────────────────────────────────────────────────────────────
    if (action === "auto") {
      const { event_type, context } = body;
      const eventDescriptions: Record<string, string> = {
        exam_completed:       "A student has completed an exam",
        exam_graded:          "A student's exam has been graded and results are ready",
        new_enrollment:       "A student has enrolled in a new subject/course",
        payment_received:     "A student's payment has been received and confirmed",
        assignment_submitted: "A student has submitted an assignment",
        level_changed:        "A student has been assigned a new learning level",
        welcome:              "A new student has joined the academy",
        hifdh_milestone:      "A student has reached a Quran memorization milestone",
        exam_reminder:        "An exam is coming up soon for students",
        class_reminder:       "A live class is starting soon",
        announcement:         "General academy announcement",
      };
      const description = eventDescriptions[event_type] || event_type;
      const result = await callAI(
        `You are an automatic notification generator for Tahleem Academy (أكاديمية التعليم), an Islamic learning platform.
Generate a warm, encouraging notification for this platform event.
IMPORTANT: The academy name in Arabic is always "أكاديمية التعليم" — never invent another Arabic translation.
Return JSON:
{
  "title_en": "short engaging title (max 60 chars)",
  "title_ar": "العنوان (max 60 chars)",
  "message_en": "encouraging message (max 200 chars)",
  "message_ar": "الرسالة (max 200 chars)",
  "type": "achievement | reminder | announcement | info"
}
Be encouraging, use appropriate Islamic phrases naturally.`,
        `Event: ${description}\nContext: ${JSON.stringify(context || {})}`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── moderate ──────────────────────────────────────────────────────────────
    if (action === "moderate") {
      const { content, content_type, author_name } = body;
      const result = await callAI(
        `You are a content moderator for Tahleem Academy, an Islamic educational platform.
Review the content and determine if it is appropriate.
Return JSON:
{
  "verdict": "approve | warn | remove",
  "confidence": 0.0-1.0,
  "reason_en": "brief reason in English",
  "reason_ar": "السبب بالعربي",
  "suggested_warning_en": "polite warning message to send user if verdict is warn (null if approve/remove)",
  "suggested_warning_ar": "رسالة التحذير بالعربي",
  "is_spam": true/false,
  "is_inappropriate": true/false,
  "severity": "none | low | medium | high"
}`,
        `Content type: ${content_type || "chat_message"}\nAuthor: ${author_name || "Unknown"}\nContent: "${content}"`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (action === "send") {
      const { title_en, title_ar, message_en, message_ar, target, type, reference_id, link } = body;

      if (!title_en || !message_en) {
        return new Response(JSON.stringify({ error: "title_en and message_en required" }), { status: 400, headers: corsHeaders });
      }

      // Resolve target users
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

      // Insert in batches of 100
      let sent = 0;
      const insertedIds: string[] = [];

      for (let i = 0; i < records.length; i += 100) {
        const chunk = records.slice(i, i + 100);
        const { data: inserted, error } = await adminClient
          .from("notifications")
          .insert(chunk)
          .select("id, user_id");
        if (!error && inserted) {
          sent += inserted.length;
          insertedIds.push(...inserted.map((r: any) => r.id));
        }
      }

      // ── DIRECT DISPATCH — no trigger needed ──────────────────────────────
      // Fire-and-forget: dispatch push+telegram for each notification in parallel.
      // We don't await all of them to avoid request timeout on large sends.
      const dispatchPromises = insertedIds.map(id => dispatchToUser(id));
      // Await up to 10 at a time to avoid overwhelming the edge function
      for (let i = 0; i < dispatchPromises.length; i += 10) {
        await Promise.allSettled(dispatchPromises.slice(i, i + 10));
      }

      await adminClient.from("ai_query_logs").insert({
        user_id:     caller.id,
        intent_type: "ai_notification",
        created_at:  new Date().toISOString(),
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
        content,
        content_type: content_type || "chat_message",
        content_id:   content_id || null,
        author_id:    author_id || null,
        flagged_by:   caller.id,
        reason:       reason || "manual_flag",
        status:       "pending",
        created_at:   new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error("ai-notification-center error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
