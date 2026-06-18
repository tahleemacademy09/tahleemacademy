/*
  supabase/functions/schedule-class-reminders/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called every minute by pg_cron.

  FIX: Was querying `subject_timetable` with day_of_week/is_active columns
  that don't exist. Now queries `public_classes` using `scheduled_at`
  which is the actual table your classes are stored in.

  Thresholds:
    0  min → CLASS IS STARTING NOW (ring push — loud, persistent)
    5  min → "Class in 5 min" reminder
    15 min → "Class in 15 min" heads-up
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THRESHOLDS    = [0, 5, 15] as const;
type Threshold      = typeof THRESHOLDS[number];

const APP_BASE_URL     = "https://tahleemacademy.vercel.app";

// Strips any non-production host from a join_url that may have been saved
// when the teacher was on a Lovable preview domain. Runs at send-time so
// old DB records get fixed without needing a migration.
function sanitiseUrl(raw: string | null | undefined): string {
  if (!raw) return APP_BASE_URL;
  if (raw.startsWith(APP_BASE_URL)) return raw;
  if (raw.startsWith("/")) return APP_BASE_URL + raw;
  try { const { pathname, search } = new URL(raw); return APP_BASE_URL + pathname + search; }
  catch { return APP_BASE_URL; }
}

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram/sendMessage";

// ── Time helpers ──────────────────────────────────────────────────────────────

function minutesUntil(scheduledAt: string): number {
  return (new Date(scheduledAt).getTime() - Date.now()) / 60_000;
}

function to12hr(isoString: string): string {
  // Always display in Nigeria/Lagos time (WAT = UTC+1)
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
      { TTL: ttl }
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
    joinUrl:      string;
    teacherName:  string;
    label:        string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    if (await alreadyNotified(sb, opts.userId, opts.classId, opts.threshold)) return "dedup";

    const isRing  = opts.threshold === 0;
    const time12  = to12hr(opts.scheduledAt);
    const key     = dedupKey(opts.classId, opts.threshold);
    const mins    = Math.round(opts.minsLeft);

    const title = isRing
      ? `📞 ${opts.classTitle} — Starting Now!`
      : opts.threshold === 5
        ? `📚 ${opts.label} in 5 min — get ready!`
        : `📚 ${opts.label} in ${mins} min`;

    const message = isRing
      ? `${opts.teacherName} is waiting — tap to join now!`
      : `${opts.classTitle} starts at ${time12}. ${opts.threshold === 5 ? "Open the app now!" : "Get ready!"}`;

    const title_ar = isRing
      ? `📞 ${opts.classTitle} — تبدأ الآن!`
      : opts.threshold === 5
        ? `📚 بعد ٥ دقائق — استعد!`
        : `📚 بعد ${mins} دقيقة`;

    const message_ar = isRing
      ? `${opts.teacherName} في انتظارك — اضغط للانضمام الآن!`
      : `تبدأ ${opts.classTitle} الساعة ${time12}. ${opts.threshold === 5 ? "افتح التطبيق الآن!" : "كن مستعداً!"}`;

    const link = `${opts.joinUrl}?${key}`;

    // 1. Bell
    await insertNotification(sb, {
      userId: opts.userId, title, message, title_ar, message_ar,
      link, type: isRing ? "class_ring" : "class_reminder",
    });

    // 2. Web Push — all devices
    const { data: pushSubs } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId);

    const pushPayload = isRing
      ? {
          type: "ring", title, body: message, message,
          url: opts.joinUrl, tag: `ring-${opts.classId}`,
          requireInteraction: true,
          vibrate: [800, 400, 800, 400, 800, 1500, 800, 400, 800],
          actions: [
            { action: "join",    title: "📹 Join Now" },
            { action: "dismiss", title: "Dismiss"     },
          ],
        }
      : {
          type: "class_reminder", title, body: message, message,
          url: opts.joinUrl, tag: `${opts.classId}:${opts.threshold}`,
          minutes_left: opts.threshold,
          vibrate: [200, 100, 200, 100, 400],
        };

    for (const sub of (pushSubs ?? []) as any[]) {
      try {
        const result = await sendWebPush(sub, pushPayload, isRing ? 600 : 1200);
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
    // ── Fetch upcoming public classes (scheduled in next 20 min, not ended) ──
    const now       = new Date();
    const in20min   = new Date(now.getTime() + 21 * 60_000);
    const minus1min = new Date(now.getTime() - 60_000);

    const { data: classes, error: classErr } = await sb
      .from("public_classes")
      .select("id, title, title_ar, scheduled_at, host_id, join_url, status")
      .gte("scheduled_at", minus1min.toISOString())
      .lte("scheduled_at", in20min.toISOString())
      .not("status", "eq", "ended")
      .not("status", "eq", "cancelled");

    if (classErr) throw classErr;

    console.log(`[schedule-class-reminders] found ${(classes ?? []).length} upcoming classes`);

    for (const cls of (classes ?? []) as any[]) {
      const minsLeft = minutesUntil(cls.scheduled_at);

      for (const threshold of THRESHOLDS) {
        const window = 2.5; // wider window catches cron timing variations
        if (minsLeft < threshold - window || minsLeft > threshold + window) continue;

        stats.checked++;
        const classTitle = cls.title_ar || cls.title || "Class";
        const joinUrl    = sanitiseUrl(cls.join_url ?? `${APP_BASE_URL}/live/${cls.id}`);

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
            teacherName: "You", label: "Your class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }

        // Notify all active students
        const { data: students } = await sb
          .from("profiles")
          .select("user_id")
          .eq("role", "student");

        for (const s of (students ?? []) as any[]) {
          const r = await maybeNotify(sb, {
            userId: s.user_id, classId: cls.id, classTitle,
            scheduledAt: cls.scheduled_at, minsLeft, threshold,
            joinUrl, teacherName, label: "Class",
          });
          stats[r === "sent" ? "sent" : r === "dedup" ? "dedup" : "errors"]++;
        }
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
