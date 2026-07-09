/*
  supabase/functions/schedule-class-reminders/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called every minute by pg_cron.

  Thresholds [0, 15]:
    0  min → CLASS IS STARTING NOW  (ring push — loud, persistent)
    15 min → "Class in 15 min" reminder

  Changes v2:
    • Thresholds reduced to [0, 10] — stops duplicate notification flood
    • Dedup query param separated from the clean join_url in push payload
    • Push payload url is now always a clean path — no dedup junk in URL
    • Urgency: "high" added to web-push so Android delivers immediately
    • Islamic content: starts with Tasleem, proper reminder wording
    • Notification window widened to 3 min to absorb cron jitter
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THRESHOLDS    = [0, 15] as const;
type Threshold      = typeof THRESHOLDS[number];

const APP_BASE_URL     = "https://tahleemacademy.vercel.app";

function sanitiseUrl(raw: string | null | undefined): string {
  if (!raw) return APP_BASE_URL;
  if (raw.startsWith(APP_BASE_URL)) return raw;
  if (raw.startsWith("/")) return APP_BASE_URL + raw;
  try { const { pathname, search } = new URL(raw); return APP_BASE_URL + pathname + search; }
  catch { return APP_BASE_URL; }
}

// Strip domain from URL — push payloads carry a clean relative path so the
// service worker can deep-link without re-attaching the Vercel host.
function toRelativePath(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram/sendMessage";

// ── Time helpers ──────────────────────────────────────────────────────────────

function minutesUntil(scheduledAt: string): number {
  return (new Date(scheduledAt).getTime() - Date.now()) / 60_000;
}

function to12hr(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function dedupKey(classId: string, threshold: number): string {
  return `class=${classId}:t=${threshold}`;
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

async function alreadyNotified(
  sb: ReturnType<typeof createClient>,
  userId: string,
  classId: string,
  threshold: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data } = await sb
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .ilike("link", `%${dedupKey(classId, threshold)}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Bell notification ─────────────────────────────────────────────────────────

async function insertNotification(
  sb: ReturnType<typeof createClient>,
  opts: { userId: string; title: string; message: string; title_ar?: string; message_ar?: string; link: string; type: string }
): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    user_id:    opts.userId,
    title:      opts.title,
    message:    opts.message,
    title_ar:   opts.title_ar   ?? null,
    message_ar: opts.message_ar ?? null,
    type:       opts.type,
    link:       opts.link,
    is_read:    false,
  });
  if (error) console.warn(`[schedule-class-reminders] bell insert failed:`, error.message);
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
  if (!pvt || !pub) {
    console.warn("[schedule-class-reminders] VAPID keys not set");
    return {};
  }
  try {
    const wp: any = await import("https://esm.sh/web-push@3.6.7");
    wp.setVapidDetails(subj, pub, pvt);
    const toBase64url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: toBase64url(sub.p256dh), auth: toBase64url(sub.auth) } },
      JSON.stringify(payload),
      {
        TTL: ttl,
        urgency: "high",      // ← critical for Android timely delivery
        topic: (payload as any).tag ?? "tahleem",
      }
    );
    return {};
  } catch (e: any) {
    if (e.statusCode === 410 || e.statusCode === 404) return { gone: true };
    console.warn("[schedule-class-reminders] push error:", e.statusCode, e.message);
    throw e;
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, title: string, message: string, url: string): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  const text =
    `🕌 <b>Tahleem Academy</b>\n` +
    `<b>${title}</b>\n\n${message}\n\n` +
    `🔗 <a href="${url}">Open Academy</a>`;

  const res = await fetch(TELEGRAM_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization":        `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type":         "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}: ${await res.text()}`);
}

// ── Resolve who a class is actually for ───────────────────────────────────────
// FIX: previously every reminder/ring blasted ALL students in the school for
// EVERY class, regardless of subject/level/enrollment. Mirrors the scoping
// logic already used in ring-live-class: enrolled-via-course, private
// 1:1 students, and level-matched students. A class with no subject_id is
// treated as a genuinely open/public class and still goes to everyone.
async function resolveStudentAudience(
  sb: ReturnType<typeof createClient>,
  subjectId: string | null | undefined
): Promise<string[]> {
  if (!subjectId) {
    const { data: allStudents } = await sb
      .from("profiles")
      .select("user_id")
      .eq("role", "student");
    return (allStudents ?? []).map((p: any) => p.user_id);
  }

  const { data: subject } = await sb
    .from("subjects")
    .select("levels, level")
    .eq("id", subjectId)
    .maybeSingle();

  // Path 1: enrolled via a course tied to this subject
  const { data: courses } = await sb
    .from("courses").select("id").eq("subject_id", subjectId);
  const courseIds = (courses || []).map((c: any) => c.id);

  let enrolledIds: string[] = [];
  if (courseIds.length > 0) {
    const { data: enrollments } = await sb
      .from("enrollments").select("user_id").in("course_id", courseIds);
    enrolledIds = (enrollments || []).map((e: any) => e.user_id);
  }

  // Path 2: private 1:1 students assigned to this subject
  const { data: privateStudents } = await sb
    .from("private_student_subjects" as any)
    .select("student_id").eq("subject_id", subjectId);
  const privateIds = (privateStudents || []).map((p: any) => p.student_id);

  // Path 3: level-based students
  const subjectLevels: string[] =
    (subject as any)?.levels || ((subject as any)?.level ? [(subject as any).level] : []);
  let levelIds: string[] = [];
  if (subjectLevels.length > 0) {
    const { data: lvlStudents } = await sb
      .from("profiles").select("user_id").in("level", subjectLevels).eq("role", "student");
    levelIds = (lvlStudents || []).map((p: any) => p.user_id);
  }

  return [...new Set([...enrolledIds, ...privateIds, ...levelIds])];
}

// ── Notify one user for one class ─────────────────────────────────────────────

async function maybeNotify(
  sb: ReturnType<typeof createClient>,
  opts: {
    userId:       string;
    classId:      string;
    classTitle:   string;
    scheduledAt:  string;
    minsLeft:     number;
    threshold:    Threshold;
    joinUrl:      string;       // clean URL — no dedup params
    joinPath:     string;       // relative path for push payload navigation
    teacherName:  string;
    label:        string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    if (await alreadyNotified(sb, opts.userId, opts.classId, opts.threshold)) return "dedup";

    const isRing  = opts.threshold === 0;
    const time12  = to12hr(opts.scheduledAt);
    const key     = dedupKey(opts.classId, opts.threshold);

    // ── Islamic content ───────────────────────────────────────────────────────
    // All notifications start with Assalamu Alaikum (tasleem)

    const title = isRing
      ? `📞 ${opts.classTitle} — Starting Now!`
      : `📚 ${opts.classTitle} — Class in 15 min`;

    const message = isRing
      ? `Assalamu Alaikum wa Rahmatullah 🌙\n${opts.teacherName} is ready and waiting for you. Tap to join the class now — may Allah bless your learning.`
      : `Assalamu Alaikum wa Rahmatullah 🌙\nYour class "${opts.classTitle}" begins at ${time12}. Please make wudu, open your Mus-haf, and join on time. Barakallahu feekum.`;

    const title_ar = isRing
      ? `📞 ${opts.classTitle} — تبدأ الآن!`
      : `📚 ${opts.classTitle} — الدرس بعد ١٥ دقيقة`;

    const message_ar = isRing
      ? `السلام عليكم ورحمة الله 🌙\n${opts.teacherName} في انتظاركم — اضغط للانضمام الآن. بارك الله في علمكم.`
      : `السلام عليكم ورحمة الله 🌙\nدرسكم "${opts.classTitle}" يبدأ الساعة ${time12}. تهيّأوا وافتحوا المصحف. بارك الله فيكم.`;

    // Bell link: relative path for direct navigation — dedup key appended as hash so it
    // doesn't interfere with query params but still lets alreadyNotified() match via ilike.
    // DashboardLayout checks n.link.startsWith("/") to navigate without a full page reload.
    const link = `${opts.joinPath}#${key}`;

    // 1. Bell
    await insertNotification(sb, {
      userId: opts.userId, title, message, title_ar, message_ar,
      link, type: isRing ? "class_ring" : "class_reminder",
    });

    // 2. Web Push — clean path in url so SW can deep-link without pollution
    const { data: pushSubs } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId);

    const pushPayload = isRing
      ? {
          type: "ring", title, body: message, message,
          url: opts.joinPath,   // ← relative path, no dedup params
          tag: `ring-${opts.classId}`,
          requireInteraction: true,
          vibrate: [800, 400, 800, 400, 800, 1500, 800, 400, 800],
          actions: [
            { action: "join",    title: "📹 Join Now" },
            { action: "dismiss", title: "Dismiss"     },
          ],
        }
      : {
          type: "class_reminder", title, body: message, message,
          url: opts.joinPath,   // ← relative path, no dedup params
          tag: `${opts.classId}:${opts.threshold}`,
          minutes_left: opts.threshold,
          vibrate: [300, 100, 300, 100, 600],
        };

    for (const sub of (pushSubs ?? []) as any[]) {
      if (!sub?.endpoint || sub.endpoint.startsWith("native:") || !sub.p256dh || !sub.auth) continue;
      try {
        const result = await sendWebPush(sub, pushPayload, isRing ? 600 : 900);
        if (result.gone) {
          await sb.from("push_subscriptions").delete()
            .eq("user_id", opts.userId).eq("endpoint", sub.endpoint);
          console.log("[schedule-class-reminders] cleaned expired sub for user:", opts.userId);
        } else {
          console.log(`[schedule-class-reminders] ✅ push → user=${opts.userId} threshold=${opts.threshold}`);
        }
      } catch (e: any) {
        console.warn(`[schedule-class-reminders] push failed user=${opts.userId}:`, e.message);
      }
    }

    // 3. Telegram
    const { data: prof } = await sb
      .from("profiles").select("telegram_chat_id")
      .eq("user_id", opts.userId).maybeSingle();
    const chatId = (prof as any)?.telegram_chat_id;
    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, opts.joinUrl);
        console.log(`[schedule-class-reminders] ✅ telegram → user=${opts.userId}`);
      } catch (e: any) {
        console.warn(`[schedule-class-reminders] telegram failed user=${opts.userId}:`, e.message);
      }
    }

    return "sent";
  } catch (e: any) {
    console.error("[schedule-class-reminders] maybeNotify error:", e.message);
    return "error";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stats = { checked: 0, sent: 0, dedup: 0, errors: 0 };

  try {
    const now       = new Date();
    const in18min   = new Date(now.getTime() + 18 * 60_000); // covers 0 and 15 min thresholds (with 3-min window)
    const minus1min = new Date(now.getTime() - 60_000);

    const { data: classes, error: classErr } = await sb
      .from("public_classes")
      .select("id, title, title_ar, scheduled_at, host_id, join_url, status, subject_id")
      .gte("scheduled_at", minus1min.toISOString())
      .lte("scheduled_at", in18min.toISOString())
      .not("status", "eq", "ended")
      .not("status", "eq", "cancelled");

    if (classErr) throw classErr;

    console.log(`[schedule-class-reminders] found ${(classes ?? []).length} upcoming classes`);

    for (const cls of (classes ?? []) as any[]) {
      const minsLeft = minutesUntil(cls.scheduled_at);

      for (const threshold of THRESHOLDS) {
        const window = 3; // 3-min window absorbs cron timing jitter
        if (minsLeft < threshold - window || minsLeft > threshold + window) continue;

        stats.checked++;
        const classTitle = cls.title_ar || cls.title || "Class";
        const joinUrl    = sanitiseUrl(cls.join_url ?? `${APP_BASE_URL}/live/${cls.id}`);
        const joinPath   = toRelativePath(joinUrl);
        // For authenticated students: deep-link directly into the live classroom overlay.
        // LearningHub reads ?subject= and ?autoJoin=true to open ClassroomView immediately.
        const studentJoinPath = cls.subject_id
          ? `/student/live-classes?subject=${cls.subject_id}&autoJoin=true`
          : joinPath; // fallback to public join page if no subject_id

        // Teacher name
        let teacherName = "Your teacher";
        if (cls.host_id) {
          const { data: tp } = await sb
            .from("profiles").select("full_name")
            .eq("user_id", cls.host_id).maybeSingle();
          teacherName = (tp as any)?.full_name || teacherName;
        }

        // Notify teacher/host
        if (cls.host_id) {
          const r = await maybeNotify(sb, {
            userId: cls.host_id, classId: cls.id, classTitle,
            scheduledAt: cls.scheduled_at, minsLeft, threshold,
            joinUrl: `${APP_BASE_URL}/teacher/live-classes`,
            joinPath: "/teacher/live-classes",
            teacherName: "You", label: "Your class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // Notify only the students this class is actually for (enrolled /
        // private / level-matched — or everyone if it's a true public class
        // with no subject_id attached).
        const studentIds = await resolveStudentAudience(sb, cls.subject_id);

        for (const studentId of studentIds) {
          if (studentId === cls.host_id) continue; // don't double-notify the host as a student
          const r = await maybeNotify(sb, {
            userId: studentId, classId: cls.id, classTitle,
            scheduledAt: cls.scheduled_at, minsLeft, threshold,
            joinUrl: `${APP_BASE_URL}${studentJoinPath}`, joinPath: studentJoinPath,
            teacherName, label: "Class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }
      }
    }

    // ── Recurring weekly classes from subject_timetable ────────────────────────
    // These are the day-of-week + start_time slots teachers set up in the
    // timetable editor. We compute today's scheduled datetime in Africa/Lagos
    // and match against the same 0/15-min thresholds.
    try {
      // Africa/Lagos is fixed UTC+1 (no DST) — compute today's dow/time there.
      const lagosNowMs = Date.now() + 60 * 60_000;
      const lagosNow   = new Date(lagosNowMs);
      const lagosDow   = lagosNow.getUTCDay(); // 0=Sun..6=Sat

      const { data: slots } = await sb
        .from("subject_timetable")
        .select("id, subject_id, teacher_id, day_of_week, start_time, live_url, is_active")
        .eq("is_active", true)
        .eq("day_of_week", lagosDow);

      console.log(`[schedule-class-reminders] found ${(slots ?? []).length} timetable slots for dow=${lagosDow}`);

      for (const slot of (slots ?? []) as any[]) {
        if (!slot.start_time) continue;
        // start_time is "HH:MM:SS" in Africa/Lagos local time
        const [hh, mm] = String(slot.start_time).split(":").map(Number);
        if (Number.isNaN(hh) || Number.isNaN(mm)) continue;

        // Build today's scheduled UTC instant: Lagos = UTC+1
        const scheduledUtcMs = Date.UTC(
          lagosNow.getUTCFullYear(),
          lagosNow.getUTCMonth(),
          lagosNow.getUTCDate(),
          hh - 1, mm, 0
        );
        const scheduledIso = new Date(scheduledUtcMs).toISOString();
        const minsLeft = (scheduledUtcMs - Date.now()) / 60_000;

        for (const threshold of THRESHOLDS) {
          const window = 3;
          if (minsLeft < threshold - window || minsLeft > threshold + window) continue;

          // Resolve subject title
          let classTitle = "Class";
          if (slot.subject_id) {
            const { data: sj } = await sb
              .from("subjects").select("title, title_ar")
              .eq("id", slot.subject_id).maybeSingle();
            classTitle = (sj as any)?.title_ar || (sj as any)?.title || classTitle;
          }

          const joinPath = slot.subject_id
            ? `/student/live-classes?subject=${slot.subject_id}&autoJoin=true`
            : "/student/live-classes";
          const teacherJoinPath = "/teacher/live-classes";

          // Teacher name
          let teacherName = "Your teacher";
          if (slot.teacher_id) {
            const { data: tp } = await sb
              .from("profiles").select("full_name")
              .eq("user_id", slot.teacher_id).maybeSingle();
            teacherName = (tp as any)?.full_name || teacherName;
          }

          // Notify teacher
          if (slot.teacher_id) {
            stats.checked++;
            const r = await maybeNotify(sb, {
              userId: slot.teacher_id, classId: slot.id, classTitle,
              scheduledAt: scheduledIso, minsLeft, threshold,
              joinUrl: `${APP_BASE_URL}${teacherJoinPath}`,
              joinPath: teacherJoinPath,
              teacherName: "You", label: "Your class",
            });
            stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
          }

          // Notify enrolled/level students
          const studentIds = await resolveStudentAudience(sb, slot.subject_id);
          for (const studentId of studentIds) {
            if (studentId === slot.teacher_id) continue;
            stats.checked++;
            const r = await maybeNotify(sb, {
              userId: studentId, classId: slot.id, classTitle,
              scheduledAt: scheduledIso, minsLeft, threshold,
              joinUrl: `${APP_BASE_URL}${joinPath}`, joinPath,
              teacherName, label: "Class",
            });
            stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
          }
        }
      }
    } catch (e: any) {
      console.error("[schedule-class-reminders] timetable scan failed:", e.message);
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
