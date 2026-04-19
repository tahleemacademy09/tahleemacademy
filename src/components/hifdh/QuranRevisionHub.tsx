// src/components/hifdh/QuranRevisionHub.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  Comprehensive Quran Revision System — Tahleem Academy
//  Flow: Setup → Recite → Evaluate → Remediate → Exercise → Complete
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Mic, MicOff, Play, Pause, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, AlertTriangle, RotateCcw, BookOpen,
  Award, Clock, Flame, Star, Loader2, Volume2, Check, X,
  RefreshCw, Headphones, Brain, Trophy, Eye, EyeOff,
  SkipForward, Zap, Target, BarChart3, Moon, Sparkles,
  BookMarked, Hash, List
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS & THEME
// ═══════════════════════════════════════════════════════════════════════

const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e8c97a";
const DG         = "#0f2d1f";   // dark green
const DG2        = "#1a4030";
const PARCHMENT  = "#fdf6e3";
const PARCH2     = "#f5eed8";
const INK        = "#1c1208";
const PASS_SCORE = 75;          // minimum to proceed from recitation
const EXERCISE_PASS = 70;       // minimum to pass exercise

// Standard Madani mushaf: juz → [startPage, endPage]
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
  const nums = Object.keys(SURAH_START).map(Number).sort((a,b)=>a-b);
  for (let i = 0; i < nums.length; i++) {
    const s = nums[i];
    const next = nums[i + 1];
    ends[s] = next ? SURAH_START[next] - 1 : 604;
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
  { id: "ar.alafasy",            name: "مشاري العفاسي" },
  { id: "ar.abdurrahmaansudais", name: "السديس"         },
  { id: "ar.husary",             name: "الحصري"         },
  { id: "ar.shaatri",            name: "الشاطري"        },
  { id: "ar.abdulsamad",         name: "عبد الصمد"      },
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
  ayah: any;          // full ayah object from alquran.cloud
  missing: string[];  // words that were missing
  wrong: string[];    // words that were wrong
  mastered: boolean;
  remediationScore: number;
}

interface ExerciseQ {
  ayah: any;
  displayText: string;    // first portion to show
  missingText: string;    // what they must complete
  options: string[];      // 3 choices
  correctIdx: number;
  answered: number | null;
  isPrevPage: boolean;    // is this from previous page (for context)
}

