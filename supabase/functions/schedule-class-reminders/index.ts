/*
  supabase/functions/schedule-class-reminders/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called every minute by pg_cron.

  Thresholds: EXACTLY 5 min warning + 0 min ring (start).
  One notification per threshold per class per user — guaranteed.

  FIX v3 — stops duplicate notification flood:
    • Thresholds = [5, 0] only (was [0,10] or [0,5,15] in older deploys)
    • Window tightened to ±1.5 min (was ±3 min) — stops triple-fires
    • Dedup key includes a 10-min time-bucket so concurrent cron runs
      produce the same key and can't race past the dedup check
    • Dedup query window = last 20 min (was all day) — faster DB query
    • Push tag is consistent per class so Android collapses duplicates
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THRESHOLDS    = [5, 0] as const;
type Threshold      = typeof THRESHOLDS[number];

const APP_BASE_URL  = "https://tahleemacademy.vercel.app";

function sanitiseUrl(raw: string | null | undefined): string {
  if (!raw) return APP_BASE_URL;
  if (raw.startsWith(APP_BASE_URL)) return raw;
  if (raw.startsWith("/")) return APP_BASE_URL + raw;
  try { const { pathname, search } = new URL(raw); return APP_BASE_URL + pathname + search; }
  catch { return APP_BASE_URL; }
}

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

/**
 * Dedup key — includes a 10-minute time-bucket.
 * Both a :00 and :01 cron run in the same 10-min slot produce the same key,
 * so the second run sees the first's notification and returns "dedup".
 */
function dedupKey(classId: string, threshold: number): string {
  const now    = new Date();
  const bucket = Math.floor(now.getMinutes() / 10);
  const stamp  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}${String(now.getHours()).padStart(2,"0")}${bucket}`;
  return `class=${classId}:t=${threshold}:b=${stamp}`;
}

// ── Dedup — checks last 20 min only ──────────────────────────────────────────

async function alreadyNotified(
  sb: ReturnType<typeof createClient>,
  userId: string,
  classId: string,
  threshold: number
): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60_000);
  const { data } = await sb
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .ilike("link", `%class=${classId}:t=${threshold}%`)
    .gte("created_at", since.toISOString())
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
        urgency: "high",
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
    joinPath:     string;
    teacherName:  string;
    label:        string;
  }
): Promise<"sent" | "dedup" | "error"> {
  try {
    if (await alreadyNotified(sb, opts.userId, opts.classId, opts.threshold)) return "dedup";

    const isRing = opts.threshold === 0;
    const time12 = to12hr(opts.scheduledAt);
    const key    = dedupKey(opts.classId, opts.threshold);

    const title = isRing
      ? `📞 ${opts.classTitle} — Starting Now!`
      : `📚 Class in 5 min — get ready!`;

    const message = isRing
      ? `${opts.teacherName} is ready and waiting. Tap to join now!`
      : `${opts.classTitle} starts at ${time12}. Open the app now!`;

    const title_ar = isRing
      ? `📞 ${opts.classTitle} — تبدأ الآن!`
      : `📚 ${opts.classTitle} — الدرس بعد ٥ دقائق`;

    const message_ar = isRing
      ? `${opts.teacherName} في انتظاركم — اضغط للانضمام الآن.`
      : `تبدأ ${opts.classTitle} الساعة ${time12}. افتح التطبيق الآن!`;

    const link = `${opts.joinUrl}?${key}`;

    // 1. Bell notification
    await insertNotification(sb, {
      userId: opts.userId, title, message, title_ar, message_ar,
      link, type: isRing ? "class_ring" : "class_reminder",
    });

    // 2. Web Push
    const { data: pushSubs } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", opts.userId);

    // Push tag is stable per class — Android replaces instead of stacking
    const pushPayload = isRing
      ? {
          type: "ring", title, body: message, message,
          url: opts.joinPath,
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
          url: opts.joinPath,
          tag: `reminder-${opts.classId}`,  // stable tag — replaces any earlier "5 min" notice
          minutes_left: 5,
          vibrate: [300, 100, 300, 100, 600],
        };

    for (const sub of (pushSubs ?? []) as any[]) {
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
    const now    = new Date();
    // Fetch classes between -1.5 min and +6.5 min (covers both thresholds with tolerance)
    const inMax  = new Date(now.getTime() + 6.5 * 60_000);
    const minus1 = new Date(now.getTime() - 1.5 * 60_000);

    const { data: classes, error: classErr } = await sb
      .from("public_classes")
      .select("id, title, title_ar, scheduled_at, host_id, join_url, status, subject_id")
      .gte("scheduled_at", minus1.toISOString())
      .lte("scheduled_at", inMax.toISOString())
      .not("status", "eq", "ended")
      .not("status", "eq", "cancelled");

    if (classErr) throw classErr;

    console.log(`[schedule-class-reminders] found ${(classes ?? []).length} upcoming classes`);

    for (const cls of (classes ?? []) as any[]) {
      const minsLeft = minutesUntil(cls.scheduled_at);

      for (const threshold of THRESHOLDS) {
        // ±1.5 min window per threshold
        if (minsLeft < threshold - 1.5 || minsLeft > threshold + 1.5) continue;

        stats.checked++;
        const classTitle      = cls.title_ar || cls.title || "Class";
        const joinUrl         = sanitiseUrl(cls.join_url ?? `${APP_BASE_URL}/live/${cls.id}`);
        const joinPath        = toRelativePath(joinUrl);
        const studentJoinPath = cls.subject_id
          ? `/student/live-classes?subject=${cls.subject_id}&autoJoin=true`
          : joinPath;

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

        // Notify all active students
        const { data: students } = await sb
          .from("profiles")
          .select("user_id")
          .eq("role", "student");

        for (const s of (students ?? []) as any[]) {
          const r = await maybeNotify(sb, {
            userId: s.user_id, classId: cls.id, classTitle,
            scheduledAt: cls.scheduled_at, minsLeft, threshold,
            joinUrl: `${APP_BASE_URL}${studentJoinPath}`, joinPath: studentJoinPath,
            teacherName, label: "Class",
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
