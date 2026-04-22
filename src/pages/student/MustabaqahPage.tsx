/*
  MustabaqahPage.tsx — Tahleem Academy
  ══════════════════════════════════════════════════════════════════════════════
  Virtual Qur'an Musabaqah (Recitation Competition) System
  ──────────────────────────────────────────────────────────────────────────
  • Admin / Teacher: create competitions, manage queue, call participants,
    judge recitations, override scores, ring bell, download results
  • Student: join queue, get called when it's their turn, recite with mic,
    see AI + judge scores, view live leaderboard

  Supabase tables required:  musabaqah_competitions, musabaqah_participants,
                             musabaqah_attempts  (see musabaqah_db.sql)

  Supabase Realtime:         channel `musabaqah:{competition_id}`
                             events: CALLED | STATUS_CHANGE | SCORE_UPDATE

  Audio:                     MediaRecorder → Supabase Storage bucket "musabaqah-audio"
  Speech-to-text:            Web Speech API (ar-SA) — best on Android Chrome / Kiwi
  Text compare:              Word-by-word after Arabic normalisation (strips tashkeel)

  Colors:  Dark Green #0f2d1f | Gold #c9a84c  (Tahleem brand)
  Fonts:   Playfair Display / Cairo / Amiri / Scheherazade New
══════════════════════════════════════════════════════════════════════════════
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Trophy, Users, Plus, Bell,
  Square, Play, SkipForward, BookOpen, Star,
  Crown, RotateCcw, Clock, Shuffle, CheckCircle,
  XCircle, AlertCircle, Radio, Award, PhoneCall,
  Volume2, Pause, X, Zap, Edit3, Download,
  ChevronRight, Eye, EyeOff, RefreshCw, UserCheck,
} from "lucide-react";

/* ── Brand colors ─────────────────────────────────────────────────────── */
const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

/* ══════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */
interface Competition {
  id: string;
  title: string;
  description?: string;
  competition_type: "juz30" | "full_quran" | "custom";
  scope_config: { surah_ids?: number[]; juz_numbers?: number[] };
  time_limit_seconds: number;
  max_rounds: number;
  status: "draft" | "open" | "active" | "paused" | "completed";
  current_round: number;
  current_participant_id?: string;
  created_by: string;
  created_at: string;
}
interface Participant {
  id: string;
  competition_id: string;
  user_id?: string;
  participant_name: string;
  participant_level: string;
  queue_position: number;
  status: "waiting" | "called" | "reciting" | "completed" | "eliminated" | "absent";
  current_round: number;
  total_score: number;
  rounds_completed: number;
}
interface Attempt {
  id: string;
  competition_id: string;
  participant_id: string;
  round_number: number;
  surah_number: number;
  surah_name: string;
  surah_name_ar: string;
  ayah_start: number;
  ayah_end: number;
  assigned_text: string;
  transcribed_text?: string;
  audio_url?: string;
  accuracy_score?: number;
  fluency_score?: number;
  tajweed_score?: number;
  total_score?: number;
  mistakes_count?: number;
  word_results?: WordResult[];
  judge_score?: number;
  judge_comment?: string;
  status: "pending" | "assigned" | "reciting" | "submitted" | "judged";
}
interface WordResult {
  word: string;
  original: string;
  status: "correct" | "mistake" | "missing";
}

/* ══════════════════════════════════════════════════════════════════════
   ALL 114 SURAHS METADATA
══════════════════════════════════════════════════════════════════════ */
const SURAHS = [
  {n:1,en:"Al-Fatiha",ar:"الفاتحة",v:7,juz:1},
  {n:2,en:"Al-Baqarah",ar:"البقرة",v:286,juz:1},
  {n:3,en:"Ali 'Imran",ar:"آل عمران",v:200,juz:3},
  {n:4,en:"An-Nisa",ar:"النساء",v:176,juz:4},
  {n:5,en:"Al-Ma'idah",ar:"المائدة",v:120,juz:6},
  {n:6,en:"Al-An'am",ar:"الأنعام",v:165,juz:7},
  {n:7,en:"Al-A'raf",ar:"الأعراف",v:206,juz:8},
  {n:8,en:"Al-Anfal",ar:"الأنفال",v:75,juz:9},
  {n:9,en:"At-Tawbah",ar:"التوبة",v:129,juz:10},
  {n:10,en:"Yunus",ar:"يونس",v:109,juz:11},
  {n:11,en:"Hud",ar:"هود",v:123,juz:11},
  {n:12,en:"Yusuf",ar:"يوسف",v:111,juz:12},
  {n:13,en:"Ar-Ra'd",ar:"الرعد",v:43,juz:13},
  {n:14,en:"Ibrahim",ar:"إبراهيم",v:52,juz:13},
  {n:15,en:"Al-Hijr",ar:"الحجر",v:99,juz:14},
  {n:16,en:"An-Nahl",ar:"النحل",v:128,juz:14},
  {n:17,en:"Al-Isra",ar:"الإسراء",v:111,juz:15},
  {n:18,en:"Al-Kahf",ar:"الكهف",v:110,juz:15},
  {n:19,en:"Maryam",ar:"مريم",v:98,juz:16},
  {n:20,en:"Ta-Ha",ar:"طه",v:135,juz:16},
  {n:21,en:"Al-Anbiya",ar:"الأنبياء",v:112,juz:17},
  {n:22,en:"Al-Hajj",ar:"الحج",v:78,juz:17},
  {n:23,en:"Al-Mu'minun",ar:"المؤمنون",v:118,juz:18},
  {n:24,en:"An-Nur",ar:"النور",v:64,juz:18},
  {n:25,en:"Al-Furqan",ar:"الفرقان",v:77,juz:18},
  {n:26,en:"Ash-Shu'ara",ar:"الشعراء",v:227,juz:19},
  {n:27,en:"An-Naml",ar:"النمل",v:93,juz:19},
  {n:28,en:"Al-Qasas",ar:"القصص",v:88,juz:20},
  {n:29,en:"Al-Ankabut",ar:"العنكبوت",v:69,juz:20},
  {n:30,en:"Ar-Rum",ar:"الروم",v:60,juz:21},
  {n:31,en:"Luqman",ar:"لقمان",v:34,juz:21},
  {n:32,en:"As-Sajda",ar:"السجدة",v:30,juz:21},
  {n:33,en:"Al-Ahzab",ar:"الأحزاب",v:73,juz:21},
  {n:34,en:"Saba",ar:"سبأ",v:54,juz:22},
  {n:35,en:"Fatir",ar:"فاطر",v:45,juz:22},
  {n:36,en:"Ya-Sin",ar:"يس",v:83,juz:22},
  {n:37,en:"As-Saffat",ar:"الصافات",v:182,juz:23},
  {n:38,en:"Sad",ar:"ص",v:88,juz:23},
  {n:39,en:"Az-Zumar",ar:"الزمر",v:75,juz:23},
  {n:40,en:"Ghafir",ar:"غافر",v:85,juz:24},
  {n:41,en:"Fussilat",ar:"فصلت",v:54,juz:24},
  {n:42,en:"Ash-Shura",ar:"الشورى",v:53,juz:25},
  {n:43,en:"Az-Zukhruf",ar:"الزخرف",v:89,juz:25},
  {n:44,en:"Ad-Dukhan",ar:"الدخان",v:59,juz:25},
  {n:45,en:"Al-Jathiyah",ar:"الجاثية",v:37,juz:25},
  {n:46,en:"Al-Ahqaf",ar:"الأحقاف",v:35,juz:26},
  {n:47,en:"Muhammad",ar:"محمد",v:38,juz:26},
  {n:48,en:"Al-Fath",ar:"الفتح",v:29,juz:26},
  {n:49,en:"Al-Hujurat",ar:"الحجرات",v:18,juz:26},
  {n:50,en:"Qaf",ar:"ق",v:45,juz:26},
  {n:51,en:"Adh-Dhariyat",ar:"الذاريات",v:60,juz:26},
  {n:52,en:"At-Tur",ar:"الطور",v:49,juz:27},
  {n:53,en:"An-Najm",ar:"النجم",v:62,juz:27},
  {n:54,en:"Al-Qamar",ar:"القمر",v:55,juz:27},
  {n:55,en:"Ar-Rahman",ar:"الرحمن",v:78,juz:27},
  {n:56,en:"Al-Waqi'a",ar:"الواقعة",v:96,juz:27},
  {n:57,en:"Al-Hadid",ar:"الحديد",v:29,juz:27},
  {n:58,en:"Al-Mujadila",ar:"المجادلة",v:22,juz:28},
  {n:59,en:"Al-Hashr",ar:"الحشر",v:24,juz:28},
  {n:60,en:"Al-Mumtahanah",ar:"الممتحنة",v:13,juz:28},
  {n:61,en:"As-Saf",ar:"الصف",v:14,juz:28},
  {n:62,en:"Al-Jumu'ah",ar:"الجمعة",v:11,juz:28},
  {n:63,en:"Al-Munafiqun",ar:"المنافقون",v:11,juz:28},
  {n:64,en:"At-Taghabun",ar:"التغابن",v:18,juz:28},
  {n:65,en:"At-Talaq",ar:"الطلاق",v:12,juz:28},
  {n:66,en:"At-Tahrim",ar:"التحريم",v:12,juz:28},
  {n:67,en:"Al-Mulk",ar:"الملك",v:30,juz:29},
  {n:68,en:"Al-Qalam",ar:"القلم",v:52,juz:29},
  {n:69,en:"Al-Haqqah",ar:"الحاقة",v:52,juz:29},
  {n:70,en:"Al-Ma'arij",ar:"المعارج",v:44,juz:29},
  {n:71,en:"Nuh",ar:"نوح",v:28,juz:29},
  {n:72,en:"Al-Jinn",ar:"الجن",v:28,juz:29},
  {n:73,en:"Al-Muzzammil",ar:"المزمل",v:20,juz:29},
  {n:74,en:"Al-Muddaththir",ar:"المدثر",v:56,juz:29},
  {n:75,en:"Al-Qiyamah",ar:"القيامة",v:40,juz:29},
  {n:76,en:"Al-Insan",ar:"الإنسان",v:31,juz:29},
  {n:77,en:"Al-Mursalat",ar:"المرسلات",v:50,juz:29},
  {n:78,en:"An-Naba",ar:"النبأ",v:40,juz:30},
  {n:79,en:"An-Nazi'at",ar:"النازعات",v:46,juz:30},
  {n:80,en:"Abasa",ar:"عبس",v:42,juz:30},
  {n:81,en:"At-Takwir",ar:"التكوير",v:29,juz:30},
  {n:82,en:"Al-Infitar",ar:"الانفطار",v:19,juz:30},
  {n:83,en:"Al-Mutaffifin",ar:"المطففين",v:36,juz:30},
  {n:84,en:"Al-Inshiqaq",ar:"الانشقاق",v:25,juz:30},
  {n:85,en:"Al-Buruj",ar:"البروج",v:22,juz:30},
  {n:86,en:"At-Tariq",ar:"الطارق",v:17,juz:30},
  {n:87,en:"Al-Ala",ar:"الأعلى",v:19,juz:30},
  {n:88,en:"Al-Ghashiyah",ar:"الغاشية",v:26,juz:30},
  {n:89,en:"Al-Fajr",ar:"الفجر",v:30,juz:30},
  {n:90,en:"Al-Balad",ar:"البلد",v:20,juz:30},
  {n:91,en:"Ash-Shams",ar:"الشمس",v:15,juz:30},
  {n:92,en:"Al-Layl",ar:"الليل",v:21,juz:30},
  {n:93,en:"Ad-Duha",ar:"الضحى",v:11,juz:30},
  {n:94,en:"Ash-Sharh",ar:"الشرح",v:8,juz:30},
  {n:95,en:"At-Tin",ar:"التين",v:8,juz:30},
  {n:96,en:"Al-Alaq",ar:"العلق",v:19,juz:30},
  {n:97,en:"Al-Qadr",ar:"القدر",v:5,juz:30},
  {n:98,en:"Al-Bayyinah",ar:"البينة",v:8,juz:30},
  {n:99,en:"Az-Zalzalah",ar:"الزلزلة",v:8,juz:30},
  {n:100,en:"Al-Adiyat",ar:"العاديات",v:11,juz:30},
  {n:101,en:"Al-Qari'ah",ar:"القارعة",v:11,juz:30},
  {n:102,en:"At-Takathur",ar:"التكاثر",v:8,juz:30},
  {n:103,en:"Al-Asr",ar:"العصر",v:3,juz:30},
  {n:104,en:"Al-Humazah",ar:"الهمزة",v:9,juz:30},
  {n:105,en:"Al-Fil",ar:"الفيل",v:5,juz:30},
  {n:106,en:"Quraish",ar:"قريش",v:4,juz:30},
  {n:107,en:"Al-Ma'un",ar:"الماعون",v:7,juz:30},
  {n:108,en:"Al-Kawthar",ar:"الكوثر",v:3,juz:30},
  {n:109,en:"Al-Kafirun",ar:"الكافرون",v:6,juz:30},
  {n:110,en:"An-Nasr",ar:"النصر",v:3,juz:30},
  {n:111,en:"Al-Masad",ar:"المسد",v:5,juz:30},
  {n:112,en:"Al-Ikhlas",ar:"الإخلاص",v:4,juz:30},
  {n:113,en:"Al-Falaq",ar:"الفلق",v:5,juz:30},
  {n:114,en:"An-Nas",ar:"الناس",v:6,juz:30},
];