interface SessionStats {
  pageNum: number;
  score: number;
  attempts: number;
  wordResults: WordResult[];
  errorCount: number;
  timeSeconds: number;
  exerciseScore: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

const toAr = (n: number) => String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

function stripDiacritics(t: string) {
  return t.replace(/[\u064B-\u065F\u0670\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "");
}

function compareWords(refText: string, gotText: string): WordResult[] {
  const refWords = stripDiacritics(refText).split(/\s+/).filter(Boolean);
  const gotWords = stripDiacritics(gotText).split(/\s+/).filter(Boolean);
  const results: WordResult[] = [];
  const usedGot = new Set<number>();

  for (const rw of refWords) {
    let found = false;
    for (let i = 0; i < gotWords.length; i++) {
      if (usedGot.has(i)) continue;
      const gw = gotWords[i];
      const match =
        rw === gw ||
        (rw.length > 3 && gw.length > 3 &&
          (rw.startsWith(gw.slice(0, 3)) || gw.startsWith(rw.slice(0, 3))));
      if (match) {
        results.push({ word: rw, status: "correct" });
        usedGot.add(i);
        found = true;
        break;
      }
    }
    if (!found) results.push({ word: rw, status: "missing" });
  }
  return results;
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

// Generate exercise questions from ayahs
function makeExercise(currentAyahs: any[], prevAyahs: any[]): ExerciseQ[] {
  const questions: ExerciseQ[] = [];
  const allAyahs = [...currentAyahs];

  // Pick 4 from current + 1 from prev
  const picks = allAyahs.filter(a => a.text.split(" ").length >= 5);
  const shuffled = picks.sort(() => Math.random() - 0.5).slice(0, 4);
  const prevPicks = prevAyahs.filter(a => a.text.split(" ").length >= 5)
                             .sort(() => Math.random() - 0.5).slice(0, 1);

  const toQuestion = (ayah: any, isPrev: boolean): ExerciseQ => {
    const words = ayah.text.split(/\s+/).filter(Boolean);
    // Show first 40-60% of the verse
    const cutoff = Math.max(2, Math.floor(words.length * (0.4 + Math.random() * 0.2)));
    const shown   = words.slice(0, cutoff).join(" ");
    const missing = words.slice(cutoff).join(" ");

    // Build 3 options: correct + 2 decoys from other ayahs
    const decoys = allAyahs
      .filter(a => a.number !== ayah.number && a.text.split(" ").length >= 4)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map(a => {
        const ws = a.text.split(/\s+/);
        const dc = Math.max(2, Math.floor(ws.length * 0.4));
        return ws.slice(dc).join(" ");
      });

    // Ensure 3 unique options
    while (decoys.length < 2) decoys.push("...");
    const correctIdx = Math.floor(Math.random() * 3);
    const opts = [...decoys.slice(0, 2)];
    opts.splice(correctIdx, 0, missing);

    return { ayah, displayText: shown, missingText: missing, options: opts, correctIdx, answered: null, isPrevPage: isPrev };
  };

  for (const a of shuffled) questions.push(toQuestion(a, false));
  for (const a of prevPicks) questions.push(toQuestion(a, true));

  return questions;
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface Props { userId: string | null; }

export default function QuranRevisionHub({ userId }: Props) {
  // ── Stage ──
  const [stage, setStage] = useState<Stage>("setup");

  // ── Setup ──
  const [selectMode, setSelectMode] = useState<SelectMode>("juz");
  const [selected, setSelected]     = useState<number[]>([]);
  const [dailyPages, setDailyPages] = useState<number>(1);

  // ── Plan ──
  const [plan, setPlan]           = useState<RevisionPlan | null>(null);
  const [completedPages, setCompletedPages] = useState<Set<number>>(new Set());

  // ── Page data ──
  const [pageData, setPageData]   = useState<any>(null);
  const [prevPageData, setPrevPageData] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [reciter, setReciter]     = useState("ar.alafasy");
  const [fontSize, setFontSize]   = useState(24);
  const [showFullPage, setShowFullPage] = useState(false);

  // ── Audio ──
  const audioRef     = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]     = useState<number | null>(null); // absolute ayah num
  const [pagePlayIdx, setPagePlayIdx] = useState(-1); // -1 = not playing page

  // ── Recording ──
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime]     = useState(0);
  const [recTarget, setRecTarget] = useState<"page" | "ayah">("page"); // what are we recording
  const [recAyahNum, setRecAyahNum] = useState<number | null>(null);
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const recChunksRef  = useRef<Blob[]>([]);
  const recTimerRef   = useRef<any>(null);

  // ── Evaluation ──
  const [evaluating, setEvaluating]   = useState(false);
  const [evalResult, setEvalResult]   = useState<{
    score: number; words: WordResult[]; transcript: string; feedback: string;
  } | null>(null);
  const [ayahErrors, setAyahErrors]   = useState<AyahError[]>([]);
  const [recitationAttempts, setRecitationAttempts] = useState(0);

  // ── Remediation ──
  const [remediationIdx, setRemediationIdx] = useState(0);
  const [remRecording, setRemRecording]   = useState(false);
  const [remRecTime, setRemRecTime]       = useState(0);
  const remMediaRef  = useRef<MediaRecorder | null>(null);
  const remChunksRef = useRef<Blob[]>([]);
  const remTimerRef  = useRef<any>(null);
  const [remEvaluating, setRemEvaluating] = useState(false);

  // ── Exercise ──
  const [exercises, setExercises]   = useState<ExerciseQ[]>([]);
  const [exIdx, setExIdx]           = useState(0);
  const [exScore, setExScore]       = useState(0);
  const [exAnswered, setExAnswered] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [exReveal, setExReveal]     = useState(false);

  // ── Session ──
  const [sessionStart, setSessionStart] = useState<number>(Date.now());
  const [finalStats, setFinalStats]     = useState<SessionStats | null>(null);

  // ── Streaks / XP ──
  const [earnedXP, setEarnedXP] = useState(0);

  const pageDataRef = useRef<any>(null);
  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);

  // ═══════════════════════════════════
  //  Load saved plan
  // ═══════════════════════════════════
  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(`revision_plan_${userId}`);
    if (saved) {
      try {
        const p: RevisionPlan = JSON.parse(saved);
        setPlan(p);
        setSelectMode(p.mode);
        setSelected(p.selected);
        setDailyPages(p.dailyPages);
      } catch { /* ignore */ }
    }
    const done = localStorage.getItem(`revision_done_${userId}`);
    if (done) {
      try { setCompletedPages(new Set(JSON.parse(done))); } catch { /* ignore */ }
    }
  }, [userId]);

  // ═══════════════════════════════════
  //  Fetch page
  // ═══════════════════════════════════
  const fetchPage = useCallback(async (pageNum: number) => {
    setPageLoading(true);
    setPageData(null);
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/page/${pageNum}/ar.uthmani`);
      const j = await r.json();
      if (j?.code === 200) setPageData(j.data);
    } finally {
      setPageLoading(false);
    }
  }, []);

  const fetchPrevPage = useCallback(async (pageNum: number) => {
    if (pageNum <= 1) return;
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/page/${pageNum - 1}/ar.uthmani`);
      const j = await r.json();
      if (j?.code === 200) setPrevPageData(j.data);
    } catch { /* ignore */ }
  }, []);

  // ═══════════════════════════════════
  //  Audio control
  // ═══════════════════════════════════
  const playAyah = useCallback((absNum: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = `https://cdn.islamic.network/quran/audio/128/${reciter}/${absNum}.mp3`;
    audio.load();
    audio.play().catch(() => {});
    setPlaying(absNum);
  }, [reciter]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const ayahs = pageDataRef.current?.ayahs;
      if (!ayahs || pagePlayIdx < 0) { setPlaying(null); return; }
      const next = pagePlayIdx + 1;
      if (next < ayahs.length) {
        setPagePlayIdx(next);
        playAyah(ayahs[next].number);
      } else {
        setPagePlayIdx(-1);
        setPlaying(null);
      }
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", () => setPlaying(null));
    return () => { audio.removeEventListener("ended", onEnded); };
  }, [pagePlayIdx, playAyah]);

  const playPage = useCallback(() => {
    const ayahs = pageData?.ayahs;
    if (!ayahs?.length) return;
    setPagePlayIdx(0);
    playAyah(ayahs[0].number);
  }, [pageData, playAyah]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(null);
    setPagePlayIdx(-1);
  }, []);

  // ═══════════════════════════════════
  //  Recording — page
  // ═══════════════════════════════════
  const startRecording = async (target: "page" | "ayah" = "page", ayahNum?: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mime || "audio/webm" });
        if (target === "ayah" && ayahNum != null) runAyahEvaluation(blob, ayahNum);
        else runPageEvaluation(blob);
      };
      mr.start(200);
      mediaRecRef.current = mr;
      setRecording(true);
      setRecTarget(target);
      setRecAyahNum(ayahNum ?? null);
      setRecTime(0);
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch (e) {
      alert("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    mediaRecRef.current?.stop();
    setRecording(false);
  };

  // ═══════════════════════════════════
  //  AI Evaluation — full page
  // ═══════════════════════════════════
  const runPageEvaluation = async (blob: Blob) => {
    setStage("evaluating");
    setEvaluating(true);
    setEvalResult(null);
    try {
      const transcript = await transcribeAudio(blob);
      if (!transcript) { setEvaluating(false); return; }

      const ayahs = pageDataRef.current?.ayahs ?? [];
      const refText = ayahs.map((a: any) => a.text).join(" ");
      const wordResults = compareWords(refText, transcript);

      const correct = wordResults.filter(w => w.status === "correct").length;
      const score   = Math.round((correct / Math.max(1, wordResults.length)) * 100);

      // Find which ayahs have errors
      const errors: AyahError[] = [];
      for (const ayah of ayahs) {
        const ayahRef = ayah.text;
        const ayahWords = stripDiacritics(ayahRef).split(/\s+/).filter(Boolean);
        const refNorm = stripDiacritics(refText);
        const gotNorm = stripDiacritics(transcript);
        // Simple check: see if this ayah's words appear in transcript
        const missing: string[] = [];
        const wrong: string[]   = [];
        for (const w of ayahWords) {
          if (!gotNorm.includes(w.slice(0, Math.max(3, w.length - 1)))) missing.push(w);
        }
        if (missing.length > 0) errors.push({ ayah, missing, wrong, mastered: false, remediationScore: 0 });
      }

      // Get AI feedback
      const feedback = await getAIFeedback(refText, transcript, score);

      setEvalResult({ score, words: wordResults, transcript, feedback });
      setAyahErrors(errors);
      setRecitationAttempts(a => a + 1);

      // Save session
      if (userId && plan) {
        try {
          await (supabase as any).from("hifdh_revision_sessions").insert({
            student_id: userId,
            page_number: plan.allPages[plan.currentIdx],
            score,
            stage: "recitation",
            word_results: wordResults,
            transcript,
            duration_seconds: recTime,
            created_at: new Date().toISOString(),
          });
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  // ═══════════════════════════════════
  //  AI Evaluation — single ayah (remediation)
  // ═══════════════════════════════════
  const runAyahEvaluation = async (blob: Blob, ayahNum: number) => {
    setRemEvaluating(true);
    try {
      const transcript = await transcribeAudio(blob);
      if (!transcript) { setRemEvaluating(false); return; }

      const ayah = pageDataRef.current?.ayahs?.find((a: any) => a.number === ayahNum);
      if (!ayah) { setRemEvaluating(false); return; }

      const wordResults = compareWords(ayah.text, transcript);
      const correct = wordResults.filter(w => w.status === "correct").length;
      const score   = Math.round((correct / Math.max(1, wordResults.length)) * 100);

      // Update mastered status
      setAyahErrors(prev => prev.map(ae =>
        ae.ayah.number === ayahNum
          ? { ...ae, mastered: score >= 70, remediationScore: Math.max(ae.remediationScore, score) }
          : ae
      ));
    } catch (e) {
      console.error(e);
    } finally {
      setRemEvaluating(false);
    }
  };

  // ═══════════════════════════════════
  //  Transcription via Groq
  // ═══════════════════════════════════
  const transcribeAudio = async (blob: Blob): Promise<string> => {
    const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
    if (groqKey) {
      try {
        const fd = new FormData();
        fd.append("file", new File([blob], "recitation.webm", { type: blob.type || "audio/webm" }));
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("response_format", "text");
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: fd,
        });
        if (r.ok) return (await r.text()).trim();
      } catch { /* fall through */ }
    }
    // Fallback: Supabase edge function
    try {
      const b64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });
      const { data } = await supabase.functions.invoke("transcribe-hifdh", {
        body: { audio: b64, mimeType: blob.type || "audio/webm" },
      });
      return data?.text ?? "";
    } catch {
      return "";
    }
  };

  // ═══════════════════════════════════
  //  Get AI Feedback via Claude
  // ═══════════════════════════════════
  const getAIFeedback = async (refText: string, gotText: string, score: number): Promise<string> => {
    const key = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;
    if (!key) return score >= PASS_SCORE ? "Good recitation! Keep it up." : "Review the highlighted words and try again.";
    try {
      const prompt = `You are an expert Quran teacher evaluating a student's memorization recitation.

Reference (correct text): "${refText.slice(0, 500)}"
Student recited: "${gotText.slice(0, 500)}"
Accuracy score: ${score}%

In 2-3 short sentences, give encouraging but honest feedback in English about:
1. What they did well
2. Key mistakes to focus on
3. One specific tajweed tip if relevant

Keep it brief, warm, and motivating.`;

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
          max_tokens: 150,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        return d.content?.[0]?.text ?? "";
      }
    } catch { /* ignore */ }
    return score >= PASS_SCORE ? "Excellent recitation! Continue to the exercise." : "Practice the highlighted verses and try again.";
  };

  // ═══════════════════════════════════
  //  Build exercise
  // ═══════════════════════════════════
  const buildExercise = useCallback(() => {
    const current = pageData?.ayahs ?? [];
    const prev    = prevPageData?.ayahs ?? [];
    // Prioritize ayahs with errors
    const errorNums = new Set(ayahErrors.map(e => e.ayah.number));
    const priority  = current.filter((a: any) => errorNums.has(a.number));
    const rest      = current.filter((a: any) => !errorNums.has(a.number));
    const pool      = [...priority, ...rest].filter((a: any) => a.text.split(" ").length >= 5);
    setExercises(makeExercise(pool, prev));
    setExIdx(0);
    setExScore(0);
    setExAnswered(0);
    setShowAnswer(false);
    setExReveal(false);
  }, [pageData, prevPageData, ayahErrors]);

  // ═══════════════════════════════════
  //  Exercise answer
  // ═══════════════════════════════════
  const answerExercise = (idx: number) => {
    const q = exercises[exIdx];
    if (!q || q.answered !== null) return;
    setExercises(prev =>
      prev.map((q2, i) => i === exIdx ? { ...q2, answered: idx } : q2)
    );
    setExAnswered(a => a + 1);
    if (idx === q.correctIdx) setExScore(s => s + 1);
    setShowAnswer(true);
  };

  const nextExercise = () => {
    setShowAnswer(false);
    setExReveal(false);
    if (exIdx + 1 < exercises.length) setExIdx(i => i + 1);
    else finishExercise();
  };

  const finishExercise = () => {
    const score = Math.round((exScore / Math.max(1, exercises.length)) * 100);
    const elapsed = Math.round((Date.now() - sessionStart) / 1000);
    const currentPage = plan!.allPages[plan!.currentIdx];

    const stats: SessionStats = {
      pageNum: currentPage,
      score: evalResult?.score ?? 0,
      attempts: recitationAttempts,
      wordResults: evalResult?.words ?? [],
      errorCount: ayahErrors.length,
      timeSeconds: elapsed,
      exerciseScore: score,
    };
    setFinalStats(stats);

    if (score >= EXERCISE_PASS) {
      // Mark page complete
      const newDone = new Set(completedPages);
      newDone.add(currentPage);
      setCompletedPages(newDone);
      if (userId) {
        localStorage.setItem(`revision_done_${userId}`, JSON.stringify(Array.from(newDone)));
        (supabase as any).from("hifdh_revision_progress").upsert({
          user_id: userId,
          page_number: currentPage,
          completed: true,
          best_score: evalResult?.score ?? 0,
          exercise_score: score,
          completed_at: new Date().toISOString(),
        }, { onConflict: "user_id,page_number" }).then(() => {});
      }
      const xp = 50 + (evalResult?.score ?? 0) + score;
      setEarnedXP(xp);
      setStage("complete");
    } else {
      // Retry exercise
      buildExercise();
    }
  };

  // ═══════════════════════════════════
  //  Move to next page
  // ═══════════════════════════════════
  const nextPage = () => {
    if (!plan) return;
    const nextIdx = plan.currentIdx + 1;
    if (nextIdx >= plan.allPages.length) {
      // Plan complete!
      setStage("complete");
      return;
    }
    const updated: RevisionPlan = { ...plan, currentIdx: nextIdx };
    setPlan(updated);
    if (userId) localStorage.setItem(`revision_plan_${userId}`, JSON.stringify(updated));
    setStage("reciting");
    setEvalResult(null);
    setAyahErrors([]);
    setRecitationAttempts(0);
    setSessionStart(Date.now());
    fetchPage(updated.allPages[nextIdx]);
    fetchPrevPage(updated.allPages[nextIdx]);
  };

  // ═══════════════════════════════════
  //  Remediation recording
  // ═══════════════════════════════════
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
        const blob = new Blob(remChunksRef.current, { type: mime || "audio/webm" });
        runAyahEvaluation(blob, ayahNum);
      };
      mr.start(200);
      remMediaRef.current = mr;
      setRemRecording(true);
      setRemRecTime(0);
      remTimerRef.current = setInterval(() => setRemRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };

  const stopRemRecording = () => {
    if (remTimerRef.current) clearInterval(remTimerRef.current);
    remMediaRef.current?.stop();
    setRemRecording(false);
  };

  // ════════════════════════════════════════════════════════
  //  RENDER — CSS
  // ════════════════════════════════════════════════════════
  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap');

    .qr-mushaf { font-family:'Amiri Quran','Scheherazade New','Amiri',serif; direction:rtl; line-height:2.8; color:${INK}; }
    .qr-arabic { font-family:'Amiri',serif; direction:rtl; }
    .qr-active { background:${GOLD}30; border-radius:3px; outline:2px solid ${GOLD}80; }
    .qr-missing { background:#fee2e2; border-radius:3px; color:#dc2626; }
    .qr-correct { background:#dcfce7; border-radius:3px; color:#16a34a; }
    .qr-wrong   { background:#fef9c3; border-radius:3px; color:#854d0e; }

    .qr-nameplate {
      margin:8px 0 4px; padding:5px 16px;
      background:linear-gradient(to right,transparent,${GOLD}22,${GOLD}44,${GOLD}22,transparent);
      border-top:1.5px solid ${GOLD}99; border-bottom:1.5px solid ${GOLD}99;
      text-align:center; font-family:'Amiri',serif; direction:rtl;
      color:${DG}; font-size:1.05em; font-weight:700;
    }
    .qr-bismillah {
      font-family:'Amiri Quran','Amiri',serif; direction:rtl; text-align:center;
      color:${INK}; margin:4px 0 10px; line-height:2;
    }
    .qr-frame {
      background:${PARCHMENT}; border:2px solid ${GOLD}88; position:relative; border-radius:4px;
    }
    .qr-frame::before {
      content:''; position:absolute; inset:7px; border:1px solid ${GOLD}44;
      border-radius:2px; pointer-events:none; z-index:1;
    }
    .qr-btn { transition:transform 0.1s, opacity 0.12s; }
    .qr-btn:active { transform:scale(0.88); }

    @keyframes qr-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    @keyframes qr-shimmer {
      0%{background-position:-200% 0} 100%{background-position:200% 0}
    }
    @keyframes qr-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes qr-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes qr-spin { to{transform:rotate(360deg)} }
    .qr-pulse  { animation:qr-pulse 1.6s ease-in-out infinite; }
    .qr-bounce { animation:qr-bounce 0.9s ease-in-out infinite; }
    .qr-fadein { animation:qr-fadein 0.35s ease-out forwards; }
    .qr-spin   { animation:qr-spin 1s linear infinite; }
    .qr-shimmer {
      background:linear-gradient(90deg,${DG} 25%,${DG2} 50%,${DG} 75%);
      background-size:200% 100%; animation:qr-shimmer 1.5s infinite;
    }
    .qr-geo {
      background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0 L40 20 L20 40 L0 20z' fill='none' stroke='%23c9a84c' stroke-width='0.5' stroke-opacity='0.18'/%3E%3C/svg%3E");
      background-size:40px 40px;
    }
  `;

  const pageAyahs  = pageData?.ayahs ?? [];
  const surahGroups = groupBySurah(pageAyahs);
  const currentPage = plan?.allPages[plan.currentIdx] ?? 1;
  const juzNum     = pageAyahs[0]?.juz ?? 1;
  const totalPages  = plan?.allPages.length ?? 0;

  // ════════════════════════════════════════════════════════
  //  RENDER — SETUP
  // ════════════════════════════════════════════════════════
  if (stage === "setup") {
    const dailyOptions = [
      { val: 0.5, ar: "نصف صفحة", en: "Half page" },
      { val: 1,   ar: "صفحة",     en: "1 page"    },
      { val: 2,   ar: "صفحتان",   en: "2 pages"   },
      { val: 3,   ar: "ثلاث صفحات", en: "3 pages" },
    ];

    const canStart = selected.length > 0;

    const handleStart = () => {
      const pages = buildPages(selectMode, selected);
      const chunkSize = dailyPages >= 1 ? Math.ceil(dailyPages) : 1;
      // For sub-page amounts, just do 1 page per session
      const newPlan: RevisionPlan = {
        mode: selectMode,
        selected,
        dailyPages,
        allPages: pages,
        currentIdx: 0,
      };
      setPlan(newPlan);
      if (userId) localStorage.setItem(`revision_plan_${userId}`, JSON.stringify(newPlan));
      setSessionStart(Date.now());
      fetchPage(pages[0]);
      fetchPrevPage(pages[0]);
      setStage("reciting");
    };

    return (
      <div className="h-full overflow-y-auto qr-geo" style={{ background: `linear-gradient(160deg,${DG} 0%,#0b1a12 100%)` }}>
        <style>{globalCSS}</style>

        {/* Header */}
        <div className="px-5 pt-6 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <BookMarked size={18} style={{ color: GOLD }} />
            <span className="font-black text-sm tracking-wider uppercase" style={{ color: GOLD }}>Quran Revision</span>
          </div>
          <p className="text-xs" style={{ color: "#7aad90" }}>مراجعة المحفوظ — Review what you've memorised</p>
        </div>

        <div className="px-4 pb-8 space-y-4">

          {/* Existing plan resume */}
          {plan && (
            <div className="rounded-2xl overflow-hidden border qr-fadein" style={{ borderColor: GOLD+"44" }}>
              <div className="px-4 py-3" style={{ background: GOLD+"22" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: GOLD }}>📋 Active Plan</span>
                  <button
                    onClick={() => {
                      setSessionStart(Date.now());
                      fetchPage(plan.allPages[plan.currentIdx]);
                      fetchPrevPage(plan.allPages[plan.currentIdx]);
                      setStage("reciting");
                    }}
                    className="text-xs font-black px-3 py-1.5 rounded-lg qr-btn"
                    style={{ background: GOLD, color: DG }}
                  >
                    Resume →
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "#adc9b8" }}>
                  {plan.mode === "juz" ? `Juz ${plan.selected.join(", ")}` :
                   plan.mode === "hizb" ? `Hizb ${plan.selected.join(", ")}` :
                   `${plan.selected.length} Surah(s)`} · Page {plan.allPages[plan.currentIdx]} / {plan.allPages.length} total
                </p>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a3025" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${Math.round((plan.currentIdx / Math.max(1, plan.allPages.length)) * 100)}%`,
                    background: `linear-gradient(to right,${GOLD},${GOLD_LIGHT})`,
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* Selection mode */}
          <div className="rounded-2xl p-4" style={{ background: "#ffffff0a", border: `1px solid ${GOLD}22` }}>
            <p className="text-xs font-bold mb-3" style={{ color: GOLD }}>📚 What to Revise</p>
            <div className="grid grid-cols-3 gap-2">
              {(["juz", "hizb", "surah"] as SelectMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setSelectMode(m); setSelected([]); }}
                  className="py-2.5 rounded-xl text-xs font-bold qr-btn"
                  style={{
                    background: selectMode === m ? GOLD : "#1a3025",
                    color: selectMode === m ? DG : "#7aad90",
                    border: selectMode === m ? "none" : `1px solid ${GOLD}22`,
                  }}
                >
                  {m === "juz" ? "بالجزء\nJuz" : m === "hizb" ? "بالحزب\nHizb" : "بالسورة\nSurah"}
                </button>
              ))}
            </div>

            {/* Selection grid */}
            <div className="mt-3 max-h-48 overflow-y-auto">
              {selectMode === "juz" && (
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({length:30},(_,i)=>i+1).map(j=>(
                    <button key={j} onClick={()=>setSelected(p=>p.includes(j)?p.filter(x=>x!==j):[...p,j])}
                      className="aspect-square rounded-lg text-xs font-bold qr-btn"
                      style={{ background:selected.includes(j)?GOLD:completedPages.has(JUZ_PAGES[j-1]?.[0])?"#16a34a22":"#1a3025",
                        color:selected.includes(j)?DG:completedPages.has(JUZ_PAGES[j-1]?.[0])?"#4ade80":"#7aad90",
                        border:selected.includes(j)?`none`:`1px solid ${GOLD}22` }}>
                      {toAr(j)}
                    </button>
                  ))}
                </div>
              )}
              {selectMode === "hizb" && (
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({length:60},(_,i)=>i+1).map(h=>(
                    <button key={h} onClick={()=>setSelected(p=>p.includes(h)?p.filter(x=>x!==h):[...p,h])}
                      className="aspect-square rounded-lg text-[10px] font-bold qr-btn"
                      style={{ background:selected.includes(h)?GOLD:"#1a3025",
                        color:selected.includes(h)?DG:"#7aad90",
                        border:`1px solid ${GOLD}22` }}>
                      {toAr(h)}
                    </button>
                  ))}
                </div>
              )}
              {selectMode === "surah" && (
                <div className="space-y-1">
                  {Object.entries(SURAHS_AR).map(([num, name]) => {
                    const n = Number(num);
                    return (
                      <button key={n} onClick={()=>setSelected(p=>p.includes(n)?p.filter(x=>x!==n):[...p,n])}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl qr-btn"
                        style={{ background:selected.includes(n)?GOLD+"33":"transparent",
                          border:`1px solid ${selected.includes(n)?GOLD+"88":GOLD+"15"}` }}>
                        <span className="text-xs font-bold qr-arabic" style={{color:selected.includes(n)?GOLD_LIGHT:"#7aad90"}}>{name}</span>
                        <span className="text-[10px]" style={{color:"#4a6d58"}}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selected.length > 0 && (
              <p className="text-xs mt-2 font-bold" style={{ color: GOLD }}>
                {selected.length} {selectMode}(s) selected · ~{buildPages(selectMode, selected).length} pages
              </p>
            )}
          </div>

          {/* Daily amount */}
          <div className="rounded-2xl p-4" style={{ background: "#ffffff0a", border: `1px solid ${GOLD}22` }}>
            <p className="text-xs font-bold mb-3" style={{ color: GOLD }}>⏱️ Daily Revision Amount</p>
            <div className="grid grid-cols-2 gap-2">
              {dailyOptions.map(o=>(
                <button key={o.val} onClick={()=>setDailyPages(o.val)}
                  className="py-3 rounded-xl qr-btn"
                  style={{ background:dailyPages===o.val?GOLD:"#1a3025",
                    border:dailyPages===o.val?"none":`1px solid ${GOLD}22` }}>
                  <div className="text-sm font-black qr-arabic" style={{color:dailyPages===o.val?DG:GOLD}}>{o.ar}</div>
                  <div className="text-[10px]" style={{color:dailyPages===o.val?DG+"99":"#4a6d58"}}>{o.en}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Start */}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-4 rounded-2xl font-black text-sm tracking-wide qr-btn"
            style={{ background:canStart?`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`:"#1a3025",
              color:canStart?DG:"#4a6d58", opacity:canStart?1:0.6 }}
          >
            {canStart ? "بسم الله — Start Revision ✨" : "Select content to revise"}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RENDER — RECITING
  // ════════════════════════════════════════════════════════
  if (stage === "reciting") {
    const progressPct = plan ? Math.round((plan.currentIdx / Math.max(1, plan.allPages.length)) * 100) : 0;
    const isPagePlaying = pagePlayIdx >= 0;

    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ background: "#0a0e0b" }}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{ display:"none" }} />

        {/* Header bar */}
        <div className="flex-none px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: GOLD+"33", background: DG }}>
          <button onClick={()=>setStage("setup")} className="p-1.5 rounded-lg qr-btn" style={{background:"#1a3025"}}>
            <ChevronLeft size={14} color={GOLD} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black" style={{ color: GOLD }}>
                Page {currentPage} · Juz {toAr(juzNum)}
              </span>
              <span className="text-[10px] rounded px-1.5 py-0.5 font-bold" style={{background:GOLD+"22",color:GOLD}}>
                {plan?.currentIdx + 1}/{totalPages}
              </span>
            </div>
            <div className="h-1 mt-1 rounded-full overflow-hidden" style={{background:"#1a3025"}}>
              <div className="h-full rounded-full" style={{width:`${progressPct}%`,background:GOLD,transition:"width 0.3s"}}/>
            </div>
          </div>

          {/* Reciter select */}
          <select value={reciter} onChange={e=>setReciter(e.target.value)}
            className="text-[9px] rounded px-1 py-1 outline-none"
            style={{background:"#1a3025",color:GOLD,border:`1px solid ${GOLD}22`}}>
            {RECITERS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {/* Font size */}
          <div className="flex items-center gap-1">
            <button onClick={()=>setFontSize(f=>Math.max(18,f-2))} className="w-6 h-6 rounded flex items-center justify-center qr-btn" style={{background:"#1a3025"}}>
              <span style={{color:GOLD,fontSize:10,fontWeight:900}}>A-</span>
            </button>
            <button onClick={()=>setFontSize(f=>Math.min(40,f+2))} className="w-6 h-6 rounded flex items-center justify-center qr-btn" style={{background:"#1a3025"}}>
              <span style={{color:GOLD,fontSize:12,fontWeight:900}}>A+</span>
            </button>
          </div>
        </div>

        {/* Mushaf */}
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2">
          {pageLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={28} className="qr-spin" style={{color:GOLD}}/>
              <p className="text-xs" style={{color:"#7aad90"}}>Loading page {currentPage}…</p>
            </div>
          ) : (
            <div className="qr-frame max-w-lg mx-auto shadow-2xl">
              {/* Page top border */}
              <div className="flex items-center justify-between px-4 py-2 border-b" style={{borderColor:GOLD+"44",background:`linear-gradient(to bottom,${GOLD}15,transparent)`}}>
                <span className="qr-arabic text-xs font-bold" style={{color:DG}}>{pageAyahs[0]?.surah?.nameAr ?? ""}</span>
                <span className="text-[10px] font-bold" style={{color:GOLD,fontFamily:"'Amiri',serif"}}>الجزء {toAr(juzNum)}</span>
                <span className="text-[9px]" style={{color:"#7a6030",fontFamily:"Georgia,serif"}}>{pageAyahs[0]?.surah?.englishName ?? ""}</span>
              </div>
              <div className="mx-4 h-px" style={{background:`linear-gradient(to right,transparent,${GOLD}88,transparent)`}}/>

              {/* Verses */}
              <div className="px-5 py-4">
                {surahGroups.map((g, gi) => {
                  const isNew = g.ayahs[0].numberInSurah === 1;
                  const showBism = isNew && g.surah.number !== 9 && g.surah.number !== 1;
                  return (
                    <div key={gi}>
                      {isNew && <div className="qr-nameplate">سورة {g.surah.nameAr}<small style={{display:"block",fontSize:"0.6em",color:"#7a6030",fontFamily:"Georgia,serif"}}>{g.surah.englishName} · {g.surah.numberOfAyahs} verses</small></div>}
                      {showBism && <div className="qr-bismillah" style={{fontSize:fontSize*0.82}}>بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>}
                      <p className="qr-mushaf" style={{fontSize}}>
                        {g.ayahs.map(a => (
                          <span key={a.number} onClick={()=>{stopAudio();playAyah(a.number);}}
                            className={cn("cursor-pointer transition-all rounded", playing===a.number && "qr-active")}>
                            {a.text}{" "}
                            <span style={{color:GOLD,fontFamily:"'Amiri',serif",fontSize:"0.65em"}}>۝{toAr(a.numberInSurah)}</span>{" "}
                          </span>
                        ))}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mx-4 h-px" style={{background:`linear-gradient(to right,transparent,${GOLD}88,transparent)`}}/>
              <div className="py-2.5 text-center" style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"0.8em"}}>
                ─── {toAr(currentPage)} ───
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex-none border-t px-3 py-2 space-y-2" style={{borderColor:GOLD+"33",background:DG}}>

          {/* Instructions */}
          {!recording && (
            <p className="text-center text-xs" style={{color:"#7aad90"}}>
              Listen first, then tap the mic to recite from memory
            </p>
          )}
          {recording && (
            <p className="text-center text-xs font-bold animate-pulse" style={{color:"#ef4444"}}>
              🔴 Recording… recite the full page from memory
            </p>
          )}

          <div className="flex items-center justify-center gap-3">
            {/* Play page */}
            <button
              onClick={isPagePlaying ? stopAudio : playPage}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold qr-btn"
              style={{background:isPagePlaying?"#1a3025":GOLD+"33", color:GOLD, border:`1px solid ${GOLD}44`}}>
              {isPagePlaying ? <><Square size={12} fill={GOLD}/> Stop</> : <><Headphones size={12}/> Listen</>}
            </button>

            {/* Main mic button */}
            <button
              onClick={recording ? stopRecording : ()=>startRecording("page")}
              disabled={evaluating}
              className={cn("w-16 h-16 rounded-full flex items-center justify-center shadow-lg qr-btn", recording && "qr-pulse")}
              style={{ background: recording ? "#dc2626" : `linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,
                boxShadow: recording ? "0 0 0 8px #dc262622" : `0 0 0 6px ${GOLD}22` }}>
              {recording ? <MicOff size={24} color="#fff" /> : <Mic size={24} color={DG} />}
            </button>

            {/* Timer */}
            {recording && (
              <div className="flex flex-col items-center">
                <span className="font-black tabular-nums" style={{color:"#ef4444",fontSize:16}}>{fmtTime(recTime)}</span>
                <span className="text-[9px]" style={{color:"#7a5050"}}>Recording</span>
              </div>
            )}
            {!recording && (
              <button
                onClick={()=>{stopAudio();setShowFullPage(f=>!f);}}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold qr-btn"
                style={{background:"#1a3025",color:"#7aad90",border:`1px solid ${GOLD}22`}}>
                {showFullPage ? <><EyeOff size={12}/> Hide</> : <><Eye size={12}/> Preview</>}
              </button>
            )}
          </div>

          {recording && (
            <div className="text-center">
              <button onClick={stopRecording}
                className="px-8 py-2.5 rounded-xl font-black text-xs qr-btn"
                style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,color:DG}}>
                ✓ Done — Submit for Evaluation
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RENDER — EVALUATING
  // ════════════════════════════════════════════════════════
  if (stage === "evaluating") {
    const result = evalResult;
    const sc = result ? scoreColor(result.score) : null;

    return (
      <div className="h-full overflow-y-auto" style={{background:`linear-gradient(160deg,${DG} 0%,#0b1a12 100%)`}}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{display:"none"}}/>

        {evaluating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center qr-shimmer">
              <Brain size={32} color={GOLD}/>
            </div>
            <p className="font-black text-sm" style={{color:GOLD}}>Analysing Your Recitation…</p>
            <p className="text-xs text-center" style={{color:"#7aad90"}}>
              AI is comparing your recitation with the reference text word by word
            </p>
            <div className="flex gap-1.5 mt-2">
              {[0,1,2].map(i=>(
                <div key={i} className="w-2 h-2 rounded-full" style={{
                  background:GOLD, animation:`qr-bounce 0.8s ${i*0.2}s ease-in-out infinite`
                }}/>
              ))}
            </div>
          </div>
        ) : result ? (
          <div className="px-4 py-5 space-y-4 qr-fadein">
            {/* Score */}
            <div className="rounded-2xl p-5 text-center" style={{background:sc!.bg, border:`2px solid ${sc!.border}`}}>
              <div className="text-5xl font-black mb-1" style={{color:sc!.text}}>{result.score}%</div>
              <div className="text-sm font-bold" style={{color:sc!.text}}>
                {result.score >= 85 ? "ممتاز — Excellent! 🌟" :
                 result.score >= 75 ? "جيد جداً — Very Good ✓" :
                 result.score >= 60 ? "جيد — Good, keep going 💪" :
                 result.score >= 40 ? "مقبول — Needs practice 📖" :
                 "يحتاج مراجعة — Needs more revision 🔄"}
              </div>
              <div className="flex justify-center gap-4 mt-3 text-xs" style={{color:sc!.text+"bb"}}>
                <span>✅ {result.words.filter(w=>w.status==="correct").length} correct</span>
                <span>❌ {result.words.filter(w=>w.status==="missing").length} missing</span>
              </div>
            </div>

            {/* AI Feedback */}
            {result.feedback && (
              <div className="rounded-2xl p-4" style={{background:GOLD+"15",border:`1px solid ${GOLD}33`}}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={13} style={{color:GOLD}}/>
                  <span className="text-xs font-black" style={{color:GOLD}}>Teacher Feedback</span>
                </div>
                <p className="text-xs leading-relaxed" style={{color:"#d4c08a"}}>{result.feedback}</p>
              </div>
            )}

            {/* Word analysis */}
            <div className="rounded-2xl p-4" style={{background:"#ffffff08",border:`1px solid ${GOLD}22`}}>
              <p className="text-xs font-black mb-3" style={{color:GOLD}}>Word-by-Word Analysis</p>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-xl" style={{background:PARCHMENT,direction:"rtl"}}>
                {result.words.filter(w=>w.status!=="wrong").map((w,i)=>(
                  <span key={i} className={cn("px-1.5 py-0.5 rounded text-sm font-semibold",
                    w.status==="correct"?"qr-correct":"qr-missing")}
                    style={{fontFamily:"'Amiri',serif"}}>
                    {w.word}
                  </span>
                ))}
              </div>
              <div className="flex gap-3 mt-2 text-[10px]" style={{color:"#7aad90"}}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:"#16a34a",display:"inline-block"}}/> Correct</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:"#dc2626",display:"inline-block"}}/> Missing/skipped</span>
              </div>
            </div>

            {/* Error verses list */}
            {ayahErrors.length > 0 && (
              <div className="rounded-2xl p-4" style={{background:"#fee2e215",border:"1px solid #dc262633"}}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={13} color="#dc2626"/>
                  <span className="text-xs font-black" style={{color:"#dc2626"}}>{ayahErrors.length} verse(s) with errors</span>
                </div>
                {ayahErrors.slice(0,3).map((ae,i)=>(
                  <div key={i} className="mb-2 p-2 rounded-lg" style={{background:"#ffffff08"}}>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={()=>playAyah(ae.ayah.number)} className="p-1 rounded qr-btn" style={{background:GOLD+"22"}}>
                        <Volume2 size={10} color={GOLD}/>
                      </button>
                      <span className="text-[10px]" style={{color:"#7aad90"}}>
                        {ae.ayah.surah?.nameAr} {toAr(ae.ayah.numberInSurah)}
                      </span>
                    </div>
                    <p className="text-xs qr-arabic leading-relaxed" style={{color:PARCHMENT,fontFamily:"'Amiri',serif",direction:"rtl",fontSize:14}}>
                      {ae.ayah.text}
                    </p>
                    <p className="text-[10px] mt-1" style={{color:"#dc2626"}}>
                      ❌ Missing: {ae.missing.slice(0,4).join("، ")}
                    </p>
                  </div>
                ))}
                {ayahErrors.length > 3 && <p className="text-[10px] text-center" style={{color:"#7aad90"}}>…and {ayahErrors.length-3} more</p>}
              </div>
            )}

            {/* Transcript */}
            {result.transcript && (
              <div className="rounded-2xl p-4" style={{background:"#ffffff08",border:`1px solid ${GOLD}22`}}>
                <p className="text-xs font-black mb-2" style={{color:GOLD}}>Your Recitation (transcribed)</p>
                <p className="text-sm qr-arabic leading-relaxed" style={{color:PARCHMENT+"bb",fontFamily:"'Amiri',serif",direction:"rtl",lineHeight:2}}>
                  {result.transcript}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              {result.score >= PASS_SCORE && ayahErrors.length === 0 ? (
                <button onClick={()=>{ buildExercise(); setStage("exercise"); }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                  style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,color:DG}}>
                  ✓ Good job! Proceed to Exercise →
                </button>
              ) : ayahErrors.length > 0 ? (
                <>
                  <button onClick={()=>{ setRemediationIdx(0); setStage("remediation"); }}
                    className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                    style={{background:`linear-gradient(135deg,#dc2626,#ef4444)`,color:"#fff"}}>
                    📖 Practise Error Verses ({ayahErrors.length})
                  </button>
                  {result.score >= PASS_SCORE && (
                    <button onClick={()=>{ buildExercise(); setStage("exercise"); }}
                      className="w-full py-3 rounded-2xl font-bold text-sm qr-btn"
                      style={{background:"#1a3025",color:GOLD,border:`1px solid ${GOLD}44`}}>
                      Skip Practice → Exercise
                    </button>
                  )}
                </>
              ) : (
                <button onClick={()=>{ setStage("reciting"); }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
                  style={{background:"#1a3025",color:GOLD,border:`1px solid ${GOLD}44`}}>
                  🔄 Try Again
                </button>
              )}
              <button onClick={()=>setStage("reciting")} className="w-full py-2.5 rounded-2xl text-xs font-bold qr-btn"
                style={{background:"transparent",color:"#4a6d58",border:`1px solid ${GOLD}15`}}>
                ← Back to Page
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RENDER — REMEDIATION
  // ════════════════════════════════════════════════════════
  if (stage === "remediation") {
    const errAyah = ayahErrors[remediationIdx];
    const masteredCount = ayahErrors.filter(e => e.mastered).length;
    const allMastered = ayahErrors.every(e => e.mastered);

    return (
      <div className="h-full flex flex-col overflow-hidden" style={{background:`linear-gradient(160deg,${DG} 0%,#0b1a12 100%)`}}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{display:"none"}}/>

        {/* Header */}
        <div className="flex-none px-4 py-3 border-b" style={{borderColor:GOLD+"33",background:DG}}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} color="#f59e0b"/>
            <span className="font-black text-sm" style={{color:"#f59e0b"}}>Error Practice</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{background:GOLD+"22",color:GOLD}}>
              {masteredCount}/{ayahErrors.length} mastered
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{background:"#1a3025"}}>
            <div className="h-full rounded-full transition-all" style={{
              width:`${Math.round((masteredCount/Math.max(1,ayahErrors.length))*100)}%`,
              background:`linear-gradient(to right,${GOLD},${GOLD_LIGHT})`
            }}/>
          </div>
        </div>

        {/* Ayah navigator */}
        <div className="flex-none px-4 py-2 flex gap-2 overflow-x-auto">
          {ayahErrors.map((ae, i) => (
            <button key={i} onClick={()=>setRemediationIdx(i)}
              className="flex-none w-8 h-8 rounded-full text-xs font-black qr-btn"
              style={{background:ae.mastered?"#16a34a":remediationIdx===i?GOLD:"#1a3025",
                color:ae.mastered?"#fff":remediationIdx===i?DG:"#7aad90",
                border:ae.mastered?"none":remediationIdx===i?"none":`1px solid ${GOLD}22`,
                boxShadow:remediationIdx===i?`0 0 0 3px ${GOLD}44`:"none"}}>
              {ae.mastered ? <Check size={12}/> : toAr(i+1)}
            </button>
          ))}
        </div>

        {errAyah && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

            {/* Verse display */}
            <div className="rounded-2xl overflow-hidden qr-frame">
              <div className="flex items-center justify-between px-4 py-2" style={{background:`linear-gradient(to bottom,${GOLD}15,transparent)`,borderBottom:`1px solid ${GOLD}33`}}>
                <span className="text-xs qr-arabic" style={{color:DG,fontWeight:700}}>{errAyah.ayah.surah?.nameAr}</span>
                <span className="text-xs" style={{color:GOLD,fontFamily:"'Amiri',serif"}}>آية {toAr(errAyah.ayah.numberInSurah)}</span>
              </div>
              <div className="px-6 py-5">
                <p className="qr-mushaf text-center leading-loose" style={{fontSize:fontSize}}>
                  {errAyah.ayah.text}{" "}
                  <span style={{color:GOLD,fontSize:"0.7em",fontFamily:"'Amiri',serif"}}>۝{toAr(errAyah.ayah.numberInSurah)}</span>
                </p>
              </div>
              <div className="px-6 pb-4">
                <p className="text-xs font-bold mb-1" style={{color:"#dc2626"}}>Words to focus on:</p>
                <div className="flex flex-wrap gap-1.5" style={{direction:"rtl"}}>
                  {errAyah.missing.map((w,i)=>(
                    <span key={i} className="qr-missing px-2 py-0.5 rounded-lg text-sm font-semibold" style={{fontFamily:"'Amiri',serif"}}>{w}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Mastered badge */}
            {errAyah.mastered && (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{background:"#16a34a22",border:"1px solid #16a34a55"}}>
                <CheckCircle2 size={20} color="#4ade80"/>
                <div>
                  <p className="text-xs font-black" style={{color:"#4ade80"}}>Verse Mastered! 🌟</p>
                  <p className="text-[10px]" style={{color:"#7aad90"}}>Score: {errAyah.remediationScore}%</p>
                </div>
              </div>
            )}

            {/* Remediation score */}
            {errAyah.remediationScore > 0 && !errAyah.mastered && (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{background:"#f59e0b22",border:"1px solid #f59e0b44"}}>
                <Target size={16} color="#f59e0b"/>
                <p className="text-xs" style={{color:"#f59e0b"}}>Last attempt: {errAyah.remediationScore}% — Need 70%+ to mark as mastered</p>
              </div>
            )}

            {/* Controls */}
            <div className="space-y-2">
              <button onClick={()=>playAyah(errAyah.ayah.number)}
                className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm qr-btn"
                style={{background:GOLD+"22",color:GOLD,border:`1px solid ${GOLD}44`}}>
                <Headphones size={14}/> Listen to Correct Recitation
              </button>

              {remEvaluating ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 size={18} className="qr-spin" style={{color:GOLD}}/>
                  <span className="text-xs" style={{color:"#7aad90"}}>Evaluating…</span>
                </div>
              ) : (
                <button
                  onClick={remRecording ? stopRemRecording : ()=>startRemRecording(errAyah.ayah.number)}
                  className={cn("w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 font-black text-sm qr-btn",
                    remRecording && "qr-pulse")}
                  style={{background:remRecording?"#dc2626":`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,
                    color:remRecording?"#fff":DG}}>
                  {remRecording ? (
                    <><MicOff size={16}/> Stop — {fmtTime(remRecTime)}</>
                  ) : (
                    <><Mic size={16}/> Record This Verse</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex-none px-4 py-3 border-t space-y-2" style={{borderColor:GOLD+"33",background:DG}}>
          <div className="flex gap-2">
            <button onClick={()=>setRemediationIdx(i=>Math.max(0,i-1))} disabled={remediationIdx===0}
              className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold qr-btn"
              style={{background:"#1a3025",color:GOLD,opacity:remediationIdx===0?0.4:1}}>
              <ChevronLeft size={14}/> Prev
            </button>
            {remediationIdx < ayahErrors.length - 1 ? (
              <button onClick={()=>setRemediationIdx(i=>i+1)}
                className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold qr-btn"
                style={{background:"#1a3025",color:GOLD}}>
                Next <ChevronRight size={14}/>
              </button>
            ) : (
              <button
                onClick={()=>{ buildExercise(); setStage("exercise"); }}
                className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-black qr-btn"
                style={{background:allMastered?`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`:GOLD+"44",
                  color:allMastered?DG:GOLD}}>
                {allMastered ? "Exercise →" : "Skip to Exercise →"}
              </button>
            )}
          </div>
          <button onClick={()=>setStage("evaluating")} className="w-full text-xs text-center py-1" style={{color:"#4a6d58"}}>
            ← Back to Results
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RENDER — EXERCISE
  // ════════════════════════════════════════════════════════
  if (stage === "exercise") {
    const q = exercises[exIdx];
    const progress = Math.round((exAnswered / Math.max(1, exercises.length)) * 100);

    return (
      <div className="h-full flex flex-col overflow-hidden" style={{background:`linear-gradient(160deg,#0b1020 0%,#0a0e0b 100%)`}}>
        <style>{globalCSS}</style>

        {/* Header */}
        <div className="flex-none px-4 py-3 border-b" style={{borderColor:GOLD+"33",background:"#0b1020"}}>
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} style={{color:GOLD}}/>
            <span className="font-black text-sm" style={{color:GOLD}}>Knowledge Exercise</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{background:GOLD+"22",color:GOLD}}>
              {exAnswered}/{exercises.length}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{background:"#1a1a2e"}}>
            <div className="h-full rounded-full transition-all" style={{
              width:`${progress}%`,
              background:`linear-gradient(to right,#6366f1,${GOLD})`
            }}/>
          </div>
        </div>

        {q ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 qr-fadein">

            {/* Question type badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{background:q.isPrevPage?"#6366f122":"#c9a84c22",
                  color:q.isPrevPage?"#a78bfa":GOLD}}>
                {q.isPrevPage ? "📎 Previous Page Review" : "📖 Complete the Verse"}
              </span>
              <span className="text-xs" style={{color:"#4a6d58"}}>Q{exIdx+1}</span>
            </div>

            {/* Verse beginning */}
            <div className="rounded-2xl p-5" style={{background:PARCHMENT,border:`2px solid ${GOLD}44`}}>
              <p className="qr-mushaf text-center leading-relaxed" style={{fontSize:fontSize-2}}>
                {q.displayText}{" "}
                <span className="inline-block px-3 py-0.5 rounded border-b-2 mx-1" style={{
                  borderColor:GOLD, background:GOLD+"15",
                  minWidth:60, color:GOLD, fontFamily:"'Amiri',serif"
                }}>
                  {exReveal ? q.missingText : "؟ ؟ ؟"}
                </span>
              </p>
            </div>

            {/* Hint button */}
            {!q.answered && (
              <button onClick={()=>setExReveal(r=>!r)}
                className="mx-auto flex items-center gap-1.5 text-xs qr-btn px-3 py-1.5 rounded-lg"
                style={{color:"#4a6d58",background:"#1a3025",border:`1px solid ${GOLD}15`}}>
                {exReveal ? <EyeOff size={11}/> : <Eye size={11}/>}
                {exReveal ? "Hide answer" : "Reveal hint"}
              </button>
            )}

            {/* Options */}
            <div className="space-y-2">
              <p className="text-xs font-bold" style={{color:"#7aad90"}}>Choose the correct continuation:</p>
              {q.options.map((opt, i) => {
                const answered = q.answered !== null;
                const isCorrect = i === q.correctIdx;
                const isChosen  = i === q.answered;
                let bg = "#1a1a2e", border = `1px solid ${GOLD}22`, textColor = "#adc9b8";
                if (answered && isCorrect) { bg = "#16a34a22"; border = "1px solid #16a34a66"; textColor = "#4ade80"; }
                if (answered && isChosen && !isCorrect) { bg = "#dc262622"; border = "1px solid #dc262666"; textColor = "#f87171"; }

                return (
                  <button key={i} onClick={()=>answered?null:answerExercise(i)}
                    disabled={answered}
                    className="w-full text-right p-4 rounded-2xl qr-arabic qr-btn transition-all"
                    style={{background:bg, border, color:textColor, direction:"rtl", fontSize:15, fontFamily:"'Amiri',serif", lineHeight:2}}>
                    <span className="flex items-start gap-2">
                      <span className="flex-none mt-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                        style={{background:answered&&isCorrect?"#16a34a":answered&&isChosen&&!isCorrect?"#dc2626":GOLD+"22",
                          color:answered&&isCorrect?"#fff":answered&&isChosen&&!isCorrect?"#fff":GOLD}}>
                        {answered && isCorrect ? <Check size={10}/> : answered && isChosen && !isCorrect ? <X size={10}/> : toAr(i+1)}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Post-answer feedback */}
            {showAnswer && q.answered !== null && (
              <div className={cn("rounded-2xl p-4 qr-fadein")}
                style={{background: q.answered===q.correctIdx?"#16a34a22":"#dc262622",
                  border:`1px solid ${q.answered===q.correctIdx?"#16a34a55":"#dc262255"}`}}>
                <div className="flex items-center gap-2 mb-2">
                  {q.answered===q.correctIdx ? <CheckCircle2 size={16} color="#4ade80"/> : <XCircle size={16} color="#f87171"/>}
                  <span className="text-xs font-black" style={{color:q.answered===q.correctIdx?"#4ade80":"#f87171"}}>
                    {q.answered===q.correctIdx ? "Correct! ما شاء الله 🌟" : "Incorrect — Review this verse"}
                  </span>
                </div>
                {q.answered !== q.correctIdx && (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold mb-1" style={{color:"#7aad90"}}>Correct answer:</p>
                    <button onClick={()=>playAyah(q.ayah.number)} className="flex items-center gap-1.5 text-xs qr-btn" style={{color:GOLD}}>
                      <Volume2 size={11}/> Listen to verse
                    </button>
                    <p className="qr-arabic mt-2 leading-loose" style={{fontFamily:"'Amiri',serif",direction:"rtl",color:PARCHMENT,fontSize:15}}>
                      {q.displayText} <span style={{color:GOLD_LIGHT}}>{q.missingText}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        {showAnswer && (
          <div className="flex-none px-4 py-3 border-t" style={{borderColor:GOLD+"33"}}>
            <button onClick={nextExercise}
              className="w-full py-3.5 rounded-2xl font-black text-sm qr-btn"
              style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,color:DG}}>
              {exIdx + 1 < exercises.length ? `Next Question (${exIdx+2}/${exercises.length}) →` : "Finish Exercise ✓"}
            </button>
          </div>
        )}

        <audio ref={audioRef} playsInline preload="none" style={{display:"none"}}/>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  RENDER — COMPLETE
  // ════════════════════════════════════════════════════════
  if (stage === "complete") {
    const stats = finalStats;
    const sc = stats ? scoreColor(stats.score) : scoreColor(0);
    const excSc = stats ? scoreColor(stats.exerciseScore) : scoreColor(0);
    const elapsed = stats?.timeSeconds ?? 0;
    const isPlanDone = plan ? plan.currentIdx >= plan.allPages.length - 1 : false;

    return (
      <div className="h-full overflow-y-auto qr-geo" style={{background:`linear-gradient(160deg,${DG} 0%,#0b1a12 100%)`}}>
        <style>{globalCSS}</style>
        <audio ref={audioRef} playsInline preload="none" style={{display:"none"}}/>

        <div className="px-4 pt-8 pb-8 space-y-4 qr-fadein">

          {/* Celebration */}
          <div className="text-center space-y-2">
            <div className="text-5xl qr-bounce">
              {isPlanDone ? "🏆" : "⭐"}
            </div>
            <h2 className="font-black text-lg" style={{color:GOLD}}>
              {isPlanDone ? "Plan Complete! أحسنت 🎉" : `Page ${currentPage} Completed!`}
            </h2>
            <p className="text-xs" style={{color:"#7aad90"}}>
              {isPlanDone
                ? `You have completed the entire revision plan. بارك الله فيك!`
                : `Page signed ✓ — ready for the next page`}
            </p>
          </div>

          {/* XP earned */}
          <div className="rounded-2xl p-4 text-center" style={{background:GOLD+"15",border:`1px solid ${GOLD}33`}}>
            <div className="text-2xl font-black" style={{color:GOLD}}>+{earnedXP} XP</div>
            <p className="text-xs" style={{color:"#d4c08a"}}>Revision Points Earned</p>
          </div>

          {/* Stats grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4 text-center" style={{background:sc.bg,border:`1.5px solid ${sc.border}`}}>
                <div className="text-2xl font-black" style={{color:sc.text}}>{stats.score}%</div>
                <p className="text-xs font-bold" style={{color:sc.text+"aa"}}>Recitation Score</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{background:excSc.bg,border:`1.5px solid ${excSc.border}`}}>
                <div className="text-2xl font-black" style={{color:excSc.text}}>{stats.exerciseScore}%</div>
                <p className="text-xs font-bold" style={{color:excSc.text+"aa"}}>Exercise Score</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{background:"#ffffff08",border:`1px solid ${GOLD}22`}}>
                <div className="text-2xl font-black" style={{color:GOLD}}>{stats.attempts}</div>
                <p className="text-xs font-bold" style={{color:"#7aad90"}}>Attempts</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{background:"#ffffff08",border:`1px solid ${GOLD}22`}}>
                <div className="text-2xl font-black" style={{color:GOLD}}>{fmtTime(elapsed)}</div>
                <p className="text-xs font-bold" style={{color:"#7aad90"}}>Time Spent</p>
              </div>
            </div>
          )}

          {/* Next action */}
          {!isPlanDone ? (
            <button onClick={nextPage}
              className="w-full py-4 rounded-2xl font-black text-sm qr-btn"
              style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,color:DG}}>
              Next Page (includes review of this page) →
            </button>
          ) : (
            <button onClick={()=>{
              setPlan(null);
              setSelected([]);
              setCompletedPages(new Set());
              if (userId) { localStorage.removeItem(`revision_plan_${userId}`); localStorage.removeItem(`revision_done_${userId}`); }
              setStage("setup");
            }}
              className="w-full py-4 rounded-2xl font-black text-sm qr-btn"
              style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`,color:DG}}>
              🔄 Start New Revision Plan
            </button>
          )}

          <button onClick={()=>setStage("setup")} className="w-full text-xs py-2" style={{color:"#4a6d58"}}>
            ← Back to Setup
          </button>
        </div>
      </div>
    );
  }

  return null;
}
