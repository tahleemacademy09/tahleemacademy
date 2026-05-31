/*  src/components/dashboard/TawheedWidget.tsx
    Tawheed (Islamic Monotheism) Daily Learning Widget
    Rotating lessons on the correct creed with Quranic proofs,
    authentic Hadith evidence, and live practical examples.
*/
import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

const DARK_GREEN = "#0f2d1f";
const MID_GREEN  = "#1a4731";
const GOLD       = "#c9a84c";
const BORDER     = "rgba(15,45,31,0.1)";

// ── Three major categories of Tawheed ────────────────────────────────────────
const CATEGORIES = [
  { key: "rububiyyah", en: "Tawheed al-Rububiyyah", ar: "توحيد الربوبية", color: "#e8f5e9", border: "#a5d6a7", badge: "#2e7d32" },
  { key: "uluhiyyah",  en: "Tawheed al-Uluhiyyah",  ar: "توحيد الألوهية", color: "#fff8e1", border: "#ffe082", badge: "#b7791f" },
  { key: "asma",       en: "Tawheed al-Asmaa' wa al-Sifaat", ar: "توحيد الأسماء والصفات", color: "#f3e5f5", border: "#ce93d8", badge: "#6b21a8" },
];

const LESSONS = [
  // ── Tawheed al-Rububiyyah ────────────────────────────────────────────────
  {
    category: "rububiyyah",
    title: "Allah Alone is the Creator & Sustainer",
    titleAr: "اللَّهُ وَحْدَهُ الخَالِقُ الرَّازِقُ",
    summary: "Affirming that Allah alone creates, controls, and sustains all of existence — no partner, no rival.",
    quranicProof: {
      ar: "قُلْ مَن يَرْزُقُكُم مِّنَ السَّمَاءِ وَالْأَرْضِ أَمَّن يَمْلِكُ السَّمْعَ وَالْأَبْصَارَ وَمَن يُخْرِجُ الْحَيَّ مِنَ الْمَيِّتِ وَيُخْرِجُ الْمَيِّتَ مِنَ الْحَيِّ وَمَن يُدَبِّرُ الْأَمْرَ ۚ فَسَيَقُولُونَ اللَّهُ",
      en: "Say: Who provides for you from the sky and the earth? Or who controls hearing and sight? And who brings forth the living from the dead and the dead from the living? And who manages every affair? They will say: Allah.",
      ref: "Quran 10:31",
    },
    hadith: {
      ar: "إِنَّ اللَّهَ هُوَ الْمُسَبِّبُ، وَبِيَدِهِ الأَمْرُ كُلُّهُ",
      en: "Indeed Allah is the one who causes things to happen, and all affairs are in His hand.",
      source: "Concept from Sahih al-Bukhari 2563",
    },
    explanation: `Tawheed al-Rububiyyah means affirming that Allah alone is the Lord (Rabb) — the Creator, Owner, and Controller of all creation. Even the polytheists of Makkah, who associated partners in worship, acknowledged this. Allah says: "If you ask them who created the heavens and earth, they will certainly say: Allah." (39:38)\n\nLIVE EXAMPLE: When it rains, the water does not come because of scientists predicting it or clouds producing it independently — it comes because Allah sent it. "Allah is He Who sends the winds, so they stir up clouds, and He spreads them in the sky as He wills, and makes them fragments, so you see the rain come forth from their midst." (30:48). When you eat food and feel strength, remember: "Allah is the one who provides sustenance, possessing firm power." (51:58).\n\nKEY POINT: Believing this type of Tawheed alone does NOT make a person a Muslim. Iblis (Shaytan) also acknowledges Allah as Creator and Lord. What distinguishes Muslims is also affirming Tawheed al-Uluhiyyah — worshipping Allah alone.`,
  },
  {
    category: "rububiyyah",
    title: "Allah's Absolute Control — Nothing Happens Without His Will",
    titleAr: "لا يَقَعُ شَيءٌ إِلَّا بِإِذْنِهِ",
    summary: "Every event in the universe — big or small — occurs by the permission and will of Allah alone.",
    quranicProof: {
      ar: "وَمَا تَشَاءُونَ إِلَّا أَن يَشَاءَ اللَّهُ رَبُّ الْعَالَمِينَ",
      en: "And you do not will except that Allah wills — Lord of the worlds.",
      ref: "Quran 81:29",
    },
    hadith: {
      ar: "وَاعْلَمْ أَنَّ الأُمَّةَ لَوِ اجْتَمَعَتْ عَلَى أَنْ يَنْفَعُوكَ بِشَيْءٍ لَمْ يَنْفَعُوكَ إِلَّا بِشَيْءٍ قَدْ كَتَبَهُ اللَّهُ لَكَ",
      en: "Know that if the entire nation gathered to benefit you, they could not benefit you except with what Allah has written for you.",
      source: "Jami' al-Tirmidhi 2516 — Sahih",
    },
    explanation: `This is among the most liberating truths in Islam. Because nothing happens without Allah's will, the believer is freed from fear of other people, reliance on other than Allah, and despair when things go wrong.\n\nLIVE EXAMPLE: You apply for a job and another person gets it. Tawheed al-Rububiyyah tells you: that outcome was decided by Allah, not merely by the interviewer's preference. Your response is not bitterness at humans, but renewed du'a to Allah — the only One who can change your situation. The Prophet ﷺ told Ibn Abbas: "And if they gather to harm you, they cannot harm you except with what Allah has decreed for you. The pen has been lifted and the pages have dried." (Tirmidhi 2516).\n\nThis is why the believer never truly despairs — their sustenance, their spouse, their children, their death — all are from Allah's perfect knowledge and plan.`,
  },

  // ── Tawheed al-Uluhiyyah ─────────────────────────────────────────────────
  {
    category: "uluhiyyah",
    title: "Worship Allah Alone — The Meaning of Laa ilaaha illallaah",
    titleAr: "لَا إِلٰهَ إِلَّا ٱللَّهُ — حَقِيقَتُهَا",
    summary: "The declaration of faith means: no one and nothing is worthy of worship except Allah. This is the entire purpose of creation.",
    quranicProof: {
      ar: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ",
      en: "I have not created jinn and mankind except to worship Me.",
      ref: "Quran 51:56",
    },
    hadith: {
      ar: "حَقُّ اللَّهِ عَلَى الْعِبَادِ أَنْ يَعْبُدُوهُ وَلاَ يُشْرِكُوا بِهِ شَيْئًا",
      en: "The right of Allah over His servants is that they worship Him and do not associate anything with Him.",
      source: "Sahih al-Bukhari 2856 — Mu'adh ibn Jabal رضي الله عنه",
    },
    explanation: `Tawheed al-Uluhiyyah is the most critical category. "Ilaah" means the one who is worshipped, obeyed, loved, feared, hoped in, and turned to. To say "Laa ilaaha illallaah" is to declare that NONE of these acts of the heart belong to anyone except Allah.\n\nLIVE EXAMPLE: You face a difficult exam tomorrow. Tawheed al-Uluhiyyah means: your first action is du'a to Allah, not superstition (wearing a "lucky" item), not despair (as if success is purely random), not relying solely on preparation while forgetting Allah. The student who studied AND prays tahajjud asking Allah for ease understands this Tawheed. The one who skipped study but trusts a good-luck charm has violated it.\n\nLIVE EXAMPLE 2: Many Muslims today swear by the names of the Prophet ﷺ, saints, or the dead, asking them for intercession directly. This is shirk al-akbar if they believe those individuals can independently help. The correct creed: the Prophet ﷺ himself cannot be called upon after his death for direct help — we ask ALLAH for His mercy and send salawat upon the Prophet ﷺ as an act of worship of Allah. Ibn Taymiyyah and Ibn al-Qayyim wrote extensively on this.`,
  },
  {
    category: "uluhiyyah",
    title: "Shirk — The One Unforgivable Sin",
    titleAr: "الشِّرْكُ — الذَّنْبُ الَّذِي لَا يُغْفَرُ",
    summary: "Associating partners with Allah in worship is the greatest injustice and the only sin Allah will not forgive if died upon.",
    quranicProof: {
      ar: "إِنَّ اللَّهَ لَا يَغْفِرُ أَن يُشْرَكَ بِهِ وَيَغْفِرُ مَا دُونَ ذَٰلِكَ لِمَن يَشَاءُ ۚ وَمَن يُشْرِكْ بِاللَّهِ فَقَدِ افْتَرَىٰ إِثْمًا عَظِيمًا",
      en: "Indeed, Allah does not forgive associating others with Him, but He forgives what is less than that for whom He wills. And whoever associates others with Allah has certainly fabricated a tremendous sin.",
      ref: "Quran 4:48",
    },
    hadith: {
      ar: "أَكْبَرُ الْكَبَائِرِ: الإِشْرَاكُ بِاللَّهِ",
      en: "The greatest of the major sins is to associate partners with Allah.",
      source: "Sahih al-Bukhari 6871 — Abu Bakra رضي الله عنه",
    },
    explanation: `Shirk is divided into major (akbar) and minor (asghar). Major shirk — like prostrating to an idol or calling upon the dead — takes a person outside of Islam. Minor shirk — like doing good deeds to be seen (riya') — does not take one out of Islam but destroys those deeds.\n\nLIVE EXAMPLE — SHIRK AL-KHAFI (hidden shirk): A student performs salah beautifully when people are watching, but rushes through it alone. The Prophet ﷺ warned: "What I fear most for you is the minor shirk." They asked: "What is that, O Messenger of Allah?" He said: "Showing off (riya')." (Ahmad 23119 — Sahih). The cure is ikhlas: sincerity, always asking: "Am I doing this for Allah or for people?"\n\nLIVE EXAMPLE — COMMON MISTAKE: Saying "Were it not for Dr. X, I would have died" — attributing the cure to the doctor alone, forgetting Allah cured you through that doctor. Correct: "Allah cured me, and made this doctor a means." The Prophet ﷺ himself used medicine while fully acknowledging Allah is Al-Shafi — the one who truly heals.`,
  },

  // ── Tawheed al-Asmaa' wa al-Sifaat ──────────────────────────────────────
  {
    category: "asma",
    title: "Allah's Names & Attributes — Without Distortion or Comparison",
    titleAr: "أَسْمَاءُ اللَّهِ وَصِفَاتُهُ — بِلَا تَحْرِيفٍ وَلَا تَشْبِيهٍ",
    summary: "Affirming every name and attribute Allah ascribed to Himself, as they come, without denial, distortion, asking 'how', or comparing to creation.",
    quranicProof: {
      ar: "لَيْسَ كَمِثْلِهِ شَيْءٌ ۖ وَهُوَ السَّمِيعُ الْبَصِيرُ",
      en: "There is nothing like unto Him, and He is the All-Hearing, the All-Seeing.",
      ref: "Quran 42:11",
    },
    hadith: {
      ar: "إِنَّ لِلَّهِ تِسْعَةً وَتِسْعِينَ اسْمًا مِئَةً إِلَّا وَاحِدًا مَنْ أَحْصَاهَا دَخَلَ الْجَنَّةَ",
      en: "Allah has 99 names — one hundred minus one. Whoever encompasses them will enter Paradise.",
      source: "Sahih al-Bukhari 2736 — Abu Hurayrah رضي الله عنه",
    },
    explanation: `The correct creed (aqeedah) regarding Allah's names and attributes follows the way of the Salaf al-Salih (the righteous early Muslims): affirm what Allah affirmed for Himself in the Quran and authentic Sunnah, exactly as it came, without:\n\n1. Ta'teel (denial): saying "He has no hand, no face" — when the Quran says He does.\n2. Tahrif (distortion): re-interpreting "hand" as "power" or "grace" — changing the plain meaning without evidence.\n3. Tamtheel (comparison): saying "His hand is like a human hand."\n4. Takyeef (asking how): saying "I wonder what His face looks like."\n\nLIVE EXAMPLE — AL-ISTIWA: Allah says: "The Most Merciful rose above (istawaa) the Throne." (20:5). The correct approach: we affirm Allah rose above His Throne in a manner that befits His majesty — but "how" it happened is known only to Him. Imam Malik (RA) was asked about this. He said: "The rising (istiwa) is known, the HOW is unknown, believing in it is obligatory, and asking about it is an innovation." This is the methodology of Ahl al-Sunnah wal-Jama'ah.`,
  },
  {
    category: "asma",
    title: "Al-Hayy al-Qayyum — The Ever-Living, Self-Sustaining",
    titleAr: "الحَيُّ القَيُّومُ",
    summary: "The greatest of Allah's names — He is perfect in life and all others depend on Him, while He depends on none.",
    quranicProof: {
      ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ",
      en: "Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep.",
      ref: "Quran 2:255 — Ayat al-Kursi",
    },
    hadith: {
      ar: "أَعْظَمُ آيَةٍ فِي الْقُرْآنِ: اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
      en: "The greatest verse in the Quran is: Allah — there is no deity except Him, the Ever-Living, the Sustainer.",
      source: "Sahih Muslim 810 — Ubayy ibn Ka'b رضي الله عنه",
    },
    explanation: `Al-Hayy means the one whose life is perfect and eternal — He was never born, will never die, is never tired or weakened. Al-Qayyum means He is completely self-sufficient and everything else subsists through Him — the heavens and earth would collapse without His constant maintenance.\n\nLIVE EXAMPLE: Ayat al-Kursi (2:255) contains both of these names and is the greatest verse in the Quran for this reason — it establishes the absolute majesty and completeness of Allah. The Prophet ﷺ said: "Whoever recites Ayat al-Kursi after every obligatory prayer — nothing stands between him and Paradise except death." (al-Nasaa'i — Sahih li-ghayrihi).\n\nWhen you feel alone, afraid at night, or facing an overwhelming problem — remind yourself: Al-Hayy al-Qayyum is not asleep, not distracted, not busy. He sees you, hears you, and sustains you every moment. Ibn al-Qayyim wrote: "The greatest du'a you can make uses these two names: Yaa Hayyu Yaa Qayyoom — by Your mercy I seek help." This is directly from the hadith of Anas ibn Malik in Tirmidhi 3524 (Sahih).`,
  },
  {
    category: "uluhiyyah",
    title: "Du'a is Worship — Calling on Allah Alone",
    titleAr: "الدُّعَاءُ عِبَادَةٌ",
    summary: "Du'a (supplication) is the essence of worship. Directing it to other than Allah — any person, grave, or object — is an act of shirk.",
    quranicProof: {
      ar: "وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ ۚ إِنَّ الَّذِينَ يَسْتَكْبِرُونَ عَنْ عِبَادَتِي سَيَدْخُلُونَ جَهَنَّمَ دَاخِرِينَ",
      en: "And your Lord says: Call upon Me; I will respond to you. Indeed, those who disdain My worship will enter Hellfire in humiliation.",
      ref: "Quran 40:60",
    },
    hadith: {
      ar: "الدُّعَاءُ هُوَ الْعِبَادَةُ",
      en: "Du'a is worship itself.",
      source: "Jami' al-Tirmidhi 2969 — Nu'man ibn Bashir رضي الله عنه — Sahih",
    },
    explanation: `In this verse, Allah equates calling upon Him (du'a) with worshipping Him ('ibadah). This means directing du'a to anyone other than Allah is directing worship to other than Allah — which is shirk.\n\nLIVE EXAMPLE: A person visits a saint's grave and says "O Shaykh, help me with my debt." Even if they love that saint and mean well, this is shirk because they are directing a du'a — an act of worship — to other than Allah. The correct practice: visit graves to remember death, make du'a TO ALLAH for the deceased, and ask ALLAH for your own needs.\n\nLIVE EXAMPLE 2: You're in an exam, stressed, pen stopped working, time running out. The person of correct Tawheed says in their heart: "Ya Allah, help me remember." Not "O Prophet ﷺ, help me" — because the Prophet ﷺ cannot hear individual du'as in our time according to Ahl al-Sunnah. But we CAN say "Allahumma salli 'ala Muhammad" (O Allah, send salah upon Muhammad) — because this is asking ALLAH to do something, not asking the Prophet ﷺ directly. This subtle difference is core Tawheed.`,
  },
  {
    category: "rububiyyah",
    title: "Al-Qadar — Believing in Divine Decree",
    titleAr: "الإِيمَانُ بِالقَدَرِ",
    summary: "Everything that happens was known to Allah before creation, written in al-Lawh al-Mahfoodh, willed by Him, and brought into being by His power.",
    quranicProof: {
      ar: "مَا أَصَابَ مِن مُّصِيبَةٍ فِي الْأَرْضِ وَلَا فِي أَنفُسِكُمْ إِلَّا فِي كِتَابٍ مِّن قَبْلِ أَن نَّبْرَأَهَا",
      en: "No disaster strikes upon the earth or among yourselves except that it is in a register before We bring it into being.",
      ref: "Quran 57:22",
    },
    hadith: {
      ar: "كَتَبَ اللَّهُ مَقَادِيرَ الْخَلَائِقِ قَبْلَ أَنْ يَخْلُقَ السَّمَاوَاتِ وَالأَرْضَ بِخَمْسِينَ أَلْفَ سَنَةٍ",
      en: "Allah recorded the destinies of all creatures fifty thousand years before He created the heavens and the earth.",
      source: "Sahih Muslim 2653 — Abdullah ibn Amr رضي الله عنه",
    },
    explanation: `The four levels of belief in al-Qadar are: (1) Allah's knowledge — He knew all things before creation. (2) Writing — recorded in al-Lawh al-Mahfoodh. (3) Will — nothing happens except by His will. (4) Creation — He created all things including human actions.\n\nLIVE EXAMPLE: You studied hard for an exam and failed. Iman in Qadar means: this outcome was written before you were born — not because your study was meaningless (that was your means and obligation), but because Allah in His infinite wisdom chose this result for you. The Prophet ﷺ said: "Seek what benefits you, rely on Allah, and do not feel helpless. And if something befalls you, do not say: 'If only I had done so-and-so' — but say: 'Allah decreed and what He willed He did.'" (Muslim 2664).\n\nBelieving in Qadar is the sixth pillar of Iman. Denying it is kufr. Misusing it ("I sin because it was decreed") is a corrupt argument — we are accountable for our choices, and Allah's decree does not negate our free will and responsibility.`,
  },
];

