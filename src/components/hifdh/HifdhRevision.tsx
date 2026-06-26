// src/components/hifdh/QuranRevisionHub.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  Comprehensive Quran Revision System — Tahleem Academy
//  Flow: Setup → Recite (page hides on record) → Evaluate → Remediate → Exercise → Complete
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
import { cn } from "@/lib/utils";
import {
  Mic, MicOff, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, AlertTriangle, BookOpen,
  Loader2, Volume2, Check, X,
  Headphones, Brain, Eye, EyeOff,
  Target, Sparkles, BookMarked, StopCircle,
  RefreshCw, Award, RotateCcw,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS & THEME
// ═══════════════════════════════════════════════════════════════════════

const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e8c97a";
const DG         = "#0f2d1f";
const DG2        = "#1a4030";
const PARCHMENT  = "#fffdf6";
const PARCH2     = "#f9f2dc";
const INK        = "#1a1007";
const PASS_SCORE = 70;
const EXERCISE_PASS = 65;

const JUZ_PAGES: [number, number][] = [
  [1,21],[22,41],[42,62],[63,81],[82,101],[102,121],[122,141],[142,161],[162,181],[182,201],
  [202,221],[222,241],[242,261],[262,281],[282,301],[302,321],[322,341],[342,361],[362,381],[382,401],
  [402,421],[422,441],[442,461],[462,481],[482,501],[502,521],[522,541],[542,561],[562,581],[582,604],
];

const HIZB_PAGES: [number, number][] = JUZ_PAGES.flatMap(([s, e]) => {
  const mid = Math.floor((s + e) / 2);
  return [[s, mid], [mid + 1, e]] as [number, number][];
});

const SURAH_START: Record<number, number> = {
  1:1,2:2,3:50,4:77,5:106,6:128,7:151,8:177,9:187,10:208,
  11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
  21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
  31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
  41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
  51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
  61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
  71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,80:585,
  81:586,82:587,83:587,84:589,85:590,86:591,87:591,88:592,89:593,90:594,
  91:595,92:595,93:596,94:596,95:597,96:597,97:598,98:598,99:599,100:600,
  101:600,102:600,103:601,104:601,105:601,106:602,107:602,108:602,109:603,
  110:603,111:603,112:604,113:604,114:604,
};

const SURAH_END: Record<number, number> = (() => {
  const ends: Record<number, number> = {};
  const nums = Object.keys(SURAH_START).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < nums.length; i++) {
    const s = nums[i];
    ends[s] = nums[i + 1] ? SURAH_START[nums[i + 1]] - 1 : 604;
  }
  return ends;
})();

const SURAHS_AR: Record<number, string> = {
  1:"الفاتحة",2:"البقرة",3:"آل عمران",4:"النساء",5:"المائدة",
  6:"الأنعام",7:"الأعراف",8:"الأنفال",9:"التوبة",10:"يونس",
  11:"هود",12:"يوسف",13:"الرعد",14:"إبراهيم",15:"الحجر",
  16:"النحل",17:"الإسراء",18:"الكهف",19:"مريم",20:"طه",
  21:"الأنبياء",22:"الحج",23:"المؤمنون",24:"النور",25:"الفرقان",
  26:"الشعراء",27:"النمل",28:"القصص",29:"العنكبوت",30:"الروم",
  31:"لقمان",32:"السجدة",33:"الأحزاب",34:"سبأ",35:"فاطر",
  36:"يس",37:"الصافات",38:"ص",39:"الزمر",40:"غافر",
  41:"فصلت",42:"الشورى",43:"الزخرف",44:"الدخان",45:"الجاثية",
  46:"الأحقاف",47:"محمد",48:"الفتح",49:"الحجرات",50:"ق",
  51:"الذاريات",52:"الطور",53:"النجم",54:"القمر",55:"الرحمن",
  56:"الواقعة",57:"الحديد",58:"المجادلة",59:"الحشر",60:"الممتحنة",
  61:"الصف",62:"الجمعة",63:"المنافقون",64:"التغابن",65:"الطلاق",
  66:"التحريم",67:"الملك",68:"القلم",69:"الحاقة",70:"المعارج",
  71:"نوح",72:"الجن",73:"المزمل",74:"المدثر",75:"القيامة",
  76:"الإنسان",77:"المرسلات",78:"النبأ",79:"النازعات",80:"عبس",
  81:"التكوير",82:"الانفطار",83:"المطففين",84:"الانشقاق",85:"البروج",
  86:"الطارق",87:"الأعلى",88:"الغاشية",89:"الفجر",90:"البلد",
  91:"الشمس",92:"الليل",93:"الضحى",94:"الشرح",95:"التين",
  96:"العلق",97:"القدر",98:"البينة",99:"الزلزلة",100:"العاديات",
  101:"القارعة",102:"التكاثر",103:"العصر",104:"الهمزة",105:"الفيل",
  106:"قريش",107:"الماعون",108:"الكوثر",109:"الكافرون",110:"النصر",
  111:"المسد",112:"الإخلاص",113:"الفلق",114:"الناس",
};

const RECITERS = [
  { id: "Alafasy_128kbps",               name: "مشاري العفاسي"   },
  { id: "Abdurrahmaan_As-Sudais_192kbps",name: "السديس"           },
  { id: "Husary_128kbps",                name: "الحصري"           },
  { id: "Minshawy_Murattal_128kbps",     name: "المنشاوي"         },
  { id: "Abu_Bakr_Ash-Shaatree_128kbps", name: "أبو بكر الشاطري" },
  { id: "AbdulSamad_128kbps",            name: "عبد الباسط"       },
  { id: "Muhammad_Jibreel_128kbps",      name: "م. جبريل"         },
  { id: "Saad_Al-Ghamdi_128kbps",        name: "سعد الغامدي"      },
];

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

type Stage = "setup" | "reciting" | "evaluating" | "remediation" | "exercise" | "complete";
type SelectMode = "juz" | "hizb" | "surah";

interface RevisionPlan {
  mode: SelectMode;
  selected: number[];
  dailyPages: number;
  allPages: number[];
  currentIdx: number;
}

interface WordResult {
  word: string;
  status: "correct" | "missing" | "wrong";
}

interface AyahError {
  ayah: any;
  missing: string[];
  mastered: boolean;
  remediationScore: number;
}

// Exercise question — voice-completion based
interface ExerciseQ {
  ayah: any;
  displayText: string;   // first portion shown to student
  missingText: string;   // what student must recite
  isPrevPage: boolean;
  answered: boolean;
  score: number | null;
  transcript: string | null;
}

interface SessionStats {
  pageNum: number;
  score: number;
  attempts: number;
  errorCount: number;
  timeSeconds: number;
  exerciseScore: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════

const toAr = (n: number) => String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

function normalizeArabic(t: string): string {
  return t
    // 1. Convert dagger alef \u0670 → regular Alef \u0627 BEFORE the bulk strip.
    .replace(/\u0670/g, "\u0627")
    // 2. Strip remaining tashkeel + Quranic annotation characters
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
    // 3. Normalise all Alef variants → plain Alef ا
    .replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627")
    // 4. Hamzated Waw ؤ → و
    .replace(/\u0624/g, "\u0648")
    // 5. Hamzated Ya ئ → ي
    .replace(/\u0626/g, "\u064A")
    // 6. Standalone Hamza ء → remove
    .replace(/\u0621/g, "")
    // 7. Alef Maqsura ى → Ya ي
    .replace(/\u0649/g, "\u064A")
    // 8. Ta Marbuta ة → Ha ه
    .replace(/\u0629/g, "\u0647")
    // 9. Strip Tatweel / Kashida ـ
    .replace(/\u0640/g, "")
    // 10. Uthmani small Waw ۥ → و and small Ya ۦ → ي
    .replace(/\u06E5/g, "\u0648")
    .replace(/\u06E6/g, "\u064A")
    // 11. Strip Quranic end-of-ayah ۝ and rub-el-hizb ۞ markers
    .replace(/[\u06DD\u06DE]/g, "")
    // 12. Strip Arabic-Indic and Extended Arabic-Indic digits
    .replace(/[\u0660-\u066C\u06F0-\u06F9]/g, "");
}

function stripDiacritics(t: string) { return normalizeArabic(t); }

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

function wordsMatch(rw: string, gw: string): boolean {
  if (rw === gw) return true;
  if (!rw || !gw) return false;
  const minLen = Math.min(rw.length, gw.length);
  if (minLen >= 3) {
    const d = levenshtein(rw, gw);
    if (d <= 1) return true;
    if (minLen >= 8 && d <= 2) return true;
  }
  // Madd-drop rule: strip trailing long vowel and retry
  const rwS = rw.replace(/[اوي]$/, "");
  const gwS = gw.replace(/[اوي]$/, "");
  if (rwS.length >= 2 && gwS.length >= 2 && rwS === gwS) return true;
  return false;
}

const HAS_ARABIC_LETTER = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3]/;

// ── compareWords — global DP/LCS alignment ─────────────────────────────────
// FIX 1: Replaced the greedy sliding-window approach with a true global
//         LCS (Longest Common Subsequence) alignment. The old WINDOW=8 scan
//         would skip any reference word not found within 8 positions of the
//         current pointer, causing middle verses to be marked missing whenever
//         the student recited a slightly different sequence. LCS finds the
//         optimal alignment over the *entire* transcript, so no verse is
//         skipped just because of a local misalignment.
//
// FIX 2: Both ref and got are normalised with normalizeArabic() which strips
//         ALL tashkeel/diacritics before comparison. Words that differ only in
//         diacritics are therefore identical after normalisation and correctly
//         marked green. The original display word (with diacritics) is still
//         shown in the UI.
function compareWords(refText: string, gotText: string): WordResult[] {
  const origRef: string[] = [];
  const normRef: string[] = [];
  for (const w of refText.replace(/﴿[^﴾]*﴾/g, "").split(/\s+/).filter(Boolean)) {
    const n = normalizeArabic(w);
    if (n.length >= 1 && HAS_ARABIC_LETTER.test(n)) { origRef.push(w); normRef.push(n); }
  }
  const normGot = normalizeArabic(gotText).split(/\s+/).filter(Boolean);
  if (!normGot.length) return origRef.map(w => ({ word: w, status: "missing" as const }));

  const R = normRef.length;
  const G = normGot.length;

  // Build LCS length table
  const dp: number[][] = Array.from({ length: R + 1 }, () => new Array(G + 1).fill(0));
  for (let r = 1; r <= R; r++) {
    for (let g = 1; g <= G; g++) {
      if (wordsMatch(normRef[r - 1], normGot[g - 1])) {
        dp[r][g] = dp[r - 1][g - 1] + 1;
      } else {
        dp[r][g] = Math.max(dp[r - 1][g], dp[r][g - 1]);
      }
    }
  }

  // Backtrack to find matched ref positions
  const matched = new Set<number>(); // ref indices that matched
  let r = R, g = G;
  while (r > 0 && g > 0) {
    if (wordsMatch(normRef[r - 1], normGot[g - 1])) {
      matched.add(r - 1);
      r--; g--;
    } else if (dp[r - 1][g] >= dp[r][g - 1]) {
      r--;
    } else {
      g--;
    }
  }

  return origRef.map((word, i) => ({
    word,
    status: matched.has(i) ? ("correct" as const) : ("missing" as const),
  }));
}

function buildPages(mode: SelectMode, selected: number[]): number[] {
  const ps = new Set<number>();
  if (mode === "juz") {
    for (const j of selected) {
      const [s, e] = JUZ_PAGES[j - 1] ?? [1, 20];
      for (let p = s; p <= e; p++) ps.add(p);
    }
  } else if (mode === "hizb") {
    for (const h of selected) {
      const [s, e] = HIZB_PAGES[h - 1] ?? [1, 10];
      for (let p = s; p <= e; p++) ps.add(p);
    }
  } else {
    for (const s of selected) {
      const start = SURAH_START[s] ?? 1;
      const end   = SURAH_END[s] ?? start;
      for (let p = start; p <= end; p++) ps.add(p);
    }
  }
  return Array.from(ps).sort((a, b) => a - b);
}

function scoreColor(score: number) {
  if (score >= 85) return { bg: "#dcfce7", border: "#16a34a", text: "#166534" };
  if (score >= 70) return { bg: "#fef9c3", border: "#ca8a04", text: "#854d0e" };
  if (score >= 50) return { bg: "#ffedd5", border: "#ea580c", text: "#9a3412" };
  return { bg: "#fee2e2", border: "#dc2626", text: "#991b1b" };
}

function groupBySurah(ayahs: any[]) {
  const groups: { surah: any; ayahs: any[] }[] = [];
  for (const a of ayahs) {
    const last = groups[groups.length - 1];
    if (!last || last.surah.number !== a.surah.number) groups.push({ surah: a.surah, ayahs: [a] });
    else last.ayahs.push(a);
  }
  return groups;
}

