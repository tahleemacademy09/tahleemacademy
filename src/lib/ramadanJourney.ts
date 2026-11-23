/*
  ramadanJourney.ts — content + pure logic for the Ramadan "Journey" (a story path of 30 levels, one per day).

  EVERYTHING the student reads (chapter names, daily story lines, tasks) lives in this file so it can be rewritten later without
  touching the screen. The task texts below are a first FRAME — to be replaced once the real daily tasks are agreed.
*/

export const TOTAL_DAYS = 30;
/** Hijri year of the season — also the key progress is saved under. */
export const RAMADAN_YEAR = 1448;
/** First day of fasting (local date). Change here when the moon is sighted / the date is confirmed. */
export const RAMADAN_START = "2027-02-08";

export type TaskCat = "quran" | "salah" | "charity" | "knowledge";
export interface Bi { en: string; ar: string }
export interface JourneyTask { id: string; cat: TaskCat; xp: number; text: Bi }
export interface JourneyDay {
  day: number;
  chapter: 0 | 1 | 2;
  title: Bi;
  story: Bi;
  /** the odd nights of the last ten: Laylatul Qadr is sought in them */
  qadr: boolean;
  tasks: JourneyTask[];
}
export interface Chapter { name: Bi; blurb: Bi; from: number; to: number }

export const CHAPTERS: Chapter[] = [
  { from: 1, to: 10, name: { en: "The Gates of Mercy", ar: "أبواب الرحمة" },
    blurb: { en: "The crescent is sighted and the journey begins. Walk gently — mercy is open to you.", ar: "هلّ الهلال وبدأت الرحلة. سِر بهدوء، فالرحمة مفتوحة لك." } },
  { from: 11, to: 20, name: { en: "The Valley of Forgiveness", ar: "وادي المغفرة" },
    blurb: { en: "The road gets steeper. Lay down what weighs on you — and be forgiven.", ar: "يشتدّ الطريق. ضَع ما أثقل كاهلك، وكُن من المغفور لهم." } },
  { from: 21, to: 30, name: { en: "The Road to Freedom", ar: "طريق العتق من النار" },
    blurb: { en: "The last ten nights. Lanterns are lit — one of these nights is better than a thousand months.", ar: "العشر الأواخر. أُضيئت الفوانيس، وفي إحداها ليلة خير من ألف شهر." } },
];