/* ══════════════════════════════════════════════════════════════════════
   INLINE QURAN TEXT (Uthmanic script, most-used competition surahs)
   For other surahs, fetched from api.alquran.cloud at question time
══════════════════════════════════════════════════════════════════════ */
const INLINE_QURAN: Record<number, string[]> = {
  1:  ["بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ","ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ","ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ","مَٰلِكِ يَوۡمِ ٱلدِّينِ","إِيَّاكَ نَعۡبُدُ وَإِيَّاكَ نَسۡتَعِينُ","ٱهۡدِنَا ٱلصِّرَٰطَ ٱلۡمُسۡتَقِيمَ","صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ"],
  103:["وَٱلۡعَصۡرِ","إِنَّ ٱلۡإِنسَٰنَ لَفِي خُسۡرٍ","إِلَّا ٱلَّذِينَ ءَامَنُواْ وَعَمِلُواْ ٱلصَّٰلِحَٰتِ وَتَوَاصَوۡاْ بِٱلۡحَقِّ وَتَوَاصَوۡاْ بِٱلصَّبۡرِ"],
  108:["إِنَّآ أَعۡطَيۡنَٰكَ ٱلۡكَوۡثَرَ","فَصَلِّ لِرَبِّكَ وَٱنۡحَرۡ","إِنَّ شَانِئَكَ هُوَ ٱلۡأَبۡتَرُ"],
  109:["قُلۡ يَٰٓأَيُّهَا ٱلۡكَٰفِرُونَ","لَآ أَعۡبُدُ مَا تَعۡبُدُونَ","وَلَآ أَنتُمۡ عَٰبِدُونَ مَآ أَعۡبُدُ","وَلَآ أَنَاْ عَابِدٞ مَّا عَبَدتُّمۡ","وَلَآ أَنتُمۡ عَٰبِدُونَ مَآ أَعۡبُدُ","لَكُمۡ دِينُكُمۡ وَلِيَ دِينِ"],
  110:["إِذَا جَآءَ نَصۡرُ ٱللَّهِ وَٱلۡفَتۡحُ","وَرَأَيۡتَ ٱلنَّاسَ يَدۡخُلُونَ فِي دِينِ ٱللَّهِ أَفۡوَاجٗا","فَسَبِّحۡ بِحَمۡدِ رَبِّكَ وَٱسۡتَغۡفِرۡهُۚ إِنَّهُۥ كَانَ تَوَّابَۢا"],
  111:["تَبَّتۡ يَدَآ أَبِي لَهَبٖ وَتَبَّ","مَآ أَغۡنَىٰ عَنۡهُ مَالُهُۥ وَمَا كَسَبَ","سَيَصۡلَىٰ نَارٗا ذَاتَ لَهَبٖ","وَٱمۡرَأَتُهُۥ حَمَّالَةَ ٱلۡحَطَبِ","فِي جِيدِهَا حَبۡلٞ مِّن مَّسَدٍ"],
  112:["قُلۡ هُوَ ٱللَّهُ أَحَدٌ","ٱللَّهُ ٱلصَّمَدُ","لَمۡ يَلِدۡ وَلَمۡ يُولَدۡ","وَلَمۡ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"],
  113:["قُلۡ أَعُوذُ بِرَبِّ ٱلۡفَلَقِ","مِن شَرِّ مَا خَلَقَ","وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ","وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِي ٱلۡعُقَدِ","وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ"],
  114:["قُلۡ أَعُوذُ بِرَبِّ ٱلنَّاسِ","مَلِكِ ٱلنَّاسِ","إِلَٰهِ ٱلنَّاسِ","مِن شَرِّ ٱلۡوَسۡوَاسِ ٱلۡخَنَّاسِ","ٱلَّذِي يُوَسۡوِسُ فِي صُدُورِ ٱلنَّاسِ","مِنَ ٱلۡجِنَّةِ وَٱلنَّاسِ"],
};

/* ══════════════════════════════════════════════════════════════════════
   ARABIC TEXT HELPERS
══════════════════════════════════════════════════════════════════════ */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0671]/g, "")   // strip tashkeel + waṣla
    .replace(/[أإآٱ]/g, "ا")                         // normalise alef
    .replace(/ة/g,  "ه")                              // taa marbuta → haa
    .replace(/ى/g,  "ي")                              // alef maqsura → yaa
    .replace(/\s+/g, " ")
    .trim();
}

function scoreRecitation(assigned: string, transcribed: string): {
  wordResults: WordResult[];
  accuracy: number;
  fluency: number;
  correct: number;
  total: number;
} {
  const origWords = normalizeArabic(assigned).split(" ").filter(Boolean);
  const transWords = normalizeArabic(transcribed).split(" ").filter(Boolean);

  const results: WordResult[] = origWords.map((orig, i) => {
    const actual = transWords[i] ?? "";
    if (!actual) return { word: orig, original: orig, status: "missing" };
    return {
      word: actual,
      original: orig,
      status: orig === actual ? "correct" : "mistake",
    };
  });

  const correct = results.filter(r => r.status === "correct").length;
  const total   = origWords.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const fluency  = Math.min(100, Math.round((transWords.length / Math.max(1, total)) * 100));

  return { wordResults: results, accuracy, fluency, correct, total };
}

/* Fetch surah text from alquran.cloud if not inline */
async function fetchSurahVerses(surahNum: number, start: number, end: number): Promise<string> {
  if (INLINE_QURAN[surahNum]) {
    return INLINE_QURAN[surahNum].slice(start - 1, end).join(" ");
  }
  try {
    const res  = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
    const data = await res.json();
    const verses: string[] = (data.data?.ayahs ?? []).map((a: any) => a.text);
    return verses.slice(start - 1, end).join(" ");
  } catch {
    return `[سورة رقم ${surahNum} - آيات ${start} إلى ${end}]`;
  }
}

/* Pick a random ayah range from competition scope */
function pickRandomAyah(comp: Competition): { surahNum: number; start: number; end: number; verseCount: number } {
  let pool = SURAHS.slice();
  if (comp.competition_type === "juz30")        pool = SURAHS.filter(s => s.juz === 30);
  else if (comp.competition_type === "custom")  pool = SURAHS.filter(s => comp.scope_config.surah_ids?.includes(s.n));

  const surah      = pool[Math.floor(Math.random() * pool.length)];
  const maxVerses  = Math.min(5, surah.v);
  const count      = Math.max(3, Math.floor(Math.random() * maxVerses) + 1);
  const start      = Math.floor(Math.random() * (surah.v - count + 1)) + 1;
  return { surahNum: surah.n, start, end: start + count - 1, verseCount: count };
}

