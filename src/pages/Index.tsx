import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveTasjeelStep, TASJEEL_ROUTES } from "@/hooks/useTasjeel";

const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

const ISLAMIC_EVENTS = [
  { hijriMonth: 12, hijriDay: 10, name: "Eid al-Adha",                nameAr: "عيد الأضحى المبارك",    emoji: "🐑", daysWindow: 3 },
  { hijriMonth: 12, hijriDay: 9,  name: "Day of Arafah",              nameAr: "يوم عرفة",               emoji: "🕋", daysWindow: 0 },
  { hijriMonth: 12, hijriDay: 1,  name: "First Days of Dhul Hijjah",  nameAr: "أيام ذي الحجة المباركة", emoji: "🕋", daysWindow: 7 },
  { hijriMonth: 10, hijriDay: 1,  name: "Eid al-Fitr",                nameAr: "عيد الفطر المبارك",      emoji: "🎉", daysWindow: 3 },
  { hijriMonth: 9,  hijriDay: 27, name: "Laylat al-Qadr",             nameAr: "ليلة القدر",              emoji: "⭐", daysWindow: 2 },
  { hijriMonth: 9,  hijriDay: 21, name: "Last Ten Nights of Ramadan", nameAr: "العشر الأواخر",           emoji: "✨", daysWindow: 9 },
  { hijriMonth: 9,  hijriDay: 1,  name: "Ramadan Begins",             nameAr: "بداية رمضان",             emoji: "🌙", daysWindow: 3 },
  { hijriMonth: 7,  hijriDay: 27, name: "Isra' & Mi'raj",             nameAr: "الإسراء والمعراج",        emoji: "🌌", daysWindow: 2 },
  { hijriMonth: 3,  hijriDay: 12, name: "Mawlid al-Nabawi ﷺ",        nameAr: "المولد النبوي الشريف",    emoji: "💛", daysWindow: 4 },
  { hijriMonth: 1,  hijriDay: 10, name: "Day of Ashura",              nameAr: "يوم عاشوراء",             emoji: "🤲", daysWindow: 2 },
  { hijriMonth: 1,  hijriDay: 1,  name: "Islamic New Year",           nameAr: "رأس السنة الهجرية",      emoji: "🌙", daysWindow: 3 },
];

const VERSES = [
  { ar: "يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ", en: "Allah will raise those who have believed among you and those who were given knowledge, by degrees.", ref: "Surah Al-Mujadila, 58:11" },
  { ar: "اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ", en: "Read in the name of your Lord who created.", ref: "Surah Al-Alaq, 96:1" },
  { ar: "رَّبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Surah Ta-Ha, 20:114" },
  { ar: "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ", en: "And We have certainly made the Quran easy to remember. So is there anyone who will be mindful?", ref: "Surah Al-Qamar, 54:17" },
  { ar: "إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ", en: "Indeed, this Quran guides to that which is most upright.", ref: "Surah Al-Isra, 17:9" },
  { ar: "وَنَزَّلْنَا عَلَيْكَ الْكِتَابَ تِبْيَانًا لِّكُلِّ شَيْءٍ وَهُدًى وَرَحْمَةً", en: "And We have revealed to you the Book as clarification for all things, and as guidance and mercy.", ref: "Surah An-Nahl, 16:89" },
  { ar: "أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ", en: "Will they not ponder the Quran?", ref: "Surah An-Nisa, 4:82" },
  { ar: "إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ", en: "Indeed, it is We who sent down the Reminder, and indeed, We will be its guardian.", ref: "Surah Al-Hijr, 15:9" },
  { ar: "إِنَّمَا يَخْشَى اللَّهَ مِنْ عِبَادِهِ الْعُلَمَاءُ", en: "Among His servants, only the knowledgeable truly fear Allah.", ref: "Surah Fatir, 35:28" },
  { ar: "قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ", en: "Say: Are those who know equal to those who do not know?", ref: "Surah Az-Zumar, 39:9" },
  { ar: "وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ", en: "And above every possessor of knowledge is one more knowing.", ref: "Surah Yusuf, 12:76" },
  { ar: "كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ", en: "This is a blessed Book which We have revealed to you, that they might reflect upon its verses.", ref: "Surah Sad, 38:29" },
  { ar: "شَهِدَ اللَّهُ أَنَّهُ لَا إِلَٰهَ إِلَّا هُوَ وَالْمَلَائِكَةُ وَأُولُو الْعِلْمِ", en: "Allah bears witness that there is no deity except Him — and so do the angels and those of knowledge.", ref: "Surah Ali Imran, 3:18" },
];

