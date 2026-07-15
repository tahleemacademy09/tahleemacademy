/*
  supabase/functions/daily-content-push/index.ts
  ════════════════════════════════════════════════════════════════════════
  Called once daily by pg_cron (recommended: 6:00 AM WAT = 5:00 AM UTC).

  Inserts 4 notification rows per student for:
    • Daily Quranic verse
    • Daily Hadith reminder
    • Daily Seerah highlight
    • Hifdh (memorisation) daily reminder

  CHANGE: this used to ALSO send its own web push (via pushAllPayloads) and
  its own single-message Telegram digest, on top of inserting into
  notifications — which already has an AFTER INSERT trigger that calls
  dispatch-notification per row. Since "daily_content" was never in
  dispatch-notification's CLASS_TYPES exclusion list, every student was
  getting each of these 4 items pushed twice (once from here, once from the
  trigger) and a 5th, differently-formatted Telegram message on top of the
  4 the trigger sends. This function's job now is only to decide *what*
  today's content is and insert it — dispatch-notification (the single
  shared sender) does the rest, respecting notification_preferences.

  Each insert carries a dedup_key so re-running this function on the same
  day (e.g. a retried cron tick) can't double-insert.

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

const APP_BASE_URL = "https://tahleemacademy.vercel.app";

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

// ── Web Push / Telegram sending removed ───────────────────────────────────────
// dispatch-notification (triggered automatically on every notifications
// INSERT) now owns all outbound sending for this function's notifications.

// ── Send all daily content to one user ───────────────────────────────────────

async function sendDailyContentToUser(
  sb: ReturnType<typeof createClient>,
  userId: string,
  doy: number,
  dateStr: string
): Promise<void> {
  const verse  = QURAN_VERSES[doy % QURAN_VERSES.length];
  const hadith = HADITHS[doy % HADITHS.length];
  const seerah = SEERAH_HIGHLIGHTS[doy % SEERAH_HIGHLIGHTS.length];
  const hifdh  = HIFDH_REMINDERS[doy % HIFDH_REMINDERS.length];

  // Each row gets its own dedup_key so a retried/duplicate cron tick on the
  // same day can't insert this student's content twice — the unique index
  // on dedup_key makes the DB itself the source of truth for idempotency.
  const { error } = await sb.from("notifications").insert([
    {
      user_id: userId,
      title:   "📖 Daily Quranic Verse",
      message: `${verse.en} — ${verse.ref}`,
      type:    "daily_content",
      dedup_key: `daily-content:${userId}:verse:${dateStr}`,
      link:    "/student/dashboard",
      is_read: false,
    },
    {
      user_id: userId,
      title:   "🌙 Daily Hadith",
      message: `"${hadith.en}" — ${hadith.source}`,
      type:    "daily_content",
      dedup_key: `daily-content:${userId}:hadith:${dateStr}`,
      link:    "/student/dashboard",
      is_read: false,
    },
    {
      user_id: userId,
      title:   "📗 Daily Hifdh Reminder",
      message: hifdh.replace(/^📖\s*/, ""),
      type:    "daily_content",
      dedup_key: `daily-content:${userId}:hifdh:${dateStr}`,
      link:    "/student/hifdh",
      is_read: false,
    },
    {
      user_id: userId,
      title:   `🕌 Seerah: ${seerah.title}`,
      message: seerah.body.slice(0, 200),
      type:    "daily_content",
      dedup_key: `daily-content:${userId}:seerah:${dateStr}`,
      link:    "/student/dashboard",
      is_read: false,
    },
  ]);

  // Unique violation (23505) means this student's content for today was
  // already inserted — not a real error, just idempotency doing its job.
  if (error && error.code !== "23505") throw error;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const doy = dayOfYear();
  const dateStr = new Date().toISOString().split("T")[0];
  let sent = 0, errors = 0;

  try {
    // Get all active students
    const { data: students, error } = await sb
      .from("profiles")
      .select("user_id, role")
      .eq("role", "student");

    if (error) throw error;

    for (const student of (students ?? []) as any[]) {
      try {
        await sendDailyContentToUser(sb, student.user_id, doy, dateStr);
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