/* ══════════════════════════════════════════════════════════════════════
   SHARED STYLE TOKENS
══════════════════════════════════════════════════════════════════════ */
const page: React.CSSProperties = {
  minHeight: "100svh",
  background: `linear-gradient(160deg, ${G} 0%, #081a10 60%, #030e08 100%)`,
  position: "relative", overflow: "hidden", fontFamily: "'Cairo', sans-serif",
};
const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(16px)",
  border: `1px solid rgba(201,168,76,0.2)`,
  borderRadius: 18,
};
const goldBtn: React.CSSProperties = {
  padding: "14px 20px", borderRadius: 13, border: "none",
  background: `linear-gradient(135deg, ${GOLD}, #a8873a)`,
  color: "#0f2d1f", cursor: "pointer", fontWeight: 800, fontSize: 15,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  fontFamily: "'Cairo', sans-serif", width: "100%",
  boxShadow: `0 4px 20px rgba(201,168,76,0.4)`,
};
const outBtn: React.CSSProperties = {
  ...goldBtn,
  background: "rgba(201,168,76,0.1)",
  border: `1.5px solid rgba(201,168,76,0.4)`,
  color: "#fff", boxShadow: "none",
};
const dangerBtn: React.CSSProperties = {
  ...outBtn, border: "1.5px solid rgba(239,68,68,0.4)",
  background: "rgba(239,68,68,0.08)", color: "#fca5a5",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 11,
  border: `1.5px solid rgba(201,168,76,0.25)`,
  background: "rgba(255,255,255,0.05)", color: "#fff",
  fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "'Cairo', sans-serif",
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: GOLD,
  display: "block", marginBottom: 6, letterSpacing: 1.4, textTransform: "uppercase" as const,
};

/* ── Islamic geometric background ───────────────────────────────────── */
const IslamicBg = ({ opacity = 0.06 }: { opacity?: number }) => (
  <svg style={{ position:"fixed",top:0,left:0,width:"100%",height:"100%",opacity,zIndex:0,pointerEvents:"none" }} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="mp" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <polygon points="50,5 58,35 88,35 65,54 73,84 50,65 27,84 35,54 12,35 42,35" fill="none" stroke={GOLD} strokeWidth="0.7"/>
        <circle cx="50" cy="50" r="3" fill="none" stroke={GOLD} strokeWidth="0.5"/>
        <line x1="0" y1="50" x2="100" y2="50" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
        <line x1="50" y1="0" x2="50" y2="100" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#mp)"/>
  </svg>
);

/* ── Live audio waveform ─────────────────────────────────────────────── */
const Waveform = ({ analyser }: { analyser: AnalyserNode | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d")!;
    const draw   = () => {
      rafRef.current = requestAnimationFrame(draw);
      const bufLen = analyser.frequencyBinCount;
      const data   = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = (canvas.width / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (data[i] / 255) * canvas.height * 0.8;
        const ratio = data[i] / 255;
        ctx.fillStyle = `rgba(${Math.round(201 * ratio + 255 * (1-ratio))}, ${Math.round(168 * ratio)}, ${Math.round(76 * ratio)}, 0.8)`;
        ctx.fillRect(x, canvas.height - barH, barW, barH);
        ctx.fillRect(x, 0, barW, barH * 0.2);
        x += barW + 1;
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <canvas ref={canvasRef} width={320} height={60}
      style={{ width:"100%", height:60, borderRadius:8, background:"rgba(0,0,0,0.2)" }}/>
  );
};

/* ── Timer ring ──────────────────────────────────────────────────────── */
const TimerRing = ({ seconds, total }: { seconds:number; total:number }) => {
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const pct  = seconds / total;
  const col  = pct > 0.5 ? GOLD : pct > 0.2 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ position:"relative", width:88, height:88, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <svg width="88" height="88" style={{ transform:"rotate(-90deg)", position:"absolute" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="5"
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 1s linear, stroke 0.4s" }}/>
      </svg>
      <span style={{ fontSize:22, fontWeight:900, color:col, zIndex:1 }}>{seconds}</span>
    </div>
  );
};

/* ── Score badge ─────────────────────────────────────────────────────── */
const ScoreBadge = ({ score }: { score: number }) => {
  const color = score >= 85 ? "#22C55E" : score >= 65 ? GOLD : "#EF4444";
  const label = score >= 85 ? "Excellent" : score >= 65 ? "Good" : "Needs Work";
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ width:100, height:100, borderRadius:"50%", border:`4px solid ${color}`,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        background:`rgba(${score>=85?'34,197,94':score>=65?'201,168,76':'239,68,68'},0.1)`,
        boxShadow:`0 0 30px ${color}40`, margin:"0 auto 8px" }}>
        <span style={{ fontSize:28, fontWeight:900, color }}>{Math.round(score)}</span>
        <span style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:1 }}>/ 100</span>
      </div>
      <span style={{ fontSize:12, fontWeight:700, color }}>{label}</span>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════ */