/* ── daily story lines (title + one line that continues the journey) ── */
const STORY: Bi[][] = [
  [{ en: "The crescent appears", ar: "ظهر الهلال" }, { en: "You step out under the new moon, your lantern lit.", ar: "تخرج تحت القمر الجديد وفانوسك مُضاء." }],
  [{ en: "The first campfire", ar: "نار الليل الأولى" }, { en: "Travellers gather. You share your dates and your du'a.", ar: "يجتمع المسافرون، فتشاركهم تمرك ودعاءك." }],
  [{ en: "The quiet path", ar: "الطريق الهادئ" }, { en: "The noise falls away; only your steps and your dhikr remain.", ar: "يخبو الضجيج، ولا يبقى إلا خطاك وذكرك." }],
  [{ en: "The well", ar: "البئر" }, { en: "You draw water for someone else before yourself.", ar: "تسقي غيرك قبل نفسك." }],
  [{ en: "The oasis", ar: "الواحة" }, { en: "Shade, dates, and a heart at rest.", ar: "ظلّ وتمر وقلب مطمئن." }],
  [{ en: "The old bridge", ar: "الجسر القديم" }, { en: "Patience carries you across.", ar: "الصبر يعبر بك." }],
  [{ en: "The market of kindness", ar: "سوق الخير" }, { en: "Every small good deed is worth more than it looks.", ar: "كل خير صغير أثقل مما يبدو." }],
  [{ en: "The lantern keeper", ar: "حارس الفوانيس" }, { en: "He hands you a light: 'Keep it burning.'", ar: "يناولك نورًا: «أبقِه مشتعلًا»." }],
  [{ en: "The hill of dawn", ar: "تلّة الفجر" }, { en: "You reach the top just as Fajr breaks.", ar: "تبلغ القمة مع انبلاج الفجر." }],
  [{ en: "The gate of mercy", ar: "باب الرحمة" }, { en: "The first third is behind you. The gate swings open.", ar: "انقضى الثلث الأول، وانفتح الباب." }],

  [{ en: "Into the valley", ar: "إلى الوادي" }, { en: "The air is heavier here. You whisper istighfar.", ar: "الهواء أثقل هنا، فتهمس بالاستغفار." }],
  [{ en: "The stone you carried", ar: "الحجر الذي حملته" }, { en: "You set down an old grudge. Your steps lighten.", ar: "تضع ضغينة قديمة فتخفّ خطاك." }],
  [{ en: "The river of tears", ar: "نهر الدموع" }, { en: "Du'a in the dark — and the river carries your sins away.", ar: "دعاء في العتمة، والنهر يحمل ذنوبك." }],
  [{ en: "The shepherd's tent", ar: "خيمة الراعي" }, { en: "Hospitality: you feed a stranger and are fed in return.", ar: "تُطعم غريبًا فتُطعَم." }],
  [{ en: "The mid-month moon", ar: "قمر المنتصف" }, { en: "Half the road is behind you. Look how far you've come.", ar: "نصف الطريق خلفك، فانظر كم قطعت." }],
  [{ en: "The windy pass", ar: "الممرّ العاصف" }, { en: "Strong gusts test you. You hold on to the rope of Allah.", ar: "تشتد الريح، فتعتصم بحبل الله." }],
  [{ en: "The healer's garden", ar: "حديقة الشافي" }, { en: "Hearts mend here. You make du'a for the sick.", ar: "تلتئم القلوب هنا، فتدعو للمرضى." }],
  [{ en: "The echoing cave", ar: "الكهف الصدّاح" }, { en: "Your recitation fills the cave — and your chest.", ar: "تملأ تلاوتك الكهف وصدرك." }],
  [{ en: "The mountain spring", ar: "نبع الجبل" }, { en: "Clear water, clear heart.", ar: "ماء صافٍ وقلب صافٍ." }],
  [{ en: "The valley's end", ar: "نهاية الوادي" }, { en: "Forgiven and lighter, you see the last ten nights ahead.", ar: "مغفورًا وأخفّ حملًا، ترى العشر الأواخر أمامك." }],

  [{ en: "The ten lanterns", ar: "الفوانيس العشرة" }, { en: "Ten lanterns line the road. You tighten your belt.", ar: "عشرة فوانيس على الطريق، فتشدّ المئزر." }],
  [{ en: "The night search begins", ar: "بدأ البحث عن الليلة" }, { en: "You stay up in worship, searching for the blessed night.", ar: "تقوم الليل باحثًا عن الليلة المباركة." }],
  [{ en: "A night of peace", ar: "ليلة سلام" }, { en: "Is it tonight? The angels descend with peace until dawn.", ar: "أهي الليلة؟ تنزل الملائكة بالسلام حتى الفجر." }],
  [{ en: "The tower of silence", ar: "برج السكون" }, { en: "Only the stars and your whispered du'a.", ar: "لا شيء إلا النجوم ودعاؤك الهامس." }],
  [{ en: "The night of power?", ar: "ليلة القدر؟" }, { en: "Better than a thousand months. You ask for 'afw — pardon.", ar: "خير من ألف شهر. تسأل العفو." }],
  [{ en: "The caravan's farewell", ar: "وداع القافلة" }, { en: "Companions begin to say goodbye to the month.", ar: "يبدأ الرفاق بوداع الشهر." }],
  [{ en: "The brightest night", ar: "الليلة الأسطع" }, { en: "The sky glows. You cry, you ask, you hope.", ar: "تتوهج السماء، فتبكي وتسأل وترجو." }],
  [{ en: "The last stretch", ar: "الشوط الأخير" }, { en: "Tired legs, strong heart. The finish is near.", ar: "ساقان متعبتان وقلب قويّ. النهاية قريبة." }],
  [{ en: "The final night", ar: "الليلة الأخيرة" }, { en: "Seal the month with du'a, zakat al-fitr and tears.", ar: "اختم الشهر بالدعاء وزكاة الفطر والدموع." }],
  [{ en: "The gate of Eid", ar: "باب العيد" }, { en: "You made it. The gate glows ahead.", ar: "وصلت. والباب يتوهج أمامك." }],
];

