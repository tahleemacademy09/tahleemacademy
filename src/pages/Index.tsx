import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// ── Daily rotation helpers ────────────────────────────────────────────────
const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

const getHijriNumeric = (date: Date): { day: number; month: number } => {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric",
    }).formatToParts(date);
    return {
      day:   parseInt(parts.find(p => p.type === "day")?.value   ?? "0"),
      month: parseInt(parts.find(p => p.type === "month")?.value ?? "0"),
    };
  } catch { return { day: 0, month: 0 }; }
};

// ── Rotating Quran verses ─────────────────────────────────────────────────
const VERSES = [
  { ar: "يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ", en: "Allah will raise those who have believed among you and those who were given knowledge, by degrees.", ref: "Surah Al-Mujadila, 58:11" },
  { ar: "اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ", en: "Read in the name of your Lord who created.", ref: "Surah Al-Alaq, 96:1" },
  { ar: "رَّبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Surah Ta-Ha, 20:114" },
  { ar: "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ", en: "And We have certainly made the Quran easy to remember. So is there anyone who will be mindful?", ref: "Surah Al-Qamar, 54:17" },
  { ar: "إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ", en: "Indeed, this Quran guides to that which is most upright.", ref: "Surah Al-Isra, 17:9" },
  { ar: "وَنَزَّلْنَا عَلَيْكَ الْكِتَابَ تِبْيَانًا لِّكُلِّ شَيْءٍ وَهُدًى وَرَحْمَةً", en: "And We have revealed to you the Book as clarification for all things, and as guidance and mercy.", ref: "Surah An-Nahl, 16:89" },
  { ar: "أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ ۚ وَلَوْ كَانَ مِنْ عِندِ غَيْرِ اللَّهِ لَوَجَدُوا فِيهِ اخْتِلَافًا كَثِيرًا", en: "Will they not ponder the Quran? Had it been from anyone other than Allah, they would have found in it many inconsistencies.", ref: "Surah An-Nisa, 4:82" },
  { ar: "إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ", en: "Indeed, it is We who sent down the Reminder, and indeed, We will be its guardian.", ref: "Surah Al-Hijr, 15:9" },
  { ar: "وَلَا تَقْفُ مَا لَيْسَ لَكَ بِهِ عِلْمٌ", en: "Do not pursue that of which you have no knowledge.", ref: "Surah Al-Isra, 17:36" },
  { ar: "شَهِدَ اللَّهُ أَنَّهُ لَا إِلَٰهَ إِلَّا هُوَ وَالْمَلَائِكَةُ وَأُولُو الْعِلْمِ", en: "Allah bears witness that there is no deity except Him — and so do the angels and those of knowledge.", ref: "Surah Ali Imran, 3:18" },
  { ar: "قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ", en: "Say: Are those who know equal to those who do not know?", ref: "Surah Az-Zumar, 39:9" },
  { ar: "وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ", en: "And above every possessor of knowledge is one more knowing.", ref: "Surah Yusuf, 12:76" },
  { ar: "كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ", en: "This is a blessed Book which We have revealed to you, that they might reflect upon its verses.", ref: "Surah Sad, 38:29" },
  { ar: "وَاللَّهُ أَخْرَجَكُم مِّن بُطُونِ أُمَّهَاتِكُمْ لَا تَعْلَمُونَ شَيْئًا وَجَعَلَ لَكُمُ السَّمْعَ وَالْأَبْصَارَ وَالْأَفْئِدَةَ لَعَلَّكُمْ تَشْكُرُونَ", en: "Allah brought you out of your mothers' wombs knowing nothing, and gave you hearing, sight and hearts so that you might be thankful.", ref: "Surah An-Nahl, 16:78" },
  { ar: "إِنَّمَا يَخْشَى اللَّهَ مِنْ عِبَادِهِ الْعُلَمَاءُ", en: "Among His servants, only the knowledgeable truly fear Allah.", ref: "Surah Fatir, 35:28" },
];

