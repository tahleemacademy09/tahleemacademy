/*
  supabase/functions/daily-content-push/index.ts
  ════════════════════════════════════════════════════════════════════════
  Called once daily by pg_cron (recommended: 6:00 AM WAT = 5:00 AM UTC).

  Sends phone push notifications + Telegram messages for:
    • Daily Quranic verse
    • Daily Hadith reminder
    • Daily Seerah highlight
    • Hifdh (memorisation) daily reminder
    • General Islamic reminder / motivational message

  Each type is sent as a separate notification so students get them
  as individual cards in their phone notification bar.

  FIX (Bug 3): Changed .maybeSingle() to fetch ALL push subscriptions
  per user so every device the user has subscribed from gets the push.

  pg_cron setup (run in Supabase SQL editor):
    select cron.schedule(
      'daily-content-push',
      '0 5 * * *',   -- 5:00 AM UTC = 6:00 AM WAT every day
      $$
        select net.http_post(
          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-content-push',
          headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        )
      $$
    );
  ════════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL     = "https://tahleemacademy.vercel.app";
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram/sendMessage";

// ── Daily content pool ────────────────────────────────────────────────────────
// These rotate by day-of-year so each day gets different content.

const QURAN_VERSES = [
  { ar: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", en: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
  { ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", en: "Whoever relies upon Allah — then He is sufficient for him.", ref: "Quran 65:3" },
  { ar: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", en: "For indeed, with hardship will be ease.", ref: "Quran 94:5" },
  { ar: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ", en: "Do not weaken or grieve, for you will be superior if you are true believers.", ref: "Quran 3:139" },
  { ar: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً", en: "Our Lord, give us good in this world and good in the Hereafter.", ref: "Quran 2:201" },
  { ar: "وَاذْكُر رَّبَّكَ كَثِيرًا", en: "And remember your Lord much.", ref: "Quran 3:41" },
  { ar: "إِنَّمَا يَخْشَى اللَّهَ مِنْ عِبَادِهِ الْعُلَمَاءُ", en: "Only those fear Allah, from among His servants, who have knowledge.", ref: "Quran 35:28" },
];

const HADITHS = [
  { en: "Seek knowledge from the cradle to the grave.", source: "Prophet Muhammad ﷺ" },
  { en: "The best of you are those who learn the Quran and teach it.", source: "Bukhari 5027" },
  { en: "Make things easy, do not make them difficult. Bring glad tidings; do not drive people away.", source: "Bukhari 69" },
  { en: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Bukhari 13" },
  { en: "Whoever follows a path in pursuit of knowledge, Allah will make his path to Paradise easy.", source: "Muslim 2699" },
  { en: "The strong person is not the one who can overpower others. Rather, the strong person is the one who controls himself when he is angry.", source: "Bukhari 6114" },
  { en: "Feed the hungry, visit the sick, and free the captive.", source: "Bukhari 5373" },
];

const SEERAH_HIGHLIGHTS = [
  { title: "The Hijrah — Leaving for Allah", body: "The Prophet ﷺ left everything he loved in Makkah for the sake of Allah. When you sacrifice for Allah, He gives you better than what you left behind." },
  { title: "Battle of Badr — 313 vs 1000", body: "313 poorly-armed Muslims stood against 1000 warriors. Victory came not from numbers but from Tawakkul. Whatever your odds today — trust Allah." },
  { title: "The Conquest of Makkah — Mercy in Victory", body: "When the Prophet ﷺ returned victorious to Makkah, he said: 'Go — you are free.' His power was matched only by his mercy. Victory and forgiveness go together." },
  { title: "Khadijah RA — The First Believer", body: "When revelation came, the Prophet ﷺ was afraid. Khadijah RA said: 'Allah will never disgrace you.' Sometimes the people closest to us see our worth before we do." },
  { title: "The Year of Sorrow — Resilience", body: "The Prophet ﷺ lost his wife and uncle in one year, yet he continued. Grief is not weakness — it is human. What defines us is continuing despite it." },
  { title: "Companions of Suffah — Students of the Prophet", body: "The Ahlus-Suffah were poor companions who lived in the mosque, dedicating themselves entirely to learning. They had no dunya — but they had the Prophet ﷺ as their teacher." },
  { title: "Treaty of Hudaybiyyah — The Hidden Victory", body: "The companions were upset by the treaty terms, but Allah called it a clear victory. Sometimes what looks like a setback is exactly what Allah planned for your success." },
];

const HIFDH_REMINDERS = [
  "📖 Today's Hifdh reminder: Don't let the day pass without reciting your assigned pages. 'The one who recites the Quran beautifully, smoothly will be with the noble honourable scribes.' (Bukhari)",
  "📖 Hifdh tip for today: Review your last 3 pages before learning anything new. Revision is the foundation of strong memorisation.",
  "📖 Daily Hifdh: Recite your memorised portions in Fajr — the Quran witnessed at dawn is most beloved to Allah. (17:78)",
  "📖 Remember your Hifdh: Even 15 minutes of daily review protects your memorisation. Consistency beats intensity.",
  "📖 Quran reminder: The Prophet ﷺ said the heart in which there is no Quran is like a ruined house. Fill yours today.",
  "📖 Hifdh motivation: Every letter earns 10 hasanat. Your daily recitation is a treasure accumulating for your Akhira.",
  "📖 Tajweed reminder: Beautify your recitation today — Allah loves to hear His words recited with care and focus.",
];

function dayOfYear(): number {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

// ── Web Push ──────────────────────────────────────────────────────────────────

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object
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
    { TTL: 60 * 60 * 12 }  // 12hr TTL — deliver within the day
  );
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  await fetch(TELEGRAM_GATEWAY, {
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
      disable_web_page_preview: true,
    }),
  });
}

// ── Send all push payloads to a single subscription object ───────────────────

async function pushAllPayloads(
  sub: { endpoint: string; p256dh: string; auth: string },
  payloads: object[]
): Promise<void> {
  for (const payload of payloads) {
    await sendWebPush(sub, payload).catch((e: any) => {
      // 410 Gone = subscription expired/unsubscribed — caller handles cleanup
      if (e?.statusCode === 410) throw e;
      // Other errors (network, etc.) — log and continue to next payload
      console.warn("[daily-content-push] sendWebPush error:", e?.message ?? e);
    });
    // Small stagger so notifications arrive as separate cards on the phone
    await new Promise(r => setTimeout(r, 800));
  }
}

// ── Send all daily content to one user ───────────────────────────────────────

async function sendDailyContentToUser(
  sb: ReturnType<typeof createClient>,
  userId: string,
  telegramChatId: string | null,
  doy: number
): Promise<void> {
  const verse  = QURAN_VERSES[doy % QURAN_VERSES.length];
  const hadith = HADITHS[doy % HADITHS.length];
  const seerah = SEERAH_HIGHLIGHTS[doy % SEERAH_HIGHLIGHTS.length];
  const hifdh  = HIFDH_REMINDERS[doy % HIFDH_REMINDERS.length];

  // ── FIX (Bug 3): Fetch ALL subscriptions for this user, not just one.
  //    Previously .maybeSingle() silently dropped every device except the first.
  const { data: pushSubs, error: subsError } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subsError) {
    console.warn(`[daily-content-push] could not fetch push subs for ${userId}:`, subsError.message);
  }

  const activeSubs = (pushSubs ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;

  // Build all push payloads up front
  const payloads = [
    {
      type:    "daily_content",
      title:   "📖 Daily Quranic Verse",
      message: `${verse.en} — ${verse.ref}`,
      body:    `${verse.ar}\n"${verse.en}"\n${verse.ref}`,
      url:     `${APP_BASE_URL}/student/dashboard`,
      tag:     "daily-verse",
      icon:    "/icons/icon-192x192.png",
      badge:   "/icons/icon-96x96.png",
    },
    {
      type:    "daily_content",
      title:   "🌙 Daily Hadith",
      message: `"${hadith.en}" — ${hadith.source}`,
      url:     `${APP_BASE_URL}/student/dashboard`,
      tag:     "daily-hadith",
      icon:    "/icons/icon-192x192.png",
      badge:   "/icons/icon-96x96.png",
    },
    {
      type:    "daily_content",
      title:   "📗 Hifdh Reminder",
      message: hifdh.replace(/^📖\s*/, ""),
      url:     `${APP_BASE_URL}/student/hifdh`,
      tag:     "daily-hifdh",
      icon:    "/icons/icon-192x192.png",
      badge:   "/icons/icon-96x96.png",
      actions: [{ action: "open_hifdh", title: "Open Hifdh" }],
    },
    {
      type:    "daily_content",
      title:   `🕌 Seerah: ${seerah.title}`,
      message: seerah.body.slice(0, 120) + "…",
      url:     `${APP_BASE_URL}/student/dashboard`,
      tag:     "daily-seerah",
      icon:    "/icons/icon-192x192.png",
      badge:   "/icons/icon-96x96.png",
    },
  ];

  // ── Web Push — send to every subscribed device ───────────────────────────
  const expiredSubIds: string[] = [];

  for (const sub of activeSubs) {
    try {
      await pushAllPayloads(sub, payloads);
    } catch (e: any) {
      if (e?.statusCode === 410) {
        // Subscription expired — mark for cleanup
        expiredSubIds.push(sub.id);
      } else {
        console.warn(`[daily-content-push] push failed for sub ${sub.id}:`, e?.message ?? e);
      }
    }
  }

  // Clean up expired subscriptions
  if (expiredSubIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", expiredSubIds).catch(() => {});
    console.log(`[daily-content-push] cleaned up ${expiredSubIds.length} expired sub(s) for ${userId}`);
  }

  // ── In-app notifications (notifications table) ────────────────────────────
  await sb.from("notifications").insert([
    {
      user_id: userId,
      title:   "📖 Daily Quranic Verse",
      message: `${verse.en} — ${verse.ref}`,
      type:    "daily_content",
      is_read: false,
    },
    {
      user_id: userId,
      title:   "🌙 Daily Hadith",
      message: `"${hadith.en}" — ${hadith.source}`,
      type:    "daily_content",
      is_read: false,
    },
    {
      user_id: userId,
      title:   "📗 Daily Hifdh Reminder",
      message: hifdh.replace(/^📖\s*/, ""),
      type:    "daily_content",
      link:    "/student/hifdh",
      is_read: false,
    },
    {
      user_id: userId,
      title:   `🕌 Seerah: ${seerah.title}`,
      message: seerah.body.slice(0, 200),
      type:    "daily_content",
      is_read: false,
    },
  ]).catch(() => {});

  // ── Telegram — single rich morning message ────────────────────────────────
  if (telegramChatId) {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const tgText =
      `🕌 <b>Tahleem Academy — Good Morning!</b>\n` +
      `<i>${today}</i>\n\n` +
      `📖 <b>Quran ${verse.ref}</b>\n` +
      `${verse.ar}\n` +
      `<i>"${verse.en}"</i>\n\n` +
      `🌙 <b>Hadith</b>\n` +
      `<i>"${hadith.en}"</i>\n` +
      `— ${hadith.source}\n\n` +
      `🕌 <b>Seerah: ${seerah.title}</b>\n` +
      `${seerah.body.slice(0, 200)}…\n\n` +
      `📗 <b>Hifdh</b>\n${hifdh}\n\n` +
      `🔗 <a href="${APP_BASE_URL}/student/dashboard">Open Academy</a>`;

    await sendTelegram(String(telegramChatId), tgText).catch(() => {});
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const doy = dayOfYear();
  let sent = 0, errors = 0;

  try {
    // Get all active students with push subscriptions or telegram
    const { data: students, error } = await sb
      .from("profiles")
      .select("user_id, telegram_chat_id, role, student_type")
      .eq("role", "student");

    if (error) throw error;

    for (const student of (students ?? []) as any[]) {
      try {
        await sendDailyContentToUser(sb, student.user_id, student.telegram_chat_id, doy);
        sent++;
      } catch (e: any) {
        console.error(`[daily-content-push] failed for ${student.user_id}:`, e.message);
        errors++;
      }
    }

    console.log(`[daily-content-push] done — sent=${sent} errors=${errors} doy=${doy}`);
    return new Response(JSON.stringify({ ok: true, sent, errors, doy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[daily-content-push] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