/* ── rotating task pools (placeholders — final tasks to be agreed) ── */
const SALAH: Bi[] = [
  { en: "Pray all five prayers on time", ar: "صلِّ الصلوات الخمس في وقتها" },
  { en: "Pray Taraweeh tonight", ar: "صلِّ التراويح الليلة" },
  { en: "Read the morning & evening adhkar", ar: "اقرأ أذكار الصباح والمساء" },
  { en: "Say «سبحان الله وبحمده» 100 times", ar: "قل «سبحان الله وبحمده» مئة مرة" },
  { en: "Make istighfar 100 times", ar: "استغفر الله مئة مرة" },
  { en: "Pray two rak'ahs of Duha", ar: "صلِّ ركعتي الضحى" },
  { en: "Send salawat on the Prophet ﷺ 100 times", ar: "صلِّ على النبي ﷺ مئة مرة" },
  { en: "Make a heartfelt du'a before iftar", ar: "ادعُ بقلب حاضر قبل الإفطار" },
  { en: "Pray a few rak'ahs of Qiyam", ar: "صلِّ ما تيسّر من قيام الليل" },
  { en: "Recite Ayat al-Kursi after every prayer", ar: "اقرأ آية الكرسي بعد كل صلاة" },
];
const QADR_SALAH: Bi = { en: "Qiyam & du'a: «اللهم إنك عفوّ تحب العفو فاعفُ عني»", ar: "قيام ودعاء: «اللهم إنك عفوّ تحب العفو فاعفُ عني»" };
const CHARITY: Bi[] = [
  { en: "Give sadaqah, however small", ar: "تصدّق ولو بالقليل" },
  { en: "Feed a fasting person or share your iftar", ar: "أطعم صائمًا أو شارك إفطارك" },
  { en: "Call or visit a relative", ar: "صِل رحمك بزيارة أو اتصال" },
  { en: "Forgive someone and make du'a for them", ar: "اعفُ عن أحد وادعُ له" },
  { en: "Guard your tongue all day — no backbiting", ar: "احفظ لسانك اليوم من الغيبة" },
  { en: "Greet people with a smile and salam", ar: "ابدأ الناس بالسلام والابتسامة" },
  { en: "Help at home without being asked", ar: "ساعد في البيت دون أن يُطلب منك" },
  { en: "Donate clothes or things you don't need", ar: "تبرّع بما لا تحتاجه" },
  { en: "Make du'a for five people by name", ar: "ادعُ لخمسة أشخاص بأسمائهم" },
  { en: "Send a kind message to a teacher or friend", ar: "أرسل رسالة طيبة لمعلّم أو صديق" },
];
const KNOWLEDGE: Bi[] = [
  { en: "Learn the meaning of one verse you recited", ar: "تعلّم معنى آية قرأتها" },
  { en: "Learn one ruling about fasting", ar: "تعلّم حكمًا من أحكام الصيام" },
  { en: "Learn a du'a with its meaning", ar: "احفظ دعاءً مع معناه" },
  { en: "Read a short story from the Seerah", ar: "اقرأ قصة قصيرة من السيرة" },
  { en: "Learn 5 new Arabic words from the Qur'an", ar: "تعلّم خمس كلمات عربية من القرآن" },
  { en: "Learn one of Allah's names and its meaning", ar: "تعلّم اسمًا من أسماء الله ومعناه" },
  { en: "Review one tajweed rule", ar: "راجع حكمًا من أحكام التجويد" },
  { en: "Read one hadith and its explanation", ar: "اقرأ حديثًا مع شرحه" },
  { en: "Listen to a short tafsir lesson", ar: "استمع إلى درس تفسير قصير" },
  { en: "Teach someone what you learned this week", ar: "علّم أحدًا ما تعلمته هذا الأسبوع" },
];

export const CAT_XP: Record<TaskCat, number> = { quran: 20, salah: 15, charity: 15, knowledge: 10 };
export const QADR_BONUS = 10;
const QADR_NIGHTS = new Set([21, 23, 25, 27, 29]);
export const chapterOf = (day: number): 0 | 1 | 2 => (day <= 10 ? 0 : day <= 20 ? 1 : 2);

export function buildDays(): JourneyDay[] {
  return Array.from({ length: TOTAL_DAYS }, (_, i) => {
    const day = i + 1;
    const qadr = QADR_NIGHTS.has(day);
    const [title, story] = STORY[i];
    const mk = (cat: TaskCat, text: Bi, bonus = 0): JourneyTask => ({ id: `d${day}-${cat}`, cat, xp: CAT_XP[cat] + bonus, text });
    return {
      day, chapter: chapterOf(day), title, story, qadr,
      tasks: [
        mk("quran", { en: `Recite Juz ${day} and do your daily revision`, ar: `اقرأ الجزء ${day} وأنجز مراجعتك اليومية` }),
        mk("salah", qadr ? QADR_SALAH : SALAH[i % SALAH.length], qadr ? QADR_BONUS : 0),
        mk("charity", CHARITY[i % CHARITY.length]),
        mk("knowledge", KNOWLEDGE[i % KNOWLEDGE.length]),
      ],
    };
  });
}
export const DAYS: JourneyDay[] = buildDays();

/* ── ranks ── */
export const RANKS: { from: number; name: Bi }[] = [
  { from: 0,  name: { en: "Traveller",        ar: "مسافر" } },
  { from: 3,  name: { en: "Seeker",           ar: "طالب" } },
  { from: 7,  name: { en: "Steadfast",        ar: "ثابت" } },
  { from: 12, name: { en: "Lantern-bearer",   ar: "حامل الفانوس" } },
  { from: 18, name: { en: "Guardian of Night", ar: "حارس الليل" } },
  { from: 24, name: { en: "Beloved of the Night", ar: "محبّ الليل" } },
  { from: 30, name: { en: "Eid Champion",     ar: "بطل العيد" } },
];
export const rankFor = (daysDone: number) => [...RANKS].reverse().find((r) => daysDone >= r.from) ?? RANKS[0];
export const nextRank = (daysDone: number) => RANKS.find((r) => r.from > daysDone) ?? null;

