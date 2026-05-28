/*
  supabase/functions/schedule-class-reminders/index.ts
  ──────────────────────────────────────────────────────
  Called every minute by pg_cron.

  For every timetable slot or private session starting in ~15 or ~5 min:
    1. Inserts a notification row  →  bell icon in the app
    2. Sends Web Push              →  works even when app is closed
    3. Sends Telegram              →  direct gateway call, no trigger dependency

  KEY FIX: The DB notification insert no longer throws on failure.
  This means Telegram is ALWAYS attempted even if the bell-icon insert
  fails (e.g. due to a constraint issue). Each delivery channel is
  independently guarded with its own try/catch.
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THRESHOLDS       = [15, 5] as const;
const APP_BASE_URL     = "https://tahleemacademy.vercel.app";
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
    .eq("type", "class_reminder")
    .ilike("link", `%${dedupKey(slotId, threshold)}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Bell notification (DB) ────────────────────────────────────────────────────
// NOTE: Does NOT throw — Telegram must still fire even if bell insert fails.

async function insertNotification(
  sb: ReturnType<typeof createClient>,
  opts: { userId: string; title: string; message: string; link: string }
): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    user_id: opts.userId,
    title:   opts.title,
    message: opts.message,
    type:    "class_reminder",   // allowed after fix_telegram_reminders.sql
    link:    opts.link,
    is_read: false,
  });
  if (error) {
    // Log but do NOT throw — Web Push and Telegram must still be attempted
    console.warn(
      `[schedule-class-reminders] bell insert failed for ${opts.userId}:`,
      error.message
    );
  }
}

// ── Web Push ──────────────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; message: string; url: string; tag: string }
): Promise<void> {
  const pvt  = Deno.env.get("VAPID_PRIVATE_KEY");
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";
  if (!pvt || !pub) return;
  const wp: any = await import("https://esm.sh/web-push@3.6.7");
  wp.setVapidDetails(subj, pub, pvt);
  await wp.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 20 }
  );
}

// ── Telegram — exact same pattern as hifdh-reminder (proven to work) ─────────

async function sendTelegram(
  chatId: string,
  title: string,
  message: string,
  fullUrl: string
): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    console.warn("[schedule-class-reminders] Telegram secrets missing — check Edge Function secrets");
    return;
  }

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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`gateway ${res.status}: ${body}`);
  }
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
    threshold:    number;
    joinPath:     string;
    label:        string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    // ── Dedup ──────────────────────────────────────────────────────────────
    if (await alreadyNotified(sb, opts.userId, opts.slotId, opts.threshold)) {
      return "dedup";
    }

    const key      = dedupKey(opts.slotId, opts.threshold);
    const time12   = to12hr(opts.startTime);
    const minsDisp = Math.round(opts.minsLeft);

    const title   = opts.threshold === 5
      ? `📚 ${opts.label} starts in 5 min — join now!`
      : `📚 ${opts.label} starting in ${minsDisp} min`;
    const message = `${opts.subjectTitle} starts at ${time12}. ${
      opts.threshold === 5 ? "Tap to join!" : "Get ready!"
    }`;
    const link    = `${opts.joinPath}?${key}`;
    const fullUrl = `${APP_BASE_URL}${link}`;

    // ── 1. Bell notification ───────────────────────────────────────────────
    // insertNotification warns on error but does NOT throw, so we always
    // continue to Web Push and Telegram regardless.
    await insertNotification(sb, { userId: opts.userId, title, message, link });

    // ── 2. Web Push ────────────────────────────────────────────────────────
    const { data: pushSub } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (pushSub) {
      try {
        await sendWebPush(pushSub as any, {
          title, message, url: fullUrl,
          tag: `${opts.slotId}:${opts.threshold}`,
        });
      } catch (e: any) {
        console.warn(
          `[schedule-class-reminders] web push failed for ${opts.userId}:`, e.message
        );
        if (e.statusCode === 410 || e.statusCode === 404) {
          await sb.from("push_subscriptions").delete().eq("user_id", opts.userId);
        }
      }
    }

    // ── 3. Telegram ────────────────────────────────────────────────────────
    // Look up telegram_chat_id by user_id — same query as hifdh-reminder
    const { data: prof, error: profErr } = await sb
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (profErr) {
      console.warn(
        `[schedule-class-reminders] profile lookup failed for ${opts.userId}:`, profErr.message
      );
    }

    const chatId = (prof as any)?.telegram_chat_id;

    if (chatId) {
      try {
        await sendTelegram(String(chatId), title, message, fullUrl);
        console.log(
          `[schedule-class-reminders] ✅ telegram sent → user=${opts.userId} chat=${chatId}`
        );
      } catch (e: any) {
        console.warn(
          `[schedule-class-reminders] ❌ telegram failed for ${opts.userId}:`, e.message
        );
      }
    } else {
      console.log(
        `[schedule-class-reminders] ℹ️  no telegram_chat_id for user=${opts.userId}`
      );
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
      .select("id, start_time, levels, live_url, subjects(id, title, title_ar, teacher_id)")
      .eq("day_of_week", todayDay)
      .eq("is_active", true);

    if (slotsErr) throw slotsErr;

    for (const slot of (slots ?? []) as any[]) {
      const minsLeft = minutesUntil(slot.start_time);

      for (const threshold of THRESHOLDS) {
        if (minsLeft < threshold - 1 || minsLeft > threshold + 1) continue;

        stats.checked++;
        const subjectTitle = slot.subjects?.title_ar || slot.subjects?.title || "Class";
        const slotLevels: string[] = slot.levels ?? [];

        // Teacher
        if (slot.subjects?.teacher_id) {
          const r = await maybeNotify(sb, {
            userId: slot.subjects.teacher_id, slotId: slot.id,
            subjectTitle, startTime: slot.start_time, minsLeft, threshold,
            joinPath: slot.live_url ?? "/teacher/classes", label: "Your class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // Students (group) filtered by level
        const { data: students } = await sb
          .from("profiles")
          .select("user_id, level, student_type")
          .eq("role", "student");

        for (const s of (students ?? []) as any[]) {
          if (s.student_type === "private") continue;
          const level   = s.level ?? "beginner";
          const visible =
            slotLevels.length === 0 ||
            slotLevels.includes("all") ||
            slotLevels.includes(level);
          if (!visible) continue;

          const r = await maybeNotify(sb, {
            userId: s.user_id, slotId: slot.id,
            subjectTitle, startTime: slot.start_time, minsLeft, threshold,
            joinPath: slot.live_url ?? "/student/timetable", label: "Class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }
      }
    }

    // ── Private sessions ──────────────────────────────────────────────────
    const { data: sessions, error: sessErr } = await sb
      .from("private_sessions")
      .select("id, student_id, session_date, start_time, subjects(title, title_ar)")
      .eq("session_date", todayDate);

    if (sessErr) throw sessErr;

    for (const s of (sessions ?? []) as any[]) {
      const minsLeft = minutesUntilDateTime(s.session_date, s.start_time);
      for (const threshold of THRESHOLDS) {
        if (minsLeft < threshold - 1 || minsLeft > threshold + 1) continue;
        stats.checked++;
        const r = await maybeNotify(sb, {
          userId: s.student_id, slotId: s.id,
          subjectTitle: s.subjects?.title_ar || s.subjects?.title || "Private Session",
          startTime: s.start_time, minsLeft, threshold,
          joinPath: "/student/timetable", label: "Private class",
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
