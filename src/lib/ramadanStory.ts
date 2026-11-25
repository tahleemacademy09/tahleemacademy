/*
  ramadanStory.ts — the STORY of each day of the Ramadan Journey.

  A day is a short sequence of scenes the student walks through before the day's deeds:
    narrate  – the story, told in the second person ("you")
    learn    – a Qur'an verse / hadith / du'a card: Arabic first, tap to reveal the meaning, source underneath
    quiz     – one question, one right answer, a "why" that quotes the evidence
    order    – put the steps in the right order
    tap      – a dhikr counter
    reflect  – choose a niyyah / a resolution (saved on the device)
  The last scene of every day is added by the screen: the day's real-life deeds.

  ⚠ CONTENT REVIEW: every ayah / hadith below carries its source. Have a teacher confirm wording, numbering
  and grading before a release — and keep adding the source line to every new card.

  Days without authored scenes (see STORIES) still get a small story built from the day's title and line in
  ramadanJourney.ts, so the path never breaks while more days are being written.

  This file has NO runtime import from ramadanJourney.ts (types only) so the two can import each other safely.
*/
import type { Bi, JourneyDay } from "./ramadanJourney";

export type Landmark =
  | "crescent" | "moon" | "star" | "fire" | "path" | "well" | "palm" | "bridge" | "market" | "lantern"
  | "hill" | "gate" | "stone" | "water" | "tent" | "wind" | "garden" | "cave" | "tower" | "caravan";

/** the place drawn on each day's medallion on the map and at the top of its story */
export const LANDMARKS: Landmark[] = [
  "crescent", "fire", "path", "well", "palm", "bridge", "market", "lantern", "hill", "gate",
  "path", "stone", "water", "tent", "moon", "wind", "garden", "cave", "water", "hill",
  "lantern", "lantern", "star", "tower", "star", "caravan", "moon", "path", "moon", "gate",
];
export const landmarkOf = (day: number): Landmark => LANDMARKS[Math.max(0, Math.min(LANDMARKS.length - 1, day - 1))];

export type LearnKind = "ayah" | "hadith" | "dua";
export interface QuizOption { text: Bi; right?: boolean }
export type Scene =
  | { type: "narrate"; text: Bi; art?: Landmark }
  | { type: "learn"; kind: LearnKind; title: Bi; arabic: string; meaning: Bi; source: string; grade?: string; note?: Bi }
  | { type: "quiz"; q: Bi; options: QuizOption[]; why: Bi }
  | { type: "order"; q: Bi; items: Bi[]; why: Bi }                       // items are listed in the CORRECT order
  | { type: "tap"; q: Bi; arabic: string; count: number; why?: Bi }
  | { type: "reflect"; q: Bi; lead?: Bi; options: Bi[] };

const b = (en: string, ar: string): Bi => ({ en, ar });

