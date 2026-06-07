/*
  supabase/functions/schedule-class-reminders/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called every minute by pg_cron.

  Thresholds:
    0  min → CLASS IS STARTING NOW — sends a RING push (loud, persistent,
             requireInteraction). Fires automatically from timetable with
             NO live session needed. Students get rung on their phones
             even if app is closed.
    5  min → "Class in 5 min" reminder
    15 min → "Class in 15 min" heads-up

  Channels per user:
    1. In-app notification row  (bell icon)
    2. Web Push                 (phone notification bar, works when closed)
    3. Telegram                 (direct message via gateway)
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 0 = ring at exact class time (no session needed — timetable-driven)
// 5 = 5-min reminder
// 15 = 15-min heads-up
const THRESHOLDS    = [0, 5, 15] as const;
type Threshold      = typeof THRESHOLDS[number];

const APP_BASE_URL     = "https://tahleemacademy.lovable.app";
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram/sendMessage";
const WAT_OFFSET_MS    = 60 * 60 * 1000; // UTC+1 (WAT)

// ── Time helpers ──────────────────────────────────────────────────────────────

function nowWAT() {
  const d = new Date(Date.now() + WAT_OFFSET_MS);
  return { day: d.getUTCDay(), dateStr: d.toISOString().split("T")[0] };
}

function nowMinutesWAT(): number {
  const d = new Date(Date.now() + WAT_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesUntil(timeStr: string): number {
  return timeToMinutes(timeStr) - nowMinutesWAT();
}

function minutesUntilDateTime(dateStr: string, timeStr: string): number {
  return (new Date(`${dateStr}T${timeStr.slice(0, 5)}+01:00`).getTime() - Date.now()) / 60_000;
}

function to12hr(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function dedupKey(slotId: string, threshold: number): string {
  return `slot=${slotId}:${threshold}`;
}

// ── Dedup check ───────────────────────────────────────────────────────────────

async function alreadyNotified(
  sb: ReturnType<typeof createClient>,
  userId: string,
  slotId: string,
  threshold: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data } = await sb
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .in("type", ["class_reminder", "class_ring"])
    .ilike("link", `%${dedupKey(slotId, threshold)}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Bell notification (DB) ────────────────────────────────────────────────────

async function insertNotification(
  sb: ReturnType<typeof createClient>,
  opts: { userId: string; title: string; message: string; title_ar?: string; message_ar?: string; link: string; type: string }
): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    user_id: opts.userId,
    title:   opts.title,
    message: opts.message,
    title_ar:   opts.title_ar   ?? null,
    message_ar: opts.message_ar ?? null,
    type:    opts.type,
    link:    opts.link,
    is_read: false,
  });
  if (error) {
    console.warn(`[schedule-class-reminders] bell insert failed for ${opts.userId}:`, error.message);
  }
}

// ── Web Push ──────────────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  ttl = 60 * 20
): Promise<{ gone?: boolean }> {
  const pvt  = Deno.env.get("VAPID_PRIVATE_KEY");
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!pvt || !pub) return {};
  try {
    const wp: any = await import("https://esm.sh/web-push@3.6.7");
    wp.setVapidDetails(subj, pub, pvt);
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: ttl }
    );
    return {};
  } catch (e: any) {
    if (e.statusCode === 410 || e.statusCode === 404) return { gone: true };
    throw e;
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(
  chatId: string,
  title: string,
  message: string,
  fullUrl: string
): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  const text =
    `🕌 <b>Tahleem Academy</b>\n` +
    `<b>${title}</b>\n\n` +
    `${message}\n\n` +
    `🔗 <a href="${fullUrl}">Open Academy</a>`;

  const res = await fetch(TELEGRAM_GATEWAY, {
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
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
}

// ── Build push payload per threshold ─────────────────────────────────────────

function buildPushPayload(opts: {
  threshold:    Threshold;
  slotId:       string;
  subjectTitle: string;
  startTime:    string;
  minsLeft:     number;
  teacherName:  string;
  joinUrl:      string;
  label:        string;
}) {
  const { threshold, slotId, subjectTitle, startTime, minsLeft, teacherName, joinUrl, label } = opts;
  const time12 = to12hr(startTime);

  if (threshold === 0) {
    // ── RING: class is starting RIGHT NOW ──────────────────────────────────
    return {
      type:               "ring",
      title:              `📞 ${subjectTitle} — Starting Now!`,
      message:            `${teacherName} is waiting — tap to join now!`,
      body:               `${teacherName} is waiting — tap to join now!`,
      class_id:           slotId,
      class_title:        subjectTitle,
      teacher_name:       teacherName,
      join_url:           joinUrl,
      url:                joinUrl,
      ring_id:            `sched-${slotId}-${new Date().toISOString().split("T")[0]}`,
      tag:                `ring-${slotId}`,
      requireInteraction: true,
      vibrate:            [800, 400, 800, 400, 800, 1500, 800, 400, 800],
      actions: [
        { action: "join",    title: "📹 Join Now" },
        { action: "dismiss", title: "Dismiss"     },
      ],
    };
  }

  if (threshold === 5) {
    return {
      type:    "class_reminder",
      title:   `📚 ${label} in 5 min — get ready!`,
      message: `${subjectTitle} starts at ${time12}. Open the app now!`,
      body:    `${subjectTitle} starts at ${time12}. Open the app now!`,
      url:     joinUrl,
      tag:     `${slotId}:5`,
      minutes_left: 5,
    };
  }

  // threshold === 15
  return {
    type:    "class_reminder",
    title:   `📚 ${label} in 15 min`,
    message: `${subjectTitle} starts at ${time12}. Get ready!`,
    body:    `${subjectTitle} starts at ${time12}. Get ready!`,
    url:     joinUrl,
    tag:     `${slotId}:15`,
    minutes_left: 15,
  };
}

// ── Core per-user notify ──────────────────────────────────────────────────────

async function maybeNotify(
  sb: ReturnType<typeof createClient>,
  opts: {
    userId:       string;
    slotId:       string;
    subjectTitle: string;
    startTime:    string;
    minsLeft:     number;
    threshold:    Threshold;
    joinPath:     string;
    label:        string;
    teacherName?: string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    if (await alreadyNotified(sb, opts.userId, opts.slotId, opts.threshold)) return "dedup";

    const key        = dedupKey(opts.slotId, opts.threshold);
    const time12     = to12hr(opts.startTime);
    const minsDisp   = Math.round(opts.minsLeft);
    const teacherName = opts.teacherName || "Your teacher";
    const joinUrl    = `${APP_BASE_URL}${opts.joinPath}`;
    const isRing     = opts.threshold === 0;

    const title = isRing
      ? `📞 ${opts.subjectTitle} — Starting Now!`
      : opts.threshold === 5
        ? `📚 ${opts.label} in 5 min — get ready!`
        : `📚 ${opts.label} in ${minsDisp} min`;

    const message = isRing
      ? `${teacherName} is waiting — tap to join now!`
      : `${opts.subjectTitle} starts at ${time12}. ${opts.threshold === 5 ? "Open the app now!" : "Get ready!"}`;

    // ── Arabic counterparts ─────────────────────────────────────────────
    const title_ar = isRing
      ? `📞 ${opts.subjectTitle} — تبدأ الآن!`
      : opts.threshold === 5
        ? `📚 ${opts.label} بعد ٥ دقائق — استعد!`
        : `📚 ${opts.label} بعد ${minsDisp} دقيقة`;

    const message_ar = isRing
      ? `${teacherName} في انتظارك — اضغط للانضمام الآن!`
      : `تبدأ ${opts.subjectTitle} الساعة ${time12}. ${opts.threshold === 5 ? "افتح التطبيق الآن!" : "كن مستعداً!"}`;

    const link = `${opts.joinPath}?${key}`;

    // ── 1. Bell notification ─────────────────────────────────────────────
    await insertNotification(sb, {
      userId: opts.userId,
      title,
      message,
      title_ar,
      message_ar,
      link,
      type: isRing ? "class_ring" : "class_reminder",
    });

    // ── 2. Web Push ──────────────────────────────────────────────────────
    // Fetch ALL subscriptions for this user (multi-device support)
    const { data: pushSubs } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId);

    const pushPayload = buildPushPayload({
      threshold:    opts.threshold,
      slotId:       opts.slotId,
      subjectTitle: opts.subjectTitle,
      startTime:    opts.startTime,
      minsLeft:     opts.minsLeft,
      teacherName,
      joinUrl,
      label:        opts.label,
    });

    for (const sub of (pushSubs || []) as any[]) {
      try {
        const result = await sendWebPush(
          sub,
          pushPayload,
          isRing ? 60 * 10 : 60 * 20  // ring: 10min TTL, reminder: 20min
        );
        if (result.gone) {
          await sb.from("push_subscriptions").delete()
            .eq("user_id", opts.userId).eq("endpoint", sub.endpoint);
        }
      } catch (e: any) {
        console.warn(`[schedule-class-reminders] web push failed for ${opts.userId}:`, e.message);
      }
    }

    // ── 3. Telegram ──────────────────────────────────────────────────────
    const { data: prof } = await sb
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", opts.userId)
      .maybeSingle();

    const chatId = (prof as any)?.telegram_chat_id;
    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, joinUrl);
        console.log(`[schedule-class-reminders] ✅ telegram → user=${opts.userId}`);
      } catch (e: any) {
        console.warn(`[schedule-class-reminders] ❌ telegram failed for ${opts.userId}:`, e.message);
      }
    }

    return "sent";
  } catch (e: any) {
    console.error("[schedule-class-reminders] maybeNotify error:", e.message);
    return "error";
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { day: todayDay, dateStr: todayDate } = nowWAT();
  const stats = { checked: 0, sent: 0, dedup: 0, errors: 0 };

  try {
    // ── Recurring timetable slots ─────────────────────────────────────────
    const { data: slots, error: slotsErr } = await sb
      .from("subject_timetable")
      .select("id, start_time, levels, live_url, teacher_id, teacher_ids, subjects(id, title, title_ar, teacher_id)")
      .eq("day_of_week", todayDay)
      .eq("is_active", true);

    if (slotsErr) throw slotsErr;

    for (const slot of (slots ?? []) as any[]) {
      const minsLeft = minutesUntil(slot.start_time);

      for (const threshold of THRESHOLDS) {
        // Window: ±1 minute for reminders, exact minute for ring
        const window = threshold === 0 ? 0.9 : 1;
        if (minsLeft < threshold - window || minsLeft > threshold + window) continue;

        stats.checked++;
        const subjectTitle = slot.subjects?.title_ar || slot.subjects?.title || "Class";
        const slotLevels: string[] = slot.levels ?? [];

        // Determine teacher for this slot
        const teacherId = slot.teacher_id || slot.subjects?.teacher_id;

        // Fetch teacher name
        let teacherName = "Your teacher";
        if (teacherId) {
          const { data: tp } = await sb
            .from("profiles").select("full_name")
            .eq("user_id", teacherId).maybeSingle();
          teacherName = (tp as any)?.full_name || teacherName;
        }

        const joinPath = slot.live_url
          ? slot.live_url.startsWith("http") ? slot.live_url : `/student/live-classes?subject=${slot.subjects?.id}`
          : `/student/live-classes?subject=${slot.subjects?.id}`;

        // ── Notify teacher ───────────────────────────────────────────────
        if (teacherId) {
          const r = await maybeNotify(sb, {
            userId: teacherId, slotId: slot.id,
            subjectTitle, startTime: slot.start_time, minsLeft, threshold,
            joinPath: `/teacher/classes`, label: "Your class",
            teacherName: "You",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // Also notify all teacher_ids (co-teachers)
        for (const tid of (slot.teacher_ids || []) as string[]) {
          if (tid === teacherId) continue;
          const r = await maybeNotify(sb, {
            userId: tid, slotId: `${slot.id}-t${tid}`,
            subjectTitle, startTime: slot.start_time, minsLeft, threshold,
            joinPath: `/teacher/classes`, label: "Your class",
            teacherName: "You",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // ── Notify students ──────────────────────────────────────────────
        // Path 1: level-based students
        let studentIds: string[] = [];

        if (slotLevels.length > 0) {
          const { data: lvlStudents } = await sb
            .from("profiles")
            .select("user_id")
            .in("level", slotLevels)
            .eq("role", "student");
          studentIds = (lvlStudents || []).map((s: any) => s.user_id);
        } else {
          // No level restriction — notify all group students
          const { data: allStudents } = await sb
            .from("profiles")
            .select("user_id, student_type")
            .eq("role", "student");
          studentIds = (allStudents || [])
            .filter((s: any) => s.student_type !== "private")
            .map((s: any) => s.user_id);
        }

        // Path 2: private students assigned to this subject
        const { data: privateStudents } = await sb
          .from("private_student_subjects" as any)
          .select("student_id")
          .eq("subject_id", slot.subjects?.id);
        const privateIds: string[] = (privateStudents || []).map((p: any) => p.student_id);

        const allStudentIds = [...new Set([...studentIds, ...privateIds])];

        for (const userId of allStudentIds) {
          const r = await maybeNotify(sb, {
            userId, slotId: slot.id,
            subjectTitle, startTime: slot.start_time, minsLeft, threshold,
            joinPath, label: "Class",
            teacherName,
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }
      }
    }

    // ── Private one-to-one sessions ───────────────────────────────────────
    const { data: sessions, error: sessErr } = await sb
      .from("private_sessions")
      .select("id, student_id, session_date, start_time, subjects(title, title_ar), teacher_id")
      .eq("session_date", todayDate);

    if (sessErr) throw sessErr;

    for (const s of (sessions ?? []) as any[]) {
      const minsLeft = minutesUntilDateTime(s.session_date, s.start_time);

      for (const threshold of THRESHOLDS) {
        const window = threshold === 0 ? 0.9 : 1;
        if (minsLeft < threshold - window || minsLeft > threshold + window) continue;
        stats.checked++;

        let teacherName = "Your teacher";
        if (s.teacher_id) {
          const { data: tp } = await sb
            .from("profiles").select("full_name")
            .eq("user_id", s.teacher_id).maybeSingle();
          teacherName = (tp as any)?.full_name || teacherName;
        }

        const r = await maybeNotify(sb, {
          userId: s.student_id, slotId: s.id,
          subjectTitle: s.subjects?.title_ar || s.subjects?.title || "Private Session",
          startTime: s.start_time, minsLeft, threshold,
          joinPath: "/student/timetable", label: "Private class",
          teacherName,
        });
        stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
      }
    }

    console.log("[schedule-class-reminders] done", stats);
    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[schedule-class-reminders] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
