/*  src/components/dashboard/TawheedWidget.tsx
    Tawheed Daily Widget — rotates one lesson per day using dayOfYear()
    Covers: Three Categories of Tawheed · Nawaqid al-Islam · Usul al-Thalatha ·
            Arba'in Nawawi creed points · Al-Qawa'id al-Arba' · Shirk types ·
            Live real-world examples · Full Quran + authenticated Hadith evidence
*/
import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, AlertTriangle, Star, Layers } from "lucide-react";

const DARK_GREEN = "#0f2d1f";
const MID_GREEN  = "#1a4731";
const GOLD       = "#c9a84c";
const BORDER     = "rgba(15,45,31,0.1)";

const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE
// ─────────────────────────────────────────────────────────────────────────────
interface Lesson {
  module: "tawheed" | "nawaqid" | "usul" | "qawaid";
  moduleLabel: string;
  moduleIcon: "star" | "alert" | "book" | "layers";
  moduleBg: string;
  moduleBadge: string;
  moduleBorder: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  quranicProof: { ar: string; en: string; ref: string };
  hadith: { ar: string; en: string; source: string };
  explanation: string; // paragraphs separated by \n\n
}

// ─────────────────────────────────────────────────────────────────────────────
//  DATA — 30 lessons (one per day, cycling monthly)
// ─────────────────────────────────────────────────────────────────────────────
const LESSONS: Lesson[] = [

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE 1 — THREE CATEGORIES OF TAWHEED  (lessons 0–8)
  // ══════════════════════════════════════════════════════════════════════════
  {
    module: "tawheed", moduleLabel: "Tawheed al-Rububiyyah", moduleIcon: "star",
    moduleBg: "#e8f5e9", moduleBadge: "#2e7d32", moduleBorder: "#a5d6a7",
    titleEn: "Allah Alone Creates, Sustains & Controls",
    titleAr: "اللَّهُ وَحْدَهُ الخَالِقُ الرَّازِقُ المُدَبِّرُ",
    subtitleEn: "Affirming that no partner shares in Allah's lordship over all creation",
    quranicProof: {
      ar: "أَلَا لَهُ الْخَلْقُ وَالْأَمْرُ ۗ تَبَارَكَ اللَّهُ رَبُّ الْعَالَمِينَ",
      en: "Unquestionably, His is the creation and the command. Blessed is Allah, Lord of the worlds.",
      ref: "Quran 7:54"
    },
    hadith: {
      ar: "إِنَّ اللَّهَ صَنَعَ كُلَّ صَانِعٍ وَصَنْعَتَهُ",
      en: "Indeed Allah created every craftsman and his craft.",
      source: "Musnad Ahmad 7957 — Hudhayfa ibn Usayd · Silsilah al-Sahihah 1637"
    },
    explanation: `Tawheed al-Rububiyyah means singling out Allah in everything related to His Lordship — creation (khalq), ownership (mulk), sustenance (rizq), and control of all affairs (tadbeer). He alone brings the living from the dead and the dead from the living. He alone sends the wind that carries the clouds that drop the rain that grows the wheat that becomes your bread.

LIVE EXAMPLE: A surgeon performs a heart bypass. The scalpel, the surgeon's hands, the machine that circulates blood — these are all means (asbab). The actual mending of flesh, the survival of the patient, the return of the heartbeat — that is Allah's act. The Prophet Ibrahim (AS) declared: "And when I am ill, it is He who cures me." (26:80). A Muslim doctor says after a successful surgery: "Alhamdulillah, Allah cured him through my hands." This is Tawheed al-Rububiyyah in action.

LIVE EXAMPLE 2: You check your salary account and the payment is late. Panic sets in. Tawheed al-Rububiyyah is the cure. Allah is al-Razzaq — the Provider — and He does not forget. "And how many a creature carries not its own provision, but Allah provides for it and for you." (29:60). Your provision was written before your birth. Your employer is a means, not the source.

KEY POINT: Even the Quraysh mushrikeen acknowledged this category — they said: "If you ask them who created the heavens and the earth, they will certainly say: Allah." (39:38). This acknowledgement ALONE was not enough to make them Muslims. What was missing was Tawheed al-Uluhiyyah — worshipping Him alone.`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Rububiyyah", moduleIcon: "star",
    moduleBg: "#e8f5e9", moduleBadge: "#2e7d32", moduleBorder: "#a5d6a7",
    titleEn: "Al-Qadar — The Divine Decree",
    titleAr: "الإيمانُ بالقَضَاءِ والقَدَرِ",
    subtitleEn: "Nothing happens in creation except by Allah's prior knowledge, will, and decree",
    quranicProof: {
      ar: "مَا أَصَابَ مِن مُّصِيبَةٍ إِلَّا بِإِذْنِ اللَّهِ ۗ وَمَن يُؤْمِن بِاللَّهِ يَهْدِ قَلْبَهُ",
      en: "No disaster strikes except by permission of Allah. And whoever believes in Allah — He will guide his heart.",
      ref: "Quran 64:11"
    },
    hadith: {
      ar: "وَاعْلَمْ أَنَّ الأُمَّةَ لَوِ اجْتَمَعَتْ عَلَى أَنْ يَنْفَعُوكَ بِشَيْءٍ لَمْ يَنْفَعُوكَ إِلَّا بِشَيْءٍ قَدْ كَتَبَهُ اللَّهُ لَكَ، وَلَوِ اجْتَمَعُوا عَلَى أَنْ يَضُرُّوكَ بِشَيْءٍ لَمْ يَضُرُّوكَ إِلَّا بِشَيْءٍ قَدْ كَتَبَهُ اللَّهُ عَلَيْكَ",
      en: "Know that if the entire nation gathered to benefit you, they could not benefit you except with what Allah has already written for you. And if they gathered to harm you, they could not harm you except with what Allah has already written against you.",
      source: "Jami' al-Tirmidhi 2516 — Ibn Abbas رضي الله عنه · Sahih"
    },
    explanation: `The four pillars of Iman in al-Qadar are: (1) 'Ilm — Allah knew all things eternally before creation. (2) Kitabah — He wrote everything in al-Lawh al-Mahfoodh fifty thousand years before the heavens and earth were created. (3) Mashee'ah — nothing happens except by His will. (4) Khalq — He created everything, including human actions.

LIVE EXAMPLE: You work for years building a business. A flood destroys it overnight. The nafs says: "Why me? If only I had chosen a different location." Iman in Qadar says: this trial was written before you were born. Ibn Abbas (RA) narrates that the Prophet ﷺ told him: "The pen has been lifted and the pages have dried." Your response is NOT passivity — you rebuild with tawakkul — but it IS freedom from destructive regret. The Prophet ﷺ commanded: "If something befalls you, do not say: 'If only I had done so-and-so' — for 'if only' opens the door to the work of Shaytan." (Muslim 2664).

LIVE EXAMPLE 2: A student from a poor family gets into medical school against all odds. Every door that opened — the teacher who noticed them, the scholarship that appeared — was Allah's Qadar. "And it may be that you hate a thing which is good for you, and it may be that you love a thing which is bad for you. Allah knows, and you do not know." (2:216).

KEY POINT: Qadar does NOT eliminate accountability. We have real choices and are judged for them. When the companions asked the Prophet ﷺ: "Shall we not then rely on our decree and abandon action?" he said: "Act — for everyone is facilitated toward what they were created for." (Bukhari 4949). The decree and the effort both belong to Allah's plan.`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Uluhiyyah", moduleIcon: "star",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "The Meaning of Laa ilaaha illallaah",
    titleAr: "مَعْنَى لَا إِلٰهَ إِلَّا ٱللَّهُ",
    subtitleEn: "The greatest statement ever uttered — its negation and its affirmation",
    quranicProof: {
      ar: "فَاعْلَمْ أَنَّهُ لَا إِلَٰهَ إِلَّا اللَّهُ وَاسْتَغْفِرْ لِذَنبِكَ",
      en: "So know that there is no deity except Allah and ask forgiveness for your sin.",
      ref: "Quran 47:19"
    },
    hadith: {
      ar: "أَفْضَلُ مَا قُلْتُهُ أَنَا وَالنَّبِيُّونَ مِنْ قَبْلِي: لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ",
      en: "The best thing I and the prophets before me have said is: There is no deity except Allah, alone, with no partner.",
      source: "Muwatta Malik · Jami' al-Tirmidhi 3585 — Hasan Sahih"
    },
    explanation: `"Laa ilaaha" is the NEGATION — there is no true god, no being worthy of worship, no object deserving the heart's ultimate love, fear, hope, and obedience. "Illallaah" is the AFFIRMATION — except Allah. This is not merely a statement of existence ("there is no creator except Allah") — it is a declaration of exclusive devotion.

Ibn al-Qayyim wrote in Madarij al-Salikeen: "The heart cannot find rest, cannot find sweetness, cannot find peace, except in the love of Allah and turning to Him. And if it finds pleasure in other than Allah, that pleasure will eventually turn to pain and punishment."

LIVE EXAMPLE: A university student loves someone deeply — to the point that they cannot eat, sleep, or focus unless that person approves of them. Their happiness, their mood, their decisions — all revolve around this person. This is an "ilaah" (deity) the heart has set up. Tawheed al-Uluhiyyah does NOT say: "Don't love people." It says: the ultimate, controlling, decisive love must be for Allah. "And those who believe are strongest in love for Allah." (2:165). When the love of Allah is greatest, all other loves find their proper place beneath it.

LIVE EXAMPLE 2: A businessperson compromises their deen to secure a deal — they lie, deal in haram, or bribe — because they fear poverty more than they fear Allah. They have made wealth their "ilaah." Tawheed al-Uluhiyyah means: your fear, ultimately, must be of Allah alone. "So do not fear them, but fear Me." (2:150).

CONDITIONS of Laa ilaaha illallaah (scholars enumerated 7): Knowledge of its meaning · Certainty without doubt · Acceptance without rejection · Submission and compliance · Truthfulness from the heart · Sincerity (ikhlas) · Love of what it demands.`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Uluhiyyah", moduleIcon: "star",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Du'a is the Marrow of Worship",
    titleAr: "الدُّعَاءُ مُخُّ العِبَادَةِ",
    subtitleEn: "Directing supplication to other than Allah is shirk regardless of intention",
    quranicProof: {
      ar: "وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ ۚ إِنَّ الَّذِينَ يَسْتَكْبِرُونَ عَنْ عِبَادَتِي سَيَدْخُلُونَ جَهَنَّمَ دَاخِرِينَ",
      en: "And your Lord says: Call upon Me; I will respond to you. Indeed those who disdain My worship will enter Hellfire in humiliation.",
      ref: "Quran 40:60"
    },
    hadith: {
      ar: "الدُّعَاءُ هُوَ الْعِبَادَةُ",
      en: "Du'a is worship itself.",
      source: "Jami' al-Tirmidhi 2969 — Nu'man ibn Bashir رضي الله عنه · Sahih"
    },
    explanation: `In this verse, Allah equates calling upon Him (du'a) with worshipping Him ('ibadah). The equation is exact and total. Therefore, directing du'a to any being other than Allah — whether a prophet, angel, saint, or jinn — is directing worship to other than Allah. This is the definition of shirk al-akbar (major polytheism).

LIVE EXAMPLE: A Muslim visits the grave of a righteous scholar and says: "Ya Shaykh, my son is sick — please intercede for him and cure him." Even if the intention is love for the righteous, this is shirk. The dead cannot hear individual petitions (according to the majority of Ahl al-Sunnah based on 27:80 and 35:22: "You cannot make the dead hear"). The correct practice: STAND at the grave, make du'a TO ALLAH, ask Allah for HIS mercy, and for the mercy shown to the deceased. Then ask Allah for your own need — directly, with no intermediary.

LIVE EXAMPLE 2: A student before a major exam says under their breath: "Ya Rasulallah, help me pass." This is a widespread practice that contradicts Tawheed. What IS correct and beautiful: "Allahumma salli 'ala Muhammad" — asking ALLAH to honour His prophet. Then: "Ya Allah, make this easy for me." The distinction is: we ask ALLAH for everything. We ask Him to bless His prophet. We do not ask the prophet for things — because that is asking the prophet to fulfill the role of Allah.

Du'a contains within it: love (you call on who you love), hope (you expect response), fear (you fear rejection), humility (you lower yourself). All of these belong to Allah. "And to Allah belong the best names, so call upon Him by them." (7:180).`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Uluhiyyah", moduleIcon: "star",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Shirk al-Asghar — The Hidden Destroyer",
    titleAr: "الشِّرْكُ الأَصْغَرُ — الرِّيَاءُ",
    subtitleEn: "Doing deeds for people's approval alongside Allah — the most feared corruption",
    quranicProof: {
      ar: "فَمَن كَانَ يَرْجُو لِقَاءَ رَبِّهِ فَلْيَعْمَلْ عَمَلًا صَالِحًا وَلَا يُشْرِكْ بِعِبَادَةِ رَبِّهِ أَحَدًا",
      en: "So whoever hopes to meet his Lord — let him do righteous work and not associate in the worship of his Lord anyone.",
      ref: "Quran 18:110"
    },
    hadith: {
      ar: "إِنَّ أَخْوَفَ مَا أَخَافُ عَلَيْكُمُ الشِّرْكُ الأَصْغَرُ. قَالُوا: وَمَا الشِّرْكُ الأَصْغَرُ يَا رَسُولَ اللَّهِ؟ قَالَ: الرِّيَاءُ",
      en: "The thing I fear most for you is minor shirk. They asked: What is minor shirk, O Messenger of Allah? He said: Showing off (riya').",
      source: "Musnad Ahmad 23119 — Mahmud ibn Labid · Sahih li-ghayrihi"
    },
    explanation: `Minor shirk does not take a person out of Islam but it DESTROYS the deeds it contaminates. In a Hadith Qudsi, Allah says on the Day of Judgment: "I am the most self-sufficient, free of any need for a partner. Whoever does a deed associating anything with Me — I leave him and his shirk." (Muslim 2985). The deed is entirely void. Not halved. Not reduced. Gone.

LIVE EXAMPLE: A student at Tahleem Academy recites Quran beautifully when the teacher is present, pouring emotion into every word. Alone at home, they rush through it carelessly. This is a symptom of riya'. The cure is not to stop reciting well publicly — it is to recite equally well in private. Ibn al-Qayyim's test: "Does your 'ibadah increase when people are watching? Then you are worshipping their gaze alongside Allah."

LIVE EXAMPLE 2: Someone gives sadaqah publicly and loves that people see them as generous. They also love Allah. This mixture is dangerous. The Prophet ﷺ said: "Whoever prays to be seen will be [only] seen. Whoever fasts to be seen will be [only] seen." (Bukhari 6499). The cure is to increase SECRET acts of worship — the prayer no one knows about, the sadaqah given so privately that the left hand does not know what the right gave.

LIVE EXAMPLE 3: In today's world — social media posts about tahajjud, sharing one's fasting, broadcasting one's charity. The scholars warn: sharing good deeds can be permissible if the intention is to inspire others AND the heart is checked. But when the motivation is the "likes" — the dopamine from approval — it has entered riya'. Check your intention BEFORE posting, not after.`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Uluhiyyah", moduleIcon: "star",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Love, Fear & Hope — The Three Wings of Worship",
    titleAr: "المَحَبَّةُ والخَوْفُ والرَّجَاءُ — أُسُسُ العِبَادَةِ",
    subtitleEn: "Worship rides on three inseparable wings — without all three, it collapses",
    quranicProof: {
      ar: "أُولَٰئِكَ الَّذِينَ يَدْعُونَ يَبْتَغُونَ إِلَىٰ رَبِّهِمُ الْوَسِيلَةَ أَيُّهُمْ أَقْرَبُ وَيَرْجُونَ رَحْمَتَهُ وَيَخَافُونَ عَذَابَهُ ۚ إِنَّ عَذَابَ رَبِّكَ كَانَ مَحْذُورًا",
      en: "Those they call upon seek means of nearness to their Lord, and hope for His mercy and fear His punishment. Indeed the punishment of your Lord is to be feared.",
      ref: "Quran 17:57"
    },
    hadith: {
      ar: "لَوْ يَعْلَمُ الْمُؤْمِنُ مَا عِنْدَ اللَّهِ مِنَ الْعُقُوبَةِ مَا طَمِعَ فِي جَنَّتِهِ أَحَدٌ، وَلَوْ يَعْلَمُ الْكَافِرُ مَا عِنْدَ اللَّهِ مِنَ الرَّحْمَةِ مَا قَنَطَ مِنْ جَنَّتِهِ أَحَدٌ",
      en: "If the believer knew what punishment Allah has, no one would hope for His Paradise. And if the disbeliever knew what mercy Allah has, no one would despair of His Paradise.",
      source: "Sahih Muslim 2755 — Abu Hurayrah رضي الله عنه"
    },
    explanation: `Ibn al-Qayyim described worship as a bird: the head is LOVE for Allah, one wing is HOPE in His mercy, the other wing is FEAR of His punishment. Without the head, there is no life. Without both wings, the bird cannot fly. A worshipper who only has fear becomes despairing, harsh, and prone to extremism. One who only has hope becomes heedless, sinning freely and claiming "Allah is merciful." The one with only love but no fear ends up following their desires while calling it "love of Allah."

LIVE EXAMPLE — FEAR WITHOUT HOPE: A young person commits a major sin and says: "I am finished. Allah will never forgive me." This is the sin of despair (qunut) — which the Quran explicitly condemns: "Indeed, no one despairs of the mercy of Allah except the disbelieving people." (12:87). Shaytan's greatest trick after tempting you to sin is to convince you that tawbah is useless. It is a lie. "Say: O My servants who have transgressed against themselves — do not despair of the mercy of Allah. Indeed Allah forgives all sins." (39:53).

LIVE EXAMPLE — HOPE WITHOUT FEAR: A student prays when convenient, misses Fajr regularly, watches what is haram, but says: "Allah is al-Ghafoor, al-Raheem — He will forgive me." This is ghuroor (delusion). The Prophet ﷺ defined the intelligent person as "one who controls his nafs and works for what comes after death." (Tirmidhi 2459 — Hasan). The mercy of Allah is real and vast — but it is for those who strive, repent, and try. "Indeed, those who have believed and done righteous deeds — their Lord will guide them because of their faith." (10:9).`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Asmaa' wa al-Sifaat", moduleIcon: "star",
    moduleBg: "#f3e5f5", moduleBadge: "#6b21a8", moduleBorder: "#ce93d8",
    titleEn: "Allah's Names & Attributes — The Salafi Methodology",
    titleAr: "أَسْمَاءُ اللَّهِ وَصِفَاتُهُ — مَنْهَجُ السَّلَفِ",
    subtitleEn: "Affirm what Allah affirmed, deny what He denied — without asking 'how'",
    quranicProof: {
      ar: "لَيْسَ كَمِثْلِهِ شَيْءٌ ۖ وَهُوَ السَّمِيعُ الْبَصِيرُ",
      en: "There is nothing like unto Him, and He is the All-Hearing, the All-Seeing.",
      ref: "Quran 42:11"
    },
    hadith: {
      ar: "إِنَّ لِلَّهِ تِسْعَةً وَتِسْعِينَ اسْمًا مِئَةً إِلَّا وَاحِدًا مَنْ أَحْصَاهَا دَخَلَ الْجَنَّةَ",
      en: "Allah has 99 names. Whoever encompasses them will enter Paradise.",
      source: "Sahih al-Bukhari 2736 — Abu Hurayrah رضي الله عنه"
    },
    explanation: `The four errors to avoid regarding Allah's names and attributes:
1. TA'TEEL (denial): Saying "Allah has no hand, no face" despite the Quran's clear statements. This empties the attributes of meaning.
2. TAHRIF (distortion): Re-interpreting "hand" as "power" or "grace" without evidence — changing the clear Arabic meaning.
3. TAMTHEEL (comparison): Saying "Allah's hand is like a human hand" — comparing the Creator to creation.
4. TAKYEEF (asking how): Speculating on the exact nature of how Allah's attributes exist.

IMAM MALIK'S GOLD STANDARD: He was asked about Allah's rising over the Throne (istiwa — 20:5). He said: "Al-istiwa is known (linguistically — it means to rise above), the HOW is unknown, believing in it is obligatory, and asking about it is an innovation (bid'ah)." This single answer contains the entire Salafi methodology.

LIVE EXAMPLE: Someone reads "The Hand of Allah is above their hands" (48:10) and says: "This means Allah has a physical hand like ours." That is tamtheel — forbidden. Another says: "This means Allah's power or blessing — it has no literal meaning." That is ta'teel (ta'weel without evidence) — also forbidden. The correct position: Allah has a Hand that befits His Majesty — real, not metaphorical — but unlike any created hand. "There is nothing like unto Him." (42:11).

LIVE EXAMPLE 2: When you say in du'a "Ya Allah, You are as-Sami' (All-Hearing)" — you are affirming that Allah truly hears, with a Hearing that befits His Majesty, unlike any hearing of creation. This gives the du'a life. You are not speaking into a void. You are calling on a Lord who actually, truly, literally hears you — right now — more clearly than anyone ever has.`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Asmaa' wa al-Sifaat", moduleIcon: "star",
    moduleBg: "#f3e5f5", moduleBadge: "#6b21a8", moduleBorder: "#ce93d8",
    titleEn: "Al-Hayy al-Qayyum — Ayat al-Kursi",
    titleAr: "الحَيُّ القَيُّومُ — آيَةُ الكُرْسِيِّ",
    subtitleEn: "The greatest verse in the Quran — why these two names contain all of Tawheed",
    quranicProof: {
      ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ",
      en: "Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth.",
      ref: "Quran 2:255 — Ayat al-Kursi"
    },
    hadith: {
      ar: "مَنْ قَرَأَ آيَةَ الْكُرْسِيِّ فِي دُبُرِ كُلِّ صَلَاةٍ مَكْتُوبَةٍ لَمْ يَمْنَعْهُ مِنْ دُخُولِ الْجَنَّةِ إِلَّا أَنْ يَمُوتَ",
      en: "Whoever recites Ayat al-Kursi after every obligatory prayer — nothing prevents him from entering Paradise except death.",
      source: "Al-Nasa'i — Ibn Hibban 2005 · Sahih li-ghayrihi"
    },
    explanation: `Al-Hayy: His life is perfect and eternal. He was never born, will never die, is never weakened, tired, or distracted. Every "living" thing in creation received a borrowed portion of life. Allah's life is the source. Al-Qayyum: He is completely self-subsistent — He depends on nothing — while everything in existence depends on Him every single moment. Ibn al-Qayyim wrote: "Were Allah to withhold His qayyumiyyah from the heavens and earth for a single moment, they would vanish instantly."

LIVE EXAMPLE — THE NIGHT: You are alone at night. The house is dark and quiet. Fear creeps in. Tawheed through these names is your shield. Al-Hayy: He is not asleep. "Neither drowsiness overtakes Him nor sleep." (2:255). Al-Qayyum: He is not distracted by the billions of people also awake right now — He is fully, completely attentive to you. Recite Ayat al-Kursi. Not as a magical formula — but with understanding: you are reminding yourself of who your Lord is.

LIVE EXAMPLE 2: The greatest du'a in the authenticated Sunnah uses these two names. Anas ibn Malik narrates that the Prophet ﷺ heard a man supplicating: "Allahumma inni as'aluka bi-annaka antal-Hamid... al-Hayy al-Qayyum." The Prophet ﷺ said: "He has called upon Allah by His Greatest Name (al-ism al-a'zam) — the one by which, if called upon, He responds; and by which, if asked, He gives." (Abu Dawud 1495 · Tirmidhi 3544 — Sahih).

The prescription of the Prophet ﷺ for anxiety and worry: "O Living, O Self-Sustaining — by Your mercy I seek help. Rectify for me all my affairs and do not leave me to myself even for the blink of an eye." (Hakim 1/730 — Sahih).`
  },

  {
    module: "tawheed", moduleLabel: "Tawheed al-Uluhiyyah", moduleIcon: "star",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Tawakkul — Complete Reliance on Allah",
    titleAr: "التَّوَكُّلُ عَلَى اللَّهِ حَقَّ تَوَكُّلِهِ",
    subtitleEn: "True tawakkul combines full effort with complete trust — neither passivity nor self-reliance",
    quranicProof: {
      ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ۚ إِنَّ اللَّهَ بَالِغُ أَمْرِهِ ۚ قَدْ جَعَلَ اللَّهُ لِكُلِّ شَيْءٍ قَدْرًا",
      en: "And whoever relies upon Allah — then He is sufficient for him. Indeed, Allah will accomplish His purpose. Allah has already set for everything a decreed extent.",
      ref: "Quran 65:3"
    },
    hadith: {
      ar: "لَوْ أَنَّكُمْ كُنْتُمْ تَوَكَّلُونَ عَلَى اللَّهِ حَقَّ تَوَكُّلِهِ لَرُزِقْتُمْ كَمَا يُرْزَقُ الطَّيْرُ، تَغْدُو خِمَاصًا وَتَرُوحُ بِطَانًا",
      en: "If you relied upon Allah with true reliance, He would provide for you as He provides for the birds — they go out hungry in the morning and return full in the evening.",
      source: "Jami' al-Tirmidhi 2344 — Umar ibn al-Khattab رضي الله عنه · Sahih"
    },
    explanation: `Tawakkul is NOT: sitting home, making no effort, and saying "Allah will provide." When the Prophet ﷺ was asked about the birds, notice: THEY GO OUT. They leave the nest. They search. They expend effort. But their reliance is on Allah's provision, not on their own wings. Ibn al-Qayyim defined true tawakkul as: "The heart's firm reliance on Allah to bring about benefit and prevent harm — while using every available means."

LIVE EXAMPLE: A student at Tahleem has exams. Tawakkul means: they study their maximum, attend every class, review their notes, prepare their schedule — AND they pray two rak'ahs before sitting down, make sincere du'a, and when the result comes, whether pass or fail, they say: "This is what Allah decreed for me, and He knows better than I do." What is NOT tawakkul: skipping study because "Allah will help me" — the Prophet ﷺ told the man who left his camel untied: "Tie it and then put your trust in Allah." (Tirmidhi 2517).

LIVE EXAMPLE 2: A business faces bankruptcy. The owner has done everything humanly possible — restructured, sought advice, cut costs. Tawakkul now means: "Ya Allah, You are al-Fattah (the Opener). You alone can open a door I cannot see. I have done what I can. I place this in Your hands." Ibrahim (AS) was thrown into a fire. Jibreel AS came and offered help. Ibrahim AS said: "From you, no. But from Allah — yes." Allah said: "O fire — be cool and safe for Ibrahim." (21:69). No means could have solved that problem. Tawakkul unlocked what no plan could.`
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE 2 — AL-USUL AL-THALATHA  (lessons 9–14)
  // ══════════════════════════════════════════════════════════════════════════
  {
    module: "usul", moduleLabel: "Al-Usul al-Thalatha", moduleIcon: "book",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "The Three Fundamental Questions of the Grave",
    titleAr: "الأُصُولُ الثَّلاثَةُ — سُؤَالُ الْقَبْرِ",
    subtitleEn: "Every soul will be asked three questions — Sheikh al-Islam Ibn Abd al-Wahhab",
    quranicProof: {
      ar: "يُثَبِّتُ اللَّهُ الَّذِينَ آمَنُوا بِالْقَوْلِ الثَّابِتِ فِي الْحَيَاةِ الدُّنْيَا وَفِي الْآخِرَةِ",
      en: "Allah keeps firm those who believe with the firm word in worldly life and in the Hereafter.",
      ref: "Quran 14:27"
    },
    hadith: {
      ar: "إِنَّ الْمَيِّتَ إِذَا وُضِعَ فِي قَبْرِهِ... يَأْتِيهِ مَلَكَانِ... فَيَقُولَانِ: مَنْ رَبُّكَ؟ مَا دِينُكَ؟ مَنْ نَبِيُّكَ؟",
      en: "When the deceased is placed in his grave, two angels come to him and say: Who is your Lord? What is your religion? Who is your Prophet?",
      source: "Musnad Ahmad 18534 — Abu Hurayrah رضي الله عنه · Sahih"
    },
    explanation: `Sheikh Muhammad ibn Abd al-Wahhab رحمه الله structured his foundational treatise "Al-Usul al-Thalatha" (The Three Fundamentals) around these three grave questions:

FIRST: "Man Rabbuk?" — Who is your Lord? Answer: My Lord is Allah. He created me, provided for me, and I worship none but Him. Evidence: "Say: Is it other than Allah I should desire as a lord?" (6:164). This requires KNOWING Allah through His names, attributes, and acts — not just saying the word.

SECOND: "Ma deenuk?" — What is your religion? Answer: My religion is Islam — submission to Allah with tawheed, compliance through obedience, and disavowal of shirk and its people. This is not a passport category. It is a complete way of life submitted to the one you answered in question one.

THIRD: "Man nabiyyuk?" — Who is your Prophet? Answer: Muhammad ﷺ. This requires KNOWING him — his life, his seerah, his sunnah, his character — not just his name.

LIVE EXAMPLE: The scholars say that the only preparation for these questions is LIVING them in dunya. If you lived as though Allah is your Lord — praying to Him, obeying Him, fearing Him — the answer will come with thabat (firmness). If Allah was merely a name on your ID and Islam was merely culture, the tongue will falter. The Prophet ﷺ said the munafiq and the one in doubt will say: "Ha ha ha — I don't know! I heard people saying something and I said it." (Bukhari 1374).

The du'a for the deceased: "Allahumma thabbithu" — O Allah, keep him firm. We say it at funerals. It is also the du'a you should say for yourself — now, while alive — because firmness at death begins with firmness in life.`
  },

  {
    module: "usul", moduleLabel: "Al-Usul al-Thalatha", moduleIcon: "book",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "Knowing Your Lord — Ma'rifatullah",
    titleAr: "مَعْرِفَةُ الرَّبِّ — بِأُلُوهِيَّتِهِ وَرُبُوبِيَّتِهِ",
    subtitleEn: "You cannot worship what you do not know — knowing Allah is the foundation of all worship",
    quranicProof: {
      ar: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ",
      en: "And I did not create the jinn and mankind except to worship Me.",
      ref: "Quran 51:56"
    },
    hadith: {
      ar: "حَقُّ اللَّهِ عَلَى الْعِبَادِ أَنْ يَعْبُدُوهُ وَلَا يُشْرِكُوا بِهِ شَيْئًا",
      en: "The right of Allah upon His servants is that they worship Him and associate nothing with Him.",
      source: "Sahih al-Bukhari 2856 · Sahih Muslim 30 — Mu'adh ibn Jabal رضي الله عنه"
    },
    explanation: `Sheikh Ibn Abd al-Wahhab رحمه الله opens Al-Usul al-Thalatha with: "Know — may Allah have mercy on you — that it is obligatory upon every Muslim man and woman to learn four matters: Knowledge (ilm), Acting upon it (amal), Calling to it (da'wah), and Patience upon the harm that comes with that (sabr)."

The first obligation of knowledge is to know Allah: who He is, what He deserves, what He commands. Ibn al-Qayyim wrote: "The key to the door of happiness and success is knowledge of Allah." A person who prays five times without knowing what "al-Rabb" means is like someone performing surgery having never studied anatomy.

LIVE EXAMPLE: Two students both recite "Subhana Rabbiyal Azeemi" in ruku'. Student A says it automatically, their mind on their phone. Student B pauses after the first "Subhana" — and reflects: "I am declaring that my Rabb (the One who created me, sustains me, controls my tomorrow) is 'Azeem — Mighty, in a way nothing in existence can approach." Who has achieved the purpose of that ruku'?

LIVE EXAMPLE 2: A person says: "I believe in Allah" — but they believe in a God who is distant, indifferent, and unknowable. This is not the Allah of the Quran. The Allah of the Quran says: "We are closer to him than his jugular vein." (50:16). "And when My servants ask you about Me — I am near." (2:186). Ma'rifatullah — KNOWING Allah — transforms prayer from routine to conversation, sadaqah from tax to love, and difficulty from punishment to training.`
  },

  {
    module: "usul", moduleLabel: "Al-Usul al-Thalatha", moduleIcon: "book",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "Knowing Your Prophet — Ma'rifat al-Nabi ﷺ",
    titleAr: "مَعْرِفَةُ النَّبِيِّ مُحَمَّدٍ ﷺ",
    subtitleEn: "Knowing who sent him, what he came with, and why obedience to him is obedience to Allah",
    quranicProof: {
      ar: "مَّن يُطِعِ الرَّسُولَ فَقَدْ أَطَاعَ اللَّهَ",
      en: "Whoever obeys the Messenger has obeyed Allah.",
      ref: "Quran 4:80"
    },
    hadith: {
      ar: "لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى أَكُونَ أَحَبَّ إِلَيْهِ مِنْ وَالِدِهِ وَوَلَدِهِ وَالنَّاسِ أَجْمَعِينَ",
      en: "None of you truly believes until I am more beloved to him than his father, his child, and all of mankind.",
      source: "Sahih al-Bukhari 15 — Anas ibn Malik رضي الله عنه"
    },
    explanation: `The third fundamental question is: "Who is your Prophet?" Answering this correctly requires knowing: (1) He is Muhammad ibn Abdillah ﷺ, from Makkah, sent to all mankind and jinn. (2) He received wahy (divine revelation) — Quran and Sunnah. (3) Obedience to him is part of Tawheed — not in addition to it. (4) Loving him is a condition of faith — not a cultural extra.

LIVE EXAMPLE: A Muslim says: "I follow the Quran only — I don't need Hadith." This contradicts Al-Usul al-Thalatha. The Quran itself commands: "And whatever the Messenger gives you — take it. And what he forbids you — refrain from it." (59:7). The Quran tells us to pray — the Prophet ﷺ showed us HOW. The Quran tells us to perform Hajj — the Prophet ﷺ showed us the rites: "Take your Hajj rituals from me." (Muslim 1297). Rejecting the Sunnah is rejecting part of the message.

LIVE EXAMPLE 2: A young Muslim says: "I love the Prophet ﷺ" — but they do not follow his sunnah in prayer, in character, in honesty. Ibn al-Qayyim's sharp test: "If your love of the Prophet ﷺ is true, you will follow him — for the one who loves obeys the beloved." Allah says: "Say: If you love Allah, follow me — Allah will love you." (3:31). Love is proven by following, not only by feeling.

The Prophet ﷺ was sent with two things: al-huda (guidance) and deen al-haq (the true religion) — "to manifest it over all religions, even if the polytheists dislike it." (9:33). His mission was not to reform Arab culture. It was to deliver the final, complete revelation and embody it in human form. "And indeed you are of great moral character." (68:4).`
  },

  {
    module: "usul", moduleLabel: "Al-Usul al-Thalatha", moduleIcon: "book",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "Knowing Your Religion — Ma'rifat al-Islam",
    titleAr: "مَعْرِفَةُ الإِسْلَامِ بِالأَدِلَّةِ",
    subtitleEn: "Islam is submission with tawheed, obedience without defiance, and rejection of shirk",
    quranicProof: {
      ar: "إِنَّ الدِّينَ عِندَ اللَّهِ الْإِسْلَامُ",
      en: "Indeed the religion in the sight of Allah is Islam.",
      ref: "Quran 3:19"
    },
    hadith: {
      ar: "الإِسْلَامُ أَنْ تَشْهَدَ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَتُقِيمَ الصَّلَاةَ، وَتُؤْتِيَ الزَّكَاةَ، وَتَصُومَ رَمَضَانَ، وَتَحُجَّ الْبَيْتَ إِنِ اسْتَطَعْتَ إِلَيْهِ سَبِيلًا",
      en: "Islam is to testify that there is no deity but Allah and Muhammad is His Messenger, to establish prayer, to give zakah, to fast Ramadan, and to perform Hajj if you have the means.",
      source: "Sahih Muslim 8 — Umar ibn al-Khattab رضي الله عنه · Hadith Jibreel"
    },
    explanation: `Sheikh Ibn Abd al-Wahhab رحمه الله defines Islam in three levels, each built on the previous: (1) ISLAM — the outward submission (the five pillars). (2) IMAN — the inward conviction (the six pillars of belief). (3) IHSAN — worshipping Allah as though you see Him, for if you do not see Him, He sees you.

The definition of Islam has three components:
AL-INQIYAD (submission): acting on what Allah commands — not just agreeing with it intellectually.
AL-IKHLАС (sincerity): doing it for Allah alone, not for culture, family pressure, or appearance.
AL-BARA' (disavowal): rejecting shirk and its people — not worshipping alongside Allah.

LIVE EXAMPLE: A student from a Muslim family performs all five pillars — but does so entirely out of cultural obligation. They do not pray when alone. They do not believe it makes a difference. This is outward Islam without inward Iman. The munafiqun of Madinah did exactly this. The Quran says: "When they meet those who believe, they say: We believe. But when they are alone with their shayateen, they say: We are with you — we were only mocking." (2:14).

LIVE EXAMPLE 2: Someone converts to Islam and everyone praises their courage. Six months later, the reality hits: this deen requires real change — in habits, in relationships, in how money is earned, in what is watched. This is the test of INQIYAD. "And among the people is he who worships Allah on an edge — if good comes to him, he is reassured; but if trial befalls him, he turns on his face [away from Islam]." (22:11). The solution is deep knowledge of why — WHY these commands are from the Wisest, Most Merciful Creator.`
  },

  {
    module: "usul", moduleLabel: "Al-Usul al-Thalatha", moduleIcon: "book",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "The Four Obligations Before Any Other Knowledge",
    titleAr: "الأُمُورُ الأَرْبَعَةُ الوَاجِبَةُ",
    subtitleEn: "Knowledge · Action · Calling · Patience — the order is not accidental",
    quranicProof: {
      ar: "وَالْعَصْرِ ﴿١﴾ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ ﴿٢﴾ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ",
      en: "By time — indeed mankind is in loss — except those who believe, do righteous deeds, enjoin truth upon each other, and enjoin patience upon each other.",
      ref: "Quran 103:1-3"
    },
    hadith: {
      ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ",
      en: "Seeking knowledge is an obligation upon every Muslim.",
      source: "Ibn Majah 224 — Anas ibn Malik رضي الله عنه · Sahih"
    },
    explanation: `Imam al-Shafi'i رحمه الله said: "If Allah had revealed no proof upon His creation except this surah (al-Asr), it would have been sufficient for them." It contains the entire program of salvation in three verses.

Sheikh Ibn Abd al-Wahhab رحمه الله derives four obligations from it:
1. KNOWLEDGE (ilm) — corresponds to "those who believe" — Iman cannot be sound without knowledge.
2. ACTION (amal) — "do righteous deeds" — knowledge without action is proof against you, not for you.
3. DA'WAH (calling to truth) — "enjoin truth upon each other" — knowledge and action create an obligation to share.
4. SABR (patience) — "enjoin patience upon each other" — because knowledge, action, and da'wah will bring harm.

LIVE EXAMPLE: A student learns that music is haram according to many scholars. The four-step obligation: (1) KNOWLEDGE: verify this from evidence, understand the scholarly positions. (2) ACTION: stop listening — the knowledge now obligates action on oneself first. (3) DA'WAH: gently share this understanding with others when appropriate — not harshly, not publicly shaming. (4) SABR: when friends mock, when culture pushes back, when it is hard — be patient. This four-step framework applies to every piece of Islamic knowledge you acquire.

LIVE EXAMPLE 2: A scholar once said: "The greatest tragedy is the scholar who knows but does not act, and the greatest betrayal is the one who acts but does not know WHY." Enrolling in Tahleem Academy is step one — ilm. But the purpose is the full four. "Allah will raise those who have believed among you and those who were given knowledge by degrees." (58:11).`
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE 3 — NAWAQID AL-ISLAM  (lessons 15–21)
  // ══════════════════════════════════════════════════════════════════════════
  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "What Nullifies Islam — Introduction",
    titleAr: "نَوَاقِضُ الإِسْلَامِ — المُقَدِّمَةُ",
    subtitleEn: "Ten nullifiers that break the covenant — not to create fear but to create protective awareness",
    quranicProof: {
      ar: "وَلَقَدْ أُوحِيَ إِلَيْكَ وَإِلَى الَّذِينَ مِن قَبْلِكَ لَئِنْ أَشْرَكْتَ لَيَحْبَطَنَّ عَمَلُكَ وَلَتَكُونَنَّ مِنَ الْخَاسِرِينَ",
      en: "And it has already been revealed to you and to those before you that if you should associate [anything] with Allah, your work would surely become worthless, and you would surely be among the losers.",
      ref: "Quran 39:65"
    },
    hadith: {
      ar: "مَنْ بَدَّلَ دِينَهُ فَاقْتُلُوهُ",
      en: "Whoever changes his religion — deal with him accordingly.",
      source: "Sahih al-Bukhari 3017 — Ibn Abbas رضي الله عنه"
    },
    explanation: `Sheikh Muhammad ibn Abd al-Wahhab رحمه الله compiled the ten greatest nullifiers of Islam in his famous epistle "Nawaqid al-Islam." He wrote it not to make Muslims paranoid — but because the biggest threat to a believing heart is not an external enemy but internal deviation that a person may not recognise.

The Nawaqid are divided into:
- Those of the HEART (al-i'tiqad) — wrong beliefs
- Those of the TONGUE (al-qawl) — speech that constitutes kufr
- Those of ACTION (al-amal) — deeds that nullify Islam

IMPORTANT PRINCIPLE: A nullifier requires CONDITIONS to be established against a specific individual: (1) Knowledge — the person knew it was haram. (2) Intention — they chose it deliberately. (3) No coercion — they were not forced. And (4) no valid scholarly interpretation — their action was not based on a legitimate scholarly view. This protects against rashly declaring Muslims as non-Muslims (takfir) — one of the most dangerous errors in contemporary Islam.

LIVE EXAMPLE: Someone commits one of these nullifiers in ignorance. The scholars distinguish: ignorance that is excusable (the new Muslim, the person in a remote area who received no knowledge) versus wilful ignorance (the person surrounded by Islamic scholars who refused to learn). The Prophet ﷺ said: "Allah overlooks errors, forgetfulness, and what people are compelled to do." (Ibn Majah 2045 — Sahih). Knowledge of the Nawaqid creates vigilance, not terror.`
  },

  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam — Nullifier 1", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Shirk with Allah in His Worship",
    titleAr: "الشِّرْكُ بِاللَّهِ فِي عِبَادَتِهِ",
    subtitleEn: "The first and greatest nullifier — calling on or dedicating any act of worship to other than Allah",
    quranicProof: {
      ar: "إِنَّهُ مَن يُشْرِكْ بِاللَّهِ فَقَدْ حَرَّمَ اللَّهُ عَلَيْهِ الْجَنَّةَ وَمَأْوَاهُ النَّارُ",
      en: "Indeed, he who associates others with Allah — Allah has forbidden him Paradise, and his refuge is the Fire.",
      ref: "Quran 5:72"
    },
    hadith: {
      ar: "مَنْ لَقِيَ اللَّهَ لَا يُشْرِكُ بِهِ شَيْئًا دَخَلَ الْجَنَّةَ، وَمَنْ لَقِيَهُ يُشْرِكُ بِهِ شَيْئًا دَخَلَ النَّارَ",
      en: "Whoever meets Allah associating nothing with Him will enter Paradise. Whoever meets Him associating something with Him will enter the Fire.",
      source: "Sahih Muslim 93 — Jabir ibn Abdillah رضي الله عنه"
    },
    explanation: `This is the first nullifier because it is the greatest sin. Shirk in worship means: slaughtering for other than Allah (even saying "bismillah" doesn't fix it if the slaughter is INTENDED for a saint or jinn). Prostrating to other than Allah. Making vows (nadhr) to other than Allah. Fearing something other than Allah in a way that governs one's actions more than fear of Allah.

LIVE EXAMPLE — SLAUGHTER: In parts of the Muslim world, when someone is ill or facing misfortune, an animal is slaughtered "for the wali" (saint) of a local shrine. This is the exact practice the Prophet ﷺ condemned: "Allah curses the one who slaughters for other than Allah." (Muslim 1978). The replacement is clear: "Allahumma hadhihi minka wa laka" — O Allah, this is from You and for You. Slaughter for Allah. Give the meat to the poor. The sadaqah (charity) is the benefit, not the blood.

LIVE EXAMPLE 2 — VOWS TO OTHER THAN ALLAH: "I vow to give 100 kg of rice to the shrine of X if my son recovers." This is a vow to other than Allah — a nullifier. The correct form: "Ya Allah, if You cure my son, I will give 100 kg of rice to the poor as sadaqah for Your sake." The outcome of sadaqah is identical. But the direction of the vow is entirely different — and that direction is everything.

LIVE EXAMPLE 3 — TALISMAN SHIRK: Wearing an amulet (tameemah) believing it independently protects from harm — "The Prophet ﷺ said: Whoever wears a tameemah has committed shirk." (Ahmad 16951 — Sahih). The cure: complete reliance on Allah's names and the Quranic adhkar (Ayat al-Kursi, Mu'awwidhat) — which are protection by Allah's permission, not by intrinsic power.`
  },

  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam — Nullifier 2 & 3", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Intermediaries & Doubting the Kuffar",
    titleAr: "الوَاسِطَةُ والشَّكُّ في كُفْرِ المُشْرِكِينَ",
    subtitleEn: "Setting up intermediaries between oneself and Allah — and failing to declare shirk as shirk",
    quranicProof: {
      ar: "وَالَّذِينَ اتَّخَذُوا مِن دُونِهِ أَوْلِيَاءَ مَا نَعْبُدُهُمْ إِلَّا لِيُقَرِّبُونَا إِلَى اللَّهِ زُلْفَىٰ",
      en: "Those who take protectors besides Him [say]: We only worship them so that they may bring us closer to Allah.",
      ref: "Quran 39:3"
    },
    hadith: {
      ar: "مَنْ أَتَى كَاهِنًا أَوْ عَرَّافًا فَصَدَّقَهُ بِمَا يَقُولُ فَقَدْ كَفَرَ بِمَا أُنزِلَ عَلَى مُحَمَّدٍ",
      en: "Whoever goes to a soothsayer or fortune-teller and believes what he says has disbelieved in what was revealed to Muhammad.",
      source: "Abu Dawud 3904 — Abu Hurayrah رضي الله عنه · Sahih"
    },
    explanation: `NULLIFIER 2: Setting up intermediaries between oneself and Allah to "get closer" — making du'a through saints, asking the dead to intercede directly. This was the justification of the Qurayshi mushrikeen: "We only worship them so they may bring us closer to Allah." (39:3). Allah rejected this justification completely and called them mushrikeen (polytheists). The reasoning sounds pious. The outcome is shirk.

The PERMITTED intercession: Asking a LIVING person to make du'a FOR you — this is wassilah (means) through a living human being. "O Prophet — when they have wronged themselves — if they come to you and ask Allah's forgiveness, and the Messenger asks forgiveness for them — they will find Allah Most Accepting, Most Merciful." (4:64). This verse describes coming to the living Prophet ﷺ in his lifetime to ask him to make du'a. It does not describe calling upon him after his death.

NULLIFIER 3: Not declaring the mushrikeen as kafir, or doubting their kufr, or considering their religion valid. This is not about personal hatred of individuals — it is about the correctness of the fundamental creed. Someone who says: "Judaism, Christianity, and Islam are all valid paths to God" has contradicted: "Whoever seeks other than Islam as a religion — it will never be accepted from him." (3:85).

LIVE EXAMPLE: A Muslim is asked by a well-meaning non-Muslim: "Doesn't Islam also accept Jesus?" The correct answer preserves brotherhood while maintaining aqeedah: "We love and respect Prophet Isa (AS) deeply — he is one of the five greatest prophets. But we follow the final message, which corrects and completes all previous ones." Politeness is not the same as theological relativism.`
  },

  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam — Nullifier 4 & 5", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Believing Another Guidance is Better Than the Prophet's ﷺ",
    titleAr: "اعتِقَادُ أَنَّ غَيرَ هَدْيِ النَّبِيِّ أَكمَلُ",
    subtitleEn: "Elevating any ideology, law, or system above the Shari'ah",
    quranicProof: {
      ar: "أَفَحُكْمَ الْجَاهِلِيَّةِ يَبْغُونَ ۚ وَمَنْ أَحْسَنُ مِنَ اللَّهِ حُكْمًا لِّقَوْمٍ يُوقِنُونَ",
      en: "Then is it the judgment of the time of ignorance they desire? And who is better than Allah in judgment for a people who are certain [in faith]?",
      ref: "Quran 5:50"
    },
    hadith: {
      ar: "كُلُّ بِدْعَةٍ ضَلَالَةٌ وَكُلُّ ضَلَالَةٍ فِي النَّارِ",
      en: "Every innovation is misguidance and every misguidance is in the Fire.",
      source: "Sahih Muslim 867 — Jabir ibn Abdillah رضي الله عنه"
    },
    explanation: `NULLIFIER 4: Believing that a law, ideology, or system OTHER than the Prophet's ﷺ guidance is more complete, more just, or more appropriate for this era. This is not about acknowledging that humans have made some technical advances — it is about the COMPLETENESS and SUFFICIENCY of the Shari'ah as a divine framework. "Today I have perfected your religion for you." (5:3).

LIVE EXAMPLE: A person says: "Secular democracy is a more just system than Islamic governance because it separates religion from law." If this person believes Islamic law is genuinely inferior — this touches on nullifier 4. The distinction: a Muslim can acknowledge the practical challenges of implementing Shari'ah in a non-Muslim state without believing secular law is more just or complete in principle.

NULLIFIER 5: Hating anything the Prophet ﷺ came with — even if they outwardly practice it. "That is because they disliked what Allah revealed, so He rendered worthless their deeds." (47:9). This is a nullifier of the HEART — a secret that only Allah knows initially.

LIVE EXAMPLE: A person performs salah but internally hates the obligation. They say: "I wish Allah had not made this compulsory." This hatred — if it is toward the command of Allah as a command — contradicts iman. The cure is not to pretend — it is to make du'a: "Ya Allah, make the prayer beloved to me as it was beloved to Your Prophet ﷺ." The companions loved salah — the Prophet ﷺ said: "My comfort was placed in salah." (Nasa'i 3940 — Sahih). Ask for that love.`
  },

  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam — Nullifiers 6–10", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Magic · Apostasy · Mocking the Deen · Sorcery · Alliance with Kuffar",
    titleAr: "السِّحرُ — الرِّدَّةُ — الاستِهزَاءُ — التَّعَاوُنُ ضِدَّ المُسلِمِين",
    subtitleEn: "The remaining five nullifiers — each a complete break from the covenant of Islam",
    quranicProof: {
      ar: "قُلْ أَبِاللَّهِ وَآيَاتِهِ وَرَسُولِهِ كُنتُمْ تَسْتَهْزِئُونَ ﴿٦٥﴾ لَا تَعْتَذِرُوا قَدْ كَفَرْتُم بَعْدَ إِيمَانِكُمْ",
      en: "Say: Was it Allah, His verses, and His Messenger you were mocking? Make no excuse — you have disbelieved after your faith.",
      ref: "Quran 9:65-66"
    },
    hadith: {
      ar: "مَنْ تَعَلَّمَ السِّحْرَ قَلِيلًا أَوْ كَثِيرًا كَانَ آخِرُ عَهْدِهِ بِجِبْرِيلَ",
      en: "Whoever learns magic — little or much — his connection with Jibreel is severed.",
      source: "Al-Tabarani — Ibn Mas'ud رضي الله عنه · Sahih li-ghayrihi"
    },
    explanation: `NULLIFIER 6 — MAGIC (sihr): Practising or seeking magic that involves calling on jinn, Shaytan, or satanic rites. This includes hiring a "shaykh" to do sihr on someone's spouse, business, or enemy. It is haram to USE it and haram to SEEK it. "Sulayman did not disbelieve, but the shayateen disbelieved, teaching people magic." (2:102). Protection: regular recitation of Ayat al-Kursi, Surat al-Baqarah in the home, and the morning/evening adhkar.

NULLIFIER 7 — SUPPORTING MUSHRIKEEN AGAINST MUSLIMS: Genuinely allying with polytheists to fight and harm Muslims — not merely living in a non-Muslim country or having non-Muslim colleagues. "Whoever allies with them — indeed he is of them." (5:51). The scholars carefully distinguish: political coexistence, trade, diplomacy ≠ alliance against Muslims.

NULLIFIER 8 — BELIEVING ONE CAN LEAVE ISLAM VALIDLY: Saying "I have left Islam" — apostasy — is a nullifier. The scholars stress: rushed declarations of takfir on OTHERS are forbidden, but a person who voluntarily and knowingly declares kufr regarding themselves has nullified.

NULLIFIER 9 — MOCKING THE DEEN: Joking that salah is "just bowing," that hijab is "backward," that halal/haram is "outdated superstition" — if said with genuine mockery and not mere frustration. The Quran is direct: "Make no excuse — you have disbelieved after your faith." (9:66).

NULLIFIER 10 — TURNING AWAY FROM THE DEEN: Not learning or practising Islam at all, out of deliberate rejection. "And who is more unjust than one who is reminded of the signs of his Lord but turns away from them?" (32:22).

LIVE EXAMPLE: A Muslim tweets: "The hijab command is medieval — no god would care about a piece of cloth." If said with genuine rejection of the command's validity — not frustration, not doubt — this touches nullifier 9. The responsible Muslim checks their tongue, especially online, before speaking about Allah's commands with contempt.`
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE 4 — AL-QAWA'ID AL-ARBA'  (lessons 22–27)
  // ══════════════════════════════════════════════════════════════════════════
  {
    module: "qawaid", moduleLabel: "Al-Qawa'id al-Arba'", moduleIcon: "layers",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "The Four Principles — Introduction",
    titleAr: "القَوَاعِدُ الأَرْبَعُ — المُقَدِّمَةُ",
    subtitleEn: "Why the Quraysh were mushrikeen — and why good intentions do not sanctify shirk",
    quranicProof: {
      ar: "وَمَا يُؤْمِنُ أَكْثَرُهُم بِاللَّهِ إِلَّا وَهُم مُّشْرِكُونَ",
      en: "And most of them do not believe in Allah except while associating others with Him.",
      ref: "Quran 12:106"
    },
    hadith: {
      ar: "إِيَّاكُمْ وَمُحْدَثَاتِ الأُمُورِ، فَإِنَّ كُلَّ مُحْدَثَةٍ بِدْعَةٌ، وَكُلَّ بِدْعَةٍ ضَلَالَةٌ",
      en: "Beware of newly invented matters, for every newly invented thing is an innovation, and every innovation is misguidance.",
      source: "Abu Dawud 4607 — Irbad ibn Sariyah رضي الله عنه · Sahih"
    },
    explanation: `Al-Qawa'id al-Arba' (The Four Principles) is another foundational treatise by Sheikh Muhammad ibn Abd al-Wahhab رحمه الله, specifically addressing the reality of the Qurayshi mushrikeen and why their reasoning did not excuse them.

He opens with a du'a that is itself a lesson: "O Allah, Lord of the Noble Throne, guide me through Your mercy to the actions and character most pleasing to You. Rectify for me all my affairs and keep far from me the evil of my nafs." The request for guidance comes BEFORE knowledge — indicating that all knowledge begins with need and humility before Allah.

THE CORE ARGUMENT: The Qurayshi mushrikeen did not deny Allah. They prayed (in their way), performed Hajj, gave charity, and feared Allah in some sense. Yet the Prophet ﷺ fought them as mushrikeen. Why? Because alongside their worship of Allah, they directed worship to idols — "only to bring us closer to Allah." Allah rejected this entirely and labelled them kafir and mushrik.

MODERN APPLICATION: Many Muslims today do the same — they pray five times, fast Ramadan, AND visit shrines asking the dead, wear amulets, consult fortune-tellers. The Quran warns exactly about this: "Most of them do not believe in Allah except while associating others with Him." (12:106). Iman and shirk can COEXIST in a heart — the goal of Tawheed study is to remove the shirk so that iman can be pure.`
  },

  {
    module: "qawaid", moduleLabel: "Al-Qawa'id al-Arba' — Principle 1", moduleIcon: "layers",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "Even the Mushrikeen Acknowledged Allah as Creator",
    titleAr: "الأَوَّلُ: إِقرَارُ المُشرِكِينَ بِالرُّبُوبِيَّةِ",
    subtitleEn: "Acknowledging Allah as Creator was never enough — the Battle of Tawheed is in Uluhiyyah",
    quranicProof: {
      ar: "وَلَئِن سَأَلْتَهُم مَّنْ خَلَقَ السَّمَاوَاتِ وَالْأَرْضَ وَسَخَّرَ الشَّمْسَ وَالْقَمَرَ لَيَقُولُنَّ اللَّهُ",
      en: "And if you asked them who created the heavens and earth and subjected the sun and moon — they would surely say: Allah.",
      ref: "Quran 29:61"
    },
    hadith: {
      ar: "كُلُّ مَولُودٍ يُولَدُ عَلَى الفِطرَةِ، فَأَبَوَاهُ يُهَوِّدَانِهِ أَو يُنَصِّرَانِهِ أَو يُمَجِّسَانِهِ",
      en: "Every child is born upon the fitrah (natural disposition). It is his parents who make him a Jew, a Christian, or a Zoroastrian.",
      source: "Sahih al-Bukhari 1358 — Abu Hurayrah رضي الله عنه"
    },
    explanation: `Principle One of Al-Qawa'id al-Arba': The mushrikeen of Makkah — those the Prophet ﷺ fought for 23 years — fully acknowledged Allah as Creator, Sustainer, and Controller of the heavens and earth. This acknowledgement alone did NOT make them Muslims, did NOT protect them from the ruling of shirk, and did NOT earn them paradise.

PROFOUND IMPLICATION: This means that the MINIMUM bar for Islam is NOT just "believing in God." Every human being is born with fitrah — an innate recognition of a Creator. Even atheists, in moments of genuine crisis (a plane crash, a cancer diagnosis), often find themselves instinctively crying out to a Creator. This is not Islam. This is fitrah.

Islam requires DIRECTING all worship — prayer, slaughter, vows, fear, hope, love — exclusively to Allah. Not partly to Allah and partly to creation.

LIVE EXAMPLE: A successful businessperson credits "the universe," "good karma," or "their ancestors" for their success alongside Allah. Their acknowledgement of Allah is Rububiyyah-level. But "the universe" has become a partner in their gratitude — a form of Uluhiyyah being shared. The correction: "Masha'Allah, alhamdulillah" — attributing success fully and exclusively to Allah, using every material means as instruments of His provision, not independent sources.

LIVE EXAMPLE 2: Someone says: "All religions worship the same God." First Principle of Al-Qawa'id answers this: Even the Qurayshi idol-worshippers "worshipped the same God" in the Rububiyyah sense. The difference — the one that matters — is in ULUHIYYAH: is that God being worshipped alone, or alongside others?`
  },

  {
    module: "qawaid", moduleLabel: "Al-Qawa'id al-Arba' — Principles 2 & 3", moduleIcon: "layers",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "The Mushrikeen Claimed Their Idols Were Intermediaries",
    titleAr: "الثَّانِي والثَّالِثُ: الوَسَاطَةُ وتَعَدُّدُ العِبَادَاتِ",
    subtitleEn: "Their justification was 'closeness to Allah' — and they practised many acts of worship to idols",
    quranicProof: {
      ar: "مَا نَعْبُدُهُمْ إِلَّا لِيُقَرِّبُونَا إِلَى اللَّهِ زُلْفَىٰ",
      en: "We only worship them so that they may bring us closer to Allah in nearness.",
      ref: "Quran 39:3"
    },
    hadith: {
      ar: "لَعَنَ اللَّهُ مَنْ ذَبَحَ لِغَيْرِ اللَّهِ",
      en: "Allah curses the one who slaughters for other than Allah.",
      source: "Sahih Muslim 1978 — Ali ibn Abi Talib رضي الله عنه"
    },
    explanation: `PRINCIPLE TWO: The mushrikeen did not worship idols because they believed the idols were creators. They believed the idols (or the spirits inhabiting them — angels, saints, jinn) would INTERCEDE for them and bring them CLOSER to Allah. This is the most sophisticated and the most common form of shirk — because it sounds pious.

The argument: "I'm not worshipping the saint — I'm using the saint as a wasila (means) to get to Allah." Sheikh Ibn Abd al-Wahhab رحمه الله responds: This was the exact argument of the Quraysh — and Allah declared them mushrikeen and sent His Prophet ﷺ to fight them. The PERMITTED wasila is: good deeds, sincere du'a, and asking a LIVING person to make du'a for you.

PRINCIPLE THREE: They practised MANY types of worship toward their idols — not just one. They made tawaf around them, slaughtered for them, made vows (nadhr) to them, feared them, and hoped from them. Sheikh Ibn Abd al-Wahhab lists these to show that contemporary shirk practices mirror the Qurayshi practices almost exactly.

LIVE EXAMPLE: A visitor to a dargah (shrine) in South Asia performs tawaf (circling) around the grave, slaughters an animal dedicated to the "wali," ties a cloth to the grill (seeking blessing), and asks the dead saint to cure their child. This maps precisely to Principles Two and Three. The cure: direct every one of those acts to Allah. Make tawaf of the Ka'bah. Slaughter for Allah. Make du'a to Allah. Seek shifaa from Allah — "al-Shafi" — through legitimate medical means.`
  },

  {
    module: "qawaid", moduleLabel: "Al-Qawa'id al-Arba' — Principle 4", moduleIcon: "layers",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "Contemporary Mushrikeen Are Worse Than Those the Prophet ﷺ Fought",
    titleAr: "الرَّابِعُ: مُشرِكُو زَمَانِنَا أَشَدُّ مِن مُشرِكِي الجَاهِلِيَّةِ",
    subtitleEn: "The Quraysh called on idols only in ease — today's mushrikeen call on saints even in hardship",
    quranicProof: {
      ar: "فَإِذَا رَكِبُوا فِي الْفُلْكِ دَعَوُا اللَّهَ مُخْلِصِينَ لَهُ الدِّينَ فَلَمَّا نَجَّاهُمْ إِلَى الْبَرِّ إِذَا هُمْ يُشْرِكُونَ",
      en: "And when they board a ship, they supplicate Allah sincerely. But when He delivers them to land — at once they associate others with Him.",
      ref: "Quran 29:65"
    },
    hadith: {
      ar: "لَا تَقُولُوا: مَا شَاءَ اللَّهُ وَشَاءَ فُلَانٌ، وَلَكِنْ قُولُوا: مَا شَاءَ اللَّهُ ثُمَّ شَاءَ فُلَانٌ",
      en: "Do not say: What Allah wills AND what so-and-so wills. But say: What Allah wills, THEN what so-and-so wills.",
      source: "Abu Dawud 4980 — Hudhayfah ibn al-Yaman رضي الله عنه · Sahih"
    },
    explanation: `The fourth and most striking principle: The mushrikeen of Quraysh, when in genuine danger — a storm at sea, a life-threatening illness — reverted to sincere du'a to Allah alone, dropping all idols. "When harm touches you at sea, those you call upon disappear except for Him." (17:67). They were mushrik in ease but temporarily muwahhid in crisis.

Sheikh Ibn Abd al-Wahhab's devastating point: many contemporary practitioners of shirk call upon their saints and walis EVEN in moments of crisis — drowning, dying, in agony — turning to the dead even when their fitrah should be screaming "call on Allah." This represents a deeper, more entrenched shirk.

LIVE EXAMPLE: A fisherman from a coastal village is caught in a storm. He cries: "Ya Shaykh [name of local wali]! Save us!" He is in the moment of crisis — the very moment the Qurayshi mushrik would have cried "Ya Allah!" — yet he calls on the dead saint. This is Principle Four in practice, and it represents a deepening of shirk beyond even the Quraysh.

THE HADITH ON LANGUAGE: Notice how even saying "What Allah AND so-and-so wills" — equating human will with divine will in language — is corrected. The Prophet ﷺ said: say "what Allah wills, THEN what so-and-so wills" — making the sequence clear: Allah's will is primary and unrestricted, human will is secondary and entirely subject to Allah's. This precision of language reflects precision of tawheed in the heart.`
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE — SUPPLEMENTARY DEEP LESSONS  (lessons 28–29)
  // ══════════════════════════════════════════════════════════════════════════
  {
    module: "qawaid", moduleLabel: "Miftah Dar al-Sa'adah", moduleIcon: "layers",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "The Key to Happiness — Ibn al-Qayyim",
    titleAr: "مِفتَاحُ دَارِ السَّعَادَةِ",
    subtitleEn: "Why knowing Allah is the root of all joy, and how ignorance of Him is the root of all suffering",
    quranicProof: {
      ar: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
      en: "Unquestionably, by the remembrance of Allah hearts are assured.",
      ref: "Quran 13:28"
    },
    hadith: {
      ar: "عَجَبًا لِأَمْرِ الْمُؤْمِنِ، إِنَّ أَمْرَهُ كُلَّهُ خَيْرٌ، وَلَيْسَ ذَلِكَ لِأَحَدٍ إِلَّا لِلْمُؤْمِنِ",
      en: "Amazing is the affair of the believer — all of it is good. If good comes to him, he is grateful — that is good for him. If hardship comes, he is patient — that is good for him. And this belongs to no one except the believer.",
      source: "Sahih Muslim 2999 — Suhaib al-Rumi رضي الله عنه"
    },
    explanation: `Ibn al-Qayyim رحمه الله opens Miftah Dar al-Sa'adah with: "The key to the house of happiness is knowledge of Allah — His names, His attributes, His actions, and His commands. From this knowledge flows love of Him, fear of Him, hope in Him, reliance upon Him, contentment with Him, and gratitude to Him. And from these flows every happiness that the heart can experience."

This is the profound connection between aqeedah (creed) and wellbeing. Anxiety, depression, fear, emptiness — these are not primarily clinical categories in the Islamic framework. They are symptoms of the heart being disconnected from its true sustenance: ma'rifatullah (knowledge of Allah).

LIVE EXAMPLE: A student is going through severe anxiety — exams, family pressure, uncertain future. The secular approach: medication, therapy, breathing exercises. These are useful tools — Islam does not forbid them. But the Islamic framework adds the deepest layer: the anxiety exists partly because the heart has placed its ultimate trust in means (grades, parents' approval, career) rather than in the One who controls all means. The cure that reaches the root: "Hasbunallahu wa ni'mal wakeel" — Allah is sufficient for us and He is the best trustee. (3:173). This was what Ibrahim AS said when he was thrown into the fire.

LIVE EXAMPLE 2: Ibn al-Qayyim lists the punishments of sin — not just in the akhira but in the dunya. Anxiety without cause. Sadness without reason. Constriction of the chest. Complicated affairs. These are the immediate fruits of heedlessness of Allah. And the immediate fruits of dhikr, salah, and iman: "Whoever does righteousness — We will surely cause him to live a good life." (16:97). The good life begins in the heart, not the bank account.`
  },

  {
    module: "nawaqid", moduleLabel: "Nawaqid al-Islam — Practical Summary", moduleIcon: "alert",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Protecting Tawheed in Modern Life",
    titleAr: "حِمَايَةُ التَّوحِيدِ فِي الحَيَاةِ المُعَاصِرَةِ",
    subtitleEn: "The most common threats to correct creed in the 21st century — and their remedies",
    quranicProof: {
      ar: "يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ حَقَّ تُقَاتِهِ وَلَا تَمُوتُنَّ إِلَّا وَأَنتُم مُّسْلِمُونَ",
      en: "O you who have believed — fear Allah as He should be feared and do not die except as Muslims.",
      ref: "Quran 3:102"
    },
    hadith: {
      ar: "حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَى وَقُومُوا لِلَّهِ قَانِتِينَ",
      en: "Maintain the prayers, especially the middle prayer, and stand before Allah in devoted obedience.",
      source: "Sahih al-Bukhari 1232 — Ali ibn Abi Talib رضي الله عنه"
    },
    explanation: `The greatest threats to Tawheed in the 21st century, based on the frameworks of Al-Usul al-Thalatha, Nawaqid al-Islam, and Al-Qawa'id al-Arba':

THREAT 1 — SPIRITUAL MATERIALISM: Treating du'a as a vending machine and Allah as a means to worldly ends. The sign: you call on Allah only when you need something. The remedy: establish a daily dhikr routine that is purely about knowing Allah — Subhan'Allah, Alhamdulillah, Allahu Akbar — regardless of whether you want anything.

THREAT 2 — DIGITAL RIYA': Performing worship for an online audience. The remedy: establish a secret 'ibadah practice that no one knows about — a nightly du'a, a sadaqah, a private Quran recitation. What is hidden from people but known to Allah is the most sincere.

THREAT 3 — CULTURAL SHIRK: Practices inherited from culture that mix Islamic appearance with shirk content — shrine visits for requests, taweez, fortune-telling apps (horoscopes are still fortune-telling). The remedy: evaluate every religious practice against the question: "Is this directed solely to Allah? Is it from Quran and Sunnah?"

THREAT 4 — THEOLOGICAL RELATIVISM: Social media pressure to say "all religions are the same" or "we all worship the same God." The remedy: Al-Qawa'id al-Arba', Principle One. Even Qurayshi idol-worshippers worshipped "the same God" in the Rububiyyah sense. What makes Islam Islam is exclusive Uluhiyyah.

THREAT 5 — DELAYED REPENTANCE: "I'll fix my deen later — I'm young." The Prophet ﷺ said: "Take advantage of five before five — your youth before your old age, your health before your illness, your wealth before your poverty, your free time before you are occupied, and your life before your death." (Hakim — Sahih). Tawheed begins today.`
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  ICON MAP
// ─────────────────────────────────────────────────────────────────────────────
const ModuleIcon = ({ type, size = 14 }: { type: string; size?: number }) => {
  const s = { width: size, height: size };
  if (type === "alert")  return <AlertTriangle style={s} />;
  if (type === "book")   return <BookOpen style={s} />;
  if (type === "layers") return <Layers style={s} />;
  return <Star style={s} />;
};

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface Props { language?: string }

export default function TawheedWidget({ language = "en" }: Props) {
  const doy     = dayOfYear();
  const todayIdx = doy % LESSONS.length;
  const [idx, setIdx]           = useState(todayIdx);
  const [expanded, setExpanded] = useState(false);

  const lesson = LESSONS[idx];
  const isToday = idx === todayIdx;

  const prev = () => { setIdx(i => (i - 1 + LESSONS.length) % LESSONS.length); setExpanded(false); };
  const next = () => { setIdx(i => (i + 1) % LESSONS.length); setExpanded(false); };
  const goToday = () => { setIdx(todayIdx); setExpanded(false); };

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, #0f2d1f 0%, #1a4731 100%)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🕌</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>
                {language === "ar" ? "التوحيد والعقيدة" : "Tawheed & Correct Creed"}
              </div>
              <div style={{ fontSize: 10, color: GOLD, fontWeight: 600, marginTop: 1 }}>
                {language === "ar" ? "درس يومي متجدد" : "Daily rotating lesson • Nawaqid · Usul al-Thalatha · Qawa'id"}
              </div>
            </div>
          </div>
          {/* navigation */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button onClick={prev} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, cursor: "pointer", padding: "4px 8px", color: "#fff", fontSize: 12, fontWeight: 700 }}>‹</button>
            {!isToday && (
              <button onClick={goToday} style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}55`, borderRadius: 7, cursor: "pointer", padding: "4px 8px", color: GOLD, fontSize: 10, fontWeight: 800 }}>
                Today
              </button>
            )}
            <button onClick={next} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, cursor: "pointer", padding: "4px 8px", color: "#fff", fontSize: 12, fontWeight: 700 }}>›</button>
          </div>
        </div>
        {/* progress bar */}
        <div style={{ marginTop: 10, background: "rgba(255,255,255,.15)", borderRadius: 4, height: 3 }}>
          <div style={{ width: `${((idx + 1) / LESSONS.length) * 100}%`, background: GOLD, borderRadius: 4, height: "100%", transition: "width .3s" }} />
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 4, textAlign: "right" }}>
          {idx + 1} / {LESSONS.length}{isToday ? " · Today's lesson" : ""}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* ── MODULE BADGE ── */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: lesson.moduleBg, color: lesson.moduleBadge, border: `1px solid ${lesson.moduleBorder}` }}>
            <ModuleIcon type={lesson.moduleIcon} size={10} />
            {lesson.moduleLabel}
          </span>
        </div>

        {/* ── TITLE ── */}
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: DARK_GREEN, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>
          {lesson.titleEn}
        </h3>
        <p dir="rtl" style={{ margin: "0 0 4px", fontSize: 14, color: GOLD, fontFamily: "'Amiri',serif", lineHeight: 1.7 }}>
          {lesson.titleAr}
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#4a7c59", lineHeight: 1.5 }}>
          {lesson.subtitleEn}
        </p>

        {/* ── QURANIC PROOF ── */}
        <div style={{ background: "#f0fff4", border: "1px solid #c6e6c6", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: MID_GREEN, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>📖</span> Quranic Proof
          </div>
          <div dir="rtl" style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 19, lineHeight: 2.1, color: DARK_GREEN, textAlign: "center", marginBottom: 8 }}>
            {lesson.quranicProof.ar}
          </div>
          <div style={{ fontSize: 11, color: "#276749", fontStyle: "italic", textAlign: "center", lineHeight: 1.6 }}>
            "{lesson.quranicProof.en}"
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textAlign: "center", marginTop: 4 }}>
            — {lesson.quranicProof.ref}
          </div>
        </div>

        {/* ── HADITH ── */}
        <div style={{ background: "#fffbeb", border: "1px solid #ffe082", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>📜</span> Hadith Evidence
          </div>
          <div dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: 15, lineHeight: 2, color: "#5d4037", textAlign: "center", marginBottom: 6 }}>
            {lesson.hadith.ar}
          </div>
          <div style={{ fontSize: 11, color: "#7a6030", fontStyle: "italic", textAlign: "center", lineHeight: 1.5 }}>
            "{lesson.hadith.en}"
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textAlign: "center", marginTop: 3 }}>
            — {lesson.hadith.source}
          </div>
        </div>

        {/* ── EXPAND: EXPLANATION + LIVE EXAMPLES ── */}
        <button onClick={() => setExpanded(v => !v)} style={{ width: "100%", background: expanded ? "#f0f4f0" : "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: DARK_GREEN }}>
            {expanded ? "Hide Explanation & Live Examples" : "Show Explanation & Live Examples ↓"}
          </span>
          {expanded ? <ChevronUp style={{ width: 14, height: 14, color: MID_GREEN }} /> : <ChevronDown style={{ width: 14, height: 14, color: MID_GREEN }} />}
        </button>

        {expanded && (
          <div style={{ marginTop: 8, background: "#f8fafb", borderRadius: 12, border: `1px solid ${BORDER}`, padding: 14 }}>
            {lesson.explanation.split("\n\n").map((para, i) => {
              const isLive    = para.startsWith("LIVE EXAMPLE");
              const isKey     = para.startsWith("KEY POINT") || para.startsWith("IMPORTANT") || para.startsWith("THE CORE") || para.startsWith("THE PERMITTED") || para.startsWith("THE HADITH");
              const isThreat  = para.startsWith("THREAT");
              const isNullifier = /^NULLIFIER \d/.test(para);
              return (
                <p key={i} style={{
                  margin: i === 0 ? 0 : "10px 0 0",
                  fontSize: 12.5,
                  lineHeight: 1.75,
                  color: isLive ? "#0f2d1f" : isKey || isThreat || isNullifier ? "#92400e" : "#374151",
                  fontWeight: isLive || isKey || isThreat || isNullifier ? 600 : 400,
                  background: isLive ? "rgba(15,45,31,.04)" : isKey || isThreat || isNullifier ? "rgba(146,64,14,.04)" : "transparent",
                  padding: isLive || isKey || isThreat || isNullifier ? "6px 8px" : 0,
                  borderRadius: 6,
                  borderLeft: isLive ? `3px solid ${MID_GREEN}` : isKey || isThreat || isNullifier ? "3px solid #c9a84c" : "none",
                  paddingLeft: isLive || isKey || isThreat || isNullifier ? 10 : 0,
                }}>
                  {para}
                </p>
              );
            })}
          </div>
        )}

        {/* ── DAY DOTS (abridged — show 10 at a time around current) ── */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 14, flexWrap: "wrap" }}>
          {LESSONS.map((l, i) => (
            <button key={i} onClick={() => { setIdx(i); setExpanded(false); }} title={l.titleEn} style={{
              width: i === idx ? 22 : 7, height: 7, borderRadius: 3.5,
              background: i === idx ? GOLD : i === todayIdx ? "#4a7c59" : "#e5e7eb",
              border: "none", cursor: "pointer", padding: 0,
              transition: "width .2s, background .2s",
              flexShrink: 0,
            }} />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 9, color: "#9ca3af" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "#4a7c59", marginRight: 3 }} />today
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: GOLD, marginLeft: 8, marginRight: 3 }} />selected
        </div>
      </div>
    </div>
  );
}