/* ════════════════════════════ the authored days ════════════════════════════ */
export const STORIES: Record<number, Scene[]> = {
  /* ───────── Day 1 · The crescent appears ───────── */
  1: [
    { type: "narrate", text: b(
      "Dusk on the last dune of Sha'bān. Your lantern is still dark. All around you, travellers whisper the same question: has anyone seen it? Then a child points to the west — a silver thread, thinner than an eyelash. The crescent. The road begins tonight.",
      "غروبٌ على آخر كثيبٍ من شعبان. فانوسك لم يُضأ بعد، والمسافرون من حولك يتهامسون: هل رآه أحد؟ ثم يشير طفلٌ نحو الغرب: خيطٌ فضيّ أرقّ من الرمش. الهلال. الليلة تبدأ الرحلة.") },
    { type: "learn", kind: "hadith", title: b("How the month begins", "كيف يبدأ الشهر"),
      arabic: "صُومُوا لِرُؤْيَتِهِ، وَأَفْطِرُوا لِرُؤْيَتِهِ، فَإِنْ غُبِّيَ عَلَيْكُمْ فَأَكْمِلُوا عِدَّةَ شَعْبَانَ ثَلَاثِينَ",
      meaning: b("Fast when you see it and break the fast when you see it. If it is hidden from you by clouds, complete Sha'bān as thirty days.", "صوموا إذا رأيتم الهلال، وأفطروا إذا رأيتموه، فإن حال دونه غيم فأتمّوا شعبان ثلاثين يومًا."),
      source: "Sahih al-Bukhari 1909 · Sahih Muslim 1081" },
    { type: "quiz", q: b("How does the month of Ramadan begin?", "كيف يبدأ شهر رمضان؟"),
      options: [
        { text: b("By sighting the crescent — or by completing Sha'bān as 30 days if it can't be seen", "برؤية الهلال، أو بإتمام شعبان ثلاثين يومًا إن لم يُرَ"), right: true },
        { text: b("On the same Gregorian date every year", "في التاريخ الميلادي نفسه كل عام") },
        { text: b("With the first Taraweeh prayer", "بأول صلاة تراويح") },
      ],
      why: b("The Prophet ﷺ tied fasting to the sighting of the crescent, and gave the fallback: complete Sha'bān as thirty days.", "ربط النبي ﷺ الصيام برؤية الهلال، وجعل البديل إتمام شعبان ثلاثين يومًا.") },
    { type: "learn", kind: "dua", title: b("The du'a for the new moon", "دعاء رؤية الهلال"),
      arabic: "اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ، وَالسَّلَامَةِ وَالْإِسْلَامِ، رَبِّي وَرَبُّكَ اللَّهُ",
      meaning: b("O Allah, let it rise over us with security and faith, with safety and Islam. My Lord and your Lord is Allah.", "اللهم أطلِعه علينا بالأمن والإيمان، والسلامة والإسلام. ربي وربك الله."),
      source: "Jami' at-Tirmidhi 3451", grade: "ḥasan",
      note: b("Say it now — as you would if the crescent were in front of you.", "قلها الآن كما لو كان الهلال أمامك.") },
    { type: "narrate", text: b(
      "Night falls and the old caravan-master raises his hand. 'Listen, travellers. This is no ordinary night. The gates on this road open only once a year.'",
      "يحلّ الليل، ويرفع شيخ القافلة يده: «اسمعوا يا مسافرون، ليست هذه ليلة كسائر الليالي، فبوابات هذا الطريق لا تُفتح إلا مرة في العام».") , art: "gate" },
    { type: "learn", kind: "hadith", title: b("The gates open", "تُفتح الأبواب"),
      arabic: "إِذَا جَاءَ رَمَضَانُ فُتِّحَتْ أَبْوَابُ الْجَنَّةِ، وَغُلِّقَتْ أَبْوَابُ النَّارِ، وَصُفِّدَتِ الشَّيَاطِينُ",
      meaning: b("When Ramadan comes, the gates of Paradise are opened, the gates of the Fire are closed, and the devils are chained.", "إذا جاء رمضان فُتحت أبواب الجنة، وأُغلقت أبواب النار، وقُيّدت الشياطين."),
      source: "Sahih Muslim 1079 · similar in Sahih al-Bukhari 1899" },
    { type: "learn", kind: "ayah", title: b("Why we walk this road", "لماذا نسير في هذا الطريق"),
      arabic: "يَا أَيُّهَا الَّذِينَ آمَنُوا كُتِبَ عَلَيْكُمُ الصِّيَامُ كَمَا كُتِبَ عَلَى الَّذِينَ مِن قَبْلِكُمْ لَعَلَّكُمْ تَتَّقُونَ",
      meaning: b("O you who believe! Fasting is prescribed for you as it was prescribed for those before you, so that you may attain taqwā (God-consciousness).", "يا أيها الذين آمنوا فُرض عليكم الصيام كما فُرض على الذين من قبلكم، لعلكم تتقون."),
      source: "Al-Baqarah 2:183",
      note: b("Fasting is an old act of worship, shared with earlier nations — and its goal is taqwā, not hunger.", "الصيام عبادة قديمة عرفتها الأمم قبلنا، وغايته التقوى لا الجوع.") },
    { type: "quiz", q: b("According to the verse, what is the goal of fasting?", "ما غاية الصيام كما في الآية؟"),
      options: [
        { text: b("Taqwā — to be mindful of Allah", "التقوى"), right: true },
        { text: b("To feel hunger as hard as possible", "الشعور بالجوع الشديد") },
        { text: b("To prove one's strength", "إثبات القوة") },
      ],
      why: b("The verse ends with «لعلكم تتقون» — 'so that you may attain taqwā'.", "ختمت الآية بقوله: «لعلكم تتقون».") },
    { type: "reflect", q: b("Set your niyyah for the road ahead", "اجعل لك نيّة لهذه الرحلة"),
      lead: b("«Actions are judged by intentions, and each person gets what they intended.» — Bukhari 1, Muslim 1907", "«إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى» — البخاري 1، مسلم 1907"),
      options: [
        b("To fast for Allah's sake alone", "أن أصوم لله وحده"),
        b("To complete a full khatm of the Qur'an", "أن أختم القرآن كاملًا"),
        b("To leave one habit that harms my heart", "أن أترك عادة تضرّ قلبي"),
      ] },
  ],

  /* ───────── Day 2 · The first campfire ───────── */
  2: [
    { type: "narrate", text: b(
      "The sun slips away and the travellers gather around the first campfire. Nobody eats yet. Every eye is on the horizon, every hand holds a date. The air smells of woodsmoke and patience.",
      "تغيب الشمس ويلتفّ المسافرون حول أول نار. لا يأكل أحد بعد، فالعيون على الأفق، وكل يدٍ تمسك تمرة. والهواء يفوح بدخان الحطب والصبر.") },
    { type: "learn", kind: "hadith", title: b("How the Prophet ﷺ broke his fast", "كيف كان النبي ﷺ يفطر"),
      arabic: "كَانَ رَسُولُ اللَّهِ ﷺ يُفْطِرُ قَبْلَ أَنْ يُصَلِّيَ عَلَى رُطَبَاتٍ، فَإِنْ لَمْ تَكُنْ رُطَبَاتٌ فَتُمَيْرَاتٌ، فَإِنْ لَمْ تَكُنْ تُمَيْرَاتٌ حَسَا حَسَوَاتٍ مِنْ مَاءٍ",
      meaning: b("The Messenger of Allah ﷺ used to break his fast before praying with fresh dates; if there were none, then dried dates; and if there were none, a few sips of water.", "كان رسول الله ﷺ يفطر قبل أن يصلي على رُطَبات، فإن لم تكن فتمرات، فإن لم تكن حسا حسوات من ماء."),
      source: "Sunan Abi Dawud 2356 · Jami' at-Tirmidhi 696", grade: "ḥasan" },
    { type: "order", q: b("Break your fast the way the Prophet ﷺ did. What comes first?", "افطر كما كان النبي ﷺ يفطر. ما الذي يأتي أولًا؟"),
      items: [b("Fresh dates", "رُطَبات"), b("Dried dates", "تمرات"), b("A few sips of water", "حسوات من ماء")],
      why: b("Fresh dates, then dried dates, then water — and all of it before praying Maghrib.", "رطبات، ثم تمرات، ثم ماء، وكل ذلك قبل صلاة المغرب.") },
    { type: "learn", kind: "dua", title: b("The du'a at iftar", "دعاء الإفطار"),
      arabic: "ذَهَبَ الظَّمَأُ، وَابْتَلَّتِ الْعُرُوقُ، وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ",
      meaning: b("The thirst has gone, the veins are moist, and the reward is confirmed, if Allah wills.", "ذهب العطش، وابتلّت العروق، وثبت الأجر إن شاء الله."),
      source: "Sunan Abi Dawud 2357", grade: "ḥasan" },
    { type: "narrate", text: b(
      "A tired stranger walks into the firelight, with nothing in his hands. You look at your dates. There are only a few. You break one in two and hold out the half.",
      "يدخل ضوءَ النار غريبٌ متعب لا يحمل شيئًا. تنظر إلى تمرك، وهو قليل. تكسر تمرة نصفين وتمدّ إليه نصفها.") , art: "fire" },
    { type: "learn", kind: "hadith", title: b("The reward of feeding a fasting person", "أجر تفطير الصائم"),
      arabic: "مَنْ فَطَّرَ صَائِمًا كَانَ لَهُ مِثْلُ أَجْرِهِ، غَيْرَ أَنَّهُ لَا يَنْقُصُ مِنْ أَجْرِ الصَّائِمِ شَيْئًا",
      meaning: b("Whoever gives a fasting person something to break his fast with earns the same reward as him, without the fasting person's reward being reduced at all.", "من فطّر صائمًا كان له مثل أجره، من غير أن ينقص من أجر الصائم شيء."),
      source: "Jami' at-Tirmidhi 807 · Sunan Ibn Majah 1746", grade: "ḥasan ṣaḥīḥ" },
    { type: "quiz", q: b("What does someone earn for feeding a fasting person at iftar?", "ماذا يكسب من فطّر صائمًا؟"),
      options: [
        { text: b("The same reward as the fasting person — without reducing his", "مثل أجر الصائم، دون أن ينقص من أجره"), right: true },
        { text: b("Half the reward of the fasting person", "نصف أجر الصائم") },
        { text: b("Nothing, unless it is a full meal", "لا شيء إلا إن كانت وجبة كاملة") },
      ],
      why: b("The hadith promises “a reward like his” and sets no condition of a full meal.", "وعد الحديث بـ«مثل أجره»، ولم يشترط وجبة كاملة.") },
    { type: "learn", kind: "hadith", title: b("Before the next dawn", "قبل الفجر القادم"),
      arabic: "تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً",
      meaning: b("Eat suhoor, for in suhoor there is blessing.", "تسحّروا، فإن في السحور بركة."),
      source: "Sahih al-Bukhari 1923 · Sahih Muslim 1095",
      note: b("Tonight, before you sleep: set an alarm for suhoor.", "الليلة قبل أن تنام: اضبط المنبّه للسحور.") },
  ],

  /* ───────── Day 3 · The quiet path ───────── */
  3: [
    { type: "narrate", text: b(
      "At noon a loud caravan thunders past, its drivers shouting at one another over the dust. One of them turns on you and says something cruel. Heat, thirst, a sharp tongue. Your reply sits ready in your mouth.",
      "عند الظهيرة تعبر قافلة صاخبة والسائقون يتصايحون في الغبار. يلتفت إليك أحدهم ويقول كلمة جارحة. حرٌّ وعطشٌ ولسانٌ حاد، وجوابك جاهز على طرف لسانك.") },
    { type: "learn", kind: "hadith", title: b("Fasting is a shield", "الصيام جُنّة"),
      arabic: "الصِّيَامُ جُنَّةٌ، فَإِذَا كَانَ يَوْمُ صَوْمِ أَحَدِكُمْ فَلَا يَرْفُثْ وَلَا يَصْخَبْ، فَإِنْ سَابَّهُ أَحَدٌ أَوْ قَاتَلَهُ فَلْيَقُلْ: إِنِّي امْرُؤٌ صَائِمٌ",
      meaning: b("Fasting is a shield. So on the day one of you fasts, let him not speak obscenely or shout. If someone insults him or fights him, let him say: “I am fasting.”", "الصيام وقاية. فإذا كان يوم صوم أحدكم فلا يفحش ولا يصخب، فإن شتمه أحد أو قاتله فليقل: إني صائم."),
      source: "Sahih al-Bukhari 1894 · Sahih Muslim 1151" },
    { type: "quiz", q: b("The driver insults you in the middle of your fast. What does the hadith teach?", "شتمك السائق وأنت صائم. ماذا يعلّمنا الحديث؟"),
      options: [
        { text: b("Stay calm and say: “I am fasting”", "أن تهدأ وتقول: إني صائم"), right: true },
        { text: b("Insult him back — you have the right", "أن تردّ عليه الشتم، فلك الحق") },
        { text: b("Your fast is already spoiled, so there is no need to stay calm", "صومك فسد، فلا داعي للهدوء") },
      ],
      why: b("“I am fasting” is the reply the Prophet ﷺ taught — a shield for your fast and your heart.", "«إني صائم» هو الجواب الذي علّمه النبي ﷺ، وقاية لصومك ولقلبك.") },
    { type: "learn", kind: "hadith", title: b("More than food and drink", "أكثر من الطعام والشراب"),
      arabic: "مَنْ لَمْ يَدَعْ قَوْلَ الزُّورِ وَالْعَمَلَ بِهِ، فَلَيْسَ لِلَّهِ حَاجَةٌ فِي أَنْ يَدَعَ طَعَامَهُ وَشَرَابَهُ",
      meaning: b("Whoever does not give up false speech and acting upon it — Allah has no need of him giving up his food and drink.", "من لم يترك قول الزور والعمل به فليس لله حاجة في أن يترك طعامه وشرابه."),
      source: "Sahih al-Bukhari 1903",
      note: b("A serious warning: a fast is not only a stomach's fast.", "تحذير شديد: الصيام ليس صيام البطن وحده.") },
    { type: "narrate", text: b(
      "You say it softly: “I am fasting.” The driver blinks, mutters something, and rides on. The dust settles. The road is quiet again — only your steps, and a word your tongue can now fill with something better.",
      "تقولها بهدوء: «إني صائم». يرمش السائق ويغمغم ويمضي. يهدأ الغبار، ويعود الطريق ساكنًا، لا يُسمع فيه إلا خطاك، وكلمةٌ يستطيع لسانك الآن أن يملأها بما هو خير.") , art: "path" },
    { type: "learn", kind: "hadith", title: b("Two light words", "كلمتان خفيفتان"),
      arabic: "كَلِمَتَانِ خَفِيفَتَانِ عَلَى اللِّسَانِ، ثَقِيلَتَانِ فِي الْمِيزَانِ، حَبِيبَتَانِ إِلَى الرَّحْمَنِ: سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ",
      meaning: b("Two words, light on the tongue, heavy on the Scale, beloved to the Most Merciful: «Subḥān Allāh wa bi-ḥamdih, Subḥān Allāh al-'Aẓīm».", "كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن: سبحان الله وبحمده، سبحان الله العظيم."),
      source: "Sahih al-Bukhari 6406 · Sahih Muslim 2694" },
    { type: "tap", q: b("Fill the quiet with dhikr. Tap once for each time you say it.", "املأ السكون بالذكر. اضغط مرة عند كل تسبيحة."),
      arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", count: 10,
      why: b("Ten down. Keep it going on your own whenever the road is quiet.", "عشر. أكمل بنفسك كلما سكن الطريق.") },
    { type: "reflect", q: b("Which one will you guard today?", "ما الذي ستحفظه اليوم؟"),
      lead: b("Choose the one that is hardest for you.", "اختر الأصعب عليك."),
      options: [
        b("My tongue — no backbiting, no shouting", "لساني: لا غيبة ولا صراخ"),
        b("My eyes — what I scroll and what I watch", "عيني: ما أتصفّحه وما أشاهده"),
        b("My time — fewer hours wasted", "وقتي: ساعات أقل ضائعة"),
      ] },
  ],
};

export const hasStory = (day: number): boolean => Boolean(STORIES[day]);

/** the scenes of a day — the authored ones, or a small story built from the day's title and line */
export function storyFor(d: JourneyDay): Scene[] {
  const authored = STORIES[d.day];
  if (authored) return authored;
  return [
    { type: "narrate", text: d.story },
    { type: "reflect", q: b("What do you want to carry through this stretch of the road?", "ماذا تريد أن تحمل معك في هذا المقطع من الطريق؟"),
      options: [b("More patience", "مزيدًا من الصبر"), b("More sincerity", "مزيدًا من الإخلاص"), b("More remembrance of Allah", "مزيدًا من ذكر الله")] },
  ];
}

/* ── pure helpers (tested) ── */

/** a fixed shuffle of 0…n-1 that is never already in order, so the same puzzle looks the same on every device */
export function shuffledIndices(n: number, seed = 1): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift() as number);
  return a;
}

/** number of questions in a day that score a "first try" (quiz + order) */
export const questionCount = (scenes: Scene[]): number => scenes.filter((s) => s.type === "quiz" || s.type === "order").length;
