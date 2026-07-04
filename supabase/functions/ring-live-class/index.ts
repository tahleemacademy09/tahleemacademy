/*
  supabase/functions/ring-live-class/index.ts
  ════════════════════════════════════════════════════════════════════════
  Called by a Supabase Database Trigger on live_sessions INSERT/UPDATE
  when status changes to "live".

  Sends a RING push notification to all students enrolled in that subject:
    • Persistent phone notification with "Join Now" action button
    • Loud vibration pattern (ring pattern)
    • requireInteraction: true — stays visible until tapped
    • Also fires CLASS_RING postMessage to any open app tabs

  DB Trigger setup (run in Supabase SQL editor):
    create or replace function notify_class_ring()
    returns trigger as $$
    begin
      if new.status = 'live' and (old.status is null or old.status != 'live') then
        perform net.http_post(
          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ring-live-class',
          headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
          body := json_build_object(
            'session_id', new.id,
            'subject_id', new.subject_id,
            'host_id',    new.host_id
          )::jsonb
        );
      end if;
      return new;
    end;
    $$ language plpgsql security definer;

    drop trigger if exists on_class_goes_live on live_sessions;
    create trigger on_class_goes_live
      after insert or update of status on live_sessions
      for each row execute function notify_class_ring();
  ════════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL = "https://tahleemacademy.vercel.app";

// ── Web Push — ring variant ───────────────────────────────────────────────────

async function sendRingPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<{ ok: boolean; gone?: boolean }> {
  const pvt  = Deno.env.get("VAPID_PRIVATE_KEY");
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!pvt || !pub) return { ok: false };

  try {
    const wp: any = await import("https://esm.sh/web-push@3.6.7");
    wp.setVapidDetails(subj, pub, pvt);
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 10 }  // 10 min — if device offline, deliver within 10 min
    );
    return { ok: true };
  } catch (e: any) {
    if (e.statusCode === 410 || e.statusCode === 404) return { ok: false, gone: true };
    return { ok: false };
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

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { body = await req.json(); } catch {}

  const { session_id, subject_id, host_id } = body;
  if (!session_id || !subject_id) {
    return new Response(JSON.stringify({ error: "session_id and subject_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Idempotency guard ──────────────────────────────────────────────────
    // FIX: the DB trigger fires on INSERT or any UPDATE OF status on
    // live_sessions. If status flips to 'live' more than once for the same
    // session (retry, teacher stop/restart, trigger re-fire), this function
    // would re-ring every enrolled student each time with no way to stop it.
    // Guard by checking for a ring notification already tagged with this
    // exact session_id before doing any work.
    const ringTag = `ring:${session_id}`;
    const { data: existingRing } = await sb
      .from("notifications")
      .select("id")
      .eq("type", "class_ring")
      .ilike("link", `%${ringTag}%`)
      .limit(1);

    if ((existingRing?.length ?? 0) > 0) {
      console.log(`[ring-live-class] session ${session_id} already rung — skipping`);
      return new Response(JSON.stringify({ ok: true, rung: 0, skipped: "already_rung" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Get subject and teacher info ─────────────────────────────────────
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

    // ── Get all enrolled students for this subject ───────────────────────
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
      return new Response(JSON.stringify({ ok: true, rung: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch push subs + telegram IDs for all students ──────────────────
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

    for (const studentId of allStudentIds) {
      const userPushSubs = pushSubMap.get(studentId) ?? [];
      const profile = profileMap.get(studentId);

      // ── Web Push ───────────────────────────────────────────────────────
      const webPushSubs = userPushSubs.filter((sub: any) =>
        sub?.endpoint && !sub.endpoint.startsWith("native:") && sub.p256dh && sub.auth
      );
      for (const pushSub of webPushSubs) {
        const result = await sendRingPush(pushSub, ringPayload);
        if (result.gone) {
          // Subscription expired — clean up
          await sb.from("push_subscriptions").delete()
            .eq("user_id", studentId).eq("endpoint", pushSub.endpoint);
        } else if (result.ok) {
          rung++;
        }
      }

      // ── Telegram ───────────────────────────────────────────────────────
      const chatId = profile?.telegram_chat_id;
      if (chatId) {
        await sendTelegramRing(String(chatId), subjectTitle, teacherName, joinUrl);
        if (webPushSubs.length === 0) rung++;  // count telegram-only users
      }

      // ── In-app notification ────────────────────────────────────────────
      // Ring tag appended as a hash fragment so it doesn't interfere with the
      // real navigation query params but still lets the dedup guard above
      // match on it via ilike.
      await sb.from("notifications").insert({
        user_id: studentId,
        title:   `📞 ${subjectTitle} is LIVE now!`,
        message: `${teacherName} has started the class. Join immediately.`,
        type:    "class_ring",
        link:    `/student/live-classes?subject=${subject_id}&autoJoin=true#${ringTag}`,
        is_read: false,
      }).catch(() => {});
    }

    console.log(`[ring-live-class] subject=${subject_id} rung=${rung}/${allStudentIds.length}`);
    return new Response(JSON.stringify({ ok: true, rung, total: allStudentIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[ring-live-class] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
