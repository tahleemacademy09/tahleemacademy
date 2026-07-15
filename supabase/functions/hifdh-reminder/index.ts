/*
  supabase/functions/hifdh-reminder/index.ts
  ─────────────────────────────────────────────────────────────────────────────
  Scheduled by pg_cron to run at three times each day (WAT / UTC+1):

    06:00 WAT  →  Morning reminder   (gentle wake-up)
    13:00 WAT  →  Afternoon reminder (midday nudge)
    20:00 WAT  →  Evening reminder   (last chance tonight)

  Logic per run:
  1. Find every student who has an active hifdh assignment for today
     (respects days_off / weekend_off so students don't get pinged on rest days)
  2. Check whether they already completed today's session (hifdh_daily_logs)
  3. Skip anyone who already submitted a completed=true log for today
  4. Deduplicate — skip anyone already sent a reminder of this "slot" today
  5. Insert ONE notification row per student. That's it.

  CHANGE: this used to also call its own sendWebPush()/sendTelegram() right
  after the insert — but the notifications table already has an AFTER INSERT
  trigger (trg_dispatch_notification_on_insert) that calls dispatch-notification
  for every new row, which does its own web push + Telegram + FCM fan-out.
  Calling both meant every Hifdh reminder was being sent twice per channel.
  This function's only job now is to decide *who* gets reminded and *why*,
  and insert the row — dispatch-notification (the single shared sender) does
  the rest, including checking notification_preferences and logging delivery
  results to notification_deliveries.

  Dedup also moved from `type = 'hifdh_reminder_<slot>'` (which was never a
  valid value in the notifications.type CHECK constraint, so past reminder
  rows likely failed to insert at all) to the dedicated `dedup_key` column.

  The motivational messages rotate across 9 Hadith / Quran-based quotes so
  students receive fresh encouragement each time rather than the same text.

  Required Supabase secrets (same as existing functions):
    SUPABASE_URL              — auto-provided
    SUPABASE_SERVICE_ROLE_KEY — auto-provided
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── WAT (UTC+1) helpers ───────────────────────────────────────────────────────

const WAT_OFFSET_MS = 60 * 60 * 1000;

function nowWAT() {
  const d = new Date(Date.now() + WAT_OFFSET_MS);
  return {
    hour:    d.getUTCHours(),
    dayOfWeek: d.getUTCDay(),          // 0=Sun … 6=Sat
    dateStr: d.toISOString().split("T")[0], // "YYYY-MM-DD"
  };
}

// ── Which "slot" are we in? ───────────────────────────────────────────────────
// pg_cron fires at 05:00, 12:00, 19:00 UTC  →  06:00, 13:00, 20:00 WAT
// We accept a ±30-minute window so a slightly delayed invocation still works.

type ReminderSlot = "morning" | "afternoon" | "evening";

function currentSlot(hourWAT: number): ReminderSlot | null {
  if (hourWAT >= 5  && hourWAT < 8)  return "morning";
  if (hourWAT >= 12 && hourWAT < 15) return "afternoon";
  if (hourWAT >= 19 && hourWAT < 22) return "evening";
  return null; // outside expected windows — do nothing
}

// ── Motivational messages (9 rotating, referenced by index) ──────────────────

const MOTIVATIONS: Record<ReminderSlot, string[]> = {
  morning: [
    "The Prophet ﷺ said: \"The best among you are those who learn the Qur'an and teach it.\" (Bukhari) Start your day with His words. 🌅",
    "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ — Begin this blessed morning by revising your pages. Every word is a light. ✨",
    "The Hafidh will be adorned with a crown of honour on the Day of Judgement. Your morning revision is a step closer to that crown. 👑",
  ],
  afternoon: [
    "The Qur'an will intercede for its companion on the Day of Judgement. Don't let the afternoon pass without your Hifdh revision! 📖",
    "اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي شَفِيعًا — Your pages are waiting. A few minutes of revision now earns rewards that last forever. ⏳",
    "Halfway through the day — still time to complete your Hifdh revision and earn your full reward for today! Keep going. 💪",
  ],
  evening: [
    "The night is the best time for the Qur'an. Don't let today end without completing your revision — your teacher is waiting to see your progress! 🌙",
    "مَنْ قَرَأَ حَرْفًا مِنْ كِتَابِ اللَّهِ فَلَهُ بِهِ حَسَنَةٌ — Every letter is ten rewards. Complete your revision before midnight! 🌟",
    "Last chance for today's Hifdh revision! Submit your session now and wake up tomorrow with a full day's reward in your account. ✅",
  ],
};

function pickMotivation(slot: ReminderSlot, studentId: string): string {
  // Rotate message by day-of-month so each day feels different
  const day = new Date().getUTCDate();
  const messages = MOTIVATIONS[slot];
  // XOR the day with first byte of the student UUID for per-student variety
  const idx = (day + (studentId.charCodeAt(0) ?? 0)) % messages.length;
  return messages[idx];
}

// ── Titles per slot ───────────────────────────────────────────────────────────

const SLOT_TITLES: Record<ReminderSlot, string> = {
  morning:   "📖 Good morning! Time for your Hifdh revision",
  afternoon: "📖 Hifdh reminder — have you revised today?",
  evening:   "🌙 Don't miss today's Hifdh revision!",
};

// ── Web Push and Telegram sending removed ────────────────────────────────────
// dispatch-notification (triggered automatically on every notifications
// INSERT) now owns all outbound sending for this function's notifications.

// ── days_off helper (mirrors client-side logic) ───────────────────────────────

function getDaysOff(assignment: any): number[] {
  if (Array.isArray(assignment.days_off) && assignment.days_off.length >= 0)
    return assignment.days_off;
  if (assignment.weekend_off === true)  return [0]; // Sunday off
  if (assignment.weekend_off === false) return [];
  return [];
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { hour, dayOfWeek, dateStr } = nowWAT();
  const slot = currentSlot(hour);

  // Allow ?force=morning|afternoon|evening for manual testing
  const url  = new URL(req.url);
  const forceSlot = url.searchParams.get("force") as ReminderSlot | null;
  const activeSlot: ReminderSlot | null = forceSlot ?? slot;

  if (!activeSlot) {
    return new Response(JSON.stringify({ ok: true, skipped: "outside reminder windows", hour }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stats = { checked: 0, sent: 0, dedup: 0, already_done: 0, no_assignment: 0, errors: 0 };

  try {
    // ── 1. All students with active hifdh assignments ─────────────────────────
    // We join both table names that exist: hifdh_daily_assignments (FK target)
    // and hifdh_assignments (the one used in the app source).
    // Use a broad select and handle gracefully if one doesn't exist.
    const { data: assignments, error: assignErr } = await supabase
      .from("hifdh_daily_assignments")
      .select("id, student_id, days_off, weekend_off, mode, selected_items, daily_pages, program_start, starts_on")
      .eq("active", true);

    if (assignErr) {
      // Fallback: try hifdh_assignments (alternate table name)
      console.warn("[hifdh-reminder] hifdh_daily_assignments error, trying hifdh_assignments:", assignErr.message);
    }

    // Also try alternate table
    const { data: altAssignments } = await supabase
      .from("hifdh_assignments")
      .select("id, student_id, days_off, weekend_off, mode, selected, daily_pages")
      .eq("active", true);

    // Merge both sources, normalising the "selected_items" field name
    const allAssignments: any[] = [
      ...(assignments ?? []),
      ...(altAssignments ?? []).map((a: any) => ({ ...a, selected_items: a.selected })),
    ];

    if (allAssignments.length === 0) {
      return new Response(JSON.stringify({ ok: true, stats, note: "no active assignments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Who already completed today? ──────────────────────────────────────
    const { data: completedLogs } = await supabase
      .from("hifdh_daily_logs")
      .select("student_id")
      .eq("log_date", dateStr)
      .eq("completed", true);

    const completedToday = new Set((completedLogs ?? []).map((l: any) => l.student_id));

    // ── 3. Who already got a reminder this slot today? (dedup) ───────────────
    // CHANGE: previously deduped on `type = 'hifdh_reminder_<slot>'`, but that
    // value was never in the notifications.type CHECK constraint, so this
    // query likely never matched anything real. Now uses the dedup_key column.
    const { data: alreadySent } = await supabase
      .from("notifications")
      .select("user_id")
      .like("dedup_key", `hifdh-reminder:%:${activeSlot}:${dateStr}`)
      .gte("created_at", `${dateStr}T00:00:00+01:00`);

    const alreadyReminded = new Set((alreadySent ?? []).map((n: any) => n.user_id));

    // ── 4. Process each assignment ────────────────────────────────────────────
    for (const assignment of allAssignments) {
      stats.checked++;
      const studentId = assignment.student_id;

      // Skip if today is a rest day for this student
      const daysOff = getDaysOff(assignment);
      if (daysOff.includes(dayOfWeek)) {
        stats.no_assignment++;
        continue;
      }

      // Skip if already done today
      if (completedToday.has(studentId)) {
        stats.already_done++;
        continue;
      }

      // Skip if already reminded this slot
      if (alreadyReminded.has(studentId)) {
        stats.dedup++;
        continue;
      }

      const title    = SLOT_TITLES[activeSlot];
      const body     = pickMotivation(activeSlot, studentId);
      const link     = "/student/hifdh-daily";

      try {
        // Insert once — the AFTER INSERT trigger on notifications calls
        // dispatch-notification automatically, which sends web push + FCM +
        // Telegram and checks the student's notification_preferences
        // (mute/quiet-hours) before doing so. This function's job ends here.
        const { error: insertErr } = await supabase.from("notifications").insert({
          user_id:    studentId,
          title,
          message:    body,
          type:       "hifdh_reminder",
          dedup_key:  `hifdh-reminder:${studentId}:${activeSlot}:${dateStr}`,
          link,
          is_read:    false,
          created_at: new Date().toISOString(),
        });

        if (insertErr) {
          // Unique violation on dedup_key = another concurrent run already
          // reminded this student for this slot today — not a real error.
          if (insertErr.code === "23505") {
            stats.dedup++;
          } else {
            console.error(`[hifdh-reminder] insert failed for ${studentId}:`, insertErr.message);
            stats.errors++;
          }
          continue;
        }

        stats.sent++;
      } catch (err: any) {
        console.error(`[hifdh-reminder] error for student ${studentId}:`, err.message);
        stats.errors++;
      }
    }

    console.log(`[hifdh-reminder] slot=${activeSlot} date=${dateStr}`, stats);

    return new Response(JSON.stringify({ ok: true, slot: activeSlot, date: dateStr, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[hifdh-reminder] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
