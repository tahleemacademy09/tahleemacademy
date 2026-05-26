/*
  supabase/functions/schedule-class-reminders/index.ts
  ──────────────────────────────────────────────────────
  Server-side cron function — fires every minute via pg_cron.
  Completely independent of whether any user is online.

  What it does every minute:
  1. Finds all subject_timetable slots for today that start in ~15 or ~5 min
  2. Finds all users who should receive each notification (by role/level)
  3. Deduplicates against the notifications table (so it's idempotent)
  4. Inserts notification rows — visible in the bell icon immediately on login
  5. Sends Web Push to each user's push_subscription (works even when browser closed)
  6. Sends Telegram directly (no longer relies on DB trigger chain)
  7. Also handles private_sessions for private students

  Required Supabase secrets:
    SUPABASE_URL               — auto-provided
    SUPABASE_SERVICE_ROLE_KEY  — auto-provided
    VAPID_PRIVATE_KEY          — your VAPID private key (base64url)
    VAPID_PUBLIC_KEY           — your VAPID public key  (base64url)
    VAPID_SUBJECT              — mailto:your@email.com
    LOVABLE_API_KEY            — Lovable gateway bearer token
    TELEGRAM_API_KEY           — your Telegram bot token
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THRESHOLDS       = [15, 5] as const;
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

// ── Time helpers ─────────────────────────────────────────────────────────────
// Deno Edge Functions run in UTC. Timetable times are stored in WAT (UTC+1).

const WAT_OFFSET_MS = 60 * 60 * 1000;

function nowMinutesWAT(): number {
  const watNow = new Date(Date.now() + WAT_OFFSET_MS);
  return watNow.getUTCHours() * 60 + watNow.getUTCMinutes();
}

function nowWAT(): { day: number; dateStr: string } {
  const watNow = new Date(Date.now() + WAT_OFFSET_MS);
  return {
    day:     watNow.getUTCDay(),
    dateStr: watNow.toISOString().split("T")[0],
  };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function to12hr(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function minutesUntil(timeStr: string): number {
  return timeToMinutes(timeStr) - nowMinutesWAT();
}

function minutesUntilDateTime(dateStr: string, timeStr: string): number {
  const target = new Date(`${dateStr}T${timeStr.slice(0, 5)}+01:00`);
  return (target.getTime() - Date.now()) / 60_000;
}

// ── Dedup ────────────────────────────────────────────────────────────────────

function dedupLinkFragment(slotId: string, threshold: number): string {
  return `slot=${slotId}:${threshold}`;
}

async function alreadyNotified(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  slotId: string,
  threshold: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "class_reminder")
    .ilike("link", `%${dedupLinkFragment(slotId, threshold)}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// ── Insert notification (bell icon) ──────────────────────────────────────────

async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  opts: { userId: string; title: string; message: string; link: string }
): Promise<void> {
  await supabase.from("notifications").insert({
    user_id:  opts.userId,
    title:    opts.title,
    message:  opts.message,
    type:     "class_reminder",
    link:     opts.link,
    is_read:  false,
  });
}

// ── Web Push ─────────────────────────────────────────────────────────────────

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; message: string; url: string; tag: string; minutes_left: number }
): Promise<void> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) return;

  const webpush = await import("https://esm.sh/web-push@3.6.7");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 20 }
  );
}

// ── Telegram ─────────────────────────────────────────────────────────────────
// Sends directly via the Lovable gateway — no DB trigger dependency.

async function sendTelegram(
  chatId: string,
  title: string,
  message: string,
  link: string
): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    console.warn("[schedule-class-reminders] Telegram env vars not set — skipping");
    return;
  }

  const text =
    `🕌 <b>Tahleem Academy</b>\n` +
    `<b>${title}</b>\n\n${message}` +
    `\n\n🔗 <a href="${link}">Open Academy</a>`;

  const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram gateway ${res.status}: ${body}`);
  }
}

// ── Core notify function ─────────────────────────────────────────────────────

async function maybeNotify(
  supabase: ReturnType<typeof createClient>,
  opts: {
    userId:       string;
    slotId:       string;
    subjectTitle: string;
    startTime:    string;
    minsLeft:     number;
    threshold:    number;
    joinUrl:      string;
    label:        string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    if (await alreadyNotified(supabase, opts.userId, opts.slotId, opts.threshold)) {
      return "dedup";
    }

    const minsDisp = Math.round(opts.minsLeft);
    const time12   = to12hr(opts.startTime);
    const title    = opts.threshold === 5
      ? `📚 ${opts.label} starts in 5 min — join now!`
      : `📚 ${opts.label} starting in ${minsDisp} min`;
    const message  = `${opts.subjectTitle} starts at ${time12}. ${opts.threshold === 5 ? "Tap to join!" : "Get ready!"}`;
    const link     = `${opts.joinUrl}?${dedupLinkFragment(opts.slotId, opts.threshold)}`;

    // 1. Bell notification (DB insert)
    await insertNotification(supabase, { userId: opts.userId, title, message, link });

    // 2. Web Push
    const { data: sub } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (sub) {
      try {
        await sendWebPush(sub, {
          title, message,
          url:          link,
          tag:          `${opts.slotId}:${opts.threshold}`,
          minutes_left: minsDisp,
        });
      } catch (e: any) {
        console.warn(`[schedule-class-reminders] web push failed for ${opts.userId}:`, e.message);
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("user_id", opts.userId);
        }
      }
    }

    // 3. Telegram — sent directly, no trigger dependency
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", opts.userId)
      .maybeSingle();

    const chatId = (prof as any)?.telegram_chat_id;
    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, link);
      } catch (e: any) {
        // Telegram failure must never block the rest of the pipeline
        console.warn(`[schedule-class-reminders] telegram failed for ${opts.userId}:`, e.message);
      }
    }

    return "sent";
  } catch (e: any) {
    console.error("[schedule-class-reminders] maybeNotify error:", e.message);
    return "error";
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { day: todayIndex, dateStr: todayDate } = nowWAT();
  const stats = { checked: 0, sent: 0, dedup: 0, errors: 0 };

  try {
    // ── 1. Recurring timetable slots ─────────────────────────────────────────
    const { data: slots, error: slotsErr } = await supabase
      .from("subject_timetable")
      .select("id, start_time, levels, live_url, subjects(id, title, title_ar, teacher_id)")
      .eq("day_of_week", todayIndex)
      .eq("is_active", true);

    if (slotsErr) throw slotsErr;

    for (const slot of (slots ?? []) as any[]) {
      const minsLeft = minutesUntil(slot.start_time);

      for (const threshold of THRESHOLDS) {
        if (minsLeft < threshold - 1 || minsLeft > threshold + 1) continue;

        stats.checked++;

        const subjectTitle  = slot.subjects?.title_ar || slot.subjects?.title || "Class";
        const slotLevels: string[] = slot.levels ?? [];

        // a. Teacher
        if (slot.subjects?.teacher_id) {
          const r = await maybeNotify(supabase, {
            userId:       slot.subjects.teacher_id,
            slotId:       slot.id,
            subjectTitle,
            startTime:    slot.start_time,
            minsLeft,
            threshold,
            joinUrl:      slot.live_url ?? "/teacher/classes",
            label:        "Your class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // b. Enrolled students (group)
        const { data: students } = await supabase
          .from("profiles")
          .select("user_id, level, student_type")
          .eq("role", "student");

        for (const student of (students ?? []) as any[]) {
          if (student.student_type === "private") continue;
          const level   = student.level ?? student.course_level ?? "beginner";
          const visible = slotLevels.length === 0
            || slotLevels.includes("all")
            || slotLevels.includes(level);
          if (!visible) continue;

          const r = await maybeNotify(supabase, {
            userId:       student.user_id,
            slotId:       slot.id,
            subjectTitle,
            startTime:    slot.start_time,
            minsLeft,
            threshold,
            joinUrl:      slot.live_url ?? "/student/timetable",
            label:        "Class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }
      }
    }

    // ── 2. Private sessions ───────────────────────────────────────────────────
    const { data: sessions, error: sessErr } = await supabase
      .from("private_sessions")
      .select("id, student_id, session_date, start_time, subjects(title, title_ar)")
      .eq("session_date", todayDate);

    if (sessErr) throw sessErr;

    for (const s of (sessions ?? []) as any[]) {
      const minsLeft = minutesUntilDateTime(s.session_date, s.start_time);

      for (const threshold of THRESHOLDS) {
        if (minsLeft < threshold - 1 || minsLeft > threshold + 1) continue;

        stats.checked++;

        const subjectTitle = s.subjects?.title_ar || s.subjects?.title || "Private Session";

        const r = await maybeNotify(supabase, {
          userId:       s.student_id,
          slotId:       s.id,
          subjectTitle,
          startTime:    s.start_time,
          minsLeft,
          threshold,
          joinUrl:      "/student/timetable",
          label:        "Private class",
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
