/*
  supabase/functions/ring-live-class/index.ts
  ════════════════════════════════════════════════════════════════════════
  CHANGE: this used to fire off a DB trigger the moment a teacher's
  live_sessions row flipped to status='live' — i.e. it rang only once the
  teacher had actually started the class. That's the wrong signal: a class
  should ring when it's TIME for it (scheduled_at reaches 0 minutes left),
  whether or not the teacher has joined yet.

  Now called every minute by pg_cron (same pattern as
  schedule-class-reminders, which already does this correctly for
  public_classes). Each run:
    1. Finds live_sessions whose scheduled_at is within a small window of
       "now" (absorbs cron jitter), that haven't been rung yet, and that
       aren't cancelled/ended.
    2. Rings each one — regardless of current status (scheduled or live).

  A single-session manual/admin override is still supported: POST with
  { session_id, subject_id } to force-ring one specific session immediately
  (e.g. an admin "Ring now" button), bypassing the time window check but
  still respecting the already-rung idempotency guard.

  pg_cron setup (run in Supabase SQL editor):
    select cron.schedule(
      'ring-live-class-every-minute',
      '* * * * *',
      $$
      select net.http_post(
        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ring-live-class',
        headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $$
    );

  IMPORTANT — remove the old trigger, or classes will ring twice (once when
  the teacher starts, once at scheduled time):
    drop trigger if exists on_class_goes_live on live_sessions;
    drop function if exists notify_class_ring();
  ════════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL = "https://tahleemacademy.vercel.app";

// Window absorbs cron jitter / clock skew, mirrors schedule-class-reminders.
const RING_WINDOW_MINUTES = 2;

// ── Web Push — ring variant ───────────────────────────────────────────────────

// web-push requires keys in base64URL (no +, /, or = padding). Supabase/PushManager
// sometimes stores them as standard base64 — this was NOT being converted here,
// unlike dispatch-notification/index.ts which already has this fix. Every call
// with non-base64url keys throws inside web-push's crypto step, gets swallowed
// by the catch below, and silently counts as a no-op.
const toBase64url = (b64: string) =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sendRingPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  const pvt  = Deno.env.get("VAPID_PRIVATE_KEY");
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!pvt || !pub) return { ok: false, error: "vapid_not_configured" };

  try {
    const wp: any = await import("https://esm.sh/web-push@3.6.7");
    wp.setVapidDetails(subj, pub, pvt);
    await wp.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: toBase64url(sub.p256dh), auth: toBase64url(sub.auth) },
      },
      JSON.stringify(payload),
      { TTL: 60 * 10 }  // 10 min — if device offline, deliver within 10 min
    );
    return { ok: true };
  } catch (e: any) {
    if (e.statusCode === 410 || e.statusCode === 404) return { ok: false, gone: true, error: `${e.statusCode}` };
    console.error("[ring-live-class] web push error:", e?.statusCode ?? "", e?.message ?? e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ── Telegram ring message ─────────────────────────────────────────────────────

async function sendTelegramRing(
  chatId: string,
  subjectTitle: string,
  teacherName: string,
  joinUrl: string
): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  const text =
    `📞 <b>CLASS IS STARTING NOW!</b>\n\n` +
    `📚 <b>${subjectTitle}</b>\n` +
    `👨‍🏫 Teacher: ${teacherName}\n\n` +
    `Your class is live right now — join immediately!\n\n` +
    `🔗 <a href="${joinUrl}">📹 Join Class Now</a>`;

  await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      "Authorization":        `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type":         "application/json",
    },
    body: JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               "HTML",
      disable_web_page_preview: false,
    }),
  }).catch(() => {});
}

// ── Ring a single session ─────────────────────────────────────────────────────
// Extracted so both the cron sweep (many due sessions) and the manual
// single-session override (admin "Ring now") share identical logic.

type RingStats = {
  session_id: string;
  total_students: number;
  rung: number;
  web_push: { attempted: number; sent: number; failed: number; expired: number; sample_errors: string[] };
  skipped?: string;
};

async function ringSession(
  sb: ReturnType<typeof createClient>,
  session: { id: string; subject_id: string; host_id?: string | null }
): Promise<RingStats> {
  const { id: session_id, subject_id, host_id } = session;

  // ── Idempotency guard ────────────────────────────────────────────────────
  // A session could be picked up by more than one cron tick (jitter window
  // overlap) or force-rung manually after already ringing — guard by
  // checking for a ring notification already tagged with this session_id.
  const ringTag = `ring:${session_id}`;
  const { data: existingRing } = await sb
    .from("notifications")
    .select("id")
    .eq("type", "class_ring")
    .ilike("link", `%${ringTag}%`)
    .limit(1);

  if ((existingRing?.length ?? 0) > 0) {
    console.log(`[ring-live-class] session ${session_id} already rung — skipping`);
    return {
      session_id, total_students: 0, rung: 0,
      web_push: { attempted: 0, sent: 0, failed: 0, expired: 0, sample_errors: [] },
      skipped: "already_rung",
    };
  }

  // ── Get subject and teacher info ─────────────────────────────────────────
  const { data: subject } = await sb
    .from("subjects")
    .select("id, title, title_ar, levels, level, teacher_id")
    .eq("id", subject_id)
    .maybeSingle();

  const subjectTitle = (subject as any)?.title_ar || (subject as any)?.title || "Class";
  const teacherId    = (subject as any)?.teacher_id || host_id;

  const { data: teacherProfile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("user_id", teacherId)
    .maybeSingle();

  const teacherName = (teacherProfile as any)?.full_name || "Your teacher";
  const joinUrl     = `${APP_BASE_URL}/student/live-classes?subject=${subject_id}&autoJoin=true`;
  const ringId      = `ring-${session_id}`;

  const ringPayload = {
    type:         "ring",
    title:        `📞 ${subjectTitle} — Starting Now!`,
    message:      `${teacherName} is waiting — tap to join now!`,
    class_id:     session_id,
    class_title:  subjectTitle,
    teacher_name: teacherName,
    join_url:     joinUrl,
    url:          joinUrl,
    ring_id:      ringId,
    tag:          `ring-${session_id}`,
    icon:         "/icons/icon-192x192.png",
    badge:        "/icons/icon-96x96.png",
    vibrate:      [800, 400, 800, 400, 800, 1500, 800, 400, 800],
    requireInteraction: true,
    actions: [
      { action: "join",    title: "📹 Join Now" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  // ── Get all enrolled students for this subject ───────────────────────────
  // Path 1: courses → enrollments
  const { data: courses } = await sb
    .from("courses").select("id").eq("subject_id", subject_id);
  const courseIds = (courses || []).map((c: any) => c.id);

  let enrolledIds: string[] = [];
  if (courseIds.length > 0) {
    const { data: enrollments } = await sb
      .from("enrollments").select("user_id").in("course_id", courseIds);
    enrolledIds = (enrollments || []).map((e: any) => e.user_id);
  }

  // Path 2: Private students assigned to this subject
  const { data: privateStudents } = await sb
    .from("private_student_subjects" as any)
    .select("student_id").eq("subject_id", subject_id);
  const privateIds = (privateStudents || []).map((p: any) => p.student_id);

  // Path 3: Level-based students
  const subjectLevels: string[] = (subject as any)?.levels || ((subject as any)?.level ? [(subject as any).level] : []);
  let levelIds: string[] = [];
  if (subjectLevels.length > 0) {
    const { data: lvlStudents } = await sb
      .from("profiles").select("user_id").in("level", subjectLevels).eq("role", "student");
    levelIds = (lvlStudents || []).map((p: any) => p.user_id);
  }

  const allStudentIds = [...new Set([...enrolledIds, ...privateIds, ...levelIds])];
  if (allStudentIds.length === 0) {
    console.log(`[ring-live-class] no students found for subject ${subject_id}`);
    return {
      session_id, total_students: 0, rung: 0,
      web_push: { attempted: 0, sent: 0, failed: 0, expired: 0, sample_errors: [] },
    };
  }

  // ── Fetch push subs + telegram IDs for all students ──────────────────────
  const { data: profiles } = await sb
    .from("profiles")
    .select("user_id, telegram_chat_id")
    .in("user_id", allStudentIds);

  const { data: pushSubs } = await sb
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", allStudentIds);

  const pushSubMap = new Map<string, any[]>();
  for (const sub of (pushSubs || []) as any[]) {
    const list = pushSubMap.get(sub.user_id) ?? [];
    list.push(sub);
    pushSubMap.set(sub.user_id, list);
  }
  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  let rung = 0;
  let webPushAttempted = 0;
  let webPushFailed = 0;
  let webPushExpired = 0;
  const failureSamples: string[] = [];

  for (const studentId of allStudentIds) {
    const userPushSubs = pushSubMap.get(studentId) ?? [];
    const profile = profileMap.get(studentId);

    // ── Web Push ─────────────────────────────────────────────────────────
    const webPushSubs = userPushSubs.filter((sub: any) =>
      sub?.endpoint && !sub.endpoint.startsWith("native:") && sub.p256dh && sub.auth
    );
    for (const pushSub of webPushSubs) {
      webPushAttempted++;
      const result = await sendRingPush(pushSub, ringPayload);
      if (result.gone) {
        webPushExpired++;
        await sb.from("push_subscriptions").delete()
          .eq("user_id", studentId).eq("endpoint", pushSub.endpoint);
      } else if (result.ok) {
        rung++;
      } else {
        webPushFailed++;
        if (failureSamples.length < 5 && result.error) {
          failureSamples.push(result.error);
        }
      }
    }

    // ── Telegram ─────────────────────────────────────────────────────────
    const chatId = profile?.telegram_chat_id;
    if (chatId) {
      await sendTelegramRing(String(chatId), subjectTitle, teacherName, joinUrl);
      if (webPushSubs.length === 0) rung++;
    }

    // ── In-app notification ──────────────────────────────────────────────
    await sb.from("notifications").insert({
      user_id: studentId,
      title:   `📞 ${subjectTitle} is LIVE now!`,
      message: `${teacherName} has started the class. Join immediately.`,
      type:    "class_ring",
      link:    `/student/live-classes?subject=${subject_id}&autoJoin=true#${ringTag}`,
      is_read: false,
    }).catch(() => {});
  }

  const stats: RingStats = {
    session_id,
    total_students: allStudentIds.length,
    rung,
    web_push: {
      attempted: webPushAttempted,
      sent: webPushAttempted - webPushFailed - webPushExpired,
      failed: webPushFailed,
      expired: webPushExpired,
      sample_errors: failureSamples,
    },
  };

  if (webPushAttempted > 0 && stats.web_push.sent === 0) {
    console.error(
      `[ring-live-class] ⚠️ ALL ${webPushAttempted} web push sends failed for session=${session_id} — pipeline likely broken, not just offline devices. Sample errors:`,
      failureSamples
    );
  }

  console.log(`[ring-live-class] session=${session_id}`, stats);
  return stats;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { body = await req.json(); } catch {}

  try {
    // ── Manual/admin single-session override ────────────────────────────────
    // Kept for an admin "Ring now" button or ad-hoc testing. Bypasses the
    // time-window check (rings immediately regardless of scheduled_at) but
    // still respects the already-rung idempotency guard inside ringSession.
    if (body?.session_id && body?.subject_id) {
      const stats = await ringSession(sb, {
        id: body.session_id, subject_id: body.subject_id, host_id: body.host_id,
      });
      return new Response(JSON.stringify({ ok: true, mode: "manual", ...stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Cron sweep: ring anything whose scheduled_at just hit 0 ─────────────
    // Rings regardless of status ('scheduled' or 'live') — the teacher
    // joining is no longer the signal, the scheduled time is.
    const now       = new Date();
    const windowEnd = new Date(now.getTime() + RING_WINDOW_MINUTES * 60_000);
    const windowStart = new Date(now.getTime() - RING_WINDOW_MINUTES * 60_000);

    const { data: dueSessions, error: dueErr } = await sb
      .from("live_sessions")
      .select("id, subject_id, host_id, scheduled_at, status")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString())
      .not("status", "eq", "ended")
      .not("status", "eq", "cancelled");

    if (dueErr) throw dueErr;

    console.log(`[ring-live-class] cron sweep found ${(dueSessions ?? []).length} due session(s)`);

    const results: RingStats[] = [];
    for (const session of (dueSessions ?? []) as any[]) {
      const stats = await ringSession(sb, {
        id: session.id, subject_id: session.subject_id, host_id: session.host_id,
      });
      results.push(stats);
    }

    return new Response(JSON.stringify({ ok: true, mode: "cron", checked: (dueSessions ?? []).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[ring-live-class] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