/* ── progress maths (pure) ── */
export type DayStatus = "done" | "partial" | "open" | "locked";
const dayTaskIds = (d: JourneyDay) => d.tasks.map((t) => t.id);

export function dayDone(d: JourneyDay, done: ReadonlySet<string>): boolean { return dayTaskIds(d).every((id) => done.has(id)); }
export function dayCount(d: JourneyDay, done: ReadonlySet<string>): number { return dayTaskIds(d).filter((id) => done.has(id)).length; }

/** which day is "today" (1…30), or 0 before the month starts, or 31 after it ends — local calendar days, not 24-hour blocks */
export function currentDay(now: Date, start = RAMADAN_START): number {
  const [y, m, d] = start.split("-").map(Number);
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(y, m - 1, d);
  const n = Math.round((a - b) / 86_400_000) + 1;
  return n < 1 ? 0 : n > TOTAL_DAYS ? TOTAL_DAYS + 1 : n;
}

export interface Progress {
  statuses: DayStatus[];     // index = day - 1
  daysDone: number;
  xp: number;
  streak: number;            // consecutive finished days up to today (a not-yet-finished today does not break it)
  bestStreak: number;
  /** the day the traveller stands on: the first unfinished day that is unlocked (or the last finished one when all are done) */
  travelerDay: number;
  perfectChapters: number[];
}

/** `unlocked` = the highest day that may be played now (30 in rehearsal) */
export function computeProgress(done: ReadonlySet<string>, unlocked: number, today: number, days: JourneyDay[] = DAYS): Progress {
  const statuses: DayStatus[] = days.map((d) => {
    if (d.day > unlocked) return "locked";
    if (dayDone(d, done)) return "done";
    return dayCount(d, done) > 0 ? "partial" : "open";
  });
  let xp = 0;
  for (const d of days) for (const t of d.tasks) if (done.has(t.id)) xp += t.xp;
  const isDone = (day: number) => statuses[day - 1] === "done";
  // streak walks back from today; today only counts once finished
  let streak = 0;
  let cursor = Math.min(today, TOTAL_DAYS);
  if (cursor >= 1 && !isDone(cursor)) cursor--;
  while (cursor >= 1 && isDone(cursor)) { streak++; cursor--; }
  let best = 0, run = 0;
  for (let day = 1; day <= TOTAL_DAYS; day++) { if (isDone(day)) { run++; best = Math.max(best, run); } else run = 0; }
  const daysDone = statuses.filter((s) => s === "done").length;
  const firstOpen = statuses.findIndex((s) => s === "open" || s === "partial");
  const travelerDay = firstOpen >= 0 ? firstOpen + 1 : Math.max(1, Math.min(unlocked, TOTAL_DAYS));
  const perfectChapters = CHAPTERS.map((c, i) => ({ c, i })).filter(({ c }) => { for (let d = c.from; d <= c.to; d++) if (!isDone(d)) return false; return true; }).map(({ i }) => i);
  return { statuses, daysDone, xp, streak, bestStreak: best, travelerDay, perfectChapters };
}

export interface Badge { id: string; icon: "flame" | "star" | "moon" | "trophy"; name: Bi; earned: boolean }
export function badgesFor(p: Progress, done: ReadonlySet<string>): Badge[] {
  const qadrAll = [21, 23, 25, 27, 29].every((d) => dayDone(DAYS[d - 1], done));
  return [
    { id: "first", icon: "star", name: { en: "First step", ar: "الخطوة الأولى" }, earned: p.daysDone >= 1 },
    { id: "s3", icon: "flame", name: { en: "3-day streak", ar: "ثلاثة أيام متتالية" }, earned: p.bestStreak >= 3 },
    { id: "s7", icon: "flame", name: { en: "7-day streak", ar: "أسبوع متتالٍ" }, earned: p.bestStreak >= 7 },
    { id: "c1", icon: "moon", name: { en: "Gates of Mercy", ar: "أبواب الرحمة" }, earned: p.perfectChapters.includes(0) },
    { id: "c2", icon: "moon", name: { en: "Valley of Forgiveness", ar: "وادي المغفرة" }, earned: p.perfectChapters.includes(1) },
    { id: "c3", icon: "moon", name: { en: "Road to Freedom", ar: "طريق العتق" }, earned: p.perfectChapters.includes(2) },
    { id: "qadr", icon: "star", name: { en: "Seeker of the Night", ar: "طالب الليلة" }, earned: qadrAll },
    { id: "all", icon: "trophy", name: { en: "All 30 days", ar: "الثلاثون كاملة" }, earned: p.daysDone === TOTAL_DAYS },
  ];
}