// ── Rotating Hadiths ──────────────────────────────────────────────────────
const HADITHS = [
  { ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ", en: "Seeking knowledge is an obligation upon every Muslim.", source: "Ibn Majah 224", narrator: "Anas ibn Malik رضي الله عنه" },
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", source: "Sahih al-Bukhari 5027", narrator: "Uthman ibn Affan رضي الله عنه" },
  { ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever travels a path in search of knowledge, Allah will ease for him a path to Paradise.", source: "Sahih Muslim 2699", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ", en: "Actions are only by intentions, and every person will have only what they intended.", source: "Sahih al-Bukhari 1", narrator: "Umar ibn al-Khattab رضي الله عنه" },
  { ar: "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ", en: "The most beloved deeds to Allah are those done consistently, even if they are few.", source: "Sahih al-Bukhari 6465", narrator: "Aishah رضي الله عنها" },
  { ar: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ", en: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Sahih al-Bukhari 13", narrator: "Anas ibn Malik رضي الله عنه" },
  { ar: "الدِّينُ النَّصِيحَةُ", en: "The religion is sincere advice and well-wishing.", source: "Sahih Muslim 55", narrator: "Tamim al-Dari رضي الله عنه" },
  { ar: "إِنَّ اللَّهَ لاَ يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ", en: "Allah does not look at your forms and wealth, but He looks at your hearts and deeds.", source: "Sahih Muslim 2564", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا", en: "The most complete of believers in faith is the best of them in character.", source: "Abu Dawud 4682", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "مَنْ لاَ يَرْحَمُ النَّاسَ لاَ يَرْحَمُهُ اللَّهُ", en: "He who does not show mercy to people will not be shown mercy by Allah.", source: "Sahih al-Bukhari 7376", narrator: "Jarir ibn Abdillah رضي الله عنه" },
  { ar: "تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ صَدَقَةٌ", en: "Your smile in the face of your brother is an act of charity.", source: "Tirmidhi 1956", narrator: "Abu Dharr رضي الله عنه" },
  { ar: "كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ", en: "Be in this world as though you were a stranger or a wayfarer.", source: "Sahih al-Bukhari 6416", narrator: "Ibn Umar رضي الله عنه" },
  { ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: صَدَقَةٍ جَارِيَةٍ، أَوْ عِلْمٍ يُنْتَفَعُ بِهِ، أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ", en: "When a person dies, all deeds cease except three: ongoing charity, knowledge that benefits, or a righteous child who prays for them.", source: "Sahih Muslim 1631", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "حُفَّتِ الْجَنَّةُ بِالْمَكَارِهِ وَحُفَّتِ النَّارُ بِالشَّهَوَاتِ", en: "Paradise is surrounded by hardships and Hellfire is surrounded by desires.", source: "Sahih Muslim 2822", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "لاَ يَشْكُرُ اللَّهَ مَنْ لاَ يَشْكُرُ النَّاسَ", en: "He who is not grateful to people is not grateful to Allah.", source: "Abu Dawud 4811", narrator: "Abu Hurayrah رضي الله عنه" },
];

// ── Seerah snippets ───────────────────────────────────────────────────────
const SEERAH = [
  { title: "Al-Amin — The Trustworthy", year: "Before 610 CE", text: "Before a single verse was revealed, the people of Makkah unanimously called Muhammad ﷺ 'Al-Amin' — the Trustworthy. Merchants left valuables in his care; people sought his counsel in disputes. When he stood on Mount Safa to preach, even his enemies said: 'Yes — we have never known you to lie.' His character was his first and most powerful credential." },
  { title: "The First Revelation", year: "610 CE", text: "At forty, in the Cave of Hira, Jibreel (AS) commanded: 'Iqra!' (Read!). Trembling, the Prophet ﷺ returned to Khadijah (RA) who said: 'By Allah, He will never disgrace you — you maintain family ties, you speak truthfully, you carry the burdens of the weak.' Her certainty in his character was the first comfort after the greatest moment in human history." },
  { title: "The Great Hijrah", year: "622 CE", text: "Hunted by assassins, the Prophet ﷺ left Makkah at night. He and Abu Bakr (RA) hid in the Cave of Thawr for three days. When searchers came within metres, he said: 'O Abu Bakr, what do you think of two when Allah is their third?' Allah recorded this in the Quran (9:40). When he reached Madinah, the entire city came out singing: 'Tala'al badru alayna.' The Islamic calendar begins here." },
  { title: "Conquest of Makkah — Mercy in Victory", year: "630 CE", text: "With 10,000 companions, the Prophet ﷺ entered the city that had exiled and persecuted him — head bowed in humility, not pride. He asked the Quraysh who had tortured his followers: 'What do you think I will do with you?' They said: 'You are a noble brother.' He said: 'Go — you are all free.' No conqueror in history has shown such magnanimity." },
  { title: "The Farewell Sermon", year: "632 CE", text: "Standing on Arafat before 100,000+ companions, the Prophet ﷺ declared: 'An Arab has no superiority over a non-Arab, nor does a non-Arab have superiority over an Arab — except through taqwa.' He asked: 'Have I delivered the message?' A hundred thousand voices replied: 'Yes!' Then came revelation: 'Today I have perfected your religion for you.' (5:3). Three months later, he returned to his Lord." },
  { title: "Khadijah رضي الله عنها — First Believer", year: "595–619 CE", text: "Khadijah (RA) was the first to believe in the Prophet ﷺ, the first to console him in fear, and she spent her entire wealth supporting Islam. The Prophet ﷺ never forgot her — years after her death, he would send food to her old friends and praise her when her name was mentioned. Jibreel descended to send her the salaam of Allah and give her glad tidings of a house in Paradise of pearl." },
  { title: "Battle of Badr — Allah's Promise", year: "624 CE", text: "313 ill-equipped Muslims faced 1,000 Qurayshi warriors. The Prophet ﷺ prayed through the night: 'O Allah, if this group is destroyed, You will not be worshipped on earth.' Allah sent angels and the Muslims triumphed decisively. The Quran named it 'Yawm al-Furqan' — the Day of Distinction. It proved to all of Arabia that this faith would not be extinguished by force." },
];

// ── Islamic Events ────────────────────────────────────────────────────────
const ISLAMIC_EVENTS = [
  { hijriMonth: 1,  hijriDay: 1,  name: "Islamic New Year",    emoji: "🌙", daysWindow: 5  },
  { hijriMonth: 1,  hijriDay: 10, name: "Day of Ashura",        emoji: "🤲", daysWindow: 4  },
  { hijriMonth: 3,  hijriDay: 12, name: "Mawlid al-Nabawi ﷺ",  emoji: "💛", daysWindow: 7  },
  { hijriMonth: 7,  hijriDay: 27, name: "Isra' & Mi'raj",       emoji: "🌌", daysWindow: 5  },
  { hijriMonth: 9,  hijriDay: 1,  name: "Ramadan Begins",       emoji: "🌙", daysWindow: 5  },
  { hijriMonth: 9,  hijriDay: 27, name: "Laylat al-Qadr",       emoji: "⭐", daysWindow: 3  },
  { hijriMonth: 10, hijriDay: 1,  name: "Eid al-Fitr",          emoji: "🎉", daysWindow: 3  },
  { hijriMonth: 12, hijriDay: 9,  name: "Day of Arafah",        emoji: "🕋", daysWindow: 3  },
  { hijriMonth: 12, hijriDay: 10, name: "Eid al-Adha",          emoji: "🐑", daysWindow: 4  },
];

const Index = () => {
  const navigate = useNavigate();
  const [liveClass, setLiveClass]       = useState<{ title: string; room_code: string } | null>(null);
  const [showEnrollGuide, setShowEnrollGuide] = useState(false);
  const [activeReflection, setActiveReflection] = useState<"verse"|"hadith"|"seerah">("verse");

  const doy         = dayOfYear();
  const dailyVerse  = VERSES[doy % VERSES.length];
  const dailyHadith = HADITHS[doy % HADITHS.length];
  const dailySeerah = SEERAH[doy % SEERAH.length];

  // Find upcoming Islamic event
  const upcomingEvent = (() => {
    const today = new Date();
    for (let i = 0; i < 10; i++) {
      const check = new Date(today.getTime() + i * 86_400_000);
      const { day, month } = getHijriNumeric(check);
      const ev = ISLAMIC_EVENTS.find(e =>
        e.hijriMonth === month && Math.abs(e.hijriDay - day) <= (e.daysWindow ?? 3)
      );
      if (ev) return { event: ev, daysAway: i };
    }
    return null;
  })();

  useEffect(() => {
    supabase.from("public_classes").select("title, room_code").eq("status", "live").eq("is_featured", true).limit(1).then(({ data }) => {
      if (data && data.length > 0) setLiveClass(data[0] as { title: string; room_code: string });
    });
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=Mulish:wght@400;500;600;700;800&family=Cairo:wght@400;600;700&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.innerHTML = `
      .ta-root * { margin:0; padding:0; box-sizing:border-box; }
      .ta-root { font-family:'Mulish',sans-serif; background:#faf7f2; color:#1a1a1a; overflow-x:hidden; }

      @keyframes fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
      @keyframes shimmer { 0%,100%{opacity:.7} 50%{opacity:1} }
      @keyframes scaleIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
      @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
      @keyframes spinAr  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

      .ta-hero { position:relative; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; overflow:hidden; }
      .ta-hero-bg { position:absolute; inset:0; background-image:url('https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=1600&q=90'); background-size:cover; background-position:center 25%; }
      .ta-hero-overlay { position:absolute; inset:0; background:linear-gradient(175deg,rgba(6,18,10,.92) 0%,rgba(11,36,22,.84) 50%,rgba(6,14,9,.94) 100%); }
      .ta-hero-tile { position:absolute; inset:0; opacity:.04; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cg fill='none' stroke='%23c9973a' stroke-width='.8'%3E%3Cpolygon points='60,6 114,33 114,87 60,114 6,87 6,33'/%3E%3Cpolygon points='60,22 98,42 98,78 60,98 22,78 22,42'/%3E%3Ccircle cx='60' cy='60' r='22'/%3E%3Cline x1='60' y1='6' x2='60' y2='22'/%3E%3Cline x1='114' y1='33' x2='98' y2='42'/%3E%3Cline x1='114' y1='87' x2='98' y2='78'/%3E%3Cline x1='60' y1='114' x2='60' y2='98'/%3E%3Cline x1='6' y1='87' x2='22' y2='78'/%3E%3Cline x1='6' y1='33' x2='22' y2='42'/%3E%3C/g%3E%3C/svg%3E"); }
      .ta-hero-arch { position:absolute; top:0; left:50%; transform:translateX(-50%); width:min(560px,92vw); height:100%; border-left:1px solid rgba(201,151,58,.16); border-right:1px solid rgba(201,151,58,.16); pointer-events:none; }
      .ta-hero-arch::before { content:''; position:absolute; top:0; left:-1px; right:-1px; height:3px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }
      .ta-hero-arch::after  { content:''; position:absolute; bottom:0; left:-1px; right:-1px; height:3px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }
      .ta-hero-content { position:relative; z-index:2; text-align:center; padding:clamp(72px,14vh,130px) 24px clamp(48px,8vh,80px); max-width:700px; width:100%; animation:scaleIn .9s ease both; }
      .ta-hero-badge { display:inline-flex; align-items:center; gap:10px; background:rgba(201,151,58,.1); border:1px solid rgba(201,151,58,.32); color:#e8c270; padding:7px 20px; border-radius:40px; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:800; margin-bottom:30px; animation:fadeUp .7s .1s ease both; }
      .ta-hero-bismi { font-family:'Scheherazade New',serif; font-size:clamp(24px,5vw,46px); color:#fff; line-height:1.65; direction:rtl; margin-bottom:12px; text-shadow:0 0 40px rgba(201,151,58,.45); animation:fadeUp .7s .2s ease both; }
      .ta-hero-div { display:flex; align-items:center; gap:14px; justify-content:center; margin:14px 0 20px; animation:fadeUp .7s .25s ease both; }
      .ta-hero-div-line { flex:1; max-width:100px; height:1px; background:linear-gradient(90deg,transparent,rgba(201,151,58,.55),transparent); }
      .ta-hero-title { font-family:'Playfair Display',serif; font-size:clamp(36px,6.5vw,68px); font-weight:800; color:#fff; line-height:1.1; margin-bottom:10px; animation:fadeUp .7s .3s ease both; letter-spacing:-.5px; }
      .ta-hero-title em { font-style:italic; color:#c9973a; display:block; }
      .ta-hero-sub { color:rgba(255,255,255,.68); font-size:clamp(14px,2vw,17px); line-height:1.85; max-width:520px; margin:16px auto 32px; font-weight:400; animation:fadeUp .7s .4s ease both; }
      .ta-hero-btns { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; animation:fadeUp .7s .5s ease both; }
      .ta-btn-p { padding:15px 38px; background:#c9973a; color:#fff; border:none; border-radius:5px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:800; cursor:pointer; transition:.25s; letter-spacing:.3px; }
      .ta-btn-p:hover { background:#dba94b; transform:translateY(-2px); box-shadow:0 12px 32px rgba(201,151,58,.42); }
      .ta-btn-s { padding:15px 38px; background:transparent; border:1.5px solid rgba(255,255,255,.28); color:#fff; border-radius:5px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:600; cursor:pointer; transition:.25s; }
      .ta-btn-s:hover { border-color:rgba(255,255,255,.65); background:rgba(255,255,255,.08); }
      .ta-hero-scroll { position:absolute; bottom:28px; left:50%; transform:translateX(-50%); z-index:2; display:flex; flex-direction:column; align-items:center; gap:6px; color:rgba(255,255,255,.35); font-size:10px; letter-spacing:2px; text-transform:uppercase; animation:shimmer 2.5s infinite; }
      .ta-hero-scroll-line { width:1px; height:38px; background:linear-gradient(to bottom,rgba(201,151,58,.55),transparent); }

      .ta-strip { background:#0c2115; border-top:1px solid rgba(201,151,58,.18); border-bottom:1px solid rgba(201,151,58,.18); padding:16px 20px; display:flex; justify-content:center; gap:0; flex-wrap:nowrap; overflow:hidden; }
      .ta-strip-item { display:flex; align-items:center; gap:8px; color:rgba(255,255,255,.72); font-size:13px; font-weight:600; padding:0 22px; border-right:1px solid rgba(201,151,58,.14); white-space:nowrap; }
      .ta-strip-item:last-child { border-right:none; }

      /* ── ISLAMIC DAILY SECTION ── */
      .ta-daily { padding:88px 24px; background:#0c2115; position:relative; overflow:hidden; }
      .ta-daily::before { content:''; position:absolute; inset:0; opacity:.04; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpolygon points='40,4 76,20 76,60 40,76 4,60 4,20' fill='none' stroke='%23c9973a' stroke-width='.7'/%3E%3Ccircle cx='40' cy='40' r='14' fill='none' stroke='%23c9973a' stroke-width='.4'/%3E%3C/svg%3E"); pointer-events:none; }
      .ta-daily-inner { max-width:1100px; margin:0 auto; position:relative; z-index:1; }
      .ta-daily-hdr { text-align:center; margin-bottom:52px; }
      .ta-daily-hdr-badge { display:inline-flex; align-items:center; gap:10px; background:rgba(201,151,58,.1); border:1px solid rgba(201,151,58,.28); color:#e8c270; padding:7px 22px; border-radius:40px; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:800; margin-bottom:18px; }
      .ta-daily-hdr h2 { font-family:'Playfair Display',serif; font-size:clamp(26px,4vw,40px); font-weight:700; color:#fff; margin-bottom:10px; }
      .ta-daily-hdr p { color:rgba(255,255,255,.48); font-size:15px; }

      /* Event banner */
      .ta-event-banner { background:linear-gradient(135deg,rgba(201,151,58,.15),rgba(201,151,58,.06)); border:1px solid rgba(201,151,58,.35); border-radius:12px; padding:16px 24px; display:flex; align-items:center; gap:16px; margin-bottom:36px; }
      .ta-event-emoji { font-size:28px; flex-shrink:0; }
      .ta-event-label { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2px; text-transform:uppercase; margin-bottom:3px; }
      .ta-event-name  { font-size:16px; font-weight:800; color:#fff; }
      .ta-event-pill  { margin-left:auto; background:#c9973a; color:#fff; font-size:9px; font-weight:800; padding:4px 12px; border-radius:20px; white-space:nowrap; flex-shrink:0; letter-spacing:.5px; }

      /* Tabs */
      .ta-daily-tabs { display:flex; justify-content:center; gap:0; margin-bottom:40px; border:1px solid rgba(201,151,58,.2); border-radius:8px; overflow:hidden; width:fit-content; margin-left:auto; margin-right:auto; }
      .ta-daily-tab { padding:11px 28px; background:transparent; border:none; color:rgba(255,255,255,.45); font-family:'Mulish',sans-serif; font-size:13px; font-weight:700; cursor:pointer; transition:.2s; white-space:nowrap; border-right:1px solid rgba(201,151,58,.15); }
      .ta-daily-tab:last-child { border-right:none; }
      .ta-daily-tab.active { background:rgba(201,151,58,.15); color:#e8c270; }
      .ta-daily-tab:hover:not(.active) { background:rgba(255,255,255,.04); color:rgba(255,255,255,.7); }

      /* Cards row */
      .ta-daily-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
      .ta-daily-main { grid-column:1; }
      .ta-daily-aside { grid-column:2; display:flex; flex-direction:column; gap:20px; }

      /* Verse card */
      .ta-verse-card { background:rgba(255,255,255,.04); border:1px solid rgba(201,151,58,.2); border-radius:16px; padding:38px 34px; text-align:center; position:relative; overflow:hidden; height:100%; display:flex; flex-direction:column; justify-content:center; }
      .ta-verse-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }
      .ta-verse-card-lbl { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:22px; }
      .ta-verse-ar { font-family:'Scheherazade New',serif; font-size:clamp(22px,3.5vw,36px); color:#fff; direction:rtl; line-height:1.85; text-shadow:0 2px 20px rgba(201,151,58,.2); margin-bottom:20px; }
      .ta-verse-divrow { display:flex; align-items:center; gap:14px; justify-content:center; margin:0 0 16px; }
      .ta-verse-dline { flex:1; max-width:70px; height:1px; background:linear-gradient(90deg,transparent,rgba(201,151,58,.45),transparent); }
      .ta-verse-en { font-family:'Playfair Display',serif; font-style:italic; font-size:clamp(14px,2vw,18px); color:#e8c270; line-height:1.65; margin-bottom:14px; }
      .ta-verse-ref { font-size:11px; color:rgba(255,255,255,.3); letter-spacing:1.5px; text-transform:uppercase; }

      /* Hadith card */
      .ta-hadith-card { background:linear-gradient(160deg,rgba(12,33,21,.95),rgba(20,55,35,.95)); border:1px solid rgba(201,151,58,.2); border-radius:16px; padding:32px 28px; position:relative; overflow:hidden; height:100%; display:flex; flex-direction:column; justify-content:center; }
      .ta-hadith-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }
      .ta-hadith-lbl { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:18px; display:flex; align-items:center; gap:8px; }
      .ta-hadith-ar  { font-family:'Scheherazade New',serif; font-size:clamp(18px,2.8vw,26px); color:#fff; direction:rtl; line-height:1.9; text-align:center; margin-bottom:16px; }
      .ta-hadith-div { width:36px; height:1.5px; background:#c9973a; margin:0 auto 14px; opacity:.7; border-radius:2px; }
      .ta-hadith-en  { font-size:clamp(13px,1.8vw,15px); font-style:italic; color:rgba(255,255,255,.82); line-height:1.75; text-align:center; margin-bottom:16px; }
      .ta-hadith-src { text-align:center; }
      .ta-hadith-src-main { font-size:11px; font-weight:700; color:#c9973a; display:block; margin-bottom:3px; }
      .ta-hadith-src-sub  { font-size:10px; color:rgba(255,255,255,.35); }

      /* Seerah card */
      .ta-seerah-card { background:rgba(255,248,220,.06); border:1px solid rgba(201,151,58,.18); border-radius:16px; padding:28px 26px; position:relative; overflow:hidden; height:100%; display:flex; flex-direction:column; }
      .ta-seerah-lbl  { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:14px; }
      .ta-seerah-yr   { font-size:10px; font-weight:700; color:rgba(201,151,58,.6); background:rgba(201,151,58,.08); border:1px solid rgba(201,151,58,.2); border-radius:20px; padding:3px 12px; display:inline-block; margin-bottom:10px; }
      .ta-seerah-ttl  { font-family:'Playfair Display',serif; font-size:clamp(15px,2vw,19px); font-weight:700; color:#fff; margin-bottom:12px; line-height:1.3; }
      .ta-seerah-txt  { font-size:13.5px; color:rgba(255,255,255,.65); line-height:1.85; flex:1; }

      /* Pillars section */
      .ta-pillars { padding:88px 24px; background:#faf7f2; }
      .ta-pillars-inner { max-width:1100px; margin:0 auto; }
      .ta-pillars-hdr { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:end; margin-bottom:56px; }
      .ta-pillars-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; background:#e5ddd4; }
      .ta-pillar { background:#faf7f2; padding:34px 28px; transition:.3s; position:relative; overflow:hidden; }
      .ta-pillar::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2px; background:#c9973a; transform:scaleX(0); transform-origin:left; transition:.35s ease; }
      .ta-pillar:hover::after { transform:scaleX(1); }
      .ta-pillar:hover { background:#fff; }
      .ta-pillar-n { font-family:'Playfair Display',serif; font-size:46px; font-weight:700; color:rgba(201,151,58,.13); line-height:1; margin-bottom:14px; }
      .ta-pillar-icon { font-size:26px; margin-bottom:12px; display:block; }
      .ta-pillar-title { font-size:15.5px; font-weight:800; color:#0c2115; margin-bottom:8px; }
      .ta-pillar-text { font-size:13px; color:#6a6a6a; line-height:1.8; }
      .ta-pillars-ar { font-family:'Scheherazade New',serif; font-size:22px; color:rgba(201,151,58,.55); direction:rtl; margin-bottom:12px; display:block; }

      .ta-eyebrow { display:inline-flex; align-items:center; gap:10px; color:#c9973a; font-size:11px; letter-spacing:2.5px; text-transform:uppercase; font-weight:800; margin-bottom:14px; }
      .ta-eyebrow-line { display:block; width:30px; height:1.5px; background:#c9973a; }
      .ta-heading { font-family:'Playfair Display',serif; font-size:clamp(28px,4vw,44px); font-weight:700; color:#0c2115; line-height:1.15; margin-bottom:14px; }
      .ta-body { font-size:15.5px; color:#5a5a5a; line-height:1.85; max-width:580px; font-weight:400; }

      .ta-courses { background:#0a1c10; padding:96px 24px; position:relative; overflow:hidden; }
      .ta-courses::before { content:''; position:absolute; inset:0; opacity:.035; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpolygon points='40,4 76,20 76,60 40,76 4,60 4,20' fill='none' stroke='%23c9973a' stroke-width='.7'/%3E%3Ccircle cx='40' cy='40' r='14' fill='none' stroke='%23c9973a' stroke-width='.4'/%3E%3C/svg%3E"); pointer-events:none; }
      .ta-courses-inner { max-width:1160px; margin:0 auto; position:relative; z-index:1; }
      .ta-courses-hdr { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:52px; flex-wrap:wrap; }
      .ta-courses-hdr-left { max-width:520px; }
      .ta-courses-all { display:inline-flex; align-items:center; gap:8px; color:#c9973a; font-size:13px; font-weight:800; letter-spacing:.5px; border:1.5px solid rgba(201,151,58,.35); padding:10px 22px; border-radius:40px; cursor:pointer; transition:.25s; white-space:nowrap; }
      .ta-courses-all:hover { background:rgba(201,151,58,.1); border-color:#c9973a; }
      .ta-courses-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }
      .ta-ccard { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.07); border-radius:20px; overflow:hidden; transition:.35s cubic-bezier(.25,.46,.45,.94); display:flex; flex-direction:column; }
      .ta-ccard:hover { border-color:rgba(201,151,58,.5); transform:translateY(-8px); background:rgba(255,255,255,.075); box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(201,151,58,.18); }
      .ta-ccard-img { height:220px; overflow:hidden; position:relative; flex-shrink:0; }
      .ta-ccard-img img { width:100%; height:100%; object-fit:cover; transition:.55s ease; }
      .ta-ccard:hover .ta-ccard-img img { transform:scale(1.08); }
      .ta-ccard-img-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(6,18,10,.85) 0%,rgba(6,18,10,.2) 50%,transparent 100%); }
      .ta-ccard-badge { position:absolute; top:16px; left:16px; background:linear-gradient(135deg,#c9973a,#a67c22); color:#fff; font-size:10px; font-weight:800; padding:5px 14px; border-radius:40px; letter-spacing:1px; text-transform:uppercase; box-shadow:0 4px 14px rgba(201,151,58,.45); }
      .ta-ccard-level-pill { position:absolute; bottom:16px; right:16px; background:rgba(255,255,255,.12); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.18); color:#fff; font-size:10px; font-weight:700; padding:4px 12px; border-radius:40px; letter-spacing:.5px; }
      .ta-ccard-body { padding:26px 24px 28px; display:flex; flex-direction:column; flex:1; }
      .ta-ccard-ar { font-family:'Scheherazade New',serif; font-size:20px; color:#c9973a; direction:rtl; margin-bottom:8px; line-height:1.5; }
      .ta-ccard-en { color:#fff; font-size:18px; font-weight:800; margin-bottom:10px; font-family:'Playfair Display',serif; line-height:1.25; }
      .ta-ccard-desc { color:rgba(255,255,255,.55); font-size:13.5px; line-height:1.8; margin-bottom:24px; flex:1; }
      .ta-ccard-footer { display:flex; align-items:center; justify-content:space-between; padding-top:18px; border-top:1px solid rgba(255,255,255,.07); }
      .ta-ccard-level { color:rgba(201,151,58,.8); font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; display:flex; align-items:center; gap:5px; }
      .ta-ccard-btn { padding:10px 24px; background:transparent; border:1.5px solid rgba(201,151,58,.55); color:#c9973a; border-radius:40px; font-size:12px; font-weight:800; cursor:pointer; font-family:'Mulish',sans-serif; transition:.25s; letter-spacing:.5px; }
      .ta-ccard-btn:hover { background:#c9973a; color:#fff; border-color:#c9973a; box-shadow:0 8px 24px rgba(201,151,58,.35); }

      .ta-stats { position:relative; padding:80px 24px; background:url('https://images.unsplash.com/photo-1585036156171-384164a8c675?w=1600&q=80') center/cover no-repeat; overflow:hidden; }
      .ta-stats::before { content:''; position:absolute; inset:0; background:rgba(6,16,10,.9); }
      .ta-stats-inner { position:relative; z-index:1; max-width:1000px; margin:0 auto; text-align:center; }
      .ta-stats-ar { font-family:'Scheherazade New',serif; font-size:24px; color:rgba(201,151,58,.65); margin-bottom:6px; display:block; }
      .ta-stats-title { font-family:'Playfair Display',serif; font-size:36px; font-weight:700; color:#fff; margin-bottom:52px; }
      .ta-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); }
      .ta-stat { padding:28px 20px; border-right:1px solid rgba(201,151,58,.12); }
      .ta-stat:last-child { border-right:none; }
      .ta-stat-n { font-family:'Playfair Display',serif; font-size:52px; color:#c9973a; font-weight:700; line-height:1; }
      .ta-stat-l { color:rgba(255,255,255,.52); font-size:13px; margin-top:8px; letter-spacing:.5px; }

      .ta-cta { padding:88px 24px; text-align:center; background:#faf7f2; }
      .ta-cta-inner { max-width:620px; margin:0 auto; }
      .ta-cta-ar { font-family:'Scheherazade New',serif; font-size:28px; color:#c9973a; margin-bottom:20px; display:block; direction:rtl; }
      .ta-cta-heading { font-family:'Playfair Display',serif; font-size:clamp(26px,4vw,42px); color:#0c2115; font-weight:700; margin-bottom:14px; line-height:1.2; }
      .ta-cta-text { font-size:15.5px; color:#666; margin-bottom:36px; line-height:1.85; }
      .ta-cta-btn { display:inline-block; padding:16px 52px; background:#0c2115; color:#fff; border:none; font-family:'Mulish',sans-serif; font-size:15px; font-weight:800; cursor:pointer; transition:.25s; letter-spacing:.5px; border-radius:4px; }
      .ta-cta-btn:hover { background:#183d26; transform:translateY(-2px); box-shadow:0 12px 32px rgba(12,33,21,.3); }

      .ta-footer { background:#060e08; color:#aaa; padding:64px 24px 0; }
      .ta-footer-top { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1.4fr; gap:48px; padding-bottom:52px; border-bottom:1px solid rgba(255,255,255,.05); }
      .ta-footer-brand { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
      .ta-footer-logo { width:44px; height:44px; background:#c9973a; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
      .ta-footer-name { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:#fff; }
      .ta-footer-name-ar { font-family:'Scheherazade New',serif; font-size:14px; color:#c9973a; direction:rtl; }
      .ta-footer-tag { font-size:13px; line-height:1.9; color:rgba(255,255,255,.38); max-width:280px; margin-bottom:22px; }
      .ta-footer-socials { display:flex; gap:8px; flex-wrap:wrap; }
      .ta-social { padding:7px 16px; border:1px solid rgba(201,151,58,.28); color:#c9973a; font-size:12px; text-decoration:none; transition:.2s; border-radius:3px; font-weight:700; }
      .ta-social:hover { background:#c9973a; color:#fff; }
      .ta-footer-hd { font-size:10.5px; font-weight:800; color:#fff; margin-bottom:20px; letter-spacing:2px; text-transform:uppercase; padding-bottom:10px; border-bottom:1px solid rgba(201,151,58,.18); }
      .ta-footer-links { list-style:none; display:flex; flex-direction:column; gap:11px; }
      .ta-footer-links a { color:rgba(255,255,255,.42); text-decoration:none; font-size:13.5px; transition:.2s; cursor:pointer; }
      .ta-footer-links a:hover { color:#c9973a; }
      .ta-footer-contacts { list-style:none; display:flex; flex-direction:column; gap:13px; }
      .ta-footer-ci { display:flex; align-items:flex-start; gap:10px; font-size:13px; }
      .ta-contact-icon { color:#c9973a; font-size:14px; flex-shrink:0; margin-top:1px; }
      .ta-footer-contacts a { color:rgba(255,255,255,.42); text-decoration:none; transition:.2s; word-break:break-all; }
      .ta-footer-contacts a:hover { color:#c9973a; }
      .ta-footer-btm { max-width:1100px; margin:0 auto; padding:22px 0 26px; display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; }
      .ta-footer-du { font-family:'Scheherazade New',serif; font-size:22px; color:rgba(201,151,58,.6); }
      .ta-footer-copy { font-size:11px; color:rgba(255,255,255,.22); letter-spacing:.3px; }

      .ta-guide { background:rgba(0,0,0,.62); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); border:1px solid rgba(201,151,58,.22); border-radius:10px; padding:22px 24px; max-width:420px; width:100%; margin-top:6px; animation:fadeUp .3s ease both; text-align:left; }
      .ta-guide-title { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2px; text-transform:uppercase; margin-bottom:16px; }
      .ta-guide-step { display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
      .ta-guide-num { width:26px; height:26px; border-radius:50%; background:#c9973a; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; flex-shrink:0; }
      .ta-guide-stitle { font-size:13px; font-weight:700; color:#fff; margin:0; }
      .ta-guide-sdesc { font-size:11px; color:rgba(255,255,255,.48); margin:2px 0 0; }
      .ta-guide-btn { width:100%; margin-top:8px; padding:12px; border-radius:6px; border:none; background:#c9973a; color:#fff; font-size:14px; font-weight:800; cursor:pointer; font-family:'Mulish',sans-serif; }

      @media(max-width:900px) {
        .ta-pillars-hdr { grid-template-columns:1fr; gap:12px; }
        .ta-pillars-grid { grid-template-columns:1fr 1fr; }
        .ta-courses-grid { grid-template-columns:1fr 1fr; gap:18px; }
        .ta-courses-hdr { flex-direction:column; align-items:flex-start; gap:16px; }
        .ta-stats-grid { grid-template-columns:1fr 1fr; }
        .ta-footer-top { grid-template-columns:1fr; gap:32px; }
        .ta-strip { flex-wrap:wrap; }
        .ta-strip-item { border-right:none; padding:4px 14px; }
        .ta-daily-grid { grid-template-columns:1fr; }
        .ta-daily-aside { grid-column:1; }
      }
      @media(max-width:600px) {
        .ta-pillars-grid { grid-template-columns:1fr; }
        .ta-courses-grid { grid-template-columns:1fr; gap:20px; }
        .ta-stat { padding:20px 10px; }
        .ta-btn-p, .ta-btn-s { padding:13px 26px; font-size:14px; }
        .ta-daily-tabs { flex-wrap:wrap; width:100%; }
        .ta-daily-tab { flex:1; min-width:80px; padding:10px 14px; font-size:12px; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.head.removeChild(link); } catch {}
      try { document.head.removeChild(style); } catch {}
    };
  }, []);

  return (
    <div className="ta-root">

      {/* LIVE BANNER */}
      {liveClass && (
        <div onClick={() => navigate(`/live/${liveClass.room_code}`)} style={{ background:"linear-gradient(90deg,#0c2115,#1a5c3a)", borderBottom:"2px solid #c9973a", padding:"11px 24px", display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer" }}>
          <span style={{ width:9, height:9, background:"#ef4444", borderRadius:"50%", animation:"pulse 1.5s infinite", display:"inline-block" }} />
          <span style={{ color:"#fff", fontWeight:700, fontSize:14, fontFamily:"'Mulish',sans-serif" }}>
            🔴 LIVE NOW: {liveClass.title} — Join Free →
          </span>
        </div>
      )}

      {/* HERO */}
      <section className="ta-hero">
        <div className="ta-hero-bg" />
        <div className="ta-hero-overlay" />
        <div className="ta-hero-tile" />
        <div className="ta-hero-arch" />
        <div className="ta-hero-content">
          <div className="ta-hero-badge">✦ Excellence in Islamic Education ✦</div>
          <div className="ta-hero-bismi">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div className="ta-hero-div">
            <span className="ta-hero-div-line" />
            <span style={{ color:"#c9973a", fontSize:11 }}>◆</span>
            <span className="ta-hero-div-line" />
          </div>
          <h1 className="ta-hero-title">
            Master Arabic &amp;
            <em>Islamic Sciences</em>
          </h1>
          <p className="ta-hero-sub">
            Learn Quran, Tajweed, Arabic Language and Islamic Studies with certified scholars — live, interactive, and structured for every level.
          </p>
          <div className="ta-hero-btns" style={{ flexDirection:"column", alignItems:"center" }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
              <button className="ta-btn-p" onClick={() => navigate("/register")}>Enrol Now</button>
              <button className="ta-btn-s" onClick={() => setShowEnrollGuide(v => !v)}>
                How to Enrol {showEnrollGuide ? "▲" : "▼"}
              </button>
            </div>
            {showEnrollGuide && (
              <div className="ta-guide">
                <p className="ta-guide-title">📋 Enrollment Steps</p>
                {[
                  { n:"1", icon:"👤", title:"Create Your Account", desc:"Register with your name, email and password" },
                  { n:"2", icon:"💳", title:"Complete Payment",     desc:"Pay the one-time registration fee" },
                  { n:"3", icon:"📝", title:"Fill Onboarding Form", desc:"Tell us about your background and goals" },
                  { n:"4", icon:"📖", title:"Take Entrance Exam",   desc:"Written assessment with full proctoring" },
                  { n:"5", icon:"🎤", title:"Recitation Test",      desc:"Audio evaluation of your Quran recitation" },
                  { n:"6", icon:"✅", title:"Admin Approval",        desc:"Admin reviews results and assigns your level" },
                  { n:"7", icon:"🚀", title:"Access Dashboard",      desc:"Start your learning journey!" },
                ].map(s => (
                  <div className="ta-guide-step" key={s.n}>
                    <div className="ta-guide-num">{s.n}</div>
                    <div>
                      <p className="ta-guide-stitle">{s.icon} {s.title}</p>
                      <p className="ta-guide-sdesc">{s.desc}</p>
                    </div>
                  </div>
                ))}
                <button className="ta-guide-btn" onClick={() => navigate("/register")}>Enrol Now →</button>
              </div>
            )}
          </div>
        </div>
        <div className="ta-hero-scroll">
          <span>SCROLL</span>
          <div className="ta-hero-scroll-line" />
        </div>
      </section>

      {/* STRIP */}
      <div className="ta-strip">
        {[["🕌","Qualified Islamic Scholars"],["📖","Structured Quranic Curriculum"],["🌐","Bilingual Arabic & English"],["🎓","Certificates Awarded"],["🎙️","Live & Recorded Classes"]].map(([icon, label]) => (
          <div className="ta-strip-item" key={label as string}>{icon}&nbsp; {label}</div>
        ))}
      </div>

      {/* ── ISLAMIC DAILY REFLECTIONS ── */}
      <section className="ta-daily">
        <div className="ta-daily-inner">

          {/* Header */}
          <div className="ta-daily-hdr">
            <div className="ta-daily-hdr-badge">✦ Daily Islamic Reflections ✦</div>
            <h2>Nourish Your Soul — Every Day</h2>
            <p>Rotating daily from the Quran, authentic Hadiths &amp; the blessed Seerah of the Prophet ﷺ</p>
          </div>

          {/* Upcoming Islamic Event Banner */}
          {upcomingEvent && (
            <div className="ta-event-banner">
              <span className="ta-event-emoji">{upcomingEvent.event.emoji}</span>
              <div>
                <div className="ta-event-label">Upcoming Islamic Occasion</div>
                <div className="ta-event-name">{upcomingEvent.event.name}</div>
              </div>
              <div className="ta-event-pill">
                {upcomingEvent.daysAway === 0 ? "TODAY ✨"
                  : upcomingEvent.daysAway === 1 ? "Tomorrow"
                  : `In ${upcomingEvent.daysAway} days`}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="ta-daily-tabs">
            {(["verse","hadith","seerah"] as const).map(tab => (
              <button
                key={tab}
                className={`ta-daily-tab${activeReflection === tab ? " active" : ""}`}
                onClick={() => setActiveReflection(tab)}
              >
                {tab === "verse"  ? "📖 Quranic Verse"
                : tab === "hadith" ? "📿 Hadith"
                : "📜 Seerah"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="ta-daily-grid">

            {/* Main card — Verse */}
            {activeReflection === "verse" && (
              <div className="ta-verse-card" style={{ gridColumn:"1 / -1" }}>
                <div className="ta-verse-card-lbl">✦ Verse of the Day ✦</div>
                <div className="ta-verse-ar">{dailyVerse.ar}</div>
                <div className="ta-verse-divrow">
                  <span className="ta-verse-dline" />
                  <span style={{ color:"#c9973a", fontSize:10 }}>◆</span>
                  <span className="ta-verse-dline" />
                </div>
                <div className="ta-verse-en">"{dailyVerse.en}"</div>
                <div className="ta-verse-ref" style={{ marginTop:12 }}>{dailyVerse.ref}</div>
              </div>
            )}

            {/* Hadith tab */}
            {activeReflection === "hadith" && (
              <>
                <div className="ta-hadith-card">
                  <div className="ta-hadith-lbl">📿 Hadith of the Day</div>
                  <div className="ta-hadith-ar">{dailyHadith.ar}</div>
                  <div className="ta-hadith-div" />
                  <div className="ta-hadith-en">"{dailyHadith.en}"</div>
                  <div className="ta-hadith-src">
                    <span className="ta-hadith-src-main">{dailyHadith.source}</span>
                    <span className="ta-hadith-src-sub">Narrated by {dailyHadith.narrator}</span>
                  </div>
                </div>
                {/* bonus: show the verse alongside */}
                <div className="ta-verse-card">
                  <div className="ta-verse-card-lbl">📖 Quranic Reflection</div>
                  <div className="ta-verse-ar" style={{ fontSize:"clamp(18px,2.8vw,28px)" }}>{dailyVerse.ar}</div>
                  <div className="ta-verse-divrow">
                    <span className="ta-verse-dline" />
                    <span style={{ color:"#c9973a", fontSize:10 }}>◆</span>
                    <span className="ta-verse-dline" />
                  </div>
                  <div className="ta-verse-en" style={{ fontSize:"clamp(13px,1.8vw,16px)" }}>"{dailyVerse.en}"</div>
                  <div className="ta-verse-ref" style={{ marginTop:12 }}>{dailyVerse.ref}</div>
                </div>
              </>
            )}

            {/* Seerah tab */}
            {activeReflection === "seerah" && (
              <>
                <div className="ta-seerah-card" style={{ gridColumn:"1 / -1", maxWidth:820, margin:"0 auto", width:"100%" }}>
                  <div className="ta-seerah-lbl">📜 Daily Seerah — Life of the Prophet ﷺ</div>
                  <span className="ta-seerah-yr">{dailySeerah.year}</span>
                  <div className="ta-seerah-ttl">{dailySeerah.title}</div>
                  <div className="ta-seerah-txt">{dailySeerah.text}</div>
                </div>
              </>
            )}

          </div>

          {/* Enrol CTA */}
          <div style={{ textAlign:"center", marginTop:44 }}>
            <p style={{ color:"rgba(255,255,255,.45)", fontSize:14, marginBottom:18 }}>
              These are just glimpses — immerse yourself in the full curriculum at Tahleem Academy.
            </p>
            <button className="ta-btn-p" onClick={() => navigate("/register")}>
              Begin Your Journey →
            </button>
          </div>

        </div>
      </section>

      {/* PILLARS */}
      <section className="ta-pillars">
        <div className="ta-pillars-inner">
          <div className="ta-pillars-hdr">
            <div>
              <div className="ta-eyebrow"><span className="ta-eyebrow-line" />Our Foundation</div>
              <h2 className="ta-heading">Seeking Knowledge<br />Is an Act of Worship</h2>
            </div>
            <div>
              <span className="ta-pillars-ar">وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ</span>
              <p className="ta-body">The Prophet ﷺ said: <strong style={{ color:"#0c2115" }}>"Seeking knowledge is an obligation upon every Muslim."</strong> At Tahleem Academy, we honour this sacred trust — nurturing mind, heart, and soul through authentic Islamic education.</p>
            </div>
          </div>
          <div className="ta-pillars-grid">
            {[
              { n:"01", icon:"🕌", title:"Traditional Scholarship",  text:"Our curriculum is rooted in authentic Islamic scholarship — the same knowledge passed down through generations of scholars." },
              { n:"02", icon:"📖", title:"Qur'an & Tajweed",         text:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules and Hifdh support." },
              { n:"03", icon:"🌐", title:"Arabic Language",           text:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic in a bilingual environment." },
              { n:"04", icon:"💻", title:"Live Interactive Classes",  text:"Real-time lessons with qualified teachers, shared whiteboards, recitation sessions and recorded replays for every student." },
              { n:"05", icon:"📊", title:"Progress Tracking",         text:"Detailed transcripts, term results and performance reports help students and parents stay informed at every stage." },
              { n:"06", icon:"🏆", title:"Certified Programmes",      text:"Earn recognised certificates in Arabic Language, Tajweed, Quran Memorisation and Islamic Sciences upon completion." },
            ].map(p => (
              <div className="ta-pillar" key={p.n}>
                <div className="ta-pillar-n">{p.n}</div>
                <span className="ta-pillar-icon">{p.icon}</span>
                <div className="ta-pillar-title">{p.title}</div>
                <p className="ta-pillar-text">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COURSES — fixed images */}
      <section className="ta-courses">
        <div className="ta-courses-inner">
          <div className="ta-courses-hdr">
            <div className="ta-courses-hdr-left">
              <div className="ta-eyebrow" style={{ color:"#e8c270" }}><span className="ta-eyebrow-line" style={{ background:"#c9973a" }} />Our Programs</div>
              <h2 className="ta-heading" style={{ color:"#fff", marginBottom:10 }}>Explore Our Courses</h2>
              <p className="ta-body" style={{ color:"rgba(255,255,255,.52)", marginBottom:0 }}>Each course is carefully structured with live sessions, assignments, and certified assessments.</p>
            </div>
            <button className="ta-courses-all" onClick={() => navigate("/register")}>
              View All &amp; Enrol →
            </button>
          </div>
          <div className="ta-courses-grid">
            {[
              { img:"https://images.unsplash.com/photo-1585036156171-384164a8c675?w=600&q=80",  badge:"Most Popular",      ar:"القرآن والتجويد",   en:"Quran & Tajweed",   desc:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules and Hifdh support.", level:"All Levels" },
              { img:"https://images.unsplash.com/photo-1519817650390-64a93db51149?w=600&q=80",  badge:"Beginner Friendly", ar:"اللغة العربية",     en:"Arabic Language",   desc:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic in a structured bilingual setting.", level:"All Levels" },
              { img:"https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600&q=80",  badge:"Certified",         ar:"العلوم الإسلامية",  en:"Islamic Sciences",  desc:"Fiqh, Aqeedah, Seerah, Hadith — comprehensive Islamic education delivered by qualified scholars.", level:"Intermediate+" },
            ].map(c => (
              <div className="ta-ccard" key={c.en}>
                <div className="ta-ccard-img">
                  <img src={c.img} alt={c.en} />
                  <div className="ta-ccard-img-overlay" />
                  <div className="ta-ccard-badge">{c.badge}</div>
                  <div className="ta-ccard-level-pill">⭐ {c.level}</div>
                </div>
                <div className="ta-ccard-body">
                  <div className="ta-ccard-ar">{c.ar}</div>
                  <div className="ta-ccard-en">{c.en}</div>
                  <div className="ta-ccard-desc">{c.desc}</div>
                  <div className="ta-ccard-footer">
                    <span className="ta-ccard-level">✦ Certified Programme</span>
                    <button className="ta-ccard-btn" onClick={() => navigate("/register")}>Enrol Now</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="ta-stats">
        <div className="ta-stats-inner">
          <span className="ta-stats-ar">الحمد لله على نعمة العلم</span>
          <h2 className="ta-stats-title">Growing Together in Knowledge</h2>
          <div className="ta-stats-grid">
            {[["500+","Lessons Delivered"],["3","Certified Scholars"],["95%","Student Satisfaction"],["4","Core Programs"]].map(([n, l]) => (
              <div className="ta-stat" key={l}>
                <div className="ta-stat-n">{n}</div>
                <div className="ta-stat-l">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ta-cta">
        <div className="ta-cta-inner">
          <span className="ta-cta-ar">اطلبوا العلم من المهد إلى اللحد</span>
          <h2 className="ta-cta-heading">Begin Your Journey Today</h2>
          <p className="ta-cta-text">Join Tahleem Academy and take your first step towards mastering Arabic and Islamic knowledge — guided by qualified scholars, supported every step of the way.</p>
          <button className="ta-cta-btn" onClick={() => navigate("/register")}>Enrol Now →</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ta-footer">
        <div className="ta-footer-top">
          <div>
            <div className="ta-footer-brand">
              <div className="ta-footer-logo">📖</div>
              <div>
                <div className="ta-footer-name">Tahleem Academy</div>
                <div className="ta-footer-name-ar">أكاديمية التعليم</div>
              </div>
            </div>
            <p className="ta-footer-tag">Empowering students to master Arabic and Islamic knowledge through structured learning and certified excellence.</p>
            <div className="ta-footer-socials">
              <a href="mailto:Tahleemacademy09@gmail.com" className="ta-social">✉️ Email</a>
              <a href="https://wa.me/2348163310471" className="ta-social">💬 WhatsApp</a>
            </div>
          </div>
          <div>
            <h4 className="ta-footer-hd">Quick Links</h4>
            <ul className="ta-footer-links">
              {[{label:"🏠 Home",path:"/"},{label:"📚 Courses",path:"/courses"},{label:"ℹ️ About Us",path:"/about"},{label:"📞 Contact",path:"/contact"}].map(l => (
                <li key={l.label}><a onClick={() => navigate(l.path)}>{l.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-hd">Programs</h4>
            <ul className="ta-footer-links">
              {["🔤 Arabic Language","🎵 Tajweed","📖 Quran Memorisation","⚖️ Islamic Fiqh","🕌 Islamic Sciences"].map(l => (
                <li key={l}><a href="#">{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-hd">Contact Us</h4>
            <ul className="ta-footer-contacts">
              <li className="ta-footer-ci"><span className="ta-contact-icon">✉️</span><a href="mailto:Tahleemacademy09@gmail.com">Tahleemacademy09@gmail.com</a></li>
              <li className="ta-footer-ci"><span className="ta-contact-icon">📱</span><a href="tel:+2348163310471">+234 816 331 0471</a></li>
              <li className="ta-footer-ci"><span className="ta-contact-icon">💬</span><a href="https://wa.me/2348163310471">WhatsApp Us</a></li>
            </ul>
          </div>
        </div>
        <div className="ta-footer-btm">
          <div className="ta-footer-du">وَقُل رَّبِّ زِدْنِي عِلْمًا</div>
          <div className="ta-footer-copy">© 2026 Tahleem Academy · All Rights Reserved · Built with ❤️ for the Ummah</div>
        </div>
      </footer>

    </div>
  );
};

export default Index;
