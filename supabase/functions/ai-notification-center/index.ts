// supabase/functions/ai-notification-center/index.ts
// AI brain for all notifications and content moderation on Tahleem Academy.
//
// Actions:
//  "compose"   → AI writes a bilingual notification from a rough idea
//  "auto"      → AI generates notification for a platform event (exam done, enrollment, etc.)
//  "moderate"  → AI reviews a chat message / content for appropriateness
//  "send"      → Insert notifications into DB for target users (uses service role)
//  "flag"      → Flag a chat message for moderation queue

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

// ── AI call helper ────────────────────────────────────────────────────────────
async function callAI(systemPrompt: string, userContent: string, json = true): Promise<any> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AI error ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (json) {
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    // Verify the user's JWT using the anon client
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: caller } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    // Use service role to bypass RLS when checking the user's role.
    // The anon client cannot read user_roles due to RLS policies that only
    // allow admins to see roles — which creates a chicken-and-egg problem.
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check admin or teacher
    const { data: roleRow } = await adminClient.from("user_roles").select("role")
      .eq("user_id", caller.id).in("role", ["admin", "teacher"]).maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { action } = body;

    // ── ACTION: compose ───────────────────────────────────────────────────────
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

    // ── ACTION: auto ─────────────────────────────────────────────────────────
    // Generate notification from a platform event
    if (action === "auto") {
      const { event_type, context } = body;
      // event_type: exam_completed | exam_graded | new_enrollment | payment_received |
      //             assignment_submitted | level_changed | welcome | hifdh_milestone

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
Be encouraging, use appropriate Islamic phrases (JazakAllah khayran, MashaAllah, etc.) naturally.`,
        `Event: ${description}\nContext: ${JSON.stringify(context || {})}`
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: moderate ──────────────────────────────────────────────────────
    if (action === "moderate") {
      const { content, content_type, author_name } = body;
      // content_type: chat_message | comment | assignment_text

      const result = await callAI(
        `You are a content moderator for Tahleem Academy, an Islamic educational platform for students learning Quran, Arabic, and Islamic Studies.
Review the content and determine if it is appropriate for this Islamic educational context.

Evaluate for:
1. Inappropriate language or profanity
2. Off-topic content unrelated to Islamic education
3. Disrespectful content towards Islam, scholars, or fellow students
4. Spam or promotional content
5. Content that could harm the learning environment

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

    // ── ACTION: send ──────────────────────────────────────────────────────────
    // Actually insert notifications into the DB
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
        // Dynamic academic level slug (foundation, beginner, intermediate, advanced, etc.)
        const { data } = await adminClient.from("profiles").select("user_id").eq("level", target);
        userIds = (data || []).map((p: any) => p.user_id);
      }

      if (userIds.length === 0) {
        return new Response(JSON.stringify({ error: "No target users found", sent: 0 }), { status: 400, headers: corsHeaders });
      }

      // Build records — store both languages so the client can show bilingual content
      const records = userIds.map((uid: string) => ({
        user_id:      uid,
        title:        title_en,                // primary title (English, always present)
        message:      message_en,              // primary message (English, always present)
        title_ar:     title_ar   || null,      // Arabic title (shown alongside English)
        message_ar:   message_ar || null,      // Arabic message (shown alongside English)
        type:         type || "announcement",
        sent_by:      caller.id,
        reference_id: reference_id || null,
        link:         link || null,
        is_read:      false,
        created_at:   new Date().toISOString(),
      }));

      // Batch insert 100 at a time
      // Tries bilingual insert first; if columns don't exist yet (migration pending),
      // falls back to English-only so the send never hard-fails.
      let sent = 0;
      for (let i = 0; i < records.length; i += 100) {
        const chunk = records.slice(i, i + 100);
        const { error } = await adminClient.from("notifications").insert(chunk);
        if (!error) {
          sent += chunk.length;
        } else if (error.message?.includes("title_ar") || error.message?.includes("message_ar")) {
          // Migration not yet applied — strip Arabic columns and retry
          const fallback = chunk.map(({ title_ar: _ta, message_ar: _ma, ...rest }: any) => rest);
          const { error: e2 } = await adminClient.from("notifications").insert(fallback);
          if (!e2) sent += chunk.length;
        }
      }

      // Log to ai_query_logs
      await adminClient.from("ai_query_logs").insert({
        user_id:     caller.id,
        intent_type: "ai_notification",
        created_at:  new Date().toISOString(),
      }).then(() => {});

      return new Response(JSON.stringify({ success: true, sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: flag ──────────────────────────────────────────────────────────
    // Flag content for moderation queue
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