function makeExercise(currentAyahs: any[], prevAyahs: any[]): ExerciseQ[] {
  const pool = currentAyahs.filter(a => a.text.split(" ").length >= 5)
                           .sort(() => Math.random() - 0.5).slice(0, 4);
  const prevPool = prevAyahs.filter(a => a.text.split(" ").length >= 5)
                            .sort(() => Math.random() - 0.5).slice(0, 1);

  const toQ = (ayah: any, isPrev: boolean): ExerciseQ => {
    const words = ayah.text.split(/\s+/).filter(Boolean);
    const cutoff = Math.max(2, Math.floor(words.length * (0.35 + Math.random() * 0.2)));
    return {
      ayah,
      displayText: words.slice(0, cutoff).join(" "),
      missingText: words.slice(cutoff).join(" "),
      isPrevPage: isPrev,
      answered: false,
      score: null,
      transcript: null,
    };
  };

  return [...pool.map(a => toQ(a, false)), ...prevPool.map(a => toQ(a, true))];
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface Props { userId: string | null; autoStart?: boolean; }

export default function QuranRevisionHub({ userId, autoStart = false }: Props) {

  const [stage, setStage]         = useState<Stage>("setup");

  // Setup
  const [selectMode, setSelectMode] = useState<SelectMode>("juz");
  const [selected, setSelected]     = useState<number[]>([]);
  const [dailyPages, setDailyPages] = useState<number>(1);

  // Plan
  const [plan, setPlan]                   = useState<RevisionPlan | null>(null);
  const [completedPages, setCompletedPages] = useState<Set<number>>(new Set());

  // Page data
  const [pageData, setPageData]         = useState<any>(null);
  const [prevPageData, setPrevPageData] = useState<any>(null);
  const [pageLoading, setPageLoading]   = useState(false);
  const [reciter, setReciter]           = useState("Alafasy_128kbps");
  const [fontSize, setFontSize]         = useState(24);

  // Audio — use ref to fix closure bug in pagePlayIdx
  const audioRef           = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]           = useState<number | null>(null);
  const [pagePlayIdx, _setPagePlayIdx]  = useState(-1);
  const pagePlayIdxRef                  = useRef(-1);
  const setPagePlayIdx = useCallback((idx: number) => {
    pagePlayIdxRef.current = idx;
    _setPagePlayIdx(idx);
  }, []);

  // Page recording
  const [recording, setRecording]         = useState(false);
  const [recTime, setRecTime]             = useState(0);
  const [pageVisible, setPageVisible]     = useState(true); // hides when recording
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null); // for playback after recording
  const [audioPath, setAudioPath]         = useState<string | null>(null); // uploaded path
  const [playingRecording, setPlayingRecording] = useState(false);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const recChunksRef  = useRef<Blob[]>([]);
  const recTimerRef   = useRef<any>(null);

  // Live recitation state — each entry is an array of {word, status} for one ayah
  // status: "hidden" | "correct" | "missing"
  const [liveWords, setLiveWords] = useState<{word:string; status:string}[][]>([]);
  const liveWordStatesRef = useRef<string[][]>([]); // mutable copy for callbacks
  const livePageWordsRef = useRef<{ai:number;wi:number;norm:string}[]>([]);
  const livePtrRef = useRef(0); // next expected word index in flat list
  const liveMediaRef = useRef<any>(null);
  const liveAccumRef = useRef("");
  const liveChunkRef = useRef<Blob | null>(null);
  // keep liveVerseResults/liveCurrentVerseIdx for backward compat with other code
  const [liveVerseResults, setLiveVerseResults] = useState<any[]>([]);
  const [liveCurrentVerseIdx, setLiveCurrentVerseIdx] = useState(0);

  // Evaluation
  const [evaluating, setEvaluating]         = useState(false);
  const [evalResult, setEvalResult]         = useState<{
    score: number; words: WordResult[]; transcript: string; feedback: string; transcriptFailed?: boolean;
  } | null>(null);
  const [ayahErrors, setAyahErrors]         = useState<AyahError[]>([]);
  const [recitationAttempts, setRecitationAttempts] = useState(0);

  // Remediation
  const [remediationIdx, setRemediationIdx] = useState(0);
  const [remRecording, setRemRecording]     = useState(false);
  const [remRecTime, setRemRecTime]         = useState(0);
  const [remEvaluating, setRemEvaluating]   = useState(false);
  const [remResult,     setRemResult]       = useState<{score:number;transcript:string}|null>(null);
  const [revealVerse,   setRevealVerse]     = useState(false);

  // Assignment / daily log
  const [assignment,       setAssignment]       = useState<{id:string;mode:string;selected_items:number[];daily_pages:number;reciter_id:string}|null>(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);

  const remMediaRef  = useRef<MediaRecorder | null>(null);
  const remChunksRef = useRef<Blob[]>([]);
  const remTimerRef  = useRef<any>(null);

  // Exercise
  const [exercises, setExercises]       = useState<ExerciseQ[]>([]);
  const [exIdx, setExIdx]               = useState(0);
  const [exCorrect, setExCorrect]       = useState(0);
  const [exAnswered, setExAnswered]     = useState(0);
  const [exRecording, setExRecording]   = useState(false);
  const [exRecTime, setExRecTime]       = useState(0);
  const [exEvaluating, setExEvaluating] = useState(false);
  const [exResult, setExResult]         = useState<{score:number;transcript:string}|null>(null);
  const exMediaRef   = useRef<MediaRecorder | null>(null);
  const exChunksRef  = useRef<Blob[]>([]);
  const exTimerRef   = useRef<any>(null);

  // Session
  const [sessionStart, setSessionStart] = useState<number>(Date.now());
  const [finalStats, setFinalStats]     = useState<SessionStats | null>(null);
  const [earnedXP, setEarnedXP]         = useState(0);

  const pageDataRef = useRef<any>(null);
  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);

  // ═══ Load saved plan (data only — resume handled below after fetchPage is defined) ═
  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(`revision_plan_${userId}`);
    if (saved) {
      try {
        const p: RevisionPlan = JSON.parse(saved);
        setPlan(p); setSelectMode(p.mode); setSelected(p.selected); setDailyPages(p.dailyPages);
      } catch { /* ignore */ }
    }
    const done = localStorage.getItem(`revision_done_${userId}`);
    if (done) { try { setCompletedPages(new Set(JSON.parse(done))); } catch { /* ignore */ } }
  }, [userId]);

  // ═══ Persist session to sessionStorage on every stage/page change ═══════
  // This ensures refresh restores the exact position the student was at.
  useEffect(() => {
    if (!userId || !plan || stage === "setup") return;
    const key = `qrh_stage_${userId}`;
    sessionStorage.setItem(key, JSON.stringify({
      stage,
      pageIdx: plan.currentIdx,
    }));
  }, [stage, plan, userId]);

  // Also persist on visibility change (tab backgrounded on Android)
  useEffect(() => {
    if (!userId) return;
    const key = `qrh_stage_${userId}`;
    const handleVisibility = () => {
      if (document.hidden && plan && stage !== "setup") {
        sessionStorage.setItem(key, JSON.stringify({
          stage,
          pageIdx: plan.currentIdx,
        }));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [stage, plan, userId]);

  // ═══ Fetch page ════════════════════════════════════════
  const fetchPage = useCallback(async (pageNum: number) => {
    setPageLoading(true); setPageData(null);
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/page/${pageNum}/ar.uthmani`);
      const j = await r.json();
      if (j?.code === 200) setPageData(j.data);
    } finally { setPageLoading(false); }
  }, []);

  const fetchPrevPage = useCallback(async (pageNum: number) => {
    if (pageNum <= 1) return;
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/page/${pageNum - 1}/ar.uthmani`);
      const j = await r.json();
      if (j?.code === 200) setPrevPageData(j.data);
    } catch { /* ignore */ }
  }, []);

  // ═══ Unified assignment + resume effect ══════════════════════════════
  const didStartRef = useRef(false);
  useEffect(() => {
    if (!userId || didStartRef.current) return;

    const startSession = (p: RevisionPlan, resumeIdx?: number) => {
      const planToResume: RevisionPlan = resumeIdx != null
        ? { ...p, currentIdx: resumeIdx }
        : p;
      const currentPage = planToResume.allPages[planToResume.currentIdx];
      console.log("[Hifdh] startSession → page:", currentPage, "plan:", planToResume);
      if (!currentPage) {
        console.warn("[Hifdh] startSession: no currentPage, allPages:", planToResume.allPages);
        setAssignmentLoaded(true);
        return;
      }
      didStartRef.current = true;
      setPlan(planToResume);
      setSessionStart(Date.now());
      setPageVisible(true);
      fetchPage(currentPage);
      fetchPrevPage(currentPage);
      setStage("reciting");
      setAssignmentLoaded(true);
    };

    // ── Refresh / reload restore: check sessionStorage for in-progress session ──
    const ssKey = `qrh_stage_${userId}`;
    const savedSS = sessionStorage.getItem(ssKey);
    if (savedSS) {
      try {
        const ss = JSON.parse(savedSS);
        // Only restore if they were mid-session (not setup or complete)
        if (ss.stage && ss.stage !== "setup" && ss.stage !== "complete") {
          const lsSaved = localStorage.getItem(`revision_plan_${userId}`);
          if (lsSaved) {
            const p: RevisionPlan = JSON.parse(lsSaved);
            // If sessionStorage has a more recent pageIdx, use it
            const resumeIdx = ss.pageIdx != null ? ss.pageIdx : p.currentIdx;
            console.log("[Hifdh] Restoring from sessionStorage — stage:", ss.stage, "pageIdx:", resumeIdx);
            sessionStorage.removeItem(ssKey); // consume it
            startSession(p, resumeIdx);
            return;
          }
        }
      } catch { /* ignore corrupted state */ }
      sessionStorage.removeItem(ssKey);
    }

    (supabase as any)
      .from("hifdh_daily_assignments")
      .select("*")
      .eq("student_id", userId)
      .eq("active", true)
      .maybeSingle()
      .then(({ data, error }: any) => {
        console.log("[Hifdh] Assignment fetch →", { data, error });

        if (error) {
          console.error("[Hifdh] Assignment load error:", error);
          // Fall through to localStorage
        }

        if (data) {
          // Ensure selected_items is array of numbers (Postgres may return strings)
          const selectedItems: number[] = (data.selected_items ?? []).map(Number);
          const mode = data.mode as SelectMode;

          setAssignment({ ...data, selected_items: selectedItems });
          setSelectMode(mode);
          setSelected(selectedItems);
          setDailyPages(Number(data.daily_pages) || 1);
          setReciter(data.reciter_id || "Alafasy_128kbps");

          // Check existing saved plan
          const saved = localStorage.getItem(`revision_plan_${userId}`);
          let existingPlan: RevisionPlan | null = null;
          if (saved) { try { existingPlan = JSON.parse(saved); } catch { /* ignore */ } }

          const sameContent = existingPlan
            && existingPlan.mode === mode
            && JSON.stringify([...existingPlan.selected].sort()) === JSON.stringify([...selectedItems].sort());

          let planToUse: RevisionPlan;
          if (sameContent && existingPlan) {
            planToUse = existingPlan;
          } else {
            const pages = buildPages(mode, selectedItems);
            planToUse = {
              mode, selected: selectedItems,
              dailyPages: Number(data.daily_pages) || 1,
              allPages: pages, currentIdx: 0,
            };
            localStorage.setItem(`revision_plan_${userId}`, JSON.stringify(planToUse));
          }

          // If autoStart (navigated from dashboard), jump straight to reciting.
          // Otherwise stay on setup screen — user clicks Resume/Start to begin.
          if (autoStart) {
            startSession(planToUse);
          } else {
            setPlan(planToUse);
            didStartRef.current = true;
            setAssignmentLoaded(true);
          }
        } else {
          // No assignment — fall back to localStorage or show setup
          const saved = localStorage.getItem(`revision_plan_${userId}`);
          if (!saved) { setAssignmentLoaded(true); return; }
          try {
            const p: RevisionPlan = JSON.parse(saved);
            if (autoStart) {
              startSession(p);
            } else {
              setPlan(p);
              setSelectMode(p.mode);
              setSelected(p.selected);
              setDailyPages(p.dailyPages);
              didStartRef.current = true;
              setAssignmentLoaded(true);
            }
          } catch {
            setAssignmentLoaded(true);
          }
        }
      });
  }, [userId, fetchPage, fetchPrevPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ Audio ═════════════════════════════════════════════
  const playAyah = useCallback((ayah: {surah: {number: number}; numberInSurah: number; number: number}) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    const s = String(ayah.surah.number).padStart(3, "0");
    const a = String(ayah.numberInSurah).padStart(3, "0");
    audio.src = `https://everyayah.com/data/${reciter}/${s}${a}.mp3`;
    audio.load();
    audio.play().catch(() => {});
    setPlaying(ayah.number);
  }, [reciter]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const ayahs = pageDataRef.current?.ayahs;
      if (!ayahs || pagePlayIdxRef.current < 0) { setPlaying(null); return; }
      const next = pagePlayIdxRef.current + 1;
      if (next < ayahs.length) {
        setPagePlayIdx(next);
        playAyah(ayahs[next]);
      } else {
        setPagePlayIdx(-1);
        setPlaying(null);
      }
    };
    const onPause = () => { if (pagePlayIdxRef.current < 0) setPlaying(null); };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    return () => { audio.removeEventListener("ended", onEnded); audio.removeEventListener("pause", onPause); };
  }, [playAyah, setPagePlayIdx]);

  const playPage = useCallback(() => {
    const ayahs = pageData?.ayahs;
    if (!ayahs?.length) return;
    setPagePlayIdx(0);
    playAyah(ayahs[0]);
  }, [pageData, playAyah, setPagePlayIdx]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(null);
    setPagePlayIdx(-1);
  }, [setPagePlayIdx]);

  // ═══ Transcription ════════════════════════════════════
  // refText kept for post-processing alignment only — NOT passed to Whisper as prompt
  // (passing the verse as Whisper prompt causes it to hallucinate the reference text)
  const transcribeAudio = async (blob: Blob, _refText?: string): Promise<string> => {
    const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY;

    // Short style-setting prompt: establishes Arabic Quranic script and diacritics.
    // Must NOT be the verse being recited — Whisper treats prompt as "previous speech"
    // and will try to continue/copy it instead of transcribing the actual audio.
    const stylePrompt = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ";

    // Correct file extension so Groq identifies the codec properly
    const ext = blob.type.includes("mp4") ? "mp4"
      : blob.type.includes("ogg") ? "ogg"
      : "webm";

    if (groqKey) {
      try {
        const fd = new FormData();
        fd.append("file", new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("response_format", "verbose_json"); // gives word-level confidence
        fd.append("temperature", "0");               // deterministic, no hallucination
        fd.append("prompt", stylePrompt);            // sets script/style only
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: fd,
        });
        if (r.ok) {
          const json = await r.json();
          // verbose_json gives us no_speech_prob to detect silence/noise
          const noSpeech = json.segments?.[0]?.no_speech_prob ?? 0;
          const txt = (json.text ?? "").trim();
          if (noSpeech < 0.6 && txt.length > 0) return txt;
          if (noSpeech >= 0.6) return ""; // treat as silence / no speech detected
        }
      } catch { /* fall through to edge function */ }
    }

    // Fallback: Supabase edge function (Deepgram)
    try {
      const b64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });
      const { data } = await supabase.functions.invoke("transcribe-hifdh", {
        body: { audio: b64, mimeType: blob.type || "audio/webm" },
      });
      return data?.text ?? data?.transcript ?? "";
    } catch { return ""; }
  };

  // ═══ AI Feedback ══════════════════════════════════════
  const getAIFeedback = async (refText: string, gotText: string, score: number): Promise<string> => {
    const key = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;
    if (!key) return score >= PASS_SCORE
      ? "Good recitation! Your memorisation is solid. Continue to the exercise."
      : "Keep practising — focus on the highlighted words and recite again.";
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 120,
          messages: [{
            role: "user",
            content: `Quran teacher evaluating memorisation. Score: ${score}%. Reference: "${refText.slice(0,300)}" Student: "${gotText.slice(0,300)}". Give 2 short sentences of honest, encouraging feedback in English. Mention one specific issue if score < 70%.`,
          }],
        }),
      });
      if (r.ok) return (await r.json()).content?.[0]?.text ?? "";
    } catch { /* ignore */ }
    return score >= PASS_SCORE
      ? "Excellent recitation! Proceed to the exercise."
      : "Practise the highlighted verses and try again.";
  };

  // ═══ Page Recording ═══════════════════════════════════
  const startPageRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        const blob = new Blob(recChunksRef.current, { type: mime || "audio/webm" });
        if (blob.size > 500) runPageEvaluation(blob);
      };
      mr.start(200);
      mediaRecRef.current = mr;
      setRecording(true);
      setPageVisible(false);  // HIDE page, show only recording UI
      setRecordedBlobUrl(null);
      setRecTime(0);
      stopAudio();
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch {
      alert("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopPageRecording = () => {
    clearInterval(recTimerRef.current);
    mediaRecRef.current?.stop();
    setRecording(false);
  };

  // ═══ FIX 3: Live Tarteel-style recording ══════════════
  // Streams chunks to Groq every 3s, accumulates transcript,
  // and reveals each verse as soon as the student recites it —
  // green for correct words, red for missing. Mirrors Tarteel.
  const startLiveRecording = async () => {
    const ayahs: any[] = pageDataRef.current?.ayahs ?? [];
    if (!ayahs.length) return startPageRecording();
    try {
      // ── Build flat reference word list for entire page ──────────────
      const flat: { ai: number; wi: number; norm: string }[] = [];
      const displayWords: string[][] = [];
      ayahs.forEach((ayah: any, ai: number) => {
        const ws = ayah.text.replace(/﴿[^﴾]*﴾/g, "").split(/\s+/).filter(Boolean);
        displayWords.push(ws);
        ws.forEach((w: string, wi: number) =>
          flat.push({ ai, wi, norm: normalizeArabic(w) })
        );
      });

      // ── Mutable word status array ───────────────────────────────────
      // "hidden" | "correct" | "missing"
      const states: string[][] = displayWords.map(ws => ws.map(() => "hidden"));
      liveWordStatesRef.current = states;
      livePageWordsRef.current = flat;
      livePtrRef.current = 0;
      liveAccumRef.current = "";

      const pushDisplay = () => {
        const next = displayWords.map((ws, ai) =>
          ws.map((word, wi) => ({ word, status: states[ai][wi] }))
        );
        setLiveWords(next);
        const lastActive = next.reduce(
          (acc: number, ws, i) => ws.some(w => w.status !== "hidden") ? i : acc, 0
        );
        setLiveCurrentVerseIdx(lastActive);
      };

      setLiveWords(displayWords.map(ws => ws.map(word => ({ word, status: "hidden" }))));
      setLiveCurrentVerseIdx(0);
      setRecording(true);
      setPageVisible(false); // HIDE page, show only recording UI
      setRecordedBlobUrl(null);
      setRecTime(0);
      stopAudio();

      // ── LCS-based matching against FULL cumulative transcript ────────
      // Every Groq response gives us the full transcript from t=0.
      // We run LCS between ALL reference words and ALL transcript words,
      // mark matched ref words as "correct", unmatched as "missing" only
      // if the transcript has passed that point (pointer-based safety).
      // This is the same algorithm as compareWords() but updates live state.
      let lastTranscript = "";

      // frontier = furthest ref-word index we have ever confirmed matched.
      // ONLY words at or before frontier are ever revealed.
      // Words beyond frontier are ALWAYS hidden (blurred) — no exceptions.
      let frontier = -1;

      const applyTranscript = (fullText: string) => {
        if (fullText === lastTranscript) return;
        lastTranscript = fullText;

        const tWords = normalizeArabic(fullText).split(/\s+/).filter(Boolean);
        if (!tWords.length) return;

        const R = flat.length;
        const T = tWords.length;

        // ── Step 1: find how many ref words the transcript covers ─────
        // Walk transcript words left-to-right, matching ref words greedily.
        // We stop as soon as transcript words run out — this gives us the
        // "transcript frontier": how far into the page this transcript reaches.
        // No LCS jumping ahead — strictly sequential from current frontier.
        let refPtr = Math.max(0, frontier); // start from where we left off
        let tPtr = 0;

        // First pass: find new matches strictly forward from refPtr
        const newlyMatched = new Set<number>();
        while (tPtr < T && refPtr < R) {
          const tw = tWords[tPtr];
          if (wordsMatch(tw, flat[refPtr].norm)) {
            newlyMatched.add(refPtr);
            refPtr++;
            tPtr++;
          } else {
            // Try small lookahead (max 3) to handle one mispronounced/skipped word
            let found = false;
            for (let look = 1; look <= 3 && refPtr + look < R; look++) {
              if (wordsMatch(tw, flat[refPtr + look].norm)) {
                // skip the unmatched ref words (they become missing later)
                refPtr += look;
                newlyMatched.add(refPtr);
                refPtr++;
                tPtr++;
                found = true;
                break;
              }
            }
            if (!found) tPtr++; // transcript word unrecognised — skip it
          }
        }

        // ── Step 2: advance frontier ──────────────────────────────────
        // frontier = furthest ref index confirmed by transcript
        const newFrontier = newlyMatched.size
          ? Math.max(...Array.from(newlyMatched))
          : frontier;

        if (newFrontier <= frontier && newlyMatched.size === 0) return; // nothing new
        frontier = Math.max(frontier, newFrontier);

        // ── Step 3: update states — ONLY up to frontier ───────────────
        let changed = false;
        for (let i = 0; i <= frontier; i++) {
          const { ai, wi } = flat[i];
          const cur = states[ai][wi];
          if (newlyMatched.has(i) || cur === "correct") {
            if (cur !== "correct") { states[ai][wi] = "correct"; changed = true; }
          } else if (cur === "hidden") {
            // Before frontier but not matched = missing
            states[ai][wi] = "missing";
            changed = true;
          }
        }

        // ── Step 4: ENFORCE — everything beyond frontier stays hidden ──
        for (let i = frontier + 1; i < R; i++) {
          const { ai, wi } = flat[i];
          if (states[ai][wi] !== "hidden") {
            states[ai][wi] = "hidden";
            changed = true;
          }
        }

        if (changed) pushDisplay();
      };

      // ── MediaRecorder ───────────────────────────────────────────────
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      mediaRecRef.current = mr;

      const allAudioChunks: Blob[] = [];
      let inFlight = 0;

      const sendToGroq = async () => {
        if (inFlight >= 2 || allAudioChunks.length === 0) return;
        const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
        if (!groqKey) return;
        inFlight++;
        const ext = (mime ?? "").includes("mp4") ? "mp4"
          : (mime ?? "").includes("ogg") ? "ogg" : "webm";
        // Snapshot current audio — safe to send while recording continues
        const snap = new Blob([...allAudioChunks], { type: mime || "audio/webm" });
        try {
          const fd = new FormData();
          fd.append("file", new File([snap], `q.${ext}`, { type: mime || "audio/webm" }));
          fd.append("model", "whisper-large-v3-turbo");
          fd.append("language", "ar");
          fd.append("response_format", "json");
          fd.append("temperature", "0");
          // Style prompt only — NEVER use the verse text or Whisper hallucinates it
          fd.append("prompt", "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ");
          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${groqKey}` },
            body: fd,
          });
          if (r.ok) {
            const { text } = await r.json();
            const clean = (text || "").trim();
            if (clean.length > 1) applyTranscript(clean);
          }
        } catch {}
        inFlight--;
      };

      mr.ondataavailable = (e) => {
        if (!e.data?.size) return;
        recChunksRef.current.push(e.data);
        allAudioChunks.push(e.data);
        sendToGroq(); // fire immediately on every chunk
      };

      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        const blob = new Blob(recChunksRef.current, { type: mime || "audio/webm" });
        if (blob.size > 500) runPageEvaluation(blob);
      };

      // 500ms chunks = Groq gets new audio every 500ms, responds in ~600-900ms
      // Net lag: ~100-400ms behind the speaker — fast enough to feel live
      mr.start(500);
      liveMediaRef.current = { stop: () => mr.stop() };
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);

    } catch {
      alert("Microphone access denied. Please allow microphone access and try again.");
    }
  };
  const stopLiveRecording = () => {
    clearInterval(recTimerRef.current);
    try { liveMediaRef.current?.stop(); } catch {}
    setRecording(false);
  };

  // ═══ Page Evaluation ══════════════════════════════════
  const runPageEvaluation = async (blob: Blob) => {
    // Stage/evaluating/pageVisible already set by Done button for instant feedback
    // Only set them here as fallback (e.g. if called from other paths)
    setStage(s => s === "evaluating" ? s : "evaluating");
    setEvaluating(true);
    if (!evalResult) setEvalResult(null);
    setPageVisible(true);
    // Save blob URL for local playback after evaluation
    const blobUrl = URL.createObjectURL(blob);
    setRecordedBlobUrl(blobUrl);
    setPlayingRecording(false);
    try {
      const ayahs    = pageDataRef.current?.ayahs ?? [];
      const refText  = ayahs.map((a: any) => a.text).join(" ");
      const transcript = await transcribeAudio(blob, refText);

      if (!transcript || transcript.trim().length < 3) {
        // Fallback: use the live word-match results we already have
        const liveWs = liveWordStatesRef.current;
        const ayahsLocal = pageDataRef.current?.ayahs ?? [];
        const hasliveData = liveWs.length > 0 && liveWs.some(ws => ws.some(s => s === "correct"));
        if (hasliveData) {
          // Reconstruct score from live matching
          const allWords: WordResult[] = [];
          ayahsLocal.forEach((ayah: any, ai: number) => {
            const ws = ayah.text.replace(/﴿[^﴾]*﴾/g,"").split(/\s+/).filter(Boolean);
            ws.forEach((word: string, wi: number) => {
              allWords.push({ word, status: (liveWs[ai]?.[wi] === "correct" ? "correct" : "missing") as any });
            });
          });
          const correct = allWords.filter(w => w.status === "correct").length;
          const score = Math.round(correct / Math.max(1, allWords.length) * 100);
          const fakeTranscript = allWords.filter(w => w.status === "correct").map(w => w.word).join(" ");
          setEvalResult({ score, words: allWords, transcript: fakeTranscript, feedback: "" });
          setEvaluating(false);
          // Still detect errors per ayah
          const errors: AyahError[] = [];
          for (const ayah of ayahsLocal) {
            const ai = ayahsLocal.indexOf(ayah);
            const ws2 = ayah.text.replace(/﴿[^﴾]*﴾/g,"").split(/\s+/).filter(Boolean);
            const missing = ws2.filter((_: string, wi: number) => liveWs[ai]?.[wi] !== "correct");
            if (missing.length >= 2) errors.push({ ayah, missing, mastered: false, remediationScore: 0 });
          }
          setAyahErrors(errors);
          setStage("evaluating");
          return;
        }
        setEvalResult({
          score: -1,
          words: [],
          transcript: "",
          feedback: "Transcription could not be completed. Please ensure you are in a quiet environment, speak clearly and closely into the microphone, then try again.",
          transcriptFailed: true,
        });
        setEvaluating(false);
        return;
      }

      const words    = compareWords(refText, transcript);
      const correct  = words.filter(w => w.status === "correct").length;
      const score    = Math.round((correct / Math.max(1, words.length)) * 100);

      // Detect error ayahs — use compareWords per-ayah for accurate missing detection
      const errors: AyahError[] = [];
      for (const ayah of ayahs) {
        const ayahResult = compareWords(ayah.text, transcript);
        const missing = ayahResult
          .filter(w => w.status === "missing")
          .map(w => w.word);
        // Only flag as error if more than 1 word missing (not just minor omission)
        if (missing.length >= 2) {
          errors.push({ ayah, missing, mastered: false, remediationScore: 0 });
        }
      }

      const feedback = await getAIFeedback(refText, transcript, score);
      setEvalResult({ score, words, transcript, feedback });
      setAyahErrors(errors);
      setRecitationAttempts(a => a + 1);

      // ── Upload audio to storage for admin playback ─────────────────
      let uploadedPath: string | null = null;
      if (userId) {
        try {
          const ext = blob.type.includes("mp4") ? "mp4"
            : blob.type.includes("ogg") ? "ogg" : "webm";
          const path = `hifdh-revision/${userId}/${Date.now()}.${ext}`;
          const { error: upErr } = await storageSupabase.storage
            .from("recitation-audio")
            .upload(path, blob, { contentType: blob.type, upsert: true });
          if (!upErr) { uploadedPath = path; setAudioPath(path); }
        } catch { /* ignore — audio upload is best-effort */ }
      }

      if (userId && plan) {
        try {
          await (supabase as any).from("hifdh_revision_sessions").insert({
            student_id: userId,
            page_number: plan.allPages[plan.currentIdx],
            score, stage: "recitation", word_results: words,
            transcript, duration_seconds: recTime,
            created_at: new Date().toISOString(),
          });
        } catch { /* ignore */ }

        // hifdh_daily_logs is written exclusively by HifdhDailyRevisionPage.
        // مراجعة sessions are tracked in hifdh_revision_sessions above.
      }
    } catch (e) {
      console.error(e);
      setEvalResult({ score: 0, words: [], transcript: "", feedback: "An error occurred. Please try again.", transcriptFailed: true });
    } finally {
      setEvaluating(false);
    }
  };

  // ═══ Remediation Recording ════════════════════════════
  const startRemRecording = async (ayahNum: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      remChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) remChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(remTimerRef.current);
        const blob = new Blob(remChunksRef.current, { type: mime || "audio/webm" });
        runRemEvaluation(blob, ayahNum);
      };
      mr.start(200);
      remMediaRef.current = mr;
      setRemRecording(true);
      setRemRecTime(0);
      setRemResult(null);
      remTimerRef.current = setInterval(() => setRemRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };

  const stopRemRecording = () => {
    clearInterval(remTimerRef.current);
    remMediaRef.current?.stop();
    setRemRecording(false);
  };

  const runRemEvaluation = async (blob: Blob, ayahNum: number) => {
    setRemEvaluating(true);
    setRemResult(null);
    try {
      const ayah = pageDataRef.current?.ayahs?.find((a: any) => a.number === ayahNum)
            ?? [...(prevPageData?.ayahs ?? [])].find((a: any) => a.number === ayahNum);
      const transcript = await transcribeAudio(blob, ayah?.text);
      if (!transcript) {
        setRemResult({ score: 0, transcript: transcript || "" });
        setRemEvaluating(false);
        return;
      }
      const wordResults = compareWords(ayah.text, transcript);
      const correct = wordResults.filter(w => w.status === "correct").length;
      const score   = Math.round((correct / Math.max(1, wordResults.length)) * 100);
      setRemResult({ score, transcript });
      setAyahErrors(prev => prev.map(ae =>
        ae.ayah.number === ayahNum
          ? { ...ae, mastered: score >= 70, remediationScore: Math.max(ae.remediationScore, score) }
          : ae
      ));
    } catch { setRemResult({ score: 0, transcript: "" }); }
    finally { setRemEvaluating(false); }
  };

  // ═══ Exercise Recording ═══════════════════════════════
  const startExRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      exChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) exChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(exTimerRef.current);
        const blob = new Blob(exChunksRef.current, { type: mime || "audio/webm" });
        runExEvaluation(blob);
      };
      mr.start(200);
      exMediaRef.current = mr;
      setExRecording(true);
      setExRecTime(0);
      setExResult(null);
      exTimerRef.current = setInterval(() => setExRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };

  const stopExRecording = () => {
    clearInterval(exTimerRef.current);
    exMediaRef.current?.stop();
    setExRecording(false);
  };

  const runExEvaluation = async (blob: Blob) => {
    setExEvaluating(true);
    setExResult(null);
    try {
      const q = exercises[exIdx];
      const transcript = await transcribeAudio(blob, q?.missingText ?? q?.promptText);
      if (!q) { setExEvaluating(false); return; }

      let score = 0;
      if (transcript && transcript.trim().length > 0) {
        const wordResults = compareWords(q.missingText, transcript);
        const correct = wordResults.filter(w => w.status === "correct").length;
        score = Math.round((correct / Math.max(1, wordResults.length)) * 100);
      }

      setExResult({ score, transcript: transcript || "" });
      const isCorrect = score >= 60;
      setExercises(prev => prev.map((eq, i) =>
        i === exIdx ? { ...eq, answered: true, score, transcript: transcript || "" } : eq
      ));
      setExAnswered(a => a + 1);
      if (isCorrect) setExCorrect(c => c + 1);
    } catch { setExResult({ score: 0, transcript: "" }); }
    finally { setExEvaluating(false); }
  };

  // ═══ Exercise navigation ══════════════════════════════
  const buildExercise = useCallback(() => {
    const current = pageData?.ayahs ?? [];
    const prev    = prevPageData?.ayahs ?? [];
    const errorNums = new Set(ayahErrors.map(e => e.ayah.number));
    const priority  = current.filter((a: any) => errorNums.has(a.number));
    const rest      = current.filter((a: any) => !errorNums.has(a.number));
    const pool      = [...priority, ...rest];
    setExercises(makeExercise(pool, prev));
    setExIdx(0); setExCorrect(0); setExAnswered(0);
    setExResult(null); setExRecording(false);
  }, [pageData, prevPageData, ayahErrors]);

  const nextExercise = () => {
    setExResult(null);
    setExRecording(false);
    if (exIdx + 1 < exercises.length) {
      setExIdx(i => i + 1);
    } else {
      finishExercise();
    }
  };

  const finishExercise = () => {
    const score    = Math.round((exCorrect / Math.max(1, exercises.length)) * 100);
    const elapsed  = Math.round((Date.now() - sessionStart) / 1000);
    const curPage  = plan!.allPages[plan!.currentIdx];
    setFinalStats({
      pageNum: curPage, score: evalResult?.score ?? 0,
      attempts: recitationAttempts, errorCount: ayahErrors.length,
      timeSeconds: elapsed, exerciseScore: score,
    });
    if (score >= EXERCISE_PASS) {
      const newDone = new Set(completedPages);
      newDone.add(curPage);
      setCompletedPages(newDone);
      if (userId) {
        localStorage.setItem(`revision_done_${userId}`, JSON.stringify(Array.from(newDone)));
        (supabase as any).from("hifdh_revision_progress").upsert({
          user_id: userId, page_number: curPage, completed: true,
          best_score: evalResult?.score ?? 0, exercise_score: score,
          completed_at: new Date().toISOString(),
        }, { onConflict: "user_id,page_number" }).then(() => {});
      }
      setEarnedXP(50 + (evalResult?.score ?? 0) + score);
      setStage("complete");
    } else {
      buildExercise();
    }
  };

  // ═══ Next page ════════════════════════════════════════
  const nextPage = () => {
    if (!plan) return;
    const nextIdx = plan.currentIdx + 1;
    if (nextIdx >= plan.allPages.length) { setStage("complete"); return; }
    const updated: RevisionPlan = { ...plan, currentIdx: nextIdx };
    setPlan(updated);
    if (userId) localStorage.setItem(`revision_plan_${userId}`, JSON.stringify(updated));
    setStage("reciting");
    setEvalResult(null); setAyahErrors([]); setRecitationAttempts(0);
    setSessionStart(Date.now()); setPageVisible(true);
    fetchPage(updated.allPages[nextIdx]);
    fetchPrevPage(updated.allPages[nextIdx]);
  };

  // ════════════════════════════════════════════════════════
  //  CSS
  // ════════════════════════════════════════════════════════
  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap');

    .qr-mushaf {
      font-family:'Amiri Quran','Scheherazade New','Amiri',serif;
      direction:rtl; line-height:2.6; color:${INK};
      text-align:justify; text-align-last:right;
      word-spacing:0.12em; letter-spacing:0.01em;
    }
    .qr-arabic { font-family:'Amiri',serif; direction:rtl; }
    .qr-active  { background:${GOLD}35; border-radius:4px; outline:2px solid ${GOLD}90; }
    .qr-missing { background:#fee2e2; border-radius:3px; color:#dc2626; }
    .qr-correct { background:#dcfce7; border-radius:3px; color:#16a34a; }

    .qr-nameplate {
      margin:10px 0 4px; padding:6px 16px;
      background:linear-gradient(to right,transparent,${GOLD}22,${GOLD}44,${GOLD}22,transparent);
      border-top:1.5px solid ${GOLD}99; border-bottom:1.5px solid ${GOLD}99;
      text-align:center; font-family:'Amiri',serif; direction:rtl;
      color:${DG}; font-size:1.05em; font-weight:700;
    }
    .qr-bismillah {
      font-family:'Amiri Quran','Amiri',serif; direction:rtl; text-align:center;
      color:${INK}; margin:4px 0 12px; line-height:2;
    }
    .qr-frame {
      background:${PARCHMENT};
      border:2px solid ${GOLD}77;
      border-radius:6px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.35), inset 0 0 0 1px ${GOLD}22;
      position:relative;
    }
    .qr-frame::before {
      content:''; position:absolute; inset:8px;
      border:1px solid ${GOLD}33; border-radius:3px;
      pointer-events:none; z-index:1;
    }
    .qr-btn { transition:transform 0.1s, opacity 0.12s; cursor:pointer; }
    .qr-btn:active { transform:scale(0.88); }
    .qr-btn:disabled { opacity:0.35; cursor:not-allowed; }

    @keyframes qr-pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    @keyframes qr-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes qr-fadein { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes qr-spin   { to{transform:rotate(360deg)} }
    @keyframes qr-shimmer {
      0%{background-position:-200% 0} 100%{background-position:200% 0}
    }
    @keyframes qr-recordpulse {
      0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.5)}
      50%{box-shadow:0 0 0 16px rgba(220,38,38,0)}
    }
    .qr-pulse  { animation:qr-pulse 1.6s ease-in-out infinite; }
    .qr-bounce { animation:qr-bounce 0.9s ease-in-out infinite; }
    .qr-fadein { animation:qr-fadein 0.35s ease-out forwards; }
    .qr-spin   { animation:qr-spin 1s linear infinite; }
    .qr-shimmer {
      background:linear-gradient(90deg,${DG} 25%,${DG2} 50%,${DG} 75%);
      background-size:200% 100%; animation:qr-shimmer 1.5s infinite;
    }
    .qr-recordpulse { animation:qr-recordpulse 1.2s ease-in-out infinite; }
    .qr-geo {
      background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0 L40 20 L20 40 L0 20z' fill='none' stroke='%23c9a84c' stroke-width='0.5' stroke-opacity='0.15'/%3E%3C/svg%3E");
      background-size:40px 40px;
    }
  `;

  const pageAyahs   = pageData?.ayahs ?? [];
  const surahGroups = groupBySurah(pageAyahs);
  const currentPage = plan?.allPages[plan.currentIdx] ?? 1;
  const juzNum      = pageAyahs[0]?.juz ?? 1;
  const totalPages  = plan?.allPages.length ?? 0;
  const isPagePlaying = pagePlayIdx >= 0;

  // ════════════════════════════════════════════════════════
  //  SETUP
  // ════════════════════════════════════════════════════════
  // Show loading spinner while DB assignment check is in progress
  if (userId && !assignmentLoaded && stage === "setup") {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", height:"100%", gap:16, background:"#faf8f4" }}>
        <div style={{ width:48, height:48, borderRadius:14, background:"#1a3d24",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:24 }}>📖</span>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:16, color:"#1a3d24", fontWeight:700 }}>
            Loading your revision…
          </div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:12, color:"#c9a84c", marginTop:4 }}>
            جار تحميل المراجعة
          </div>
        </div>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #e8ddd0",
          borderTopColor:"#1a3d24", animation:"spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (stage === "setup") {
    const dailyOptions = [
      { val: 0.5, ar: "نصف",     en: "½ page"   },
      { val: 1,   ar: "صفحة",    en: "1 page"   },
      { val: 2,   ar: "صفحتان",  en: "2 pages"  },
      { val: 3,   ar: "ثلاث",    en: "3 pages"  },
      { val: 5,   ar: "خمس",     en: "5 pages"  },
      { val: 7,   ar: "سبع",     en: "7 pages"  },
      { val: 10,  ar: "عشر",     en: "10 pages" },
      { val: 20,  ar: "عشرون",   en: "20 pages" },
    ];

    /* Refined palette */
    const W    = "#ffffff";
    const WARM = "#faf8f4";
    const BRD  = "#e8ddd0";
    const MUT  = "#9aab94";
    const GL   = GOLD;

    return (
      <div className="h-full overflow-y-auto" style={{ background: "#f5f2ec" }}>
        <style>{globalCSS + `
          .rv-btn:active{transform:scale(0.97);transition:transform .1s}
          .rv-card{background:#fff;border:1px solid #e8ddd0;border-radius:16px;box-shadow:0 2px 10px rgba(26,61,36,.07)}
          .rv-card-gold{background:linear-gradient(135deg,#fffdf6,#fdf6e3);border:1px solid #ddc97a55;border-radius:16px;box-shadow:0 2px 10px rgba(183,121,31,.08)}
          .rv-sel:focus{outline:2px solid #1a3d24;outline-offset:1px}
          .rv-arabic{font-family:'Amiri',serif;direction:rtl}
          .rv-grid-btn{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:10px;cursor:pointer;font-family:'Amiri',serif;font-weight:800;transition:all .15s;border:1.5px solid #e8ddd0;background:#fff;color:#9aab94}
          .rv-grid-btn.active{background:#1a3d24;border-color:#1a3d24;color:#c9a84c;box-shadow:0 2px 6px rgba(26,61,36,.3)}
        `}</style>

        {/* ── Header with geometric pattern ── */}
        <div style={{ background: `linear-gradient(160deg,#1a3d24 0%,#276749 100%)`, padding: "20px 16px 18px", position: "relative", overflow: "hidden" }}>
          {/* Geometric SVG watermark */}
          <svg style={{ position: "absolute", right: 0, top: 0, opacity: 0.07, pointerEvents: "none" }} width="160" height="120" viewBox="0 0 160 120">
            <polygon points="80,10 150,55 150,110 80,110 10,110 10,55" fill="none" stroke="#c9a84c" strokeWidth="1"/>
            <polygon points="80,25 135,60 135,95 80,95 25,95 25,60" fill="none" stroke="#c9a84c" strokeWidth="0.8"/>
            <polygon points="80,40 120,65 120,90 80,90 40,90 40,65" fill="none" stroke="#c9a84c" strokeWidth="0.6"/>
            <line x1="80" y1="10" x2="80" y2="110" stroke="#c9a84c" strokeWidth="0.5"/>
            <line x1="10" y1="55" x2="150" y2="55" stroke="#c9a84c" strokeWidth="0.5"/>
          </svg>
          {/* Gold top stripe */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,#b7791f,#e8c97a,#b7791f)` }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(201,168,76,.18)",
              border: "1.5px solid rgba(201,168,76,.4)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookMarked size={22} style={{ color: GL }} />
            </div>
            <div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#ffffff", fontWeight: 700, lineHeight: 1.2 }}>Quran Revision</div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: GL, marginTop: 2 }}>مراجعة المحفوظ — Review what you've memorised</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 12 }}>



          {/* Resume plan */}
          {plan && (
            <div className="rv-card qr-fadein" style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: GL }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: GL, letterSpacing: 1, textTransform: "uppercase" as const }}>Active Plan</span>
                </div>
                <button className="rv-btn"
                  onClick={() => {
                    setSessionStart(Date.now()); setPageVisible(true);
                    fetchPage(plan.allPages[plan.currentIdx]);
                    fetchPrevPage(plan.allPages[plan.currentIdx]);
                    setStage("reciting");
                  }}
                  style={{ fontSize: 12, fontWeight: 800, padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg,${DG},${DG2})`, color: W, boxShadow: `0 2px 8px ${DG}35` }}>
                  Resume →
                </button>
              </div>
              <p style={{ fontSize: 12, color: MUT, marginBottom: 8 }}>
                {plan.mode === "juz" ? `Juz ${plan.selected.join(", ")}` :
                 plan.mode === "hizb" ? `Hizb ${plan.selected.join(", ")}` :
                 `${plan.selected.length} Surah(s)`} · Page {plan.allPages[plan.currentIdx]} / {plan.allPages.length}
              </p>
              <div style={{ height: 6, borderRadius: 3, background: BRD, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((plan.currentIdx / Math.max(1, plan.allPages.length - 1)) * 100)}%`, height: "100%",
                  borderRadius: 3, background: `linear-gradient(to right,${DG},${GL})` }} />
              </div>
            </div>
          )}

          {/* What to Revise */}
          <div className="rv-card" style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: `linear-gradient(to bottom,${GL},#e8c97a)` }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: GL, letterSpacing: 1.2, textTransform: "uppercase" as const }}>What to Revise</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {(["juz", "hizb", "surah"] as SelectMode[]).map(m => (
                <button key={m} className="rv-btn" onClick={() => { setSelectMode(m); setSelected([]); }}
                  style={{ padding: "11px 4px", borderRadius: 12,
                    border: `2px solid ${selectMode === m ? DG : BRD}`,
                    background: selectMode === m ? DG : "#faf8f4",
                    color: selectMode === m ? W : "#6b7a6b",
                    fontWeight: 800, cursor: "pointer", transition: "all .2s",
                    boxShadow: selectMode === m ? `0 3px 10px ${DG}35` : "none" }}>
                  <div style={{ fontSize: 14, fontFamily: "'Amiri',serif", color: selectMode === m ? GL : DG, lineHeight: 1.4 }}>
                    {m === "juz" ? "بالجزء" : m === "hizb" ? "بالحزب" : "بالسورة"}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700, letterSpacing: .5,
                    color: selectMode === m ? "rgba(201,168,76,.8)" : "#9aab94" }}>
                    {m === "juz" ? "Juz" : m === "hizb" ? "Hizb" : "Surah"}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ maxHeight: 208, overflowY: "auto", borderRadius: 12,
              border: `1px solid #e8ddd0`, background: "#faf8f4", padding: "10px" }}>
              {selectMode === "juz" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                  {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                    <button key={j} className={`rv-grid-btn${selected.includes(j) ? " active" : ""}`}
                      onClick={() => setSelected(p => p.includes(j) ? p.filter(x => x !== j) : [...p, j])}
                      style={{ fontSize: 13 }}>
                      {toAr(j)}
                    </button>
                  ))}
                </div>
              )}
              {selectMode === "hizb" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                  {Array.from({ length: 60 }, (_, i) => i + 1).map(h => (
                    <button key={h} className={`rv-grid-btn${selected.includes(h) ? " active" : ""}`}
                      onClick={() => setSelected(p => p.includes(h) ? p.filter(x => x !== h) : [...p, h])}
                      style={{ fontSize: 11 }}>
                      {toAr(h)}
                    </button>
                  ))}
                </div>
              )}
              {selectMode === "surah" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(SURAHS_AR).map(([num, name]) => {
                    const n = Number(num);
                    return (
                      <button key={n} className="rv-btn"
                        onClick={() => setSelected(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 10, cursor: "pointer", transition: "all .15s",
                          border: `1.5px solid ${selected.includes(n) ? DG : BRD}`,
                          background: selected.includes(n) ? `${DG}0d` : W }}>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Amiri',serif",
                          color: selected.includes(n) ? DG : "#374141" }}>{name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: MUT }}>{n}</span>
                          {selected.includes(n) && (
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: DG,
                              display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Check size={10} color={GL} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selected.length > 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: `${DG}08`, border: `1px solid ${DG}18`,
                fontSize: 11, color: DG, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                <span>✓ {selected.length} {selectMode}(s) selected</span>
                <span style={{ color: GL }}>~{buildPages(selectMode, selected).length} pages</span>
              </div>
            )}
          </div>

          {/* Daily amount */}
          <div className="rv-card" style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: GL }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: GL, letterSpacing: 1.2, textTransform: "uppercase" as const }}>Daily Revision Amount</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
              {dailyOptions.map(o => (
                <button key={o.val} className="rv-btn" onClick={() => setDailyPages(o.val)}
                  style={{ padding: "10px 4px", borderRadius: 12, cursor: "pointer", transition: "all .2s",
                    border: `2px solid ${dailyPages === o.val ? DG : BRD}`,
                    background: dailyPages === o.val ? DG : W,
                    boxShadow: dailyPages === o.val ? `0 2px 8px ${DG}30` : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "'Amiri',serif",
                    color: dailyPages === o.val ? GL : MUT }}>{o.ar}</div>
                  <div style={{ fontSize: 9, marginTop: 2, color: dailyPages === o.val ? `${GL}cc` : "#c0c0b0" }}>{o.en}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reciter */}
          <div className="rv-card" style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: GL }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: GL, letterSpacing: 1.2, textTransform: "uppercase" as const }}>Reciter</span>
            </div>
            <select value={reciter} className="rv-sel rv-arabic" onChange={e => setReciter(e.target.value)}
              style={{ width: "100%", fontSize: 14, borderRadius: 10, padding: "10px 12px",
                border: `1.5px solid ${BRD}`, background: WARM, color: DG, fontWeight: 600,
                appearance: "none" as const, cursor: "pointer" }}>
              {RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Start */}
          <button className="rv-btn"
            onClick={() => {
              const pages = buildPages(selectMode, selected);
              const newPlan: RevisionPlan = { mode: selectMode, selected, dailyPages, allPages: pages, currentIdx: 0 };
              setPlan(newPlan);
              if (userId) localStorage.setItem(`revision_plan_${userId}`, JSON.stringify(newPlan));
              setSessionStart(Date.now()); setPageVisible(true);
              fetchPage(pages[0]); fetchPrevPage(pages[0]);
              setStage("reciting");
              setAssignmentLoaded(true);
            }}
            disabled={selected.length === 0}
            style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none",
              cursor: selected.length > 0 ? "pointer" : "not-allowed",
              background: selected.length > 0 ? `linear-gradient(135deg,${DG} 0%,${DG2} 100%)` : "#f0f0ee",
              color: selected.length > 0 ? W : MUT, fontSize: 16, fontWeight: 800,
              boxShadow: selected.length > 0 ? `0 4px 16px ${DG}40` : "none",
              letterSpacing: .3, transition: "all .2s" }}>
            {selected.length > 0 ? "بسم الله — Start Revision ✨" : "Select content to revise"}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RECITING
  // ════════════════════════════════════════════════════════
  if (stage === "reciting") {
    const progressPct = plan ? Math.round((plan.currentIdx / Math.max(1, plan.allPages.length)) * 100) : 0;

    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ background: "#0a0e0b" }}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

        {/* Header */}
        <div className="flex-none border-b" style={{ borderColor: GOLD + "33", background: DG }}>
          <div className="px-3 py-2 flex items-center gap-2">
          {!assignment && (
            <button onClick={() => setStage("setup")} className="p-1.5 rounded-lg qr-btn" style={{ background: "#1a3025" }}>
              <ChevronLeft size={14} color={GOLD} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black" style={{ color: GOLD }}>
                Page {currentPage} · Juz {toAr(juzNum)}
              </span>
              <span className="text-[10px] rounded px-1.5 py-0.5 font-bold"
                style={{ background: GOLD + "22", color: GOLD }}>
                {(plan?.currentIdx ?? 0) + 1}/{totalPages}
              </span>
            </div>
            <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: "#1a3025" }}>
              <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: GOLD, transition: "width 0.3s" }} />
            </div>
          </div>

          {/* Reciter */}
          <select value={reciter} onChange={e => { stopAudio(); setReciter(e.target.value); }}
            className="text-[9px] rounded-lg px-2 py-1 outline-none qr-arabic max-w-[90px]"
            style={{ background: "#1a3025", color: GOLD, border: `1px solid ${GOLD}22` }}>
            {RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {/* Font size */}
          <div className="flex items-center gap-1">
            <button onClick={() => setFontSize(f => Math.max(18, f - 2))}
              className="w-6 h-6 rounded flex items-center justify-center qr-btn" style={{ background: "#1a3025" }}>
              <span style={{ color: GOLD, fontSize: 9, fontWeight: 900 }}>A-</span>
            </button>
            <button onClick={() => setFontSize(f => Math.min(40, f + 2))}
              className="w-6 h-6 rounded flex items-center justify-center qr-btn" style={{ background: "#1a3025" }}>
              <span style={{ color: GOLD, fontSize: 11, fontWeight: 900 }}>A+</span>
            </button>
          </div>
          </div>{/* end inner row */}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">

          {/* ── LIVE MUSHAF RECITATION SCREEN ── */}
          {recording && (() => {
            const ayahs: any[] = pageDataRef.current?.ayahs ?? [];
            const total   = liveWords.reduce((s,ws) => s + ws.length, 0);
            const correct = liveWords.reduce((s,ws) => s + ws.filter(w=>w.status==="correct").length, 0);
            const pct = total ? Math.round(correct/total*100) : 0;

            return (
              <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "#050f08" }}>

                {/* ── Top bar ── */}
                <div className="flex-none flex items-center gap-2 px-3 py-2"
                  style={{ background: DG, borderBottom: `1px solid ${GOLD}33` }}>
                  {/* Pulse mic */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 qr-recordpulse"
                    style={{ background:"#dc262618", border:"2px solid #dc2626" }}>
                    <Mic size={14} color="#ef4444" />
                  </div>
                  <span className="font-black text-sm tabular-nums" style={{ color:"#ef4444" }}>
                    {fmtTime(recTime)}
                  </span>
                  {/* Progress bar */}
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"#1a3025" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width:`${pct}%`, background:`linear-gradient(to right,${GOLD},#22c55e)` }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: GOLD }}>{pct}%</span>
                  {/* Done */}
                  <button onClick={() => {
                      setStage("evaluating"); setEvaluating(true);
                      setEvalResult(null); setPageVisible(true);
                      stopLiveRecording();
                    }}
                    className="px-3 py-1.5 rounded-xl font-black text-xs qr-btn flex-shrink-0"
                    style={{ background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color:DG }}>
                    ✓ Done
                  </button>
                </div>

                {/* ── Mushaf page ── */}
                <div className="flex-1 overflow-y-auto" style={{ background: PARCHMENT }}>
                  <div className="px-4 py-5">

                    {/* Surah name */}
                    {ayahs[0]?.surah && (
                      <div className="text-center mb-4">
                        <p style={{ fontFamily:"'Amiri',serif", fontSize:15, fontWeight:800, color:"#5a3e1b" }}>
                          سورة {ayahs[0].surah.nameAr}
                        </p>
                        <p style={{ fontFamily:"'Amiri Quran','Amiri',serif", fontSize:14, color:"#8a6030", marginTop:2 }}>
                          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                        </p>
                      </div>
                    )}

                    {/* All words in one continuous flow — no cards */}
                    <div style={{
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      fontSize: fontSize,
                      lineHeight: 2.7,
                      direction: "rtl",
                      textAlign: "justify",
                    }}>
                      {liveWords.length === 0 && (
                        <p className="text-center text-xs" style={{ color:"#4a6d58" }}>Loading…</p>
                      )}

                      {liveWords.map((ws, ai) => {
                        const ayah = ayahs[ai];
                        if (!ayah) return null;
                        return (
                          <span key={ai}>
                            {ws.map((w, wi) => (
                              <span key={wi} style={{
                                color: w.status === "correct" ? "#16a34a"
                                     : w.status === "missing"  ? "#dc2626"
                                     : "transparent",
                                // Hidden: show the glyph shape as a blurred silhouette
                                // so the page looks like a real mushaf but unreadable
                                textShadow: w.status === "hidden"
                                  ? "0 0 8px #1c1c1c"
                                  : "none",
                                WebkitTextStroke: w.status === "hidden" ? "0px" : "0px",
                                filter: w.status === "hidden" ? "blur(3.5px)" : "none",
                                textDecoration: "none",
                                transition: "color 0.12s, filter 0.12s",
                                display: "inline",
                              }}>
                                {w.word}{" "}
                              </span>
                            ))}
                            {/* Verse number circle */}
                            <span style={{
                              display: "inline-block",
                              width: "1.5em", height: "1.5em",
                              lineHeight: "1.5em",
                              textAlign: "center",
                              borderRadius: "50%",
                              border: `1.5px solid ${GOLD}`,
                              color: GOLD,
                              fontSize: "0.5em",
                              fontFamily: "'Amiri',serif",
                              verticalAlign: "middle",
                              margin: "0 0.2em",
                            }}>
                              {toAr(ayah.numberInSurah)}
                            </span>
                            {" "}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* ── MUSHAF ── */}
          {!recording && (
            <div className="h-full overflow-y-auto px-1 pt-1 pb-1">
              {pageLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 size={28} className="qr-spin" style={{ color: GOLD }} />
                  <p className="text-xs" style={{ color: "#7aad90" }}>Loading page {currentPage}…</p>
                </div>
              ) : (
                <div className="qr-frame w-full shadow-2xl">
                  {/* Page header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b"
                    style={{ borderColor: GOLD + "44", background: `linear-gradient(to bottom,${GOLD}12,transparent)` }}>
                    <span className="qr-arabic text-xs font-bold" style={{ color: DG }}>
                      {pageAyahs[0]?.surah?.nameAr ?? ""}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: GOLD, fontFamily: "'Amiri',serif" }}>
                      الجزء {toAr(juzNum)}
                    </span>
                    <span className="text-[9px]" style={{ color: "#8a6830", fontFamily: "Georgia,serif" }}>
                      {pageAyahs[0]?.surah?.englishName ?? ""}
                    </span>
                  </div>
                  <div className="mx-4 h-px" style={{ background: `linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />

                  {/* Verses */}
                  <div className="px-4 py-4">
                    {surahGroups.map((g, gi) => {
                      const isNew     = g.ayahs[0].numberInSurah === 1;
                      const showBism  = isNew && g.surah.number !== 9 && g.surah.number !== 1;
                      return (
                        <div key={gi}>
                          {isNew && (
                            <div className="qr-nameplate">
                              سورة {g.surah.nameAr}
                              <small style={{ display: "block", fontSize: "0.6em", color: "#7a6030", fontFamily: "Georgia,serif" }}>
                                {g.surah.englishName} · {g.surah.numberOfAyahs} verses
                              </small>
                            </div>
                          )}
                          {showBism && (
                            <div className="qr-bismillah" style={{ fontSize: fontSize * 0.82 }}>
                              بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                            </div>
                          )}
                          <p className="qr-mushaf" style={{ fontSize }}>
                            {g.ayahs.map(a => (
                              <span key={a.number}
                                onClick={() => { stopAudio(); playAyah(a); }}
                                className={cn("cursor-pointer transition-all rounded-sm", playing === a.number && "qr-active")}>
                                {a.text}{" "}
                                <span style={{ color: GOLD, fontFamily: "'Amiri',serif", fontSize: "0.65em" }}>
                                  ۝{toAr(a.numberInSurah)}
                                </span>{" "}
                              </span>
                            ))}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mx-4 h-px" style={{ background: `linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />
                  <div className="py-3 text-center" style={{ fontFamily: "'Amiri',serif", color: GOLD, fontSize: "0.8em" }}>
                    ─── {toAr(currentPage)} ───
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only when NOT recording */}
        {!recording && (
          <div className="flex-none border-t px-3 py-1.5"
            style={{ borderColor: GOLD + "33", background: DG }}>
            {/* ── Pre-recording controls ── */}
            <div className="flex items-center justify-center gap-3">
              {/* Listen */}
              <button
                onClick={isPagePlaying ? stopAudio : playPage}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold qr-btn"
                style={{ background: isPagePlaying ? "#1a3025" : GOLD + "28", color: GOLD, border: `1px solid ${GOLD}44` }}>
                {isPagePlaying
                  ? <><StopCircle size={10} /> Stop</>
                  : <><Headphones size={10} /> Listen</>
                }
              </button>

              {/* Main mic button — compact */}
              <button
                onClick={startLiveRecording}
                disabled={pageLoading}
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg qr-btn"
                style={{
                  background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,
                  boxShadow: `0 0 0 4px ${GOLD}22`,
                }}>
                <Mic size={17} color={DG} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  EVALUATING
  // ════════════════════════════════════════════════════════
  if (stage === "evaluating") {
    const result = evalResult;
    const sc = result && result.score >= 0 ? scoreColor(result.score) : null;

    return (
      <div className="h-full overflow-y-auto" style={{ background: `linear-gradient(160deg,${DG} 0%,#0b1a12 100%)` }}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

        {evaluating ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center qr-shimmer">
              <Brain size={32} color={GOLD} />
            </div>
            <p className="font-black text-sm" style={{ color: GOLD }}>Analysing Your Recitation…</p>
            <p className="text-xs text-center" style={{ color: "#7aad90" }}>
              Comparing your recitation with the reference text word by word
            </p>
            <div className="flex gap-2 mt-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full" style={{
                  background: GOLD,
                  animation: `qr-bounce 0.8s ${i * 0.22}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>

        ) : result?.transcriptFailed ? (
          /* Transcription failed */
          <div className="px-4 py-6 space-y-4 qr-fadein">
            <div className="rounded-2xl p-5 text-center" style={{ background: "#fee2e2", border: "2px solid #dc2626" }}>
              <div className="text-4xl mb-2">🎙️</div>
              <p className="font-black text-sm" style={{ color: "#991b1b" }}>Transcription Failed</p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: "#7f1d1d" }}>{result.feedback}</p>
            </div>
            <button onClick={() => { setStage("reciting"); setEvalResult(null); }}
              className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
              style={{ background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color: DG }}>
              🔄 Try Again
            </button>
          </div>

        ) : result ? (
          <div className="px-4 py-5 space-y-4 qr-fadein">

            {/* Score */}
            <div className="rounded-2xl p-5 text-center" style={{ background: sc!.bg, border: `2px solid ${sc!.border}` }}>
              <div className="text-5xl font-black mb-1" style={{ color: sc!.text }}>{result.score}%</div>
              <div className="text-sm font-bold" style={{ color: sc!.text }}>
                {result.score >= 85 ? "ممتاز — Excellent! 🌟" :
                 result.score >= 70 ? "جيد جداً — Very Good ✓" :
                 result.score >= 50 ? "جيد — Good, keep going 💪" :
                 "يحتاج مراجعة — Needs more revision 🔄"}
              </div>
              <div className="flex justify-center gap-4 mt-3 text-xs" style={{ color: sc!.text + "aa" }}>
                <span>✅ {result.words.filter(w => w.status === "correct").length} correct</span>
                <span>❌ {result.words.filter(w => w.status === "missing").length} missing</span>
              </div>
            </div>

            {/* AI Feedback */}
            {result.feedback && (
              <div className="rounded-2xl p-4" style={{ background: GOLD + "12", border: `1px solid ${GOLD}33` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={13} style={{ color: GOLD }} />
                  <span className="text-xs font-black" style={{ color: GOLD }}>Teacher Feedback</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#d4c08a" }}>{result.feedback}</p>
              </div>
            )}

            {/* Playback your recording */}
            {recordedBlobUrl && (
              <div className="rounded-2xl p-4" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Headphones size={13} style={{ color: GOLD }} />
                  <span className="text-xs font-black" style={{ color: GOLD }}>Your Recording</span>
                </div>
                <audio
                  ref={playbackAudioRef}
                  src={recordedBlobUrl}
                  onPlay={() => setPlayingRecording(true)}
                  onPause={() => setPlayingRecording(false)}
                  onEnded={() => setPlayingRecording(false)}
                  playsInline
                  preload="metadata"
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => {
                    const a = playbackAudioRef.current;
                    if (!a) return;
                    if (playingRecording) { a.pause(); }
                    else { a.currentTime = 0; a.play(); }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs qr-btn"
                  style={{ background: playingRecording ? "#1a3025" : GOLD + "22", color: GOLD, border: `1px solid ${GOLD}44` }}>
                  {playingRecording
                    ? <><StopCircle size={13} /> Stop Playback</>
                    : <><Volume2 size={13} /> Play My Recording</>
                  }
                </button>
              </div>
            )}

            {/* Word analysis */}
            {result.words.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <p className="text-xs font-black mb-3" style={{ color: GOLD }}>Word-by-Word Analysis</p>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-xl" style={{ background: PARCHMENT, direction: "rtl" }}>
                  {result.words.filter(w => w.status !== "wrong").map((w, i) => (
                    <span key={i}
                      className={cn("px-1.5 py-0.5 rounded text-sm font-semibold",
                        w.status === "correct" ? "qr-correct" : "qr-missing")}
                      style={{ fontFamily: "'Amiri',serif" }}>
                      {w.word}
                    </span>
                  ))}
                </div>
                <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "#7aad90" }}>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#16a34a" }} /> Correct
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#dc2626" }} /> Missing
                  </span>
                </div>
              </div>
            )}

            {/* Error verses */}
            {ayahErrors.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "#fee2e214", border: "1px solid #dc262633" }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={13} color="#dc2626" />
                  <span className="text-xs font-black" style={{ color: "#dc2626" }}>
                    {ayahErrors.length} verse(s) need practice
                  </span>
                </div>
                {ayahErrors.slice(0, 3).map((ae, i) => (
                  <div key={i} className="mb-2 p-3 rounded-xl" style={{ background: "#ffffff08" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <button onClick={() => playAyah(ae.ayah)}
                        className="p-1.5 rounded-lg qr-btn" style={{ background: GOLD + "22" }}>
                        <Volume2 size={11} color={GOLD} />
                      </button>
                      <span className="text-[10px]" style={{ color: "#7aad90" }}>
                        {ae.ayah.surah?.nameAr} · آية {toAr(ae.ayah.numberInSurah)}
                      </span>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "#dc2626" }}>
                      Missing: {ae.missing.slice(0, 5).join("، ")}
                    </p>
                  </div>
                ))}
                {ayahErrors.length > 3 && (
                  <p className="text-[10px] text-center mt-1" style={{ color: "#7aad90" }}>
                    …and {ayahErrors.length - 3} more
                  </p>
                )}
              </div>
            )}

            {/* Transcript */}
            {result.transcript && (
              <div className="rounded-2xl p-4" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <p className="text-xs font-black mb-2" style={{ color: GOLD }}>Your Recitation (transcribed)</p>
                <p className="text-sm qr-arabic leading-relaxed"
                  style={{ color: PARCHMENT + "bb", fontFamily: "'Amiri',serif", direction: "rtl", lineHeight: 2 }}>
                  {result.transcript}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pb-4">
              {result.score >= PASS_SCORE && ayahErrors.length === 0 ? (
                <button onClick={() => { buildExercise(); setStage("exercise"); }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                  style={{ background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color: DG }}>
                  ✓ Proceed to Exercise →
                </button>
              ) : ayahErrors.length > 0 ? (
                <>
                  <button onClick={() => { setRemediationIdx(0); setRemResult(null); setRevealVerse(false); setStage("remediation"); }}
                    className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                    style={{ background: "linear-gradient(135deg,#c2410c,#ea580c)", color: "#fff" }}>
                    📖 Practise Error Verses ({ayahErrors.length})
                  </button>
                  {result.score >= PASS_SCORE && (
                    <button onClick={() => { buildExercise(); setStage("exercise"); }}
                      className="w-full py-3 rounded-2xl font-bold text-sm qr-btn"
                      style={{ background: "#1a3025", color: GOLD, border: `1px solid ${GOLD}44` }}>
                      Skip Practice → Exercise
                    </button>
                  )}
                </>
              ) : (
                <button onClick={() => setStage("reciting")}
                  className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                  style={{ background: "#1a3025", color: GOLD, border: `1px solid ${GOLD}44` }}>
                  🔄 Try Again
                </button>
              )}
              <button onClick={() => { setStage("reciting"); setRecordedBlobUrl(null); setPlayingRecording(false); }}
                className="w-full py-2.5 rounded-2xl text-xs font-bold qr-btn"
                style={{ background: "transparent", color: "#4a6d58", border: `1px solid ${GOLD}15` }}>
                ← Back to Page
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  REMEDIATION
  // ════════════════════════════════════════════════════════
  if (stage === "remediation") {
    const errAyah       = ayahErrors[remediationIdx];
    const masteredCount = ayahErrors.filter(e => e.mastered).length;
    const allMastered   = ayahErrors.every(e => e.mastered);

    // Find previous ayah for context (don't show error verse — only context)
    const allAyahs   = [...(prevPageData?.ayahs ?? []), ...(pageData?.ayahs ?? [])];
    const errIdx     = allAyahs.findIndex(a => a.number === errAyah?.ayah?.number);
    const contextAyah = errIdx > 0 ? allAyahs[errIdx - 1] : null;

    const remSc = remResult ? scoreColor(remResult.score) : null;

    return (
      <div className="h-full flex flex-col overflow-hidden"
        style={{ background: `linear-gradient(160deg,${DG} 0%,#0b1a12 100%)` }}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

        {/* Header */}
        <div className="flex-none px-4 py-3 border-b" style={{ borderColor: GOLD + "33", background: DG }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} color="#f59e0b" />
            <span className="font-black text-sm" style={{ color: "#f59e0b" }}>Error Practice</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: GOLD + "22", color: GOLD }}>
              {masteredCount}/{ayahErrors.length} mastered
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a3025" }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.round((masteredCount / Math.max(1, ayahErrors.length)) * 100)}%`,
              background: `linear-gradient(to right,${GOLD},${GOLD_LIGHT})`,
            }} />
          </div>
        </div>

        {/* Ayah navigator */}
        <div className="flex-none px-4 py-2 flex gap-2 overflow-x-auto border-b"
          style={{ borderColor: GOLD + "22" }}>
          {ayahErrors.map((ae, i) => (
            <button key={i}
              onClick={() => { setRemediationIdx(i); setRemResult(null); setRevealVerse(false); }}
              className="flex-none w-8 h-8 rounded-full text-xs font-black qr-btn flex items-center justify-center"
              style={{
                background: ae.mastered ? "#16a34a" : remediationIdx === i ? GOLD : "#1a3025",
                color: ae.mastered ? "#fff" : remediationIdx === i ? DG : "#7aad90",
                boxShadow: remediationIdx === i ? `0 0 0 3px ${GOLD}44` : "none",
              }}>
              {ae.mastered ? <Check size={12} /> : toAr(i + 1)}
            </button>
          ))}
        </div>

        {errAyah && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

            {/* Context verse — the verse BEFORE the error verse */}
            {contextAyah && (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}33` }}>
                <div className="px-4 py-2 flex items-center gap-2" style={{ background: GOLD + "15" }}>
                  <BookOpen size={12} color={GOLD} />
                  <span className="text-xs font-bold" style={{ color: GOLD }}>
                    The verse before — use it as your starting point:
                  </span>
                </div>
                <div className="px-5 py-4" style={{ background: PARCHMENT }}>
                  <p className="qr-mushaf text-center leading-loose" style={{ fontSize: fontSize - 2 }}>
                    {contextAyah.text}{" "}
                    <span style={{ color: GOLD, fontSize: "0.7em", fontFamily: "'Amiri',serif" }}>
                      ۝{toAr(contextAyah.numberInSurah)}
                    </span>
                  </p>
                  <button onClick={() => playAyah(contextAyah)}
                    className="mt-2 mx-auto flex items-center gap-1.5 text-xs qr-btn px-3 py-1.5 rounded-lg"
                    style={{ background: GOLD + "22", color: GOLD, display: "flex" }}>
                    <Volume2 size={11} /> Listen to this verse
                  </button>
                </div>
              </div>
            )}

            {/* Error verse — hidden by default, reveal on demand */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "2px solid #f59e0b", boxShadow: "0 2px 12px rgba(245,158,11,.15)" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#f59e0b" }}>
                <span className="text-xs font-black" style={{ color: "#78350f" }}>
                  📢 {errAyah.ayah.surah?.nameAr} · آية {toAr(errAyah.ayah.numberInSurah)}
                </span>
                <span className="text-[10px] font-bold" style={{ color: "#78350f99" }}>
                  {remediationIdx + 1}/{ayahErrors.length}
                </span>
              </div>
              {revealVerse ? (
                <div className="px-5 py-4" style={{ background: PARCHMENT }}>
                  <p className="qr-mushaf text-center leading-loose" style={{ fontSize: fontSize - 2 }}>
                    {errAyah.ayah.text}{" "}
                    <span style={{ color: GOLD, fontSize: "0.7em", fontFamily: "'Amiri',serif" }}>
                      ۝{toAr(errAyah.ayah.numberInSurah)}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="px-5 py-4 flex items-center justify-center gap-2" style={{ background: PARCHMENT }}>
                  <p className="text-xs font-semibold" style={{ color: "#92400e" }}>Hidden —</p>
                  <button onClick={() => setRevealVerse(true)}
                    className="qr-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: "#f59e0b", color: "#78350f" }}>
                    <Eye size={12} /> Reveal
                  </button>
                </div>
              )}
            </div>

            {/* Mastered badge */}
            {errAyah.mastered && (
              <div className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: "#16a34a18", border: "1px solid #16a34a44" }}>
                <CheckCircle2 size={20} color="#4ade80" />
                <div>
                  <p className="text-xs font-black" style={{ color: "#4ade80" }}>Verse Mastered! ما شاء الله 🌟</p>
                  <p className="text-[10px]" style={{ color: "#7aad90" }}>Score: {errAyah.remediationScore}%</p>
                </div>
              </div>
            )}

            {/* Result from last attempt */}
            {remResult && !remEvaluating && (
              <div className="rounded-2xl p-4 qr-fadein"
                style={{ background: remSc!.bg, border: `2px solid ${remSc!.border}` }}>
                <div className="flex items-center gap-2 mb-2">
                  {remResult.score >= 70
                    ? <CheckCircle2 size={16} color={remSc!.text} />
                    : <AlertTriangle size={16} color={remSc!.text} />}
                  <span className="text-sm font-black" style={{ color: remSc!.text }}>
                    {remResult.score}% —{" "}
                    {remResult.score >= 70 ? "Mastered! 🌟" : remResult.score >= 50 ? "Getting there 💪" : "Try again 🔄"}
                  </span>
                </div>
                {remResult.transcript && (
                  <p className="text-xs qr-arabic leading-relaxed mt-1"
                    style={{ fontFamily: "'Amiri',serif", direction: "rtl", color: remSc!.text + "cc", lineHeight: 2 }}>
                    {remResult.transcript}
                  </p>
                )}
                {!remResult.transcript && (
                  <p className="text-xs" style={{ color: remSc!.text + "aa" }}>
                    Transcription failed — please speak clearly and try again.
                  </p>
                )}
              </div>
            )}

            {/* Compact action row: Reveal toggle · Listen · Record */}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>

              {/* Reveal / Hide pill */}
              <button onClick={() => setRevealVerse(v => !v)}
                className="qr-btn flex flex-col items-center justify-center gap-1 rounded-2xl font-bold"
                style={{ flex: 1, padding: "12px 8px", fontSize: 10,
                  background: revealVerse ? "#f59e0b22" : "#f59e0b",
                  color: revealVerse ? "#92400e" : "#78350f",
                  border: "1.5px solid #f59e0b66" }}>
                {revealVerse ? <EyeOff size={18} /> : <Eye size={18} />}
                {revealVerse ? "Hide" : "Reveal"}
              </button>

              {/* Listen pill */}
              <button onClick={() => playAyah(errAyah.ayah)}
                className="qr-btn flex flex-col items-center justify-center gap-1 rounded-2xl font-bold"
                style={{ flex: 1, padding: "12px 8px", fontSize: 10,
                  background: "#1a3d24", color: "#c9a84c",
                  border: "1.5px solid #c9a84c44" }}>
                <Headphones size={18} />
                Listen
              </button>

              {/* Record / Stop pill */}
              {remEvaluating ? (
                <div className="flex flex-col items-center justify-center gap-1 rounded-2xl"
                  style={{ flex: 1, padding: "12px 8px", background: "#1a3025",
                    border: "1.5px solid #c9a84c22" }}>
                  <Loader2 size={18} className="qr-spin" style={{ color: GOLD }} />
                  <span style={{ fontSize: 9, color: "#7aad90", fontWeight: 700 }}>Checking…</span>
                </div>
              ) : (
                <button
                  onClick={remRecording ? stopRemRecording : () => startRemRecording(errAyah.ayah.number)}
                  className={cn("qr-btn flex flex-col items-center justify-center gap-1 rounded-2xl font-bold",
                    remRecording && "qr-recordpulse")}
                  style={{ flex: 1, padding: "12px 8px", fontSize: 10,
                    background: remRecording ? "#dc2626" : `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,
                    color: remRecording ? "#fff" : DG,
                    border: remRecording ? "1.5px solid #dc262688" : "none",
                    boxShadow: remRecording ? "0 0 12px rgba(220,38,38,.4)" : `0 2px 8px rgba(201,168,76,.35)` }}>
                  {remRecording
                    ? <><MicOff size={18} />{fmtTime(remRecTime)}</>
                    : <><Mic size={18} />Record</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex-none px-4 py-3 border-t space-y-2" style={{ borderColor: GOLD + "33", background: DG }}>
          <div className="flex gap-2">
            <button onClick={() => { setRemediationIdx(i => Math.max(0, i - 1)); setRemResult(null); setRevealVerse(false); }}
              disabled={remediationIdx === 0}
              className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold qr-btn"
              style={{ background: "#1a3025", color: GOLD, opacity: remediationIdx === 0 ? 0.4 : 1 }}>
              <ChevronLeft size={14} /> Prev
            </button>
            {remediationIdx < ayahErrors.length - 1 ? (
              <button onClick={() => { setRemediationIdx(i => i + 1); setRemResult(null); setRevealVerse(false); }}
                className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold qr-btn"
                style={{ background: "#1a3025", color: GOLD }}>
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={() => { buildExercise(); setStage("exercise"); }}
                className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-black qr-btn"
                style={{
                  background: allMastered ? `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})` : GOLD + "44",
                  color: allMastered ? DG : GOLD,
                }}>
                {allMastered ? "Exercise →" : "Skip to Exercise →"}
              </button>
            )}
          </div>
          <button onClick={() => setStage("evaluating")}
            className="w-full text-xs text-center py-1" style={{ color: "#4a6d58" }}>
            ← Back to Results
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  EXERCISE — Voice-based recitation completion
  // ════════════════════════════════════════════════════════
  if (stage === "exercise") {
    const q        = exercises[exIdx];
    const progress = Math.round((exAnswered / Math.max(1, exercises.length)) * 100);
    const exSc     = exResult ? scoreColor(exResult.score) : null;

    return (
      <div className="h-full flex flex-col overflow-hidden"
        style={{ background: `linear-gradient(160deg,#0a0f18 0%,#0a0e0b 100%)` }}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

        {/* Header */}
        <div className="flex-none px-4 py-3 border-b" style={{ borderColor: GOLD + "33", background: "#0a0f18" }}>
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} style={{ color: GOLD }} />
            <span className="font-black text-sm" style={{ color: GOLD }}>Recitation Exercise</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: GOLD + "22", color: GOLD }}>
              {exAnswered}/{exercises.length}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a1a2e" }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${progress}%`,
              background: `linear-gradient(to right,#6366f1,${GOLD})`,
            }} />
          </div>
        </div>

        {q ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 qr-fadein">

            {/* Question label */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{
                  background: q.isPrevPage ? "#6366f122" : GOLD + "22",
                  color: q.isPrevPage ? "#a78bfa" : GOLD,
                }}>
                {q.isPrevPage ? "📎 Previous Page Review" : "📖 Complete the Verse"}
              </span>
              <span className="text-xs" style={{ color: "#4a6d58" }}>Q{exIdx + 1}</span>
            </div>

            {/* Verse beginning */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${GOLD}44` }}>
              <div className="px-4 py-2 border-b" style={{ background: GOLD + "15", borderColor: GOLD + "33" }}>
                <p className="text-[10px] font-bold" style={{ color: GOLD }}>
                  {q.ayah.surah?.nameAr} · آية {toAr(q.ayah.numberInSurah)}
                </p>
              </div>
              <div className="px-5 py-4" style={{ background: PARCHMENT }}>
                <p className="qr-mushaf text-center leading-loose" style={{ fontSize: fontSize - 2 }}>
                  {q.displayText}{" "}
                  <span className="inline-block px-3 py-0.5 rounded-lg border-b-2 mx-1"
                    style={{
                      borderColor: GOLD,
                      background: GOLD + "20",
                      color: GOLD,
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      minWidth: 60,
                    }}>
                    {q.answered && exResult?.transcript
                      ? <span style={{ color: exResult.score >= 60 ? "#16a34a" : "#dc2626" }}>
                          {exResult.transcript.split(" ").slice(0, 5).join(" ")}…
                        </span>
                      : "…؟؟؟…"
                    }
                  </span>
                </p>
              </div>
            </div>

            {/* Instruction */}
            {!q.answered && !exRecording && !exEvaluating && (
              <div className="rounded-xl px-4 py-3 text-center" style={{ background: "#1a3025", border: `1px solid ${GOLD}22` }}>
                <p className="text-sm font-bold" style={{ color: GOLD }}>Complete the verse above</p>
                <p className="text-xs mt-1" style={{ color: "#5a8a6a" }}>
                  Listen to the beginning, then tap the mic to recite what comes next from memory
                </p>
              </div>
            )}

            {/* Listen to the verse beginning */}
            {!q.answered && (
              <button onClick={() => playAyah(q.ayah)}
                className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold qr-btn"
                style={{ background: GOLD + "18", color: GOLD, border: `1px solid ${GOLD}33` }}>
                <Headphones size={13} /> Listen to Full Verse (reference)
              </button>
            )}

            {/* Recording / evaluating */}
            {!q.answered && (
              exEvaluating ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 size={22} className="qr-spin" style={{ color: GOLD }} />
                  <span className="text-xs" style={{ color: "#7aad90" }}>Evaluating your recitation…</span>
                </div>
              ) : (
                <button
                  onClick={exRecording ? stopExRecording : startExRecording}
                  className={cn(
                    "w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-black text-sm qr-btn",
                    exRecording && "qr-recordpulse"
                  )}
                  style={{
                    background: exRecording ? "#dc2626" : `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,
                    color: exRecording ? "#fff" : DG,
                  }}>
                  {exRecording
                    ? <><MicOff size={18} /> Stop · {fmtTime(exRecTime)}</>
                    : <><Mic size={18} /> Recite the Continuation</>
                  }
                </button>
              )
            )}

            {/* Result */}
            {q.answered && exResult && (
              <div className="rounded-2xl p-4 qr-fadein"
                style={{ background: exSc!.bg, border: `2px solid ${exSc!.border}` }}>
                <div className="flex items-center gap-2 mb-3">
                  {exResult.score >= 60
                    ? <CheckCircle2 size={18} color={exSc!.text} />
                    : <XCircle size={18} color={exSc!.text} />}
                  <span className="font-black text-sm" style={{ color: exSc!.text }}>
                    {exResult.score}% — {exResult.score >= 60 ? "Correct! ما شاء الله 🌟" : "Needs review"}
                  </span>
                </div>

                {/* Correct answer reveal */}
                <div className="rounded-xl p-3 mt-2" style={{ background: PARCHMENT, border: `1px solid ${GOLD}33` }}>
                  <p className="text-[10px] font-bold mb-1.5" style={{ color: "#8a6030" }}>Correct continuation:</p>
                  <p className="qr-mushaf text-center" style={{ fontSize: fontSize - 4 }}>
                    <span style={{ color: "#aaa" }}>{q.displayText}</span>{" "}
                    <span style={{ color: "#16a34a", fontWeight: "bold" }}>{q.missingText}</span>
                  </p>
                </div>

                {exResult.transcript && (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold mb-1" style={{ color: exSc!.text + "99" }}>You said:</p>
                    <p className="text-xs qr-arabic" style={{ fontFamily: "'Amiri',serif", direction: "rtl", color: exSc!.text }}>
                      {exResult.transcript}
                    </p>
                  </div>
                )}
                {!exResult.transcript && (
                  <p className="text-xs mt-2" style={{ color: exSc!.text + "99" }}>
                    Transcription unclear — try again next time.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Next button */}
        {q?.answered && (
          <div className="flex-none px-4 py-3 border-t" style={{ borderColor: GOLD + "33" }}>
            <button onClick={nextExercise}
              className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
              style={{ background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color: DG }}>
              {exIdx + 1 < exercises.length
                ? `Next Question (${exIdx + 2}/${exercises.length}) →`
                : "Finish Exercise ✓"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  COMPLETE
  // ════════════════════════════════════════════════════════
  if (stage === "complete") {
    const stats     = finalStats;
    const sc        = stats ? scoreColor(stats.score) : scoreColor(0);
    const excSc     = stats ? scoreColor(stats.exerciseScore) : scoreColor(0);
    const isPlanDone = plan ? plan.currentIdx >= plan.allPages.length - 1 : false;

    return (
      <div className="h-full overflow-y-auto qr-geo" style={{ background: `linear-gradient(160deg,${DG} 0%,#0b1a12 100%)` }}>
        <style>{globalCSS}</style>

        <div className="px-4 pt-10 pb-10 space-y-4 qr-fadein">

          <div className="text-center space-y-2">
            <div className="text-5xl qr-bounce">{isPlanDone ? "🏆" : "⭐"}</div>
            <h2 className="font-black text-lg" style={{ color: GOLD }}>
              {isPlanDone ? "Plan Complete! أحسنت 🎉" : `Page ${currentPage} Complete!`}
            </h2>
            <p className="text-xs" style={{ color: "#7aad90" }}>
              {isPlanDone
                ? "You have completed the entire revision plan. بارك الله فيك!"
                : "Page signed ✓ — ready for the next page"}
            </p>
          </div>

          <div className="rounded-2xl p-4 text-center" style={{ background: GOLD + "15", border: `1px solid ${GOLD}33` }}>
            <div className="text-2xl font-black" style={{ color: GOLD }}>+{earnedXP} XP</div>
            <p className="text-xs" style={{ color: "#d4c08a" }}>Revision Points Earned</p>
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4 text-center" style={{ background: sc.bg, border: `1.5px solid ${sc.border}` }}>
                <div className="text-2xl font-black" style={{ color: sc.text }}>{stats.score}%</div>
                <p className="text-xs font-bold" style={{ color: sc.text + "aa" }}>Recitation</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: excSc.bg, border: `1.5px solid ${excSc.border}` }}>
                <div className="text-2xl font-black" style={{ color: excSc.text }}>{stats.exerciseScore}%</div>
                <p className="text-xs font-bold" style={{ color: excSc.text + "aa" }}>Exercise</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <div className="text-2xl font-black" style={{ color: GOLD }}>{stats.attempts}</div>
                <p className="text-xs font-bold" style={{ color: "#7aad90" }}>Attempts</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <div className="text-2xl font-black" style={{ color: GOLD }}>{fmtTime(stats.timeSeconds)}</div>
                <p className="text-xs font-bold" style={{ color: "#7aad90" }}>Time</p>
              </div>
            </div>
          )}

          {!isPlanDone ? (
            <>
              {/* Attempts progress — 3 required */}
              <div style={{ borderRadius: 14, padding: "12px 14px",
                background: recitationAttempts >= 3 ? "#16a34a18" : "#ffffff08",
                border: `1px solid ${recitationAttempts >= 3 ? "#16a34a44" : GOLD + "22"}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: recitationAttempts >= 3 ? "#16a34a" : GOLD }}>
                    {recitationAttempts >= 3 ? "✅ 3 attempts complete — ready!" : `Attempt ${recitationAttempts}/3 — revise ${3 - recitationAttempts} more time${3 - recitationAttempts !== 1 ? "s" : ""}`}
                  </span>
                  <span style={{ fontSize: 10, color: "#7aad90" }}>{recitationAttempts}/3</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#1a3025", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, transition: "width .4s",
                    width: `${Math.min(100, (recitationAttempts / 3) * 100)}%`,
                    background: recitationAttempts >= 3
                      ? "linear-gradient(to right,#16a34a,#22c55e)"
                      : `linear-gradient(to right,${GOLD},${GOLD_LIGHT})` }} />
                </div>
              </div>
              {recitationAttempts < 3 ? (
                <button onClick={() => { setStage("reciting"); setEvalResult(null); setAyahErrors([]); setPageVisible(true); }}
                  className="w-full py-4 rounded-2xl font-black text-sm qr-btn"
                  style={{ background: `linear-gradient(135deg,${DG},${DG2})`,
                    color: GOLD, border: `2px solid ${GOLD}44` }}>
                  🔄 Revise Again ({recitationAttempts}/3)
                </button>
              ) : (
                <button onClick={nextPage}
                  className="w-full py-4 rounded-2xl font-black text-sm qr-btn"
                  style={{ background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color: DG }}>
                  Next Page →
                </button>
              )}
            </>
          ) : (
            <button onClick={() => {
              setPlan(null); setSelected([]); setCompletedPages(new Set());
              if (userId) {
                localStorage.removeItem(`revision_plan_${userId}`);
                localStorage.removeItem(`revision_done_${userId}`);
              }
              setStage("setup");
            }}
              className="w-full py-4 rounded-2xl font-black text-sm qr-btn"
              style={{ background: `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, color: DG }}>
              🔄 Start New Revision Plan
            </button>
          )}

          <button onClick={() => setStage("setup")}
            className="w-full text-xs py-2" style={{ color: "#4a6d58" }}>
            ← Back to Setup
          </button>
        </div>
      </div>
    );
  }

  return null;
}