const HADITHS = [
  { ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ", en: "Seeking knowledge is an obligation upon every Muslim.", source: "Ibn Majah 224", narrator: "Anas ibn Malik رضي الله عنه" },
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", source: "Sahih al-Bukhari 5027", narrator: "Uthman ibn Affan رضي الله عنه" },
  { ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever travels a path in search of knowledge, Allah will ease for him a path to Paradise.", source: "Sahih Muslim 2699", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ", en: "The most beloved deeds to Allah are those done consistently, even if they are few.", source: "Sahih al-Bukhari 6465", narrator: "Aishah رضي الله عنها" },
  { ar: "أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا", en: "The most complete of believers in faith is the best of them in character.", source: "Abu Dawud 4682", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ", en: "When a person dies, all deeds cease except three: ongoing charity, knowledge that benefits, or a righteous child who prays for them.", source: "Sahih Muslim 1631", narrator: "Abu Hurayrah رضي الله عنه" },
];

const SEERAH = [
  { title: "Al-Amin — The Trustworthy", year: "Before 610 CE", text: "Before a single verse was revealed, the people of Makkah unanimously called Muhammad ﷺ 'Al-Amin' — the Trustworthy. Merchants left valuables in his care; people sought his counsel in disputes. When he stood on Mount Safa to preach, even his enemies said: 'Yes — we have never known you to lie.' His character was his first and most powerful credential." },
  { title: "The First Revelation", year: "610 CE", text: "At forty, in the Cave of Hira, Jibreel (AS) commanded: 'Iqra!' (Read!). Trembling, the Prophet ﷺ returned to Khadijah (RA) who said: 'By Allah, He will never disgrace you — you maintain family ties, you speak truthfully, you carry the burdens of the weak.' Her certainty in his character was the first comfort after the greatest moment in human history." },
  { title: "The Great Hijrah", year: "622 CE", text: "Hunted by assassins, the Prophet ﷺ left Makkah at night. He and Abu Bakr (RA) hid in the Cave of Thawr for three days. When searchers came within metres, he said: 'O Abu Bakr, what do you think of two when Allah is their third?' Allah recorded this in the Quran (9:40). When he reached Madinah, the entire city came out singing: 'Tala'al badru alayna.' The Islamic calendar begins here." },
  { title: "Conquest of Makkah — Mercy in Victory", year: "630 CE", text: "With 10,000 companions, the Prophet ﷺ entered the city that had exiled and persecuted him — head bowed in humility, not pride. He asked the Quraysh who had tortured his followers: 'What do you think I will do with you?' They said: 'You are a noble brother.' He said: 'Go — you are all free.' No conqueror in history has shown such magnanimity." },
  { title: "The Farewell Sermon", year: "632 CE", text: "Standing on Arafat before 100,000+ companions, the Prophet ﷺ declared: 'An Arab has no superiority over a non-Arab — except through taqwa.' He asked: 'Have I delivered the message?' A hundred thousand voices replied: 'Yes!' Then came revelation: 'Today I have perfected your religion for you.' (5:3). Three months later, he returned to his Lord." },
  { title: "Khadijah رضي الله عنها — First Believer", year: "595–619 CE", text: "Khadijah (RA) was the first to believe in the Prophet ﷺ, the first to console him in fear, and she spent her entire wealth supporting Islam. Jibreel descended to send her the salaam of Allah and give her glad tidings of a house in Paradise of pearl." },
];

const Index = () => {
  const navigate = useNavigate();
  const { user, roles, loading: authLoading } = useAuth();
  const [liveClass, setLiveClass] = useState<{ title: string; room_code: string } | null>(null);
  const [liveClassChecked, setLiveClassChecked] = useState(false);
  const [showEnrollGuide, setShowEnrollGuide] = useState(false);
  const [activeReflection, setActiveReflection] = useState<"verse"|"hadith"|"seerah">("verse");
  const [upcomingEvent, setUpcomingEvent] = useState<{ event: typeof ISLAMIC_EVENTS[0]; daysAway: number } | null>(null);

  // ── Skip the marketing page entirely for an already-logged-in user ────────
  // This is what makes the PWA "always land on the dashboard": start_url is
  // "/", which renders this component. Without this check, a signed-in user
  // reopening the app (or the browser) would see the public homepage instead
  // of going straight back into their dashboard — the persisted Supabase
  // session was still valid, this page just never looked at it. Uses the same
  // resolver Login.tsx uses so a mid-registration student still lands on the
  // correct Tasjeel step instead of being dropped into a half-built dashboard.
  useEffect(() => {
    if (authLoading || !user) return; // no session, or still resolving it — show the homepage

    const isAdmin   = roles.includes("admin");
    const isTeacher = roles.includes("teacher");
    if (isAdmin)   { navigate("/admin",   { replace: true }); return; }
    if (isTeacher) { navigate("/teacher", { replace: true }); return; }

    (async () => {
      try {
        const step = await resolveTasjeelStep(user.id, user.email_confirmed_at, 5000);
        navigate(step === "completed" ? "/student" : (TASJEEL_ROUTES[step] ?? "/student"), { replace: true });
      } catch {
        navigate("/student", { replace: true });
      }
    })();
  }, [user, roles, authLoading, navigate]);

  const doy         = dayOfYear();
  const dailyVerse  = VERSES[doy % VERSES.length];
  const dailyHadith = HADITHS[doy % HADITHS.length];
  const dailySeerah = SEERAH[doy % SEERAH.length];

  useEffect(() => {
    const fetchHijriEvents = async () => {
      try {
        const today = new Date();
        const mm  = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        const res  = await fetch(`https://api.aladhan.com/v1/gToHCalendar/${mm}/${yyyy}`);
        const json = await res.json();
        const cal: any[] = json?.data ?? [];
        const hijriMap: Record<number, { day: number; month: number }> = {};
        for (const entry of cal) {
          const gDay = parseInt(entry.gregorian.date.split("-")[0]);
          hijriMap[gDay] = { day: parseInt(entry.hijri.day), month: entry.hijri.month.number };
        }
        let nextMap: Record<number, { day: number; month: number }> = {};
        if (today.getDate() >= 22) {
          const nextDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          const nr = await fetch(`https://api.aladhan.com/v1/gToHCalendar/${String(nextDate.getMonth()+1).padStart(2,"0")}/${nextDate.getFullYear()}`);
          const nd = await nr.json();
          for (const entry of nd?.data ?? []) {
            const gDay = parseInt(entry.gregorian.date.split("-")[0]);
            nextMap[gDay] = { day: parseInt(entry.hijri.day), month: entry.hijri.month.number };
          }
        }
        for (let i = 0; i <= 10; i++) {
          const check  = new Date(today.getTime() + i * 86_400_000);
          const gDay   = check.getDate();
          const isNext = check.getMonth() !== today.getMonth();
          const hijri  = isNext ? nextMap[gDay] : hijriMap[gDay];
          if (!hijri) continue;
          for (const ev of ISLAMIC_EVENTS) {
            const diff = hijri.day - ev.hijriDay;
            if (hijri.month === ev.hijriMonth && diff >= 0 && diff <= ev.daysWindow) {
              setUpcomingEvent({ event: ev, daysAway: i });
              return;
            }
          }
        }
        setUpcomingEvent(null);
      } catch { setUpcomingEvent(null); }
    };
    fetchHijriEvents();
  }, []);

  useEffect(() => {
    supabase.from("public_classes").select("title, room_code").eq("status", "live").eq("is_featured", true).limit(1).then(({ data }) => {
      if (data && data.length > 0) setLiveClass(data[0] as { title: string; room_code: string });
      // Mark checked regardless of result — prevents the banner from flashing
      // in after mount when the fetch resolves and liveClass jumps null → value,
      // causing a layout shift that looks like blinking on the web view.
      setLiveClassChecked(true);
    });
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=Mulish:wght@400;500;600;700;800;900&family=Cairo:wght@400;600;700&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.innerHTML = `
      .ta-root * { margin:0; padding:0; box-sizing:border-box; }
      .ta-root { font-family:'Mulish',sans-serif; background:#fdf8f0; color:#111; overflow-x:hidden; }

      /* ── ANIMATIONS ── */
      @keyframes fadeUp    { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
      @keyframes scaleIn   { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
      @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.3} }
      @keyframes goldGlow  { 0%,100%{text-shadow:0 0 40px rgba(240,192,96,.3)} 50%{text-shadow:0 0 80px rgba(240,192,96,.7),0 0 120px rgba(201,151,58,.4)} }
      @keyframes starSpin  { from{transform:rotate(0deg) scale(1)} to{transform:rotate(360deg) scale(1)} }
      @keyframes starPulse { 0%,100%{opacity:.06;transform:scale(1)} 50%{opacity:.12;transform:scale(1.05)} }
      @keyframes shimmerLine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      @keyframes floatUp   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }

      /* ── LIVE BANNER ── */
      .ta-live-banner { background:linear-gradient(90deg,#061a0b,#0c2e14,#061a0b); border-bottom:2px solid #c9973a; padding:12px 24px; display:flex; align-items:center; justify-content:center; gap:12px; cursor:pointer; transition:.2s; }
      .ta-live-banner:hover { background:linear-gradient(90deg,#0a2812,#163d1e,#0a2812); }
      .ta-live-dot { width:10px; height:10px; background:#ef4444; border-radius:50%; animation:pulse 1.2s infinite; box-shadow:0 0 10px rgba(239,68,68,.6); flex-shrink:0; }
      .ta-live-text { color:#fff; font-weight:800; font-size:14px; font-family:'Mulish',sans-serif; letter-spacing:.3px; }
      .ta-live-text span { color:#f0c060; }

      /* ── HERO ── */
      .ta-hero { position:relative; min-height:min(100vh,880px); display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; }
      .ta-hero-bg { position:absolute; inset:0; background:radial-gradient(ellipse at center,#0f2e1c 0%,#0a1f12 55%,#040e06 100%); }
      .ta-hero-bg::before { content:''; position:absolute; inset:0; background-image:url('/brand-logo.png'); background-repeat:no-repeat; background-position:center; background-size:min(70vh,640px); opacity:.14; filter:saturate(1.1); }
      @media(min-width:961px) { .ta-hero-bg::before { display:none; } }
      .ta-hero-overlay { position:absolute; inset:0; background:linear-gradient(165deg,rgba(4,14,7,.72) 0%,rgba(8,28,16,.4) 45%,rgba(4,12,7,.75) 100%); }

      /* Geometric star behind hero text — the signature element */
      .ta-hero-star { position:absolute; top:50%; left:50%; transform:translate(-50%,-52%); width:min(700px,110vw); height:min(700px,110vw); pointer-events:none; animation:starPulse 6s ease-in-out infinite; }
      .ta-hero-star svg { width:100%; height:100%; }

      /* Gold arch lines */
      .ta-hero-arch { position:absolute; top:0; left:50%; transform:translateX(-50%); width:min(560px,90vw); height:100%; border-left:1px solid rgba(240,192,96,.12); border-right:1px solid rgba(240,192,96,.12); pointer-events:none; }
      .ta-hero-arch::before { content:''; position:absolute; top:0; left:-1px; right:-1px; height:3px; background:linear-gradient(90deg,transparent,#f0c060,transparent); }
      .ta-hero-arch::after  { content:''; position:absolute; bottom:0; left:-1px; right:-1px; height:2px; background:linear-gradient(90deg,transparent,rgba(240,192,96,.4),transparent); }

      .ta-hero-content { position:relative; z-index:2; text-align:center; padding:clamp(40px,10vh,100px) 24px clamp(60px,10vh,100px); max-width:760px; width:100%; animation:scaleIn 1s ease both; }

      .ta-hero-badge { display:inline-flex; align-items:center; gap:10px; background:rgba(240,192,96,.08); border:1px solid rgba(240,192,96,.28); color:#f0c060; padding:8px 22px; border-radius:40px; font-size:10.5px; letter-spacing:2.5px; text-transform:uppercase; font-weight:800; margin-bottom:32px; animation:fadeUp .7s .1s ease both; }

      .ta-hero-bismi { font-family:'Scheherazade New',serif; font-size:clamp(28px,5.5vw,54px); color:#fff; line-height:1.7; direction:rtl; margin-bottom:8px; animation:goldGlow 4s ease-in-out infinite, fadeUp .7s .2s ease both; }

      .ta-divider { display:flex; align-items:center; gap:16px; justify-content:center; margin:16px 0 24px; animation:fadeUp .7s .25s ease both; }
      .ta-divider-line { flex:1; max-width:120px; height:1px; background:linear-gradient(90deg,transparent,rgba(240,192,96,.5),transparent); }
      .ta-divider-gem { color:#f0c060; font-size:10px; }

      .ta-hero-title { font-family:'Playfair Display',serif; font-size:clamp(40px,7vw,76px); font-weight:800; color:#fff; line-height:1.05; margin-bottom:8px; animation:fadeUp .7s .3s ease both; letter-spacing:-1px; text-shadow:0 4px 24px rgba(0,0,0,.55); }
      .ta-hero-title em { font-style:italic; color:#f0c060; display:block; }

      .ta-hero-sub { color:rgba(255,255,255,.75); font-size:clamp(15px,2.2vw,18px); line-height:1.9; max-width:560px; margin:20px auto 40px; font-weight:400; animation:fadeUp .7s .4s ease both; text-shadow:0 2px 12px rgba(0,0,0,.5); }

      .ta-hero-btns { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; animation:fadeUp .7s .5s ease both; }

      .ta-btn-primary { padding:16px 44px; background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; border:none; border-radius:6px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:900; cursor:pointer; transition:.3s; letter-spacing:.5px; box-shadow:0 8px 32px rgba(201,151,58,.45); }
      .ta-btn-primary:hover { transform:translateY(-3px); box-shadow:0 16px 48px rgba(240,192,96,.55); background:linear-gradient(135deg,#dba94b,#f5ce6a); }
      .ta-btn-secondary { padding:16px 44px; background:transparent; border:1.5px solid rgba(255,255,255,.3); color:#fff; border-radius:6px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:700; cursor:pointer; transition:.3s; }
      .ta-btn-secondary:hover { border-color:rgba(240,192,96,.7); color:#f0c060; background:rgba(240,192,96,.06); }

      .ta-hero-scroll { position:absolute; bottom:32px; left:50%; transform:translateX(-50%); z-index:2; display:flex; flex-direction:column; align-items:center; gap:8px; opacity:.4; }
      .ta-scroll-label { color:#fff; font-size:9px; letter-spacing:3px; text-transform:uppercase; font-weight:700; }
      .ta-scroll-line  { width:1px; height:44px; background:linear-gradient(to bottom,rgba(240,192,96,.6),transparent); animation:floatUp 2.5s ease-in-out infinite; }

      /* ── ENROLLMENT GUIDE ── */
      .ta-guide { background:rgba(2,10,5,.88); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(240,192,96,.22); border-radius:12px; padding:24px 26px; max-width:440px; width:100%; margin-top:8px; animation:fadeUp .3s ease both; text-align:left; }
      .ta-guide-label { font-size:9px; font-weight:900; color:#f0c060; letter-spacing:3px; text-transform:uppercase; margin-bottom:18px; }
      .ta-guide-step { display:flex; gap:14px; align-items:flex-start; margin-bottom:14px; }
      .ta-guide-num { width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; flex-shrink:0; }
      .ta-guide-stitle { font-size:13px; font-weight:800; color:#fff; margin:0 0 2px; }
      .ta-guide-sdesc  { font-size:11px; color:rgba(255,255,255,.45); margin:0; line-height:1.5; }
      .ta-guide-cta { width:100%; margin-top:10px; padding:13px; border-radius:7px; border:none; background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; font-size:14px; font-weight:900; cursor:pointer; font-family:'Mulish',sans-serif; transition:.2s; }
      .ta-guide-cta:hover { opacity:.9; }

      /* ── FEATURE STRIP (auto-scrolling marquee) ── */
      .ta-strip { background:#081810; border-top:1px solid rgba(240,192,96,.15); border-bottom:1px solid rgba(240,192,96,.15); padding:0; display:flex; overflow:hidden; }
      .ta-strip-track { display:flex; align-items:stretch; width:max-content; animation: ta-strip-scroll 28s linear infinite; }
      .ta-strip:hover .ta-strip-track { animation-play-state:paused; }
      .ta-strip-inner { display:flex; align-items:stretch; }
      .ta-strip-item { display:flex; align-items:center; gap:9px; color:rgba(255,255,255,.75); font-size:13px; font-weight:700; padding:18px 26px; border-right:1px solid rgba(240,192,96,.1); white-space:nowrap; transition:.2s; }
      .ta-strip-item:last-child { border-right:none; }
      .ta-strip-item:hover { color:#f0c060; }
      .ta-strip-icon { font-size:16px; }
      @keyframes ta-strip-scroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
      @media (prefers-reduced-motion: reduce) { .ta-strip-track { animation:none; } }

      /* ── DAILY REFLECTIONS ── */
      .ta-daily { padding:100px 24px; background:#071410; position:relative; overflow:hidden; }
      .ta-daily-pattern { position:absolute; inset:0; opacity:.045; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cpolygon points='50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5' fill='none' stroke='%23f0c060' stroke-width='.8'/%3E%3Cpolygon points='50,18 82,34 82,66 50,82 18,66 18,34' fill='none' stroke='%23f0c060' stroke-width='.5'/%3E%3Ccircle cx='50' cy='50' r='16' fill='none' stroke='%23f0c060' stroke-width='.4'/%3E%3C/svg%3E"); pointer-events:none; }
      .ta-daily-glow { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(201,151,58,.06) 0%,transparent 70%); pointer-events:none; }
      .ta-daily-inner { max-width:1080px; margin:0 auto; position:relative; z-index:1; }

      .ta-section-badge { display:inline-flex; align-items:center; gap:10px; background:rgba(240,192,96,.08); border:1px solid rgba(240,192,96,.25); color:#f0c060; padding:8px 22px; border-radius:40px; font-size:10px; letter-spacing:2.5px; text-transform:uppercase; font-weight:800; margin-bottom:20px; }
      .ta-section-heading { font-family:'Playfair Display',serif; font-size:clamp(28px,4.5vw,46px); font-weight:700; color:#fff; line-height:1.15; margin-bottom:12px; }
      .ta-section-sub { color:rgba(255,255,255,.45); font-size:15px; line-height:1.8; }
      .ta-section-hdr { text-align:center; margin-bottom:56px; }

      /* Event banner */
      .ta-event-banner { background:linear-gradient(135deg,rgba(240,192,96,.12),rgba(201,151,58,.06)); border:1.5px solid rgba(240,192,96,.3); border-radius:14px; padding:18px 26px; display:flex; align-items:center; gap:18px; margin-bottom:40px; }
      .ta-event-emoji { font-size:32px; flex-shrink:0; animation:floatUp 3s ease-in-out infinite; }
      .ta-event-label { font-size:9px; font-weight:800; color:#f0c060; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:4px; }
      .ta-event-name  { font-size:17px; font-weight:800; color:#fff; }
      .ta-event-pill  { margin-left:auto; background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; font-size:10px; font-weight:900; padding:6px 16px; border-radius:20px; white-space:nowrap; flex-shrink:0; letter-spacing:.5px; }

      /* Tabs */
      .ta-tabs { display:flex; justify-content:center; gap:0; margin-bottom:44px; background:rgba(255,255,255,.04); border:1px solid rgba(240,192,96,.18); border-radius:10px; overflow:hidden; width:fit-content; margin-left:auto; margin-right:auto; }
      .ta-tab  { padding:13px 32px; background:transparent; border:none; color:rgba(255,255,255,.4); font-family:'Mulish',sans-serif; font-size:13px; font-weight:800; cursor:pointer; transition:.2s; white-space:nowrap; border-right:1px solid rgba(240,192,96,.12); letter-spacing:.3px; }
      .ta-tab:last-child { border-right:none; }
      .ta-tab.active { background:linear-gradient(135deg,rgba(201,151,58,.2),rgba(240,192,96,.1)); color:#f0c060; }
      .ta-tab:hover:not(.active) { color:rgba(255,255,255,.75); background:rgba(255,255,255,.04); }

      /* Content cards */
      .ta-content-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }

      .ta-verse-card { background:linear-gradient(160deg,rgba(255,255,255,.045),rgba(255,255,255,.02)); border:1px solid rgba(240,192,96,.2); border-radius:18px; padding:44px 38px; text-align:center; position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; }
      .ta-verse-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,transparent,#f0c060,transparent); }
      .ta-verse-card::after  { content:''; position:absolute; top:0; left:0; width:100%; height:100%; background:radial-gradient(ellipse at 50% 0%,rgba(240,192,96,.06) 0%,transparent 70%); pointer-events:none; }
      .ta-verse-label { font-size:9px; font-weight:900; color:#f0c060; letter-spacing:3px; text-transform:uppercase; margin-bottom:26px; position:relative; z-index:1; }
      .ta-verse-ar { font-family:'Scheherazade New',serif; font-size:clamp(24px,3.8vw,40px); color:#fff; direction:rtl; line-height:1.9; margin-bottom:24px; position:relative; z-index:1; }
      .ta-verse-divrow { display:flex; align-items:center; gap:16px; justify-content:center; margin:0 0 20px; position:relative; z-index:1; }
      .ta-verse-dline { flex:1; max-width:80px; height:1px; background:linear-gradient(90deg,transparent,rgba(240,192,96,.5),transparent); }
      .ta-verse-en { font-family:'Playfair Display',serif; font-style:italic; font-size:clamp(15px,2.2vw,19px); color:#f0c060; line-height:1.7; margin-bottom:16px; position:relative; z-index:1; }
      .ta-verse-ref { font-size:10px; color:rgba(255,255,255,.28); letter-spacing:2px; text-transform:uppercase; position:relative; z-index:1; }

      .ta-hadith-card { background:linear-gradient(160deg,rgba(10,28,18,.98),rgba(16,42,28,.98)); border:1px solid rgba(240,192,96,.2); border-radius:18px; padding:36px 32px; position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; }
      .ta-hadith-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,transparent,#f0c060,transparent); }
      .ta-hadith-label { font-size:9px; font-weight:900; color:#f0c060; letter-spacing:3px; text-transform:uppercase; margin-bottom:20px; }
      .ta-hadith-ar  { font-family:'Scheherazade New',serif; font-size:clamp(20px,3vw,30px); color:#fff; direction:rtl; line-height:1.95; text-align:center; margin-bottom:18px; }
      .ta-hadith-bar { width:40px; height:2px; background:linear-gradient(90deg,#c9973a,#f0c060); margin:0 auto 16px; border-radius:2px; }
      .ta-hadith-en  { font-size:clamp(13px,1.9vw,15.5px); font-style:italic; color:rgba(255,255,255,.82); line-height:1.8; text-align:center; margin-bottom:18px; }
      .ta-hadith-src { text-align:center; }
      .ta-hadith-src-main { font-size:12px; font-weight:800; color:#f0c060; display:block; margin-bottom:3px; }
      .ta-hadith-src-sub  { font-size:10px; color:rgba(255,255,255,.32); }

      .ta-seerah-card { background:linear-gradient(160deg,rgba(255,248,220,.05),rgba(201,151,58,.04)); border:1px solid rgba(240,192,96,.18); border-radius:18px; padding:32px 30px; position:relative; overflow:hidden; display:flex; flex-direction:column; }
      .ta-seerah-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,transparent,#f0c060,transparent); }
      .ta-seerah-label { font-size:9px; font-weight:900; color:#f0c060; letter-spacing:3px; text-transform:uppercase; margin-bottom:16px; }
      .ta-seerah-yr    { font-size:10px; font-weight:800; color:rgba(240,192,96,.7); background:rgba(240,192,96,.08); border:1px solid rgba(240,192,96,.2); border-radius:20px; padding:4px 14px; display:inline-block; margin-bottom:12px; }
      .ta-seerah-title { font-family:'Playfair Display',serif; font-size:clamp(16px,2.2vw,21px); font-weight:700; color:#fff; margin-bottom:14px; line-height:1.3; }
      .ta-seerah-text  { font-size:14px; color:rgba(255,255,255,.62); line-height:1.9; }

      /* ── FOUNDATION / PILLARS ── */
      .ta-pillars { padding:100px 24px; background:#fdf8f0; }
      .ta-pillars-inner { max-width:1120px; margin:0 auto; }
      .ta-pillars-intro { display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:center; margin-bottom:72px; }
      .ta-eyebrow { display:inline-flex; align-items:center; gap:10px; color:#c9973a; font-size:10px; letter-spacing:3px; text-transform:uppercase; font-weight:900; margin-bottom:16px; }
      .ta-eyebrow-line { display:block; width:32px; height:2px; background:linear-gradient(90deg,#c9973a,#f0c060); border-radius:2px; }
      .ta-light-heading { font-family:'Playfair Display',serif; font-size:clamp(30px,4.5vw,50px); font-weight:700; color:#081810; line-height:1.1; margin-bottom:18px; letter-spacing:-.5px; }
      .ta-light-body { font-size:16px; color:#4a5a4e; line-height:1.9; }
      .ta-pillars-quote { background:linear-gradient(160deg,#0a1f12,#0f2e1c); border-radius:18px; padding:36px 32px; text-align:center; position:relative; overflow:hidden; }
      .ta-pillars-quote::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,transparent,#f0c060,transparent); }
      .ta-pillars-qar { font-family:'Scheherazade New',serif; font-size:clamp(22px,3vw,34px); color:#f0c060; direction:rtl; line-height:1.8; margin-bottom:14px; }
      .ta-pillars-qen { font-family:'Playfair Display',serif; font-style:italic; font-size:15px; color:rgba(255,255,255,.7); line-height:1.7; }
      .ta-pillars-qref { font-size:10px; color:rgba(255,255,255,.3); letter-spacing:2px; text-transform:uppercase; margin-top:12px; }

      .ta-grid-6 { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; }
      .ta-pillar { background:#fff; border:1px solid rgba(201,151,58,.14); border-radius:16px; box-shadow:0 4px 24px rgba(8,24,16,.06); padding:38px 32px; transition:.35s cubic-bezier(.25,.46,.45,.94); position:relative; overflow:hidden; }
      .ta-pillar::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#c9973a,#f0c060); transform:scaleX(0); transform-origin:left; transition:.4s ease; }
      .ta-pillar:hover { box-shadow:0 12px 36px rgba(8,24,16,.12); border-color:rgba(201,151,58,.35); transform:translateY(-4px); }
      .ta-pillar:hover::after { transform:scaleX(1); }
      .ta-pillar-num  { font-family:'Playfair Display',serif; font-size:52px; font-weight:700; color:rgba(201,151,58,.1); line-height:1; margin-bottom:16px; }
      .ta-pillar-icon { font-size:28px; margin-bottom:14px; display:block; }
      .ta-pillar-name { font-size:16px; font-weight:900; color:#081810; margin-bottom:10px; }
      .ta-pillar-desc { font-size:13.5px; color:#6a7a6e; line-height:1.85; }

      /* ── COURSES ── */
      .ta-courses { background:linear-gradient(180deg,#040e06 0%,#081810 100%); padding:104px 24px; position:relative; overflow:hidden; }
      .ta-courses-pattern { position:absolute; inset:0; opacity:.03; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpolygon points='40,4 76,22 76,58 40,76 4,58 4,22' fill='none' stroke='%23f0c060' stroke-width='.7'/%3E%3C/svg%3E"); pointer-events:none; }
      .ta-courses-inner { max-width:1160px; margin:0 auto; position:relative; z-index:1; }
      .ta-courses-hdr { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:56px; flex-wrap:wrap; }
      .ta-courses-link { display:inline-flex; align-items:center; gap:8px; color:#f0c060; font-size:13px; font-weight:800; border:1.5px solid rgba(240,192,96,.3); padding:11px 24px; border-radius:40px; cursor:pointer; transition:.25s; white-space:nowrap; }
      .ta-courses-link:hover { background:rgba(240,192,96,.1); border-color:#f0c060; }
      .ta-courses-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }

      .ta-card { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:20px; overflow:hidden; transition:.4s cubic-bezier(.25,.46,.45,.94); display:flex; flex-direction:column; }
      .ta-card:hover { border-color:rgba(240,192,96,.45); transform:translateY(-10px); background:rgba(255,255,255,.07); box-shadow:0 32px 72px rgba(0,0,0,.6),0 0 0 1px rgba(240,192,96,.15),0 0 60px rgba(201,151,58,.08); }
      .ta-card-img { height:230px; overflow:hidden; position:relative; flex-shrink:0; }
      .ta-card-img img { width:100%; height:100%; object-fit:cover; transition:.6s ease; filter:brightness(.85); }
      .ta-card:hover .ta-card-img img { transform:scale(1.1); filter:brightness(1); }
      .ta-card-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(4,14,7,.9) 0%,rgba(4,14,7,.3) 55%,transparent 100%); }
      .ta-card-badge { position:absolute; top:16px; left:16px; background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; font-size:9.5px; font-weight:900; padding:5px 14px; border-radius:40px; letter-spacing:1px; text-transform:uppercase; box-shadow:0 4px 18px rgba(201,151,58,.5); }
      .ta-card-level { position:absolute; bottom:16px; right:16px; background:rgba(0,0,0,.5); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.15); color:#fff; font-size:10px; font-weight:700; padding:4px 12px; border-radius:40px; }
      .ta-card-body { padding:28px 26px 30px; display:flex; flex-direction:column; flex:1; }
      .ta-card-ar { font-family:'Scheherazade New',serif; font-size:21px; color:#f0c060; direction:rtl; margin-bottom:8px; line-height:1.5; }
      .ta-card-en { font-family:'Playfair Display',serif; color:#fff; font-size:20px; font-weight:800; margin-bottom:12px; line-height:1.2; }
      .ta-card-desc { color:rgba(255,255,255,.5); font-size:13.5px; line-height:1.85; margin-bottom:26px; flex:1; }
      .ta-card-footer { display:flex; align-items:center; justify-content:space-between; padding-top:18px; border-top:1px solid rgba(255,255,255,.07); }
      .ta-card-cert { color:rgba(240,192,96,.7); font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
      .ta-card-btn { padding:10px 24px; background:transparent; border:1.5px solid rgba(240,192,96,.5); color:#f0c060; border-radius:40px; font-size:12px; font-weight:800; cursor:pointer; font-family:'Mulish',sans-serif; transition:.25s; }
      .ta-card-btn:hover { background:linear-gradient(135deg,#c9973a,#f0c060); color:#0a1f12; border-color:transparent; box-shadow:0 8px 28px rgba(201,151,58,.45); }

      /* ── STATS ── */
      .ta-stats { position:relative; padding:96px 24px; overflow:hidden; background:#040e06; }
      .ta-stats-bg { position:absolute; inset:0; background-image:url('https://images.unsplash.com/photo-1585036156171-384164a8c675?w=1600&q=80'); background-size:cover; background-position:center; filter:brightness(.15) saturate(.6); }
      .ta-stats-inner { position:relative; z-index:1; max-width:1000px; margin:0 auto; text-align:center; }
      .ta-stats-ar { font-family:'Scheherazade New',serif; font-size:26px; color:rgba(240,192,96,.55); margin-bottom:8px; display:block; }
      .ta-stats-title { font-family:'Playfair Display',serif; font-size:clamp(28px,4vw,42px); font-weight:700; color:#fff; margin-bottom:64px; }
      .ta-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); }
      .ta-stat { padding:32px 20px; border-right:1px solid rgba(240,192,96,.1); position:relative; }
      .ta-stat:last-child { border-right:none; }
      .ta-stat-num { font-family:'Playfair Display',serif; font-size:clamp(44px,6vw,64px); color:#f0c060; font-weight:700; line-height:1; display:block; }
      .ta-stat-label { color:rgba(255,255,255,.5); font-size:13px; margin-top:10px; letter-spacing:.5px; display:block; }

      /* ── CTA ── */
      .ta-cta { padding:104px 24px; text-align:center; background:#fdf8f0; position:relative; overflow:hidden; }
      .ta-cta::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 50% 100%,rgba(201,151,58,.06) 0%,transparent 70%); pointer-events:none; }
      .ta-cta-inner { max-width:640px; margin:0 auto; position:relative; z-index:1; }
      .ta-cta-ar { font-family:'Scheherazade New',serif; font-size:32px; color:#c9973a; margin-bottom:24px; display:block; direction:rtl; }
      .ta-cta-heading { font-family:'Playfair Display',serif; font-size:clamp(30px,5vw,52px); color:#081810; font-weight:700; margin-bottom:16px; line-height:1.15; letter-spacing:-.5px; }
      .ta-cta-text { font-size:16px; color:#5a6a5e; margin-bottom:44px; line-height:1.9; }
      .ta-cta-btn { display:inline-block; padding:18px 60px; background:linear-gradient(135deg,#0a1f12,#163d24); color:#fff; border:none; font-family:'Mulish',sans-serif; font-size:16px; font-weight:800; cursor:pointer; transition:.3s; letter-spacing:.5px; border-radius:6px; box-shadow:0 8px 32px rgba(8,24,16,.3); }
      .ta-cta-btn:hover { background:linear-gradient(135deg,#163d24,#1e5430); transform:translateY(-3px); box-shadow:0 20px 48px rgba(8,24,16,.4); }
      .ta-cta-note { font-size:12px; color:#aaa; margin-top:16px; }

      /* ── RESPONSIVE ── */
      @media(max-width:960px) {
        .ta-pillars-intro { grid-template-columns:1fr; gap:32px; }
        .ta-grid-6 { grid-template-columns:1fr 1fr; }
        .ta-courses-grid { grid-template-columns:1fr 1fr; gap:20px; }
        .ta-courses-hdr { flex-direction:column; align-items:flex-start; }
        .ta-stats-grid { grid-template-columns:1fr 1fr; }
        .ta-content-grid { grid-template-columns:1fr; }
        .ta-strip-inner { gap:0; }
      }
      @media(max-width:620px) {
        .ta-grid-6 { grid-template-columns:1fr; }
        .ta-courses-grid { grid-template-columns:1fr; }
        .ta-stats-grid { grid-template-columns:1fr 1fr; }
        .ta-tabs { flex-wrap:wrap; width:100%; }
        .ta-tab { flex:1; min-width:90px; padding:11px 14px; font-size:12px; }
        .ta-btn-primary, .ta-btn-secondary { padding:14px 28px; font-size:14px; }
        .ta-stat-num { font-size:40px; }

        /* FIX: .ta-hero vertically centers its content inside a full 100vh
           section. On mobile that leaves a large empty gap above the badge
           on first paint (roughly a third of the screen), pushing the
           enrol buttons below the fold. Top-align instead and pull the
           padding way down so the content starts filling that dead space
           near the top of the viewport instead of floating in the middle. */
        .ta-hero { justify-content:flex-start; }
        .ta-hero-content { padding-top:56px; padding-bottom:48px; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.head.removeChild(link); } catch {}
      try { document.head.removeChild(style); } catch {}
    };
  }, []);

  // While AuthContext is still resolving the persisted session, or once we know
  // there IS one (redirect effect above is about to fire), show a blank loader
  // instead of the marketing homepage — prevents a flash of "/" before the
  // dashboard redirect lands.
  //
  // CRITICAL: this early return MUST stay below every hook in this component.
  // It used to sit above the three useEffects below, so the moment auth
  // resolved (authLoading true → false with no user) React rendered MORE hooks
  // than the previous render and crashed the whole page with the minified
  // React error #310 — exactly the intermittent "Something went wrong" screen
  // people hit while signing in.
  if (authLoading || user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f2419" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #C9973A", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="ta-root">

      {/* LIVE BANNER — only render after fetch resolves to prevent layout-shift
          flash. Before liveClassChecked is true the banner slot is absent;
          once checked it either shows (live class found) or stays absent
          (no live class). This eliminates the null→visible blink on WebView. */}
      {liveClassChecked && liveClass && (
        <div className="ta-live-banner" onClick={() => navigate(`/live/${liveClass.room_code}`)}>
          <div className="ta-live-dot" />
          <span className="ta-live-text">🔴 LIVE NOW: <span>{liveClass.title}</span> — Tap to Join Free →</span>
        </div>
      )}

      {/* ══ HERO ══ */}
      <section className="ta-hero">
        <div className="ta-hero-bg" />
        <div className="ta-hero-overlay" />

        {/* Signature: 8-pointed Islamic geometric star radiating behind the title */}
        <div className="ta-hero-star">
          <svg viewBox="0 0 700 700" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="starGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#f0c060" stopOpacity=".18"/>
                <stop offset="40%"  stopColor="#c9973a" stopOpacity=".08"/>
                <stop offset="100%" stopColor="#c9973a" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="350" cy="350" r="340" fill="url(#starGrad)"/>
            {/* 8-pointed star */}
            {[0,45,90,135,180,225,270,315].map((deg, i) => (
              <line key={i} x1="350" y1="350"
                x2={350 + 300 * Math.cos((deg-90)*Math.PI/180)}
                y2={350 + 300 * Math.sin((deg-90)*Math.PI/180)}
                stroke="#f0c060" strokeWidth=".6" strokeOpacity=".3"/>
            ))}
            {[0,45,90,135,180,225,270,315].map((deg, i) => (
              <polygon key={i}
                points={`350,350 ${350+300*Math.cos((deg-101)*Math.PI/180)},${350+300*Math.sin((deg-101)*Math.PI/180)} ${350+300*Math.cos((deg-79)*Math.PI/180)},${350+300*Math.sin((deg-79)*Math.PI/180)}`}
                fill="#f0c060" fillOpacity=".04" stroke="#f0c060" strokeWidth=".4" strokeOpacity=".25"/>
            ))}
            <circle cx="350" cy="350" r="120" fill="none" stroke="#f0c060" strokeWidth=".6" strokeOpacity=".2"/>
            <circle cx="350" cy="350" r="200" fill="none" stroke="#f0c060" strokeWidth=".4" strokeOpacity=".1"/>
            <circle cx="350" cy="350" r="280" fill="none" stroke="#f0c060" strokeWidth=".3" strokeOpacity=".07"/>
          </svg>
        </div>

        <div className="ta-hero-arch" />

        <div className="ta-hero-content">
          <div className="ta-hero-badge">✦ Excellence in Islamic Education ✦</div>
          <div className="ta-hero-bismi">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div className="ta-divider">
            <span className="ta-divider-line" />
            <span className="ta-divider-gem">◆</span>
            <span className="ta-divider-line" />
          </div>
          <h1 className="ta-hero-title">
            Master Arabic &amp;
            <em>Islamic Sciences</em>
          </h1>
          <p className="ta-hero-sub">
            Learn Quran, Tajweed, Arabic Language and Islamic Studies with certified scholars — live, interactive, and structured for every level.
          </p>
          <div className="ta-hero-btns" style={{ flexDirection:"column", alignItems:"center" }}>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center" }}>
              <button className="ta-btn-primary" onClick={() => navigate("/register")}>Enrol Now →</button>
              <button className="ta-btn-secondary" onClick={() => setShowEnrollGuide(v => !v)}>
                How to Enrol {showEnrollGuide ? "▲" : "▼"}
              </button>
            </div>
            {showEnrollGuide && (
              <div className="ta-guide">
                <p className="ta-guide-label">Enrollment Steps</p>
                {[
                  { n:"1", icon:"👤", title:"Create Your Account",  desc:"Register with your name, email and password" },
                  { n:"2", icon:"💳", title:"Complete Payment",      desc:"Pay the one-time registration fee" },
                  { n:"3", icon:"📝", title:"Fill Onboarding Form",  desc:"Tell us about your background and goals" },
                  { n:"4", icon:"📖", title:"Take Entrance Exam",    desc:"Written assessment with full proctoring" },
                  { n:"5", icon:"🎤", title:"Recitation Test",       desc:"Audio evaluation of your Quran recitation" },
                  { n:"6", icon:"✅", title:"Admin Approval",         desc:"Admin reviews results and assigns your level" },
                  { n:"7", icon:"🚀", title:"Access Dashboard",       desc:"Start your learning journey!" },
                ].map(s => (
                  <div className="ta-guide-step" key={s.n}>
                    <div className="ta-guide-num">{s.n}</div>
                    <div>
                      <p className="ta-guide-stitle">{s.icon} {s.title}</p>
                      <p className="ta-guide-sdesc">{s.desc}</p>
                    </div>
                  </div>
                ))}
                <button className="ta-guide-cta" onClick={() => navigate("/register")}>Enrol Now →</button>
              </div>
            )}
          </div>
        </div>
        <div className="ta-hero-scroll">
          <span className="ta-scroll-label">Scroll</span>
          <div className="ta-scroll-line" />
        </div>
      </section>

      {/* ══ FEATURE STRIP ══ */}
      <div className="ta-strip">
        <div className="ta-strip-track">
          {[0,1].map(dup => (
            <div className="ta-strip-inner" key={dup} aria-hidden={dup === 1}>
              {[["🕌","Qualified Islamic Scholars"],["📖","Structured Quranic Curriculum"],["🌐","Bilingual Arabic & English"],["🎓","Certificates Awarded"],["🎙️","Live & Recorded Classes"]].map(([icon, label]) => (
                <div className="ta-strip-item" key={label as string}>
                  <span className="ta-strip-icon">{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ══ DAILY ISLAMIC REFLECTIONS ══ */}
      <section className="ta-daily">
        <div className="ta-daily-pattern" />
        <div className="ta-daily-glow" />
        <div className="ta-daily-inner">

          <div className="ta-section-hdr">
            <div className="ta-section-badge">✦ Daily Islamic Reflections ✦</div>
            <h2 className="ta-section-heading">Nourish Your Soul — Every Day</h2>
            <p className="ta-section-sub">Rotating daily from the Quran, authentic Hadiths &amp; the blessed Seerah of the Prophet ﷺ</p>
          </div>

          {upcomingEvent && (
            <div className="ta-event-banner">
              <span className="ta-event-emoji">{upcomingEvent.event.emoji}</span>
              <div>
                <div className="ta-event-label">Upcoming Islamic Occasion</div>
                <div className="ta-event-name">{upcomingEvent.event.name}</div>
              </div>
              <div className="ta-event-pill">
                {upcomingEvent.daysAway === 0 ? "TODAY ✨" : upcomingEvent.daysAway === 1 ? "Tomorrow" : `In ${upcomingEvent.daysAway} days`}
              </div>
            </div>
          )}

          <div className="ta-tabs">
            {(["verse","hadith","seerah"] as const).map(tab => (
              <button key={tab} className={`ta-tab${activeReflection === tab ? " active" : ""}`} onClick={() => setActiveReflection(tab)}>
                {tab === "verse" ? "📖 Quranic Verse" : tab === "hadith" ? "📿 Hadith" : "📜 Seerah"}
              </button>
            ))}
          </div>

          <div className="ta-content-grid">
            {activeReflection === "verse" && (
              <div className="ta-verse-card" style={{ gridColumn:"1 / -1" }}>
                <div className="ta-verse-label">✦ Verse of the Day ✦</div>
                <div className="ta-verse-ar">{dailyVerse.ar}</div>
                <div className="ta-verse-divrow">
                  <span className="ta-verse-dline" />
                  <span style={{ color:"#f0c060", fontSize:10 }}>◆</span>
                  <span className="ta-verse-dline" />
                </div>
                <div className="ta-verse-en">"{dailyVerse.en}"</div>
                <div className="ta-verse-ref" style={{ marginTop:14 }}>{dailyVerse.ref}</div>
              </div>
            )}

            {activeReflection === "hadith" && (
              <>
                <div className="ta-hadith-card">
                  <div className="ta-hadith-label">📿 Hadith of the Day</div>
                  <div className="ta-hadith-ar">{dailyHadith.ar}</div>
                  <div className="ta-hadith-bar" />
                  <div className="ta-hadith-en">"{dailyHadith.en}"</div>
                  <div className="ta-hadith-src">
                    <span className="ta-hadith-src-main">{dailyHadith.source}</span>
                    <span className="ta-hadith-src-sub">Narrated by {dailyHadith.narrator}</span>
                  </div>
                </div>
                <div className="ta-verse-card">
                  <div className="ta-verse-label">📖 Quranic Reflection</div>
                  <div className="ta-verse-ar" style={{ fontSize:"clamp(20px,2.8vw,30px)" }}>{dailyVerse.ar}</div>
                  <div className="ta-verse-divrow">
                    <span className="ta-verse-dline"/>
                    <span style={{ color:"#f0c060", fontSize:10 }}>◆</span>
                    <span className="ta-verse-dline"/>
                  </div>
                  <div className="ta-verse-en" style={{ fontSize:"clamp(13px,1.8vw,16px)" }}>"{dailyVerse.en}"</div>
                  <div className="ta-verse-ref" style={{ marginTop:12 }}>{dailyVerse.ref}</div>
                </div>
              </>
            )}

            {activeReflection === "seerah" && (
              <div className="ta-seerah-card" style={{ gridColumn:"1 / -1", maxWidth:860, margin:"0 auto", width:"100%" }}>
                <div className="ta-seerah-label">📜 Daily Seerah — Life of the Prophet ﷺ</div>
                <span className="ta-seerah-yr">{dailySeerah.year}</span>
                <div className="ta-seerah-title">{dailySeerah.title}</div>
                <div className="ta-seerah-text">{dailySeerah.text}</div>
              </div>
            )}
          </div>

          <div style={{ textAlign:"center", marginTop:52 }}>
            <p style={{ color:"rgba(255,255,255,.35)", fontSize:14, marginBottom:20 }}>
              These are just glimpses — immerse yourself in the full curriculum at Tahleem Academy.
            </p>
            <button className="ta-btn-primary" onClick={() => navigate("/register")}>Begin Your Journey →</button>
          </div>
        </div>
      </section>

      {/* ══ FOUNDATION ══ */}
      <section className="ta-pillars">
        <div className="ta-pillars-inner">
          <div className="ta-pillars-intro">
            <div>
              <div className="ta-eyebrow"><span className="ta-eyebrow-line"/>Our Foundation</div>
              <h2 className="ta-light-heading">Seeking Knowledge<br/>Is an Act of Worship</h2>
              <p className="ta-light-body">
                The Prophet ﷺ said: <strong style={{ color:"#081810" }}>"Seeking knowledge is an obligation upon every Muslim."</strong> At Tahleem Academy, we honour this sacred trust — nurturing mind, heart, and soul through authentic Islamic education.
              </p>
            </div>
            <div className="ta-pillars-quote">
              <div className="ta-pillars-qar">وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ</div>
              <div className="ta-pillars-qen">"And above every possessor of knowledge is one more knowing."</div>
              <div className="ta-pillars-qref">Surah Yusuf · 12:76</div>
            </div>
          </div>
          <div className="ta-grid-6">
            {[
              { n:"01", icon:"🕌", name:"Traditional Scholarship",  desc:"Our curriculum is rooted in authentic Islamic scholarship — the same knowledge passed down through generations of scholars." },
              { n:"02", icon:"📖", name:"Qur'an & Tajweed",         desc:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules and Hifdh support." },
              { n:"03", icon:"🌐", name:"Arabic Language",           desc:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic in a bilingual environment." },
              { n:"04", icon:"💻", name:"Live Interactive Classes",  desc:"Real-time lessons with qualified teachers, shared whiteboards, recitation sessions and recorded replays for every student." },
              { n:"05", icon:"📊", name:"Progress Tracking",         desc:"Detailed transcripts, term results and performance reports help students and parents stay informed at every stage." },
              { n:"06", icon:"🏆", name:"Certified Programmes",      desc:"Earn recognised certificates in Arabic Language, Tajweed, Quran Memorisation and Islamic Sciences upon completion." },
            ].map(p => (
              <div className="ta-pillar" key={p.n}>
                <div className="ta-pillar-num">{p.n}</div>
                <span className="ta-pillar-icon">{p.icon}</span>
                <div className="ta-pillar-name">{p.name}</div>
                <p className="ta-pillar-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COURSES ══ */}
      <section className="ta-courses">
        <div className="ta-courses-pattern"/>
        <div className="ta-courses-inner">
          <div className="ta-courses-hdr">
            <div style={{ maxWidth:520 }}>
              <div className="ta-eyebrow" style={{ color:"#f0c060" }}><span className="ta-eyebrow-line"/>Our Programs</div>
              <h2 className="ta-section-heading" style={{ marginBottom:10 }}>Explore Our Courses</h2>
              <p className="ta-section-sub" style={{ marginBottom:0 }}>Each course is carefully structured with live sessions, assignments, and certified assessments.</p>
            </div>
            <button className="ta-courses-link" onClick={() => navigate("/register")}>View All & Enrol →</button>
          </div>
          <div className="ta-courses-grid">
            {[
              { img:"https://images.unsplash.com/photo-1585036156171-384164a8c675?w=700&q=80", badge:"Most Popular",      ar:"القرآن والتجويد",  en:"Quran & Tajweed",   desc:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules and Hifdh support.", level:"All Levels" },
              { img:"https://images.unsplash.com/photo-1519817650390-64a93db51149?w=700&q=80", badge:"Beginner Friendly", ar:"اللغة العربية",    en:"Arabic Language",   desc:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic in a structured bilingual setting.", level:"All Levels" },
              { img:"https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=700&q=80", badge:"Certified",         ar:"العلوم الإسلامية", en:"Islamic Sciences",  desc:"Fiqh, Aqeedah, Seerah, Hadith — comprehensive Islamic education delivered by qualified scholars.", level:"Intermediate+" },
            ].map(c => (
              <div className="ta-card" key={c.en}>
                <div className="ta-card-img">
                  <img src={c.img} alt={c.en} loading="lazy"/>
                  <div className="ta-card-overlay"/>
                  <div className="ta-card-badge">{c.badge}</div>
                  <div className="ta-card-level">⭐ {c.level}</div>
                </div>
                <div className="ta-card-body">
                  <div className="ta-card-ar">{c.ar}</div>
                  <div className="ta-card-en">{c.en}</div>
                  <div className="ta-card-desc">{c.desc}</div>
                  <div className="ta-card-footer">
                    <span className="ta-card-cert">✦ Certified Programme</span>
                    <button className="ta-card-btn" onClick={() => navigate("/register")}>Enrol Now</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STATS ══ */}
      <section className="ta-stats">
        <div className="ta-stats-bg"/>
        <div className="ta-stats-inner">
          <span className="ta-stats-ar">الحمد لله على نعمة العلم</span>
          <h2 className="ta-stats-title">Growing Together in Knowledge</h2>
          <div className="ta-stats-grid">
            {[["500+","Lessons Delivered"],["3","Certified Scholars"],["95%","Student Satisfaction"],["4","Core Programs"]].map(([n,l]) => (
              <div className="ta-stat" key={l}>
                <span className="ta-stat-num">{n}</span>
                <span className="ta-stat-label">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section className="ta-cta">
        <div className="ta-cta-inner">
          <span className="ta-cta-ar">اطلبوا العلم من المهد إلى اللحد</span>
          <h2 className="ta-cta-heading">Begin Your Journey Today</h2>
          <p className="ta-cta-text">Join Tahleem Academy and take your first step towards mastering Arabic and Islamic knowledge — guided by qualified scholars, supported every step of the way.</p>
          <button className="ta-cta-btn" onClick={() => navigate("/register")}>Enrol Now →</button>
          <p className="ta-cta-note">Free to register · No commitment required</p>
        </div>
      </section>

    </div>
  );
};

export default Index;