interface Props { language: string; }

export default function TawheedWidget({ language }: Props) {
  const t = (en: string, ar: string) => language === "ar" ? ar : en;
  const [idx, setIdx]         = useState(() => Math.floor(Math.random() * LESSONS.length));
  const [expanded, setExpanded] = useState(false);

  const lesson  = LESSONS[idx];
  const cat     = CATEGORIES.find(c => c.key === lesson.category)!;

  const next = () => {
    setIdx(i => (i + 1) % LESSONS.length);
    setExpanded(false);
  };
  const prev = () => {
    setIdx(i => (i - 1 + LESSONS.length) % LESSONS.length);
    setExpanded(false);
  };

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderRadius: 18,
      boxShadow: "0 2px 12px rgba(0,0,0,.06)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(135deg, #0f2d1f 0%, #1a4731 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🕌</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display',serif" }}>
              {t("Tawheed — Correct Creed", "التوحيد — العقيدة الصحيحة")}
            </div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600, marginTop: 1 }}>
              {t("Fundamentals of Islamic Monotheism", "أُسُس التوحيد الإسلامي")}
            </div>
          </div>
        </div>
        <button onClick={next} style={{
          background: "rgba(201,168,76,.15)", border: `1px solid ${GOLD}44`,
          borderRadius: 8, cursor: "pointer", padding: "5px 8px",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <RefreshCw style={{ width: 12, height: 12, color: GOLD }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>
            {t("Next", "التالي")}
          </span>
        </button>
      </div>

      <div style={{ padding: "16px" }}>
        {/* Category badge */}
        <div style={{ marginBottom: 12 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
            background: cat.color, color: cat.badge, border: `1px solid ${cat.border}`,
          }}>
            {t(cat.en, cat.ar)}
          </span>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: DARK_GREEN, fontFamily: "'Playfair Display',serif", lineHeight: 1.3 }}>
            {lesson.title}
          </h3>
          <p dir="rtl" style={{ margin: "4px 0 0", fontSize: 13, color: GOLD, fontFamily: "'Amiri',serif", lineHeight: 1.6 }}>
            {lesson.titleAr}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#4a7c59", lineHeight: 1.5 }}>
            {lesson.summary}
          </p>
        </div>

        {/* Quranic Proof */}
        <div style={{
          background: "#f0fff4", border: "1px solid #d4e8d4",
          borderRadius: 12, padding: "12px 14px", marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: MID_GREEN, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <span>📖</span> {t("Quranic Proof", "الدليل القرآني")}
          </div>
          <div dir="rtl" style={{
            fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 20, lineHeight: 2,
            color: DARK_GREEN, textAlign: "center", marginBottom: 8,
          }}>
            {lesson.quranicProof.ar}
          </div>
          <div style={{ fontSize: 12, color: "#276749", fontStyle: "italic", textAlign: "center", lineHeight: 1.5 }}>
            "{lesson.quranicProof.en}"
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textAlign: "center", marginTop: 4 }}>
            — {lesson.quranicProof.ref}
          </div>
        </div>

        {/* Hadith Proof */}
        <div style={{
          background: "#fffbeb", border: "1px solid #ffe082",
          borderRadius: 12, padding: "12px 14px", marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#b7791f", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <span>📜</span> {t("Hadith Evidence", "الدليل من السنة")}
          </div>
          <div dir="rtl" style={{
            fontFamily: "'Amiri',serif", fontSize: 16, lineHeight: 1.9,
            color: "#5d4037", textAlign: "center", marginBottom: 6,
          }}>
            {lesson.hadith.ar}
          </div>
          <div style={{ fontSize: 11, color: "#7a6030", fontStyle: "italic", textAlign: "center" }}>
            "{lesson.hadith.en}"
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#b7791f", textAlign: "center", marginTop: 3 }}>
            — {lesson.hadith.source}
          </div>
        </div>

        {/* Expand/collapse explanation */}
        <button onClick={() => setExpanded(v => !v)} style={{
          width: "100%", background: expanded ? "#f0f4f0" : "#f8fafb",
          border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: DARK_GREEN }}>
            {expanded ? t("Hide Explanation & Examples ↑", "إخفاء الشرح ↑") : t("Show Explanation & Live Examples ↓", "عرض الشرح والأمثلة ↓")}
          </span>
          {expanded
            ? <ChevronUp  style={{ width: 14, height: 14, color: MID_GREEN }} />
            : <ChevronDown style={{ width: 14, height: 14, color: MID_GREEN }} />
          }
        </button>

        {expanded && (
          <div style={{
            marginTop: 8, background: "#f8fafb", borderRadius: 12,
            border: `1px solid ${BORDER}`, padding: "14px",
          }}>
            {lesson.explanation.split("\n\n").map((para, i) => (
              <p key={i} style={{
                margin: i === 0 ? 0 : "10px 0 0",
                fontSize: 12, lineHeight: 1.7, color: "#374151",
                fontWeight: para.startsWith("LIVE EXAMPLE") || para.startsWith("KEY POINT") ? 600 : 400,
                color: para.startsWith("LIVE EXAMPLE") ? "#0f2d1f" : para.startsWith("KEY POINT") ? "#b7791f" : "#374151",
              }}>
                {para}
              </p>
            ))}
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 12 }}>
          {LESSONS.map((_, i) => (
            <button key={i} onClick={() => { setIdx(i); setExpanded(false); }} style={{
              width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
              background: i === idx ? GOLD : "#e5e7eb",
              border: "none", cursor: "pointer", padding: 0,
              transition: "width 0.2s, background 0.2s",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
