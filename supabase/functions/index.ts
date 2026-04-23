/*
  supabase/functions/cron-class-reminders/index.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Called every minute by pg_cron (see PUSH_NOTIFICATIONS_SETUP.sql).
  Sends Web Push notifications to ALL subscribed students and teachers
  whose classes start in ~15 or ~5 minutes.

  This runs ENTIRELY SERVER-SIDE — no browser needs to be open.

  Required Supabase secrets (Dashboard → Settings → Edge Functions → Secrets):
    VAPID_PRIVATE_KEY     — VAPID private key (base64url)
    VAPID_PUBLIC_KEY      — VAPID public key  (base64url)
    VAPID_SUBJECT         — e.g. mailto:admin@tahleemacademy.com
    ACADEMY_TIMEZONE      — e.g. Africa/Lagos  (default: Africa/Lagos)
    SUPABASE_URL          — auto-provided by Supabase
    SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────
const THRESHOLDS = [15, 5] as const;

// ── CORS (needed even for cron-triggered calls) ──────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Web Push ─────────────────────────────────────────────────────────────────
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: {
    title:        string;
    message:      string;
    url:          string;
    tag:          string;
    minutes_left: number;
  }
): Promise<"sent" | "expired" | string> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    return "skipped:no_vapid_keys";
  }

  try {
    const webpush = await import("https://esm.sh/web-push@3.6.7");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 20 } // keep in FCM/APNs queue for up to 20 min if device is offline
    );
    return "sent";
  } catch (err: any) {
    // HTTP 410 = subscription expired (user unsubscribed / reinstalled browser)
    if (err?.statusCode === 410 || String(err?.message).includes("410")) {
      return "expired";
    }
    return `failed:${err?.message ?? err}`;
  }
}

// ── Time helpers ─────────────────────────────────────────────────────────────
function getNowInTimezone(tz: string): { dayOfWeek: number; minutesFromMidnight: number } {
  // Use Intl to convert UTC now → academy local time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday:  "short",
    hour:     "numeric",
    minute:   "numeric",
    hour12:   false,
  });

  const parts = formatter.formatToParts(new Date());
  const dayStr  = parts.find(p => p.type === "weekday")?.value ?? "Sun";
  const hour    = parseInt(parts.find(p => p.type === "hour")?.value   ?? "0", 10);
  const minute  = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    dayOfWeek:           dayMap[dayStr] ?? new Date().getDay(),
    minutesFromMidnight: hour * 60 + minute,
  };
}

function slotMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function to12hr(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Dedup check via notifications table ──────────────────────────────────────
async function alreadySent(
  supabase:  ReturnType<typeof createClient>,
  userId:    string,
  slotId:    string,
  threshold: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tag = `${slotId}:${threshold}`;

  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "class_reminder")
    .ilike("link", `%${tag}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// ── Record sent notification (for dedup + in-app bell) ───────────────────────
async function recordNotification(
  supabase:   ReturnType<typeof createClient>,
  userId:     string,
  title:      string,
  message:    string,
  link:       string
): Promise<void> {
  await supabase.from("notifications").insert({
    user_id: userId,
    title,
    message,
    type:    "class_reminder",
    link,
    is_read: false,
  }).then(); // best-effort — ignore RLS errors
}

// ── Remove expired push subscription ─────────────────────────────────────────
async function removeExpiredSubscription(
  supabase: ReturnType<typeof createClient>,
  userId:   string
): Promise<void> {
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId);
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ACADEMY_TIMEZONE  = Deno.env.get("ACADEMY_TIMEZONE") ?? "Africa/Lagos";

  // Service role bypasses all RLS — required for cross-user queries
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const results: Record<string, any> = {
    timezone: ACADEMY_TIMEZONE,
    slots_checked: 0,
    notifications_sent: 0,
    errors: [],
  };

  try {
    // ── 1. Get current academy local time ─────────────────────────────────
    const { dayOfWeek, minutesFromMidnight } = getNowInTimezone(ACADEMY_TIMEZONE);
    results.local_day = dayOfWeek;
    results.local_minutes = minutesFromMidnight;

    // ── 2. Fetch all active slots for today ───────────────────────────────
    const { data: slots, error: slotsErr } = await supabase
      .from("subject_timetable")
      .select(`
        id, subject_id, start_time, end_time, levels, live_url,
        subjects(title, title_ar, teacher_id)
      `)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true);

    if (slotsErr) {
      return new Response(
        JSON.stringify({ error: slotsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    results.slots_checked = slots?.length ?? 0;
    if (!slots || slots.length === 0) {
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Fetch ALL push subscriptions in one query (efficient) ──────────
    const { data: allSubs } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth");

    const subByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }>();
    for (const sub of (allSubs ?? [])) {
      subByUser.set(sub.user_id, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    }

    if (subByUser.size === 0) {
      results.note = "No push subscriptions in DB";
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Fetch all student profiles (for level matching) ─────────────────
    const studentUserIds = [...subByUser.keys()];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, level, course_level")
      .in("user_id", studentUserIds);

    const levelByUser = new Map<string, string>();
    for (const p of (profiles ?? [])) {
      levelByUser.set(p.user_id, p.level ?? p.course_level ?? "beginner");
    }

    // ── 5. Fetch user roles to separate students from teachers ────────────
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", studentUserIds);

    const roleByUser = new Map<string, string>();
    for (const r of (userRoles ?? [])) {
      roleByUser.set(r.user_id, r.role);
    }

    // ── 6. For each slot, check threshold windows & notify ────────────────
    for (const slot of (slots as any[])) {
      const slotMins = slotMinutes(slot.start_time);
      const diff     = slotMins - minutesFromMidnight;

      // Determine which threshold this minute falls into (1-min tolerance window)
      let matchedThreshold: 5 | 15 | null = null;
      if (diff >= 4  && diff <= 6)  matchedThreshold = 5;
      if (diff >= 14 && diff <= 16) matchedThreshold = 15;
      if (!matchedThreshold) continue;

      const threshold     = matchedThreshold;
      const slotLevels    = (slot.levels as string[]) ?? [];
      const teacherId     = slot.subjects?.teacher_id as string | undefined;
      const subjectTitle  = slot.subjects?.title_ar ?? slot.subjects?.title ?? "class";
      const time12        = to12hr(slot.start_time);
      const joinUrl       = slot.live_url ?? "/student/timetable";
      const dedupTag      = `${slot.id}:${threshold}`;

      const title   = threshold === 5
        ? `📚 Class starts in 5 min — join now!`
        : `📚 Class starting in ${threshold} min`;
      const message = `${subjectTitle} starts at ${time12}. ${threshold === 5 ? "Tap to join!" : "Get ready!"}`;

      // ── For every subscribed user, check if they should receive this ────
      for (const [userId, sub] of subByUser.entries()) {
        const role = roleByUser.get(userId) ?? "student";

        // Admins don't receive class reminders
        if (role === "admin") continue;

        let shouldNotify = false;

        if (role === "teacher") {
          // Teacher: only notify if this is their slot
          shouldNotify = teacherId === userId;
        } else {
          // Student: notify if their level matches the slot
          const userLevel = levelByUser.get(userId) ?? "beginner";
          shouldNotify =
            slotLevels.length === 0 ||
            slotLevels.includes(userLevel) ||
            slotLevels.includes("all");
        }

        if (!shouldNotify) continue;

        // Dedup: skip if already sent today for this slot+threshold
        const sent = await alreadySent(supabase, userId, slot.id, threshold);
        if (sent) continue;

        // Send Web Push
        const link = `${joinUrl}?slot=${dedupTag}`;
        const pushResult = await sendWebPush(sub, {
          title,
          message,
          url:          link,
          tag:          dedupTag,
          minutes_left: threshold,
        });

        if (pushResult === "expired") {
          // Clean up stale subscription
          await removeExpiredSubscription(supabase, userId);
          results.errors.push(`Removed expired subscription for user ${userId.slice(0, 8)}`);
          continue;
        }

        // Record in DB (dedup + in-app bell)
        await recordNotification(supabase, userId, title, message, link);
        results.notifications_sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[cron-class-reminders]", err);
    return new Response(
      JSON.stringify({ error: err.message, results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