const MustabaqahPage = () => {
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isJudge = hasRole("admin") || hasRole("teacher");

  type MView =
    | "hub"
    | "create"
    | "admin-lobby"
    | "admin-judge"
    | "student-queue"
    | "student-called"
    | "reciting"
    | "result"
    | "leaderboard";

  /* ── State ──────────────────────────────────────────────────────── */
  const [view,          setView]         = useState<MView>("hub");
  const [competitions,  setCompetitions] = useState<Competition[]>([]);
  const [competition,   setCompetition]  = useState<Competition | null>(null);
  const [participants,  setParticipants] = useState<Participant[]>([]);
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<Attempt | null>(null);
  const [allAttempts,   setAllAttempts]  = useState<Attempt[]>([]);
  const [loading,       setLoading]      = useState(false);
  const [timeLeft,      setTimeLeft]     = useState(120);
  const [countdown,     setCountdown]    = useState(3);
  const [isRecording,   setIsRecording]  = useState(false);
  const [isPaused,      setIsPaused]     = useState(false);
  const [transcript,    setTranscript]   = useState("");
  const [interimText,   setInterimText]  = useState("");
  const [analyser,      setAnalyser]     = useState<AnalyserNode | null>(null);
  const [audioUrl,      setAudioUrl]     = useState<string | null>(null);
  const [showAyah,      setShowAyah]     = useState(false);
  const [calledAyahText, setCalledAyahText] = useState("");
  const [judgeScore,    setJudgeScore]   = useState("");
  const [judgeComment,  setJudgeComment] = useState("");
  const [bellRinging,   setBellRinging]  = useState(false);

  // Create-form state
  const [form, setForm] = useState({
    title: "", description: "", type: "juz30" as Competition["competition_type"],
    surahIds: [] as number[], time: 120, rounds: 3,
  });
  const [surahFilter, setSurahFilter] = useState("");

  /* ── Refs ───────────────────────────────────────────────────────── */
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const audioChunks   = useRef<Blob[]>([]);
  const recognizerRef = useRef<any>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const channelRef    = useRef<any>(null);

  /* ── Load competitions on mount ─────────────────────────────────── */
  useEffect(() => {
    loadCompetitions();
  }, []);

  const loadCompetitions = async () => {
    const { data } = await supabase
      .from("musabaqah_competitions" as any)
      .select("*")
      .in("status", ["open", "active", "paused"])
      .order("created_at", { ascending: false });
    setCompetitions((data || []) as unknown as Competition[]);
  };

  /* ── Supabase Realtime ──────────────────────────────────────────── */
  useEffect(() => {
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`musabaqah:${competition.id}`)
      .on("broadcast", { event: "CALLED" }, ({ payload }: any) => {
        // Student was called
        if (payload.participant_id === myParticipant?.id) {
          setCalledAyahText(payload.assigned_text || "");
          setCurrentAttempt(payload.attempt as Attempt);
          setShowAyah(false);
          setView("student-called");
          try { navigator.vibrate?.([300, 100, 300, 100, 600]); } catch {}
        }
        loadParticipants();
      })
      .on("broadcast", { event: "STATUS_CHANGE" }, ({ payload }: any) => {
        setCompetition(c => c ? { ...c, ...payload } : c);
        if (payload.status === "completed") loadParticipants();
      })
      .on("broadcast", { event: "SCORE_UPDATE" }, () => {
        loadParticipants();
        loadAttempts();
      })
      .on("broadcast", { event: "BELL" }, () => {
        setBellRinging(true);
        setTimeout(() => setBellRinging(false), 3000);
      })
      .on("postgres_changes" as any, {
        event: "*", schema: "public",
        table: "musabaqah_participants",
        filter: `competition_id=eq.${competition.id}`,
      }, () => loadParticipants())
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [competition?.id, myParticipant?.id]);

  /* ── Data loaders ───────────────────────────────────────────────── */
  const loadParticipants = async () => {
    if (!competition) return;
    const { data } = await supabase
      .from("musabaqah_participants" as any)
      .select("*")
      .eq("competition_id", competition.id)
      .order("queue_position", { ascending: true });
    const all = (data || []) as unknown as Participant[];
    setParticipants(all);
    if (myParticipant) {
      const mine = all.find(p => p.id === myParticipant.id);
      if (mine) setMyParticipant(mine);
    }
  };

  const loadAttempts = async () => {
    if (!competition) return;
    const { data } = await supabase
      .from("musabaqah_attempts" as any)
      .select("*")
      .eq("competition_id", competition.id)
      .order("created_at", { ascending: false });
    setAllAttempts((data || []) as unknown as Attempt[]);
  };

  useEffect(() => {
    if (competition) { loadParticipants(); loadAttempts(); }
  }, [competition?.id]);

  /* ── Broadcast helper ───────────────────────────────────────────── */
  const broadcast = (event: string, payload: object) => {
    channelRef.current?.send({ type: "broadcast", event, payload });
  };

  /* ══════════════════════════════════════════════════════════════════
     ADMIN HANDLERS
  ══════════════════════════════════════════════════════════════════ */
  const createCompetition = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("musabaqah_competitions" as any)
        .insert({
          title:               form.title,
          description:         form.description,
          competition_type:    form.type,
          scope_config:        { surah_ids: form.surahIds },
          time_limit_seconds:  form.time,
          max_rounds:          form.rounds,
          status:              "open",
          current_round:       1,
          created_by:          user!.id,
        } as any)
        .select().single();
      if (error) throw error;
      const comp = data as unknown as Competition;
      setCompetition(comp);
      setParticipants([]);
      toast({ title: "✅ Competition created — participants can now join!" });
      setView("admin-lobby");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const callNextParticipant = async () => {
    if (!competition) return;
    const waiting = participants.find(p => p.status === "waiting");
    if (!waiting) { toast({ title: "No more participants waiting" }); return; }

    setLoading(true);
    try {
      // 1. Pick random ayah
      const { surahNum, start, end } = pickRandomAyah(competition);
      const surahMeta = SURAHS.find(s => s.n === surahNum)!;
      const text      = await fetchSurahVerses(surahNum, start, end);

      // 2. Create attempt record
      const { data: attemptData, error: ae } = await supabase
        .from("musabaqah_attempts" as any)
        .insert({
          competition_id: competition.id,
          participant_id: waiting.id,
          round_number:   competition.current_round,
          surah_number:   surahNum,
          surah_name:     surahMeta.en,
          surah_name_ar:  surahMeta.ar,
          ayah_start:     start,
          ayah_end:       end,
          assigned_text:  text,
          status:         "assigned",
        } as any)
        .select().single();
      if (ae) throw ae;

      // 3. Update participant status
      await supabase.from("musabaqah_participants" as any)
        .update({ status: "called" } as any).eq("id", waiting.id);

      // 4. Update competition current participant
      await supabase.from("musabaqah_competitions" as any)
        .update({ current_participant_id: waiting.id } as any).eq("id", competition.id);

      // 5. Broadcast call event
      const attempt = attemptData as unknown as Attempt;
      setCurrentAttempt(attempt);
      broadcast("CALLED", {
        participant_id: waiting.id,
        participant_name: waiting.participant_name,
        assigned_text: text,
        attempt,
      });

      toast({ title: `📢 ${waiting.participant_name} has been called!` });
      loadParticipants();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const ringBell = () => {
    broadcast("BELL", {});
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 3000);
    // Play bell sound via Web Audio
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start(); osc.stop(ctx.currentTime + 1.5);
    } catch {}
  };

  const pauseCompetition = async () => {
    if (!competition) return;
    const newStatus = competition.status === "paused" ? "active" : "paused";
    await supabase.from("musabaqah_competitions" as any)
      .update({ status: newStatus } as any).eq("id", competition.id);
    setCompetition(c => c ? { ...c, status: newStatus } : c);
    broadcast("STATUS_CHANGE", { status: newStatus });
  };

  const markAbsent = async (participantId: string) => {
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "absent" } as any).eq("id", participantId);
    loadParticipants();
  };

  const submitJudgeScore = async () => {
    if (!currentAttempt) return;
    const finalScore = parseFloat(judgeScore) || currentAttempt.total_score || 0;
    await supabase.from("musabaqah_attempts" as any).update({
      judge_score:  finalScore,
      judge_comment: judgeComment,
      status:       "judged",
      total_score:  finalScore,
    } as any).eq("id", currentAttempt.id);

    // Update participant total score
    const p = participants.find(p => p.id === currentAttempt.participant_id);
    if (p) {
      await supabase.from("musabaqah_participants" as any).update({
        total_score: (p.total_score || 0) + finalScore,
        status:      "completed",
        rounds_completed: (p.rounds_completed || 0) + 1,
      } as any).eq("id", p.id);
    }

    broadcast("SCORE_UPDATE", { attempt_id: currentAttempt.id });
    toast({ title: "✅ Score submitted!" });
    setView("admin-lobby");
    loadParticipants(); loadAttempts();
  };

  /* ══════════════════════════════════════════════════════════════════
     STUDENT HANDLERS
  ══════════════════════════════════════════════════════════════════ */
  const joinCompetition = async (comp: Competition) => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if already joined
      const { data: existing } = await supabase
        .from("musabaqah_participants" as any)
        .select("*").eq("competition_id", comp.id).eq("user_id", user.id).single();
      if (existing) {
        setMyParticipant(existing as unknown as Participant);
        setCompetition(comp);
        setView("student-queue");
        return;
      }

      // Get queue position
      const { count } = await supabase
        .from("musabaqah_participants" as any)
        .select("*", { count: "exact", head: true })
        .eq("competition_id", comp.id);

      const { data, error } = await supabase
        .from("musabaqah_participants" as any)
        .insert({
          competition_id:    comp.id,
          user_id:           user.id,
          participant_name:  (profile as any)?.full_name || user.email?.split("@")[0] || "Student",
          participant_level: (profile as any)?.level || (profile as any)?.course_level || "beginner",
          queue_position:    (count ?? 0) + 1,
          status:            "waiting",
          current_round:     1,
          total_score:       0,
        } as any)
        .select().single();
      if (error) throw error;
      setMyParticipant(data as unknown as Participant);
      setCompetition(comp);
      toast({ title: "✅ Joined! Wait for your name to be called." });
      setView("student-queue");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  /* ── Start recitation ─────────────────────────────────────────── */
  const startRecitation = async () => {
    if (!competition || !currentAttempt) return;
    setTranscript(""); setInterimText(""); setAudioUrl(null);

    // Countdown 3-2-1
    setCountdown(3);
    setView("reciting");
    setIsRecording(false);

    await new Promise<void>(res => {
      let c = 3;
      const iv = setInterval(() => {
        c--; setCountdown(c);
        if (c <= 0) { clearInterval(iv); res(); }
      }, 1000);
    });

    // Update attempt status
    await supabase.from("musabaqah_attempts" as any)
      .update({ status: "reciting", started_at: new Date().toISOString() } as any)
      .eq("id", currentAttempt.id);
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "reciting" } as any).eq("id", myParticipant!.id);

    // Mic setup
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // AnalyserNode for waveform
      const audioCtx  = new AudioContext();
      const src       = audioCtx.createMediaStreamSource(stream);
      const an        = audioCtx.createAnalyser();
      an.fftSize      = 256;
      src.connect(an);
      setAnalyser(an);

      // MediaRecorder for audio capture
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      recorder.start(200);
      mediaRecRef.current = recorder;

      // Speech recognition
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recog         = new SR();
        recog.lang          = "ar-SA";
        recog.continuous    = true;
        recog.interimResults = true;
        recog.onresult      = (e: any) => {
          let final = "", interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t + " ";
            else interim += t;
          }
          if (final) setTranscript(p => p + final);
          setInterimText(interim);
        };
        recog.onerror = () => {};
        recog.start();
        recognizerRef.current = recog;
      }

      setIsRecording(true);
    } catch {
      toast({ title: "Mic error", description: "Could not access microphone.", variant: "destructive" });
      return;
    }

    // Timer
    const limit = competition.time_limit_seconds;
    setTimeLeft(limit);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); stopRecitation(); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const stopRecitation = async () => {
    clearInterval(timerRef.current!);
    setIsRecording(false);

    // Stop speech recognition
    try { recognizerRef.current?.stop(); } catch {}

    // Stop MediaRecorder and get blob
    let finalTranscript = "";
    setTranscript(t => { finalTranscript = t; return t; });
    setInterimText(it => { finalTranscript += it; return ""; });

    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
      await new Promise<void>(res => { mediaRecRef.current!.onstop = () => res(); });
    }

    // Stop stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    setAnalyser(null);

    // Upload audio
    let audioStorageUrl = "";
    if (audioChunks.current.length > 0) {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const path = `${competition!.id}/${currentAttempt!.id}.webm`;
      const { error: upErr } = await supabase.storage
        .from("musabaqah-audio")
        .upload(path, blob, { upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("musabaqah-audio").getPublicUrl(path);
        audioStorageUrl = urlData.publicUrl;
        setAudioUrl(audioStorageUrl);
      }
    }

    // Score recitation
    const fullTranscript = finalTranscript.trim();
    const assignedText   = currentAttempt!.assigned_text;
    const { wordResults, accuracy, fluency, correct, total } = scoreRecitation(assignedText, fullTranscript);
    const tajweed        = Math.round((accuracy * 0.6 + fluency * 0.4));
    const totalScore     = Math.round((accuracy * 0.5 + fluency * 0.3 + tajweed * 0.2));

    // Save to DB
    const { data: savedAttempt } = await supabase
      .from("musabaqah_attempts" as any)
      .update({
        transcribed_text: fullTranscript,
        audio_url:        audioStorageUrl,
        accuracy_score:   accuracy,
        fluency_score:    fluency,
        tajweed_score:    tajweed,
        total_score:      totalScore,
        mistakes_count:   total - correct,
        word_results:     wordResults,
        status:           "submitted",
        completed_at:     new Date().toISOString(),
      } as any)
      .eq("id", currentAttempt!.id)
      .select().single();

    setCurrentAttempt(savedAttempt as unknown as Attempt);

    // Update participant
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "completed" } as any).eq("id", myParticipant!.id);

    setView("result");
  };

  /* ══════════════════════════════════════════════════════════════════
     SHARED STYLES / HELPERS
  ══════════════════════════════════════════════════════════════════ */
  const divider = (
    <div style={{ display:"flex", alignItems:"center", gap:10, margin:"18px 0" }}>
      <div style={{ flex:1, height:1, background:`rgba(201,168,76,0.15)` }}/>
      <Star size={10} color={GOLD} fill={GOLD}/>
      <div style={{ flex:1, height:1, background:`rgba(201,168,76,0.15)` }}/>
    </div>
  );

  const statusBadge = (s: Participant["status"]) => {
    const cfg: Record<string, [string, string]> = {
      waiting:   ["rgba(201,168,76,0.15)",  GOLD],
      called:    ["rgba(59,130,246,0.15)",  "#60A5FA"],
      reciting:  ["rgba(34,197,94,0.15)",   "#4ADE80"],
      completed: ["rgba(107,114,128,0.15)", "#9CA3AF"],
      eliminated:["rgba(239,68,68,0.15)",   "#F87171"],
      absent:    ["rgba(75,85,99,0.15)",    "#6B7280"],
    };
    const [bg, color] = cfg[s] || ["rgba(255,255,255,0.1)", "#fff"];
    return (
      <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, background:bg, color, letterSpacing:0.5, textTransform:"uppercase" }}>
        {s}
      </span>
    );
  };

  const positionRank = (i: number) => ["🥇","🥈","🥉"][i] ?? `#${i+1}`;

  /* ══════════════════════════════════════════════════════════════════
     VIEW: HUB
  ══════════════════════════════════════════════════════════════════ */
  if (view === "hub") return (
    <div style={{ ...page, padding:"0 0 40px", overflowY:"auto" }}>
      <IslamicBg/>

      {/* Header */}
      <div style={{ background:"rgba(0,0,0,0.3)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"14px 18px", position:"sticky", top:0, zIndex:10, display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => navigate(-1)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:20, lineHeight:1, padding:"0 8px 0 0" }}>←</button>
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:20, fontWeight:900, color:"#fff", margin:0 }}>Al-Musābaqah</h1>
          <p style={{ fontSize:11, color:GOLD, margin:0, fontFamily:"'Amiri', serif", letterSpacing:1 }}>مسابقة القرآن الكريم</p>
        </div>
        {isJudge && (
          <button onClick={() => setView("create")} style={{ ...goldBtn, width:"auto", padding:"9px 16px", fontSize:13 }}>
            <Plus size={15}/> Create
          </button>
        )}
        <button onClick={loadCompetitions} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"9px 12px", cursor:"pointer" }}>
          <RefreshCw size={14} color="rgba(255,255,255,0.6)"/>
        </button>
      </div>

      <div style={{ maxWidth:480, margin:"0 auto", padding:"20px 16px", position:"relative", zIndex:1 }}>

        {/* Hero */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:80, height:80, borderRadius:24, background:`linear-gradient(135deg,${GOLD},#a8873a)`, display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:12, boxShadow:`0 8px 32px rgba(201,168,76,0.5)` }}>
            <span style={{ fontSize:38 }}>🏆</span>
          </div>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.5)", margin:0 }}>
            Virtual Qur'an Recitation Competition
          </p>
        </div>

        {/* Active competitions */}
        {competitions.length === 0 ? (
          <div style={{ ...glass, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:10, opacity:0.4 }}>📖</div>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.4)", margin:0 }}>No active competitions</p>
            {isJudge && <p style={{ fontSize:12, color:"rgba(255,255,255,0.25)", marginTop:6 }}>Create one using the + button above</p>}
          </div>
        ) : competitions.map(c => (
          <div key={c.id} style={{ ...glass, padding:18, marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
              <div style={{ width:42, height:42, borderRadius:12, background:"rgba(201,168,76,0.15)", border:`1px solid rgba(201,168,76,0.3)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Trophy size={20} color={GOLD}/>
              </div>
              <div style={{ flex:1 }}>
                <h3 style={{ fontSize:16, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>{c.title}</h3>
                {c.description && <p style={{ fontSize:12, color:"rgba(255,255,255,0.45)", margin:"0 0 6px" }}>{c.description}</p>}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"rgba(34,197,94,0.15)", color:"#4ADE80", fontWeight:700, letterSpacing:0.5 }}>
                    {c.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.5)" }}>
                    {c.competition_type === "juz30" ? "Juz 30" : c.competition_type === "custom" ? "Custom Surahs" : "Full Quran"}
                  </span>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.5)" }}>
                    <Clock size={9} style={{ display:"inline", marginRight:3 }}/>{c.time_limit_seconds}s
                  </span>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.5)" }}>
                    Round {c.current_round}/{c.max_rounds}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {!isJudge && (
                <button onClick={() => joinCompetition(c)} disabled={loading}
                  style={{ ...goldBtn, flex:2, padding:"11px" }}>
                  <ChevronRight size={16}/> Join Queue
                </button>
              )}
              {isJudge && (
                <button onClick={() => { setCompetition(c); setView("admin-lobby"); }}
                  style={{ ...goldBtn, flex:2, padding:"11px" }}>
                  <Crown size={16}/> Open Control Panel
                </button>
              )}
              <button onClick={() => { setCompetition(c); loadParticipants(); setView("leaderboard"); }}
                style={{ ...outBtn, flex:1, padding:"11px" }}>
                <Trophy size={14}/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════
     VIEW: CREATE COMPETITION (Admin)
  ══════════════════════════════════════════════════════════════════ */
  if (view === "create") {
    const filtered = surahFilter
      ? SURAHS.filter(s => s.en.toLowerCase().includes(surahFilter.toLowerCase()) || s.ar.includes(surahFilter))
      : SURAHS;
    return (
      <div style={{ ...page, overflowY:"auto" }}>
        <IslamicBg/>
        <div style={{ background:"rgba(0,0,0,0.4)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"14px 18px", position:"sticky", top:0, zIndex:10, display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setView("hub")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:16 }}>← Back</button>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:18, color:"#fff", margin:0, flex:1 }}>Create Competition</h2>
        </div>

        <div style={{ maxWidth:480, margin:"0 auto", padding:"20px 16px 40px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:18 }}>

          {/* Title */}
          <div>
            <label style={label}>Competition Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Ramadan Musabaqah 2026" style={inp}/>
          </div>

          {/* Description */}
          <div>
            <label style={label}>Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Brief description of the competition…"
              style={{ ...inp, minHeight:64, resize:"vertical" }}/>
          </div>

          {/* Type */}
          <div>
            <label style={label}>Scope</label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {([
                ["juz30",      "🌙", "Juz 30 Only",   "Short surahs from the 30th Juz"],
                ["full_quran", "📖", "Full Quran",     "Any surah from 1–114"],
                ["custom",     "✏️", "Custom Surahs",  "Choose specific surahs below"],
              ] as const).map(([t, icon, name, desc]) => (
                <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, border:`1.5px solid ${form.type===t?GOLD:"rgba(255,255,255,0.1)"}`, background:form.type===t?"rgba(201,168,76,0.1)":"rgba(255,255,255,0.03)", cursor:"pointer", textAlign:"left" }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:form.type===t?GOLD:"#fff", margin:0 }}>{name}</p>
                    <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", margin:0 }}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom surah picker */}
          {form.type === "custom" && (
            <div>
              <label style={label}>Select Surahs</label>
              <input value={surahFilter} onChange={e => setSurahFilter(e.target.value)}
                placeholder="Search surah…" style={{ ...inp, marginBottom:8 }}/>
              <div style={{ maxHeight:200, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                {filtered.map(s => {
                  const selected = form.surahIds.includes(s.n);
                  return (
                    <button key={s.n} onClick={() => setForm(p => ({
                      ...p, surahIds: selected ? p.surahIds.filter(id => id !== s.n) : [...p.surahIds, s.n]
                    }))}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:10, border:`1px solid ${selected?GOLD:"rgba(255,255,255,0.08)"}`, background:selected?"rgba(201,168,76,0.1)":"rgba(255,255,255,0.02)", cursor:"pointer", textAlign:"left" }}>
                      <span style={{ fontSize:11, color:GOLD, minWidth:28, fontWeight:700 }}>{s.n}.</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#fff", flex:1 }}>{s.en}</span>
                      <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)", fontFamily:"'Amiri',serif" }}>{s.ar}</span>
                      {selected && <CheckCircle size={14} color={GOLD}/>}
                    </button>
                  );
                })}
              </div>
              {form.surahIds.length > 0 && (
                <p style={{ fontSize:11, color:GOLD, marginTop:6, fontWeight:700 }}>{form.surahIds.length} surahs selected</p>
              )}
            </div>
          )}

          {/* Time limit */}
          <div>
            <label style={label}>Time Limit Per Recitation</label>
            <div style={{ display:"flex", gap:8 }}>
              {[60,90,120,180].map(t => (
                <button key={t} onClick={() => setForm(p => ({ ...p, time: t }))}
                  style={{ flex:1, padding:"10px 6px", borderRadius:10, border:`1.5px solid ${form.time===t?GOLD:"rgba(255,255,255,0.1)"}`, background:form.time===t?"rgba(201,168,76,0.15)":"transparent", color:form.time===t?GOLD:"rgba(255,255,255,0.5)", cursor:"pointer", fontWeight:800, fontSize:13 }}>
                  {t}s
                </button>
              ))}
            </div>
          </div>

          {/* Rounds */}
          <div>
            <label style={label}>Max Rounds</label>
            <div style={{ display:"flex", gap:8 }}>
              {[1,2,3,5].map(r => (
                <button key={r} onClick={() => setForm(p => ({ ...p, rounds: r }))}
                  style={{ flex:1, padding:"10px 6px", borderRadius:10, border:`1.5px solid ${form.rounds===r?GOLD:"rgba(255,255,255,0.1)"}`, background:form.rounds===r?"rgba(201,168,76,0.15)":"transparent", color:form.rounds===r?GOLD:"rgba(255,255,255,0.5)", cursor:"pointer", fontWeight:800, fontSize:15 }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button onClick={createCompetition} disabled={!form.title.trim() || loading} style={{ ...goldBtn, opacity:form.title.trim()?1:0.4, fontSize:16, padding:"16px" }}>
            <Play size={18}/> {loading ? "Creating…" : "Launch Competition"}
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: ADMIN LOBBY (Control Panel)
  ══════════════════════════════════════════════════════════════════ */
  if (view === "admin-lobby" && competition) {
    const waiting    = participants.filter(p => p.status === "waiting");
    const called     = participants.find(p => p.status === "called" || p.status === "reciting");
    const completed  = participants.filter(p => p.status === "completed");
    const recentAttempt = allAttempts.find(a => a.status === "submitted");

    return (
      <div style={{ ...page, overflowY:"auto" }}>
        <IslamicBg/>
        {/* Sticky header */}
        <div style={{ background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"12px 16px", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={() => setView("hub")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:16 }}>←</button>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:16, fontWeight:800, color:"#fff", margin:0 }}>{competition.title}</p>
              <p style={{ fontSize:11, color:GOLD, margin:0 }}>Round {competition.current_round}/{competition.max_rounds} · {competition.status.toUpperCase()}</p>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={ringBell}
                style={{ background:bellRinging?"rgba(201,168,76,0.3)":"rgba(255,255,255,0.07)", border:`1px solid ${bellRinging?GOLD:"rgba(255,255,255,0.12)"}`, borderRadius:10, padding:"9px 11px", cursor:"pointer", transition:"all .2s" }}>
                <Bell size={16} color={bellRinging?GOLD:"rgba(255,255,255,0.5)"}/>
              </button>
              <button onClick={pauseCompetition}
                style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"9px 11px", cursor:"pointer" }}>
                {competition.status === "paused" ? <Play size={16} color={GOLD}/> : <Pause size={16} color="rgba(255,255,255,0.5)"/>}
              </button>
              <button onClick={() => { loadParticipants(); setView("leaderboard"); }}
                style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"9px 11px", cursor:"pointer" }}>
                <Trophy size={16} color="rgba(255,255,255,0.5)"/>
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth:520, margin:"0 auto", padding:"16px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Stats row */}
          <div style={{ display:"flex", gap:8 }}>
            {[
              { label:"Waiting",   val:waiting.length,   color:GOLD },
              { label:"On Stage",  val:called?1:0,       color:"#60A5FA" },
              { label:"Done",      val:completed.length,  color:"#4ADE80" },
            ].map(s => (
              <div key={s.label} style={{ flex:1, ...glass, padding:"12px 8px", textAlign:"center" }}>
                <p style={{ fontSize:22, fontWeight:900, color:s.color, margin:0 }}>{s.val}</p>
                <p style={{ fontSize:10, color:"rgba(255,255,255,0.4)", margin:0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Currently reciting */}
          {called && (
            <div style={{ ...glass, padding:16, border:`1px solid rgba(34,197,94,0.3)`, background:"rgba(34,197,94,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <Radio size={14} color="#4ADE80"/>
                <span style={{ fontSize:12, fontWeight:700, color:"#4ADE80", letterSpacing:1 }}>ON STAGE NOW</span>
              </div>
              <p style={{ fontSize:18, fontWeight:900, color:"#fff", margin:"0 0 6px" }}>{called.participant_name}</p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", margin:"0 0 12px" }}>Status: {called.status}</p>
              {recentAttempt && recentAttempt.status === "submitted" && (
                <button onClick={() => { setCurrentAttempt(recentAttempt); setJudgeScore(String(recentAttempt.total_score || "")); setJudgeComment(""); setView("admin-judge"); }}
                  style={{ ...goldBtn, padding:"11px" }}>
                  <Edit3 size={15}/> Judge Recitation
                </button>
              )}
            </div>
          )}

          {/* Call next */}
          {!called && waiting.length > 0 && (
            <button onClick={callNextParticipant} disabled={loading || competition.status==="paused"}
              style={{ ...goldBtn, fontSize:17, padding:"18px", opacity:competition.status==="paused"?0.4:1 }}>
              <PhoneCall size={20}/> {loading ? "Calling…" : `Call Next — ${waiting[0]?.participant_name}`}
            </button>
          )}
          {!called && waiting.length === 0 && (
            <div style={{ ...glass, padding:16, textAlign:"center" }}>
              <CheckCircle size={24} color="#4ADE80" style={{ marginBottom:6 }}/>
              <p style={{ color:"rgba(255,255,255,0.6)", margin:0 }}>All participants have recited</p>
            </div>
          )}

          {/* Queue */}
          <div style={{ ...glass, padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <h3 style={{ fontSize:13, fontWeight:800, color:GOLD, margin:0, letterSpacing:1, textTransform:"uppercase" }}>
                <Users size={13} style={{ marginRight:6 }}/>Queue
              </h3>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>{participants.length} total</span>
            </div>
            {participants.length === 0 ? (
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", textAlign:"center", padding:"12px 0" }}>No participants yet</p>
            ) : participants.map((p, i) => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:i<participants.length-1?"1px solid rgba(255,255,255,0.06)":"none" }}>
                <span style={{ fontSize:13, minWidth:24, fontWeight:700, color:GOLD }}>#{p.queue_position}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:"#fff", margin:0 }}>{p.participant_name}</p>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:0 }}>{p.participant_level} · Score: {p.total_score}</p>
                </div>
                {statusBadge(p.status)}
                {p.status === "waiting" && (
                  <button onClick={() => markAbsent(p.id)}
                    style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"4px 8px", cursor:"pointer" }}>
                    <X size={12} color="#F87171"/>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Recent scores */}
          {allAttempts.filter(a => a.status === "judged").length > 0 && (
            <div style={{ ...glass, padding:16 }}>
              <h3 style={{ fontSize:13, fontWeight:800, color:GOLD, margin:"0 0 12px", letterSpacing:1, textTransform:"uppercase" }}>Recent Scores</h3>
              {allAttempts.filter(a => a.status === "judged").slice(0,5).map(a => {
                const p = participants.find(pt => pt.id === a.participant_id);
                return (
                  <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:"#fff", margin:0 }}>{p?.participant_name}</p>
                      <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:0, fontFamily:"'Amiri',serif" }}>{a.surah_name_ar} {a.ayah_start}:{a.ayah_end}</p>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <p style={{ fontSize:18, fontWeight:900, color:GOLD, margin:0 }}>{Math.round(a.judge_score ?? a.total_score ?? 0)}</p>
                      <p style={{ fontSize:10, color:"rgba(255,255,255,0.35)", margin:0 }}>/ 100</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: ADMIN JUDGE PANEL
  ══════════════════════════════════════════════════════════════════ */
  if (view === "admin-judge" && currentAttempt) {
    const { wordResults = [] } = currentAttempt;
    const participant = participants.find(p => p.id === currentAttempt.participant_id);

    return (
      <div style={{ ...page, overflowY:"auto" }}>
        <IslamicBg/>
        <div style={{ background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"12px 16px", position:"sticky", top:0, zIndex:10, display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setView("admin-lobby")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:16 }}>← Back</button>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:17, color:"#fff", margin:0, flex:1 }}>Judge Panel</h2>
        </div>

        <div style={{ maxWidth:520, margin:"0 auto", padding:"16px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Participant info */}
          <div style={{ ...glass, padding:14 }}>
            <p style={{ fontSize:18, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>{participant?.participant_name}</p>
            <p style={{ fontSize:12, color:GOLD, margin:0 }}>
              {currentAttempt.surah_name_ar} (Surah {currentAttempt.surah_number}) · Ayah {currentAttempt.ayah_start}–{currentAttempt.ayah_end}
            </p>
          </div>

          {/* Audio player */}
          {currentAttempt.audio_url && (
            <div style={{ ...glass, padding:14 }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 10px", letterSpacing:1.5, textTransform:"uppercase" }}>🎵 Recitation Audio</p>
              <audio controls src={currentAttempt.audio_url} style={{ width:"100%", borderRadius:8 }}/>
            </div>
          )}

          {/* Assigned text */}
          <div style={{ ...glass, padding:14 }}>
            <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 10px", letterSpacing:1.5, textTransform:"uppercase" }}>📖 Assigned Text</p>
            <p style={{ fontSize:20, color:"#fff", lineHeight:2.2, direction:"rtl", fontFamily:"'Scheherazade New','Amiri',serif", margin:0, textAlign:"right" }}>
              {currentAttempt.assigned_text}
            </p>
          </div>

          {/* Word comparison */}
          {wordResults.length > 0 && (
            <div style={{ ...glass, padding:14 }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 10px", letterSpacing:1.5, textTransform:"uppercase" }}>
                Word-by-Word Analysis
              </p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, direction:"rtl", justifyContent:"flex-end" }}>
                {wordResults.map((w, i) => (
                  <span key={i} style={{
                    padding:"4px 10px", borderRadius:8, fontSize:14,
                    fontFamily:"'Scheherazade New','Amiri',serif",
                    background: w.status==="correct"?"rgba(34,197,94,0.15)":w.status==="mistake"?"rgba(239,68,68,0.15)":"rgba(107,114,128,0.15)",
                    color: w.status==="correct"?"#4ADE80":w.status==="mistake"?"#F87171":"#6B7280",
                    border: `1px solid ${w.status==="correct"?"rgba(34,197,94,0.3)":w.status==="mistake"?"rgba(239,68,68,0.3)":"rgba(107,114,128,0.3)"}`,
                  }}>{w.original}</span>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, marginTop:12 }}>
                {[["🟢","Correct"],["🔴","Mistake"],["⚫","Missing"]].map(([ic,lb]) => (
                  <span key={lb} style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{ic} {lb}</span>
                ))}
              </div>
            </div>
          )}

          {/* AI scores */}
          <div style={{ display:"flex", gap:8 }}>
            {[
              { l:"Accuracy",  v:currentAttempt.accuracy_score },
              { l:"Fluency",   v:currentAttempt.fluency_score },
              { l:"Tajweed",   v:currentAttempt.tajweed_score },
            ].map(s => (
              <div key={s.l} style={{ flex:1, ...glass, padding:"12px 8px", textAlign:"center" }}>
                <p style={{ fontSize:20, fontWeight:900, color:GOLD, margin:0 }}>{Math.round(s.v ?? 0)}</p>
                <p style={{ fontSize:10, color:"rgba(255,255,255,0.4)", margin:0 }}>{s.l}</p>
              </div>
            ))}
          </div>

          {/* Judge override */}
          <div style={{ ...glass, padding:14 }}>
            <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 12px", letterSpacing:1.5, textTransform:"uppercase" }}>Judge Score Override</p>
            <div style={{ marginBottom:10 }}>
              <label style={label}>Final Score (0–100)</label>
              <input type="number" min="0" max="100"
                value={judgeScore} onChange={e => setJudgeScore(e.target.value)}
                placeholder={`AI: ${Math.round(currentAttempt.total_score ?? 0)}`}
                style={{ ...inp, fontSize:20, fontWeight:700, color:GOLD, textAlign:"center" }}/>
            </div>
            <div>
              <label style={label}>Judge Comment</label>
              <textarea value={judgeComment} onChange={e => setJudgeComment(e.target.value)}
                placeholder="Feedback for the student…"
                style={{ ...inp, minHeight:64, resize:"vertical" }}/>
            </div>
          </div>

          <button onClick={submitJudgeScore} style={{ ...goldBtn, fontSize:16, padding:"16px" }}>
            <CheckCircle size={18}/> Submit Score & Continue
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: STUDENT QUEUE (Waiting Room)
  ══════════════════════════════════════════════════════════════════ */
  if (view === "student-queue" && competition) {
    const myPos = myParticipant?.queue_position ?? 0;
    const waiting = participants.filter(p => p.status === "waiting");
    const currentlyOn = participants.find(p => p.status === "called" || p.status === "reciting");

    return (
      <div style={{ ...page, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 18px" }}>
        <IslamicBg/>
        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:420, textAlign:"center" }}>

          {/* Bell animation if ringing */}
          {bellRinging && (
            <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)" }}>
              <div style={{ animation:"bellBounce 0.3s ease infinite alternate" }}>
                <span style={{ fontSize:80 }}>🔔</span>
              </div>
            </div>
          )}

          <div style={{ width:90, height:90, borderRadius:28, background:`linear-gradient(135deg,${GOLD},#a8873a)`, display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:16, boxShadow:`0 8px 36px rgba(201,168,76,0.5)` }}>
            <span style={{ fontSize:44 }}>🕌</span>
          </div>

          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:26, color:"#fff", margin:"0 0 4px" }}>You're in the Queue</h2>
          <p style={{ fontSize:15, color:GOLD, margin:"0 0 24px" }}>{competition.title}</p>

          {/* Position */}
          <div style={{ ...glass, padding:20, marginBottom:14 }}>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.45)", margin:"0 0 6px", letterSpacing:1, textTransform:"uppercase" }}>Your Position</p>
            <p style={{ fontSize:52, fontWeight:900, color:GOLD, margin:"0 0 4px", fontFamily:"'Playfair Display',serif" }}>#{myPos}</p>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", margin:0 }}>{waiting.length > 0 ? `${waiting.length} remaining` : "You're next!"}</p>
          </div>

          {/* Currently on stage */}
          {currentlyOn && (
            <div style={{ ...glass, padding:14, marginBottom:14, border:"1px solid rgba(34,197,94,0.25)", background:"rgba(34,197,94,0.04)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#4ADE80", animation:"pulse 1s infinite" }}/>
                <p style={{ fontSize:12, color:"#4ADE80", fontWeight:700, margin:0 }}>On Stage: {currentlyOn.participant_name}</p>
              </div>
            </div>
          )}

          {/* My name */}
          <div style={{ ...glass, padding:14, marginBottom:20 }}>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", margin:0 }}>Registered as</p>
            <p style={{ fontSize:18, fontWeight:800, color:"#fff", margin:0 }}>{myParticipant?.participant_name}</p>
          </div>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:GOLD, animation:"pulse 1.5s infinite" }}/>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", margin:0 }}>Waiting for your name to be called…</p>
          </div>

          <button onClick={() => setView("leaderboard")} style={{ ...outBtn, marginTop:20, width:"auto", padding:"10px 20px" }}>
            <Trophy size={14}/> View Leaderboard
          </button>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}} @keyframes bellBounce{0%{transform:rotate(-15deg)}100%{transform:rotate(15deg)}}`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: STUDENT CALLED (You're Up!)
  ══════════════════════════════════════════════════════════════════ */
  if (view === "student-called") {
    return (
      <div style={{ ...page, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 18px" }}>
        <IslamicBg opacity={0.09}/>
        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:440, textAlign:"center" }}>

          {/* Pulsing icon */}
          <div style={{ width:100, height:100, borderRadius:32, background:"rgba(34,197,94,0.2)", border:"2px solid #4ADE80", display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:16, animation:"calledPulse 1.2s ease infinite", boxShadow:"0 0 50px rgba(34,197,94,0.4)" }}>
            <PhoneCall size={48} color="#4ADE80"/>
          </div>

          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:30, color:"#4ADE80", margin:"0 0 6px", animation:"fadeIn .4s ease" }}>
            It's Your Turn!
          </h2>
          <p style={{ fontSize:18, color:GOLD, margin:"0 0 24px", fontFamily:"'Amiri',serif" }}>حان دورك — You've been called</p>

          {/* Ayah reveal */}
          <div style={{ ...glass, padding:20, marginBottom:20, border:"1px solid rgba(201,168,76,0.3)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:0, letterSpacing:1.5, textTransform:"uppercase" }}>Your Assigned Ayah</p>
              <button onClick={() => setShowAyah(!showAyah)}
                style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:"rgba(255,255,255,0.6)", fontSize:12 }}>
                {showAyah ? <EyeOff size={12}/> : <Eye size={12}/>} {showAyah ? "Hide" : "Reveal"}
              </button>
            </div>

            {showAyah ? (
              <p style={{ fontSize:24, color:"#fff", lineHeight:2.4, direction:"rtl", fontFamily:"'Scheherazade New','Amiri Quran','Amiri',serif", margin:0, textAlign:"right" }}>
                {calledAyahText || currentAttempt?.assigned_text}
              </p>
            ) : (
              <div style={{ padding:"20px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ width:24, height:8, borderRadius:4, background:"rgba(255,255,255,0.1)" }}/>
                ))}
              </div>
            )}

            {currentAttempt && (
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.35)", margin:"10px 0 0", fontFamily:"'Cairo',sans-serif" }}>
                {currentAttempt.surah_name_ar} ({currentAttempt.surah_name}) · Ayah {currentAttempt.ayah_start}–{currentAttempt.ayah_end}
              </p>
            )}
          </div>

          <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:20 }}>
            You have <strong style={{ color:GOLD }}>{competition?.time_limit_seconds}s</strong> to recite. The mic will start automatically.
          </p>

          <button onClick={startRecitation} style={{ ...goldBtn, fontSize:18, padding:"20px" }}>
            <Mic size={22}/> Start Recitation
          </button>
        </div>
        <style>{`@keyframes calledPulse{0%,100%{transform:scale(1);box-shadow:0 0 50px rgba(34,197,94,.4)}50%{transform:scale(1.06);box-shadow:0 0 70px rgba(34,197,94,.7)}} @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: RECITING
  ══════════════════════════════════════════════════════════════════ */
  if (view === "reciting" && competition) {
    const isCountingDown = !isRecording;
    return (
      <div style={{ ...page, display:"flex", flexDirection:"column", padding:"0 0 30px" }}>
        <IslamicBg opacity={0.05}/>

        {/* Countdown overlay */}
        {isCountingDown && countdown > 0 && (
          <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.85)", backdropFilter:"blur(10px)", flexDirection:"column", gap:12 }}>
            <p style={{ fontSize:14, color:GOLD, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>Get Ready…</p>
            <div style={{ width:160, height:160, borderRadius:"50%", background:`conic-gradient(${GOLD} ${(countdown/3)*360}deg, rgba(255,255,255,0.06) 0deg)`, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 0 60px rgba(201,168,76,0.6)` }}>
              <div style={{ width:130, height:130, borderRadius:"50%", background:"#030e08", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:80, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',serif", animation:"cPop .3s ease" }}>{countdown}</span>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${isRecording?"rgba(239,68,68,0.3)":"rgba(201,168,76,0.18)"}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
          {isRecording && <div style={{ width:10, height:10, borderRadius:"50%", background:"#EF4444", animation:"pulse 1s infinite" }}/>}
          <p style={{ fontSize:14, fontWeight:800, color:isRecording?"#F87171":"rgba(255,255,255,0.7)", margin:0, flex:1 }}>
            {isRecording ? "🔴 Recording…" : "Preparing…"}
          </p>
          {isRecording && (
            <TimerRing seconds={timeLeft} total={competition.time_limit_seconds}/>
          )}
        </div>

        <div style={{ flex:1, overflowY:"auto", maxWidth:480, margin:"0 auto", width:"100%", padding:"16px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Assigned ayah (always visible during reciting) */}
          {currentAttempt && (
            <div style={{ ...glass, padding:16 }}>
              <p style={{ fontSize:10, color:GOLD, fontWeight:700, margin:"0 0 8px", letterSpacing:1.5, textTransform:"uppercase" }}>
                {currentAttempt.surah_name_ar} · Ayah {currentAttempt.ayah_start}–{currentAttempt.ayah_end}
              </p>
              <p style={{ fontSize:22, color:"#fff", lineHeight:2.4, direction:"rtl", fontFamily:"'Scheherazade New','Amiri Quran','Amiri',serif", margin:0, textAlign:"right" }}>
                {currentAttempt.assigned_text}
              </p>
            </div>
          )}

          {/* Waveform */}
          {isRecording && (
            <div style={{ ...glass, padding:14 }}>
              <p style={{ fontSize:10, color:"rgba(255,255,255,0.35)", margin:"0 0 8px", letterSpacing:1 }}>🎤 Live Audio</p>
              <Waveform analyser={analyser}/>
            </div>
          )}

          {/* Live transcription */}
          {isRecording && (
            <div style={{ ...glass, padding:14, minHeight:80 }}>
              <p style={{ fontSize:10, color:GOLD, fontWeight:700, margin:"0 0 8px", letterSpacing:1.5, textTransform:"uppercase" }}>Live Transcription</p>
              <p style={{ fontSize:18, color:"#fff", direction:"rtl", fontFamily:"'Scheherazade New','Amiri',serif", lineHeight:2, margin:0, textAlign:"right" }}>
                {transcript || <span style={{ color:"rgba(255,255,255,0.2)" }}>بدأ التسجيل…</span>}
                {interimText && <span style={{ color:"rgba(201,168,76,0.6)" }}> {interimText}</span>}
              </p>
            </div>
          )}

          {/* Stop button */}
          {isRecording && (
            <button onClick={stopRecitation}
              style={{ ...dangerBtn, fontSize:16, padding:"16px", border:"2px solid rgba(239,68,68,0.5)", background:"rgba(239,68,68,0.12)", color:"#F87171" }}>
              <Square size={18}/> Stop & Submit
            </button>
          )}
        </div>
        <style>{`@keyframes cPop{0%{transform:scale(1.5);opacity:0}100%{transform:scale(1);opacity:1}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: RESULT
  ══════════════════════════════════════════════════════════════════ */
  if (view === "result" && currentAttempt) {
    const totalScore = currentAttempt.total_score ?? 0;
    const wordResults = (currentAttempt.word_results ?? []) as WordResult[];

    return (
      <div style={{ ...page, overflowY:"auto" }}>
        <IslamicBg/>
        <div style={{ background:"rgba(0,0,0,0.4)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"12px 16px", position:"sticky", top:0, zIndex:10, display:"flex", alignItems:"center", gap:10 }}>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:18, color:"#fff", margin:0, flex:1 }}>Your Result</h2>
          <button onClick={() => { setView("student-queue"); }}
            style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10, padding:"8px 14px", cursor:"pointer", color:"rgba(255,255,255,0.6)", fontSize:12 }}>
            ← Back to Queue
          </button>
        </div>

        <div style={{ maxWidth:480, margin:"0 auto", padding:"20px 16px 40px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Main score */}
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <ScoreBadge score={totalScore}/>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.5)", marginTop:12 }}>
              {currentAttempt.surah_name_ar} · Ayah {currentAttempt.ayah_start}–{currentAttempt.ayah_end}
            </p>
          </div>

          {/* Score breakdown */}
          <div style={{ display:"flex", gap:8 }}>
            {[
              { l:"Accuracy",    v:currentAttempt.accuracy_score ?? 0,  icon:"🎯" },
              { l:"Fluency",     v:currentAttempt.fluency_score ?? 0,   icon:"🌊" },
              { l:"Tajweed",     v:currentAttempt.tajweed_score ?? 0,   icon:"✨" },
            ].map(s => (
              <div key={s.l} style={{ flex:1, ...glass, padding:"12px 8px", textAlign:"center" }}>
                <p style={{ fontSize:16, margin:"0 0 2px" }}>{s.icon}</p>
                <p style={{ fontSize:20, fontWeight:900, color:GOLD, margin:0 }}>{Math.round(s.v)}</p>
                <p style={{ fontSize:10, color:"rgba(255,255,255,0.4)", margin:0 }}>{s.l}</p>
              </div>
            ))}
          </div>

          {/* Word results */}
          {wordResults.length > 0 && (
            <div style={{ ...glass, padding:16 }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 12px", letterSpacing:1.5, textTransform:"uppercase" }}>Word Analysis</p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, direction:"rtl", justifyContent:"flex-end" }}>
                {wordResults.map((w, i) => (
                  <span key={i} style={{
                    padding:"4px 10px", borderRadius:8, fontSize:14,
                    fontFamily:"'Scheherazade New','Amiri',serif",
                    background: w.status==="correct"?"rgba(34,197,94,0.15)":w.status==="mistake"?"rgba(239,68,68,0.15)":"rgba(107,114,128,0.15)",
                    color: w.status==="correct"?"#4ADE80":w.status==="mistake"?"#F87171":"#6B7280",
                    border:`1px solid ${w.status==="correct"?"rgba(34,197,94,0.3)":w.status==="mistake"?"rgba(239,68,68,0.3)":"rgba(107,114,128,0.3)"}`,
                  }}>{w.original}</span>
                ))}
              </div>
              <div style={{ display:"flex", gap:14, marginTop:12 }}>
                {[
                  ["🟢", `${wordResults.filter(w=>w.status==="correct").length} Correct`],
                  ["🔴", `${wordResults.filter(w=>w.status==="mistake").length} Mistake`],
                  ["⚫", `${wordResults.filter(w=>w.status==="missing").length} Missing`],
                ].map(([ic, lb]) => (
                  <span key={lb as string} style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{ic} {lb}</span>
                ))}
              </div>
            </div>
          )}

          {/* Judge comment if available */}
          {currentAttempt.judge_comment && (
            <div style={{ ...glass, padding:14, border:"1px solid rgba(201,168,76,0.25)" }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 8px", letterSpacing:1.5, textTransform:"uppercase" }}>Judge Feedback</p>
              <p style={{ fontSize:14, color:"rgba(255,255,255,0.7)", margin:0, lineHeight:1.6 }}>"{currentAttempt.judge_comment}"</p>
              {currentAttempt.judge_score !== null && currentAttempt.judge_score !== undefined && (
                <p style={{ fontSize:13, color:GOLD, fontWeight:800, margin:"8px 0 0" }}>Final Judge Score: {Math.round(currentAttempt.judge_score)} / 100</p>
              )}
            </div>
          )}

          {currentAttempt.status !== "judged" && (
            <div style={{ ...glass, padding:14, border:"1px solid rgba(59,130,246,0.25)", background:"rgba(59,130,246,0.04)" }}>
              <p style={{ fontSize:13, color:"#60A5FA", margin:0 }}>⏳ Awaiting judge review — your AI score is shown above. The judge may override it.</p>
            </div>
          )}

          {/* Audio playback */}
          {audioUrl && (
            <div style={{ ...glass, padding:14 }}>
              <p style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 8px", letterSpacing:1.5, textTransform:"uppercase" }}>Your Recording</p>
              <audio controls src={audioUrl} style={{ width:"100%", borderRadius:8 }}/>
            </div>
          )}

          <button onClick={() => { setView("leaderboard"); loadParticipants(); }}
            style={{ ...outBtn, padding:"14px" }}>
            <Trophy size={16}/> View Leaderboard
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     VIEW: LEADERBOARD
  ══════════════════════════════════════════════════════════════════ */
  if (view === "leaderboard" && competition) {
    const sorted  = [...participants].sort((a,b) => (b.total_score||0) - (a.total_score||0));
    const top3    = [sorted[1], sorted[0], sorted[2]];
    const heights = [100, 130, 80];
    const medals  = ["🥈","🥇","🥉"];

    return (
      <div style={{ ...page, overflowY:"auto" }}>
        <IslamicBg/>
        <div style={{ background:"rgba(0,0,0,0.4)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(201,168,76,0.18)", padding:"12px 16px", position:"sticky", top:0, zIndex:10, display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setView(isJudge ? "admin-lobby" : "student-queue")}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:16 }}>←</button>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontWeight:900, fontSize:18, color:"#fff", margin:0, flex:1 }}>Leaderboard</h2>
          <button onClick={() => { loadParticipants(); loadAttempts(); }}
            style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10, padding:"8px 10px", cursor:"pointer" }}>
            <RefreshCw size={14} color="rgba(255,255,255,0.5)"/>
          </button>
        </div>

        <div style={{ maxWidth:480, margin:"0 auto", padding:"16px 16px 40px", position:"relative", zIndex:1 }}>

          {/* Competition info */}
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <p style={{ fontSize:16, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>{competition.title}</p>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", margin:0 }}>Round {competition.current_round}/{competition.max_rounds} · {participants.length} Participants</p>
          </div>

          {/* Podium */}
          {sorted.length >= 2 && (
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:6, marginBottom:24, height:150 }}>
              {top3.map((p, i) => {
                if (!p) return <div key={i} style={{ flex:1 }}/>;
                return (
                  <div key={p.id} style={{ flex:1, height:heights[i], background:i===1?"rgba(201,168,76,0.18)":"rgba(255,255,255,0.06)", borderRadius:"12px 12px 0 0", border:`1px solid ${i===1?GOLD:"rgba(255,255,255,0.1)"}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", padding:"8px 4px", gap:2 }}>
                    <span style={{ fontSize:22 }}>{medals[i]}</span>
                    <p style={{ fontSize:11, fontWeight:800, color:"#fff", margin:0, lineHeight:1.2, wordBreak:"break-word", padding:"0 4px", textAlign:"center" }}>{p.participant_name}</p>
                    <p style={{ fontSize:13, fontWeight:900, color:GOLD, margin:0 }}>{Math.round(p.total_score||0)}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full standings */}
          <div style={{ ...glass, padding:16 }}>
            <h4 style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 14px", letterSpacing:1.5, textTransform:"uppercase", display:"flex", alignItems:"center", gap:8 }}>
              <Trophy size={12}/> Full Standings
            </h4>
            {sorted.length === 0 ? (
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", textAlign:"center", padding:"12px 0" }}>No participants yet</p>
            ) : sorted.map((p, i) => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 8px", borderRadius:10, marginBottom:2, background:p.id===myParticipant?.id?"rgba(201,168,76,0.08)":"transparent", border:p.id===myParticipant?.id?`1px solid rgba(201,168,76,0.2)`:"1px solid transparent" }}>
                <span style={{ fontSize:14, minWidth:28, textAlign:"center" }}>{positionRank(i)}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:p.id===myParticipant?.id?GOLD:"#fff", margin:0 }}>
                    {p.participant_name}{p.id===myParticipant?.id?" (You)":""}
                  </p>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:0 }}>
                    {p.rounds_completed} round{p.rounds_completed!==1?"s":""} · {p.participant_level}
                  </p>
                </div>
                {statusBadge(p.status)}
                <p style={{ fontSize:18, fontWeight:900, color:GOLD, margin:0, minWidth:40, textAlign:"right" }}>
                  {Math.round(p.total_score||0)}
                </p>
              </div>
            ))}
          </div>

          {/* Per-attempt breakdown */}
          {allAttempts.length > 0 && (
            <div style={{ ...glass, padding:16, marginTop:14 }}>
              <h4 style={{ fontSize:11, color:GOLD, fontWeight:700, margin:"0 0 12px", letterSpacing:1.5, textTransform:"uppercase" }}>
                Attempt History
              </h4>
              {allAttempts.filter(a => a.status !== "pending").map(a => {
                const ptc = participants.find(p => p.id === a.participant_id);
                return (
                  <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:"#fff", margin:0 }}>{ptc?.participant_name}</p>
                      <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:0, fontFamily:"'Amiri',serif" }}>
                        {a.surah_name_ar} {a.ayah_start}:{a.ayah_end} · R{a.round_number}
                      </p>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <p style={{ fontSize:16, fontWeight:900, color:GOLD, margin:0 }}>
                        {Math.round(a.judge_score ?? a.total_score ?? 0)}
                      </p>
                      <p style={{ fontSize:9, color:"rgba(255,255,255,0.3)", margin:0 }}>
                        {a.status === "judged" ? "Judged" : "AI Score"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Download results (admin) */}
          {isJudge && sorted.length > 0 && (
            <button onClick={() => {
              const csv = ["Rank,Name,Level,Score,Rounds\n",
                ...sorted.map((p,i) => `${i+1},${p.participant_name},${p.participant_level},${Math.round(p.total_score||0)},${p.rounds_completed}`)
              ].join("\n");
              const blob = new Blob([csv], { type:"text/csv" });
              const a    = document.createElement("a");
              a.href     = URL.createObjectURL(blob);
              a.download = `${competition.title.replace(/\s+/g,"_")}_results.csv`;
              a.click();
            }} style={{ ...outBtn, marginTop:14, padding:"13px" }}>
              <Download size={15}/> Download Results (CSV)
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default MustabaqahPage;
