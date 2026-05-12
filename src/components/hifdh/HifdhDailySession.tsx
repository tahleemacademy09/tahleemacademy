// src/components/hifdh/HifdhDailySession.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full daily Hifdh session flow for students:
//
//  INTRO → READING (per page, 75% gate) → TESTING (MCQ, 75% gate) → COMPLETE
//
// • Page auto-advances each calendar/working day from assignment start date
//   regardless of whether the student completed the previous session
// • Recitation: Web Speech API (ar-SA) — attentive listening mode
// • Pass gate: 75% — student must re-read with encouragement if below
// • Testing: smart page-aware MCQ after passing all pages
// • Submission: writes hifdh_daily_logs + notifies assigned teacher/admin
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, MicOff, ChevronRight, CheckCircle2, AlertTriangle,
  Loader2, BookOpen, RefreshCcw, Trophy, Star,
  Volume2, Heart,
} from "lucide-react";

/* ── Palette ──────────────────────────────────────────────────────── */
const G    = "#1a3d24";
const GM   = "#276749";
const GOLD = "#c9a84c";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e8ddd0";
const INK  = "#1a1a1a";
const PASS_COLOR = "#16a34a";
const FAIL_COLOR = "#dc2626";
const PASS_THRESHOLD = 75;

/* ── Types ─────────────────────────────────────────────────────────── */
interface Ayah {
  numberInSurah: number;
  number: number;
  text: string;
  surah: { number: number; name: string; englishName: string };
}

interface Assignment {
  id: string;
  student_id: string;
  mode: "juz" | "hizb" | "surah";
  selected_items: number[];
  daily_pages: number;
  // Support both field name variants from different DB schemas
  program_start?: string;
  starts_on?: string;
  days_off?: number[];
  weekend_off?: boolean;
  notes?: string;
}

interface PageResult {
  pageNum: number;
  score: number;
  transcript: string;
  errorWords: string[];
  ayahs: Ayah[];
}

interface Question {
  id: number;
  type: "next_verse" | "missing_word";
  prompt: string;
  promptLabel: string;
  options: string[];
  correct: number;
  correctText: string;
}

type Phase =
  | "intro"
  | "reading"
  | "evaluating"
  | "page_result"
  | "testing"
  | "submitting"
  | "complete";

interface Props {
  assignment: Assignment;
  userId: string;
  onClose: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Returns the effective start date from the assignment, supporting both
 * "program_start" and "starts_on" field names stored by different admin RPCs.
 */
function getStartDate(a: Assignment): string | undefined {
  return a.program_start || a.starts_on || undefined;
}

/**
 * Returns the days-off array from the assignment, supporting both:
 * - "days_off": number[] (array of day-of-week indices 0=Sun…6=Sat)
 * - "weekend_off": boolean (true means Sunday=0 is off)
 */
function getDaysOff(a: Assignment): number[] {
  if (Array.isArray(a.days_off) && a.days_off.length >= 0) return a.days_off;
  if (a.weekend_off === true)  return [0];   // Sunday off
  if (a.weekend_off === false) return [];    // every day
  return [];
}

/**
 * Count working days elapsed from startDate up to (but not including) today.
 * Day 1 = the start date itself.
 * On the start date: elapsed = 0, so page = 1.
 * Next working day: elapsed = 1, page = 2. Etc.
 */
function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now   = new Date();
  now.setHours(0, 0, 0, 0); // compare at midnight to avoid time-of-day issues
  let count = 0;
  const cur = new Date(start);
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function normalizeAr(text: string): string {
  return text
    // Convert dagger alef \u0670 → regular Alef BEFORE stripping
    // (represents actual long-vowel 'a' in Uthmani script, e.g. عَٰقِبَتَهُمَا → عاقبتهما)
    .replace(/\u0670/g, "\u0627")
    .replace(/[\u064B-\u065F\u0610-\u061A]/g, "")
    // Normalise ALL Alef variants → plain Alef ا
    // \u0671 (Alef Wasla ٱ) was missing — appears on virtually every "ال" in ar.uthmani
    .replace(/[\u0671\u0622\u0623\u0625\u0627]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0640/g, "")
    // Strip Quranic stop/pause/ayah-end markers
    .replace(/[\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u06DD\u06DE]/g, "")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * Score the transcript against the expected ayahs.
 * Uses a generous prefix-match so slight recognition differences don't
 * devastate the score (Arabic STT on mobile is imperfect for Quran).
 */
function scoreText(transcript: string, ayahs: Ayah[], recitedSecs: number): number {
  const ref  = ayahs.map(a => a.text).join(" ");
  const refW = normalizeAr(ref).split(" ").filter(Boolean);
  const gotW = normalizeAr(transcript).split(" ").filter(Boolean);
  if (!refW.length) return 0;
  if (!gotW.length) {
    // Student spoke for >45s — give effort credit
    return recitedSecs >= 45 ? 40 : 0;
  }
  const used = new Set<number>();
  let matches = 0;
  for (const rw of refW) {
    const rPrefix = rw.slice(0, 4);
    for (let i = 0; i < gotW.length; i++) {
      if (used.has(i)) continue;
      const gw = gotW[i];
      if (
        rw === gw ||
        (rw.length >= 3 && gw.length >= 3 && rw.slice(0, 4) === gw.slice(0, 4)) ||
        (rw.length >= 5 && gw.length >= 5 && rPrefix === gw.slice(0, 4))
      ) {
        matches++;
        used.add(i);
        break;
      }
    }
  }
  const rawScore = Math.round((matches / refW.length) * 100);
  // Bonus: if student spoke for significant time, the STT may have missed words
  // Apply a small recitation-duration bonus (max +10) to account for STT gaps
  const durationBonus = recitedSecs >= 60 ? 10 : recitedSecs >= 30 ? 5 : 0;
  return Math.min(100, rawScore + durationBonus);
}

function getErrorWords(transcript: string, ayahs: Ayah[]): string[] {
  const ref  = ayahs.map(a => a.text).join(" ");
  const refW = normalizeAr(ref).split(" ").filter(Boolean);
  const gotW = normalizeAr(transcript).split(" ").filter(Boolean);
  const used = new Set<number>();
  const errs: string[] = [];
  for (const rw of refW) {
    let found = false;
    for (let i = 0; i < gotW.length; i++) {
      if (used.has(i)) continue;
      const gw = gotW[i];
      if (
        rw === gw ||
        (rw.length >= 3 && gw.length >= 3 && rw.slice(0, 4) === gw.slice(0, 4))
      ) {
        used.add(i); found = true; break;
      }
    }
    if (!found) errs.push(rw);
  }
  return errs;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(pageResults: PageResult[], isJuzStart: boolean): Question[] {
  const allAyahs = pageResults.flatMap(r => r.ayahs);
  const pagesRead = pageResults.length;
  const questions: Question[] = [];
  let id = 0;

  const ayahsForQuestions = (pagesRead < 2 && isJuzStart)
    ? pageResults[0]?.ayahs ?? []
    : allAyahs;

  if (ayahsForQuestions.length < 3) return [];

  // MCQ: next verse (up to 5)
  const nvTarget = Math.min(5, ayahsForQuestions.length - 1);
  const nvStep   = Math.max(1, Math.floor(ayahsForQuestions.length / nvTarget));
  for (
    let i = 0;
    i < ayahsForQuestions.length - 1 &&
    questions.filter(q => q.type === "next_verse").length < nvTarget;
    i += nvStep
  ) {
    const correct = ayahsForQuestions[i + 1];
    const wrongs  = shuffle(ayahsForQuestions.filter((_, j) => j !== i + 1)).slice(0, 3);
    if (wrongs.length < 2) continue;
    const opts = shuffle([correct, ...wrongs]);
    questions.push({
      id: id++, type: "next_verse",
      prompt: ayahsForQuestions[i].text,
      promptLabel: `${ayahsForQuestions[i].surah.englishName} · Verse ${ayahsForQuestions[i].numberInSurah}`,
      options: opts.map(o => o.text),
      correct: opts.indexOf(correct),
      correctText: correct.text,
    });
  }

  // MCQ: missing word (up to 4)
  const mwTarget = Math.min(4, ayahsForQuestions.length);
  const mwStep   = Math.max(1, Math.floor(ayahsForQuestions.length / mwTarget));
  for (
    let i = 0;
    i < ayahsForQuestions.length &&
    questions.filter(q => q.type === "missing_word").length < mwTarget;
    i += mwStep
  ) {
    const ayah  = ayahsForQuestions[i];
    const words = ayah.text.split(" ");
    if (words.length < 4) continue;
    const bi  = 1 + Math.floor(Math.random() * (words.length - 2));
    const cw  = words[bi];
    const blanked = words.map((w, j) => j === bi ? "____" : w).join(" ");
    const allW    = ayahsForQuestions.flatMap(a => a.text.split(" ")).filter(w => w !== cw && w.length > 2);
    const wrongs  = shuffle([...new Set(allW)]).slice(0, 3);
    if (wrongs.length < 2) continue;
    const opts = shuffle([cw, ...wrongs]);
    questions.push({
      id: id++, type: "missing_word",
      prompt: blanked,
      promptLabel: `Complete Verse ${ayah.numberInSurah} — ${ayah.surah.englishName}`,
      options: opts,
      correct: opts.indexOf(cw),
      correctText: cw,
    });
  }

  return shuffle(questions);
}

function isJuzStartPage(pageNum: number): boolean {
  const JUZ_STARTS = [1,22,42,62,82,102,122,142,162,182,
                      202,222,242,262,282,302,322,342,362,382,
                      402,422,442,462,482,502,522,542,562,582];
  return JUZ_STARTS.includes(pageNum);
}

async function fetchPageAyahs(pageNum: number): Promise<Ayah[]> {
  const res = await fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-uthmani`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.data?.ayahs ?? []) as Ayah[];
}

const RETRY_MESSAGES = [
  "You're almost there — take a breath, focus, and try again. You can do it! 💪",
  "Every great Hafidh struggled before they excelled. Read with concentration and try again.",
  "Don't give up! Review the page carefully, then recite with confidence.",
  "Allah is with the patient. Slow down, focus on each verse, and recite again.",
  "Beautiful recitation takes practice. Look at the text again and give it your best.",
];

/* ═════════════════════════════════════════════════════════════════ */
export default function HifdhDailySession({ assignment, userId, onClose }: Props) {
  const [phase,         setPhase]         = useState<Phase>("intro");
  const [pagesToRevise, setPagesToRevise] = useState<number[]>([]);
  const [pageIdx,       setPageIdx]       = useState(0);
  const [pageAyahs,     setPageAyahs]     = useState<Ayah[]>([]);
  const [fetchingPage,  setFetchingPage]  = useState(false);
  const [pageResults,   setPageResults]   = useState<PageResult[]>([]);
  const [currentScore,  setCurrentScore]  = useState<number | null>(null);
  const [currentTx,     setCurrentTx]     = useState("");
  const [errorWords,    setErrorWords]    = useState<string[]>([]);
  const [retryCount,    setRetryCount]    = useState(0);
  const [retryMsg,      setRetryMsg]      = useState("");
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [testIdx,       setTestIdx]       = useState(0);
  const [testAnswers,   setTestAnswers]   = useState<(number | null)[]>([]);
  const [testScore,     setTestScore]     = useState<number | null>(null);
  const [testRetries,   setTestRetries]   = useState(0);
  const [finalScore,    setFinalScore]    = useState(0);
  const [sessionStart]                    = useState(Date.now());
  const [isListening,   setIsListening]   = useState(false);
  const [recitedSecs,   setRecitedSecs]   = useState(0);
  const [submitting,    setSubmitting]    = useState(false);

  const recognRef  = useRef<any>(null);
  const liveRef    = useRef("");
  const recTimerRef = useRef<any>(null);

  /* ── Calculate pages to revise today ─────────────────────────── */
  useEffect(() => {
    const startDate = getStartDate(assignment);
    const daysOff   = getDaysOff(assignment);

    // Page offsets per section type so we always open the correct mushaf pages
    const JUZ_PAGE_STARTS = [
      1,22,42,62,82,102,122,142,162,182,
      202,222,242,262,282,302,322,342,362,382,
      402,422,442,462,482,502,522,542,562,582,
    ];
    const SURAH_PAGE_STARTS: Record<number,number> = {
      1:1,2:2,3:50,4:77,5:106,6:128,7:151,8:177,9:187,10:208,
      11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
      21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
      31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
      41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
      51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
      61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
      71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,
      80:585,81:586,82:587,83:587,84:589,85:590,86:591,87:591,
      88:592,89:593,90:594,91:595,92:595,93:596,94:596,95:597,
      96:597,97:598,98:598,99:599,100:600,101:600,102:600,
      103:601,104:601,105:601,106:602,107:602,108:602,
      109:603,110:603,111:603,112:604,113:604,114:604,
    };

    // Compute section base-page offset so we open the right mushaf pages
    let baseOffset = 0;
    const firstItem = assignment.selected_items?.[0] ?? 1;
    if (assignment.mode === "juz") {
      baseOffset = (JUZ_PAGE_STARTS[firstItem - 1] ?? 1) - 1;
    } else if (assignment.mode === "hizb") {
      // Each hizb ≈ 10 pages; hizb N starts at page (N-1)*10 + 1
      baseOffset = (firstItem - 1) * 10;
    } else if (assignment.mode === "surah") {
      baseOffset = (SURAH_PAGE_STARTS[firstItem] ?? 1) - 1;
    }

    if (!startDate) {
      // Fallback: start from section base page
      setPagesToRevise(
        Array.from({ length: assignment.daily_pages }, (_, i) => baseOffset + 1 + i)
          .filter(p => p >= 1 && p <= 604)
      );
      return;
    }

    const elapsed   = workingDaysElapsed(startDate, daysOff);
    const startPage = Math.floor(elapsed * assignment.daily_pages) + 1 + baseOffset;
    const pages     = Array.from({ length: assignment.daily_pages }, (_, i) => startPage + i)
      .filter(p => p >= 1 && p <= 604);
    setPagesToRevise(pages);
  }, [assignment]);

  /* ── Fetch page ayahs when page changes ──────────────────────── */
  useEffect(() => {
    if (!pagesToRevise.length || phase !== "reading") return;
    const pn = pagesToRevise[pageIdx];
    if (!pn) return;
    setFetchingPage(true);
    setPageAyahs([]);
    fetchPageAyahs(pn).then(ayahs => {
      setPageAyahs(ayahs);
      setFetchingPage(false);
    });
  }, [pagesToRevise, pageIdx, phase]);

  /* ── Speech recognition — attentive listening mode ──────────── */
  const startListening = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition is not supported on this browser. Please use Chrome on Android.");
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3; // get more alternatives for better matching

    liveRef.current = "";

    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          // Take the best alternative
          final += e.results[i][0].transcript + " ";
        }
      }
      if (final) liveRef.current += final;
    };

    rec.onerror = (e: any) => {
      // "no-speech" and "audio-capture" are common — don't stop session for these
      if (e.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone in your browser settings.");
        setIsListening(false);
        clearInterval(recTimerRef.current);
      }
    };

    rec.onend = () => {
      // Auto-restart while listening (browser stops recognition after ~60s on some devices)
      if (recognRef.current && isListeningRef.current) {
        try { rec.start(); } catch { /* already started */ }
      }
    };

    rec.start();
    recognRef.current = rec;
    setIsListening(true);
    setRecitedSecs(0);
    recTimerRef.current = setInterval(() => setRecitedSecs(s => s + 1), 1000);
  }, []);

  // Ref to track isListening without stale closure in rec.onend
  const isListeningRef = useRef(false);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    recognRef.current?.stop();
    recognRef.current = null;
    setIsListening(false);
    clearInterval(recTimerRef.current);
  }, []);

  /* ── Evaluate current page ──────────────────────────────────────*/
  const evaluatePage = useCallback(() => {
    const tx    = liveRef.current.trim();
    const score = scoreText(tx, pageAyahs, recitedSecs);
    const errs  = getErrorWords(tx, pageAyahs);
    setCurrentScore(score);
    setCurrentTx(tx);
    setErrorWords(errs);
    setPhase("page_result");
    liveRef.current = "";
  }, [pageAyahs, recitedSecs]);

  const handleStopAndEvaluate = () => {
    stopListening();
    evaluatePage();
  };

  /* ── Accept page result (score >= 75%) ─────────────────────────*/
  const acceptPageResult = () => {
    const result: PageResult = {
      pageNum:    pagesToRevise[pageIdx],
      score:      currentScore!,
      transcript: currentTx,
      errorWords,
      ayahs:      pageAyahs,
    };
    const newResults = [...pageResults, result];
    setPageResults(newResults);
    setRetryCount(0);
    setCurrentScore(null);

    const nextIdx = pageIdx + 1;
    if (nextIdx < pagesToRevise.length) {
      setPageIdx(nextIdx);
      setPhase("reading");
    } else {
      // All pages passed — go straight to testing
      startTesting(newResults);
    }
  };

  /* ── Retry page (score < 75%) ───────────────────────────────────*/
  const retryPage = () => {
    const msgIdx = retryCount % RETRY_MESSAGES.length;
    setRetryMsg(RETRY_MESSAGES[msgIdx]);
    setCurrentScore(null);
    setRetryCount(c => c + 1);
    liveRef.current = "";
    setRecitedSecs(0);
    setPhase("reading");
  };

  /* ── Build and start test ───────────────────────────────────────*/
  const startTesting = (results: PageResult[]) => {
    const firstPage  = results[0]?.pageNum ?? 1;
    const isJuzStart = isJuzStartPage(firstPage);
    const questions  = buildQuestions(results, isJuzStart);
    setTestQuestions(questions);
    setTestAnswers(new Array(questions.length).fill(null));
    setTestIdx(0);
    setTestScore(null);
    setPhase("testing");
  };

  const answerQuestion = (answerIdx: number) => {
    const updated = [...testAnswers];
    updated[testIdx] = answerIdx;
    setTestAnswers(updated);
  };

  const nextTestQuestion = () => {
    if (testIdx < testQuestions.length - 1) {
      setTestIdx(i => i + 1);
    } else {
      gradeTest();
    }
  };

  const gradeTest = () => {
    const correct = testAnswers.filter((a, i) => a === testQuestions[i]?.correct).length;
    const pct     = testQuestions.length > 0
      ? Math.round((correct / testQuestions.length) * 100)
      : 100;
    setTestScore(pct);
    if (pct >= PASS_THRESHOLD) {
      submitSession(pct);
    }
  };

  const retryTest = () => {
    setTestRetries(r => r + 1);
    setTestAnswers(new Array(testQuestions.length).fill(null));
    setTestIdx(0);
    setTestScore(null);
  };

  /* ── Submit session to DB ───────────────────────────────────────*/
  const submitSession = async (tScore: number) => {
    setPhase("submitting");
    setSubmitting(true);

    const recitationAvg = pageResults.length
      ? Math.round(pageResults.reduce((s, r) => s + r.score, 0) / pageResults.length)
      : 0;
    const overallScore  = Math.round((recitationAvg + tScore) / 2);
    const durationSecs  = Math.round((Date.now() - sessionStart) / 1000);
    setFinalScore(overallScore);

    const today = new Date().toISOString().split("T")[0];
    const sessionData = {
      recitation_score: recitationAvg,
      test_score:       tScore,
      pages_done:       pagesToRevise,
      page_results: pageResults.map(r => ({
        pageNum: r.pageNum, score: r.score, errorWords: r.errorWords,
      })),
      test_retries: testRetries,
      errors: pageResults.flatMap(r =>
        r.errorWords.map(w => ({ word: w, page: r.pageNum }))
      ).slice(0, 20),
    };

    await (supabase as any)
      .from("hifdh_daily_logs")
      .upsert({
        student_id:    userId,
        assignment_id: assignment.id,
        log_date:      today,
        pages_revised: pagesToRevise.length,
        avg_score:     overallScore,
        duration_secs: durationSecs,
        completed:     true,
        session_data:  sessionData,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "student_id,log_date" });

    // Notify teacher/admin
    try {
      const { data: profile } = await supabase
        .from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
      const studentName = (profile as any)?.full_name || "A student";
      const modeLabel   = assignment.mode === "juz" ? "Juz"
        : assignment.mode === "hizb" ? "Hizb" : "Surah";
      const itemsStr    = assignment.selected_items.slice(0, 3).join(", ");

      const { data: admins } = await supabase
        .from("profiles").select("user_id").eq("role", "admin" as any);

      const { data: enrollments } = await supabase
        .from("subject_enrollments" as any)
        .select("subjects(teacher_id)")
        .eq("student_id", userId).limit(1);

      const teacherId = (enrollments as any)?.[0]?.subjects?.teacher_id;
      const notifyIds = [
        ...(admins || []).map((a: any) => a.user_id),
        teacherId,
      ].filter(Boolean);

      for (const nid of notifyIds) {
        await (supabase as any).from("notifications").insert({
          user_id:    nid,
          title:      `📖 ${studentName} completed Hifdh revision`,
          message:    `${modeLabel} ${itemsStr} — Score: ${overallScore}% (${pagesToRevise.length} page${pagesToRevise.length > 1 ? "s" : ""})`,
          type:       "hifdh_complete",
          read:       false,
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) { console.error("Notify failed:", e); }

    setPhase("complete");
    setSubmitting(false);
  };

  /* ── Motivational hadith for completion ─────────────────────────*/
  const VERSES = [
    { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best among you are those who learn the Qur'an and teach it.", ref: "Sahih Bukhari 5027" },
    { ar: "اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ", en: "Recite the Qur'an, for it will come as an intercessor for its companions on the Day of Resurrection.", ref: "Sahih Muslim 804" },
    { ar: "الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ", en: "The one who is proficient in the Qur'an will be with the noble, righteous scribes.", ref: "Sahih Bukhari 4937" },
  ];
  const verse = VERSES[Math.floor(Math.random() * VERSES.length)];

  /* ── Shared sub-components ─────────────────────────────────────*/
  const Hdr = ({ title, sub }: { title: string; sub?: string }) => (
    <div style={{ background: G, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <button onClick={onClose}
        style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.1)", border: "none", cursor: "pointer", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
        ‹
      </button>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: "#fff", margin: 0 }}>{title}</p>
        {sub && <p style={{ fontSize: 10, color: `${GOLD}cc`, margin: 0 }}>{sub}</p>}
      </div>
      <div style={{ fontFamily: "'Amiri',serif", color: GOLD, fontSize: "1.2em" }}>﷽</div>
    </div>
  );

  const ScoreBadge = ({ score }: { score: number }) => {
    const pass  = score >= PASS_THRESHOLD;
    const color = pass ? PASS_COLOR : FAIL_COLOR;
    const bg    = pass ? "#DCFCE7" : "#FEE2E2";
    return (
      <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${color}`, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <span style={{ fontSize: 26, fontWeight: 900, color }}>{score}%</span>
        <span style={{ fontSize: 9, fontWeight: 700, color, opacity: .7 }}>{pass ? "PASSED ✓" : "TRY AGAIN ↩"}</span>
      </div>
    );
  };

  const Btn = ({ label, onClick, color = G, disabled = false, icon }: { label: string; onClick: () => void; color?: string; disabled?: boolean; icon?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: disabled ? "#D1D5DB" : color, color: "#fff", fontWeight: 800, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
      {icon}{label}
    </button>
  );

  const modeLabel = assignment.mode === "juz" ? "Juz" : assignment.mode === "hizb" ? "Hizb" : "Surah";
  const startDate = getStartDate(assignment);

  /* ═══════════════════ RENDER ════════════════════════════════════ */
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: WARM, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes slideUp { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes wavePulse {
          0%  { transform: scaleY(0.4); }
          50% { transform: scaleY(1.0); }
          100%{ transform: scaleY(0.4); }
        }
      `}</style>

      {/* ════════ INTRO ════════ */}
      {phase === "intro" && (
        <>
          <Hdr title="Today's Hifdh Session" sub={`${modeLabel} ${assignment.selected_items.slice(0,3).join(", ")} · ${assignment.daily_pages} page${assignment.daily_pages > 1 ? "s" : ""}`} />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Assignment card */}
            <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: `${G}0d`, borderBottom: `1px solid ${BRD}` }}>
                <p style={{ fontWeight: 700, fontSize: 11, color: G, margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>Your Assignment</p>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Mode",      value: modeLabel },
                    { label: "Section",   value: assignment.selected_items.slice(0,3).join(", ") + (assignment.selected_items.length > 3 ? "…" : "") },
                    { label: "Pages/day", value: String(assignment.daily_pages) },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center", background: WARM, borderRadius: 10, padding: "8px 4px", border: `1px solid ${BRD}` }}>
                      <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, margin: "0 0 2px" }}>{s.label}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: G, margin: 0 }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {pagesToRevise.length > 0 && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: `${G}0d`, border: `1px solid ${G}22`, display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={14} color={G} />
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: G }}>
                        Today: Page{pagesToRevise.length > 1 ? "s" : ""} {pagesToRevise[0]}{pagesToRevise.length > 1 ? `–${pagesToRevise[pagesToRevise.length - 1]}` : ""}
                      </span>
                      {startDate && (
                        <p style={{ fontSize: 9, color: "#9CA3AF", margin: "1px 0 0" }}>
                          Day {workingDaysElapsed(startDate, getDaysOff(assignment)) + 1} of {assignment.selected_items.length * 20}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Session guide */}
            <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
              <p style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>How This Session Works</p>
              {[
                { emoji: "🎙️", label: "Recite each page aloud", sub: `Score ≥ ${PASS_THRESHOLD}% to proceed. You may retry if you fall below.` },
                { emoji: "🎯", label: "Quick Qur'an test",       sub: "Answer MCQ questions from today's pages — ≥ 75% to pass" },
                { emoji: "✅", label: "Submit & complete",       sub: "Your teacher is notified automatically" },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < 2 ? `1px solid #F3F4F6` : "none" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${G}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15 }}>{step.emoji}</div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0 }}>{step.label}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{step.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tip card */}
            <div style={{ background: `${GOLD}10`, borderRadius: 12, padding: "10px 14px", border: `1px solid ${GOLD}33` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#92400E", margin: "0 0 4px" }}>💡 Tips for accurate recognition</p>
              <p style={{ fontSize: 11, color: "#78350F", margin: 0, lineHeight: 1.6 }}>
                Recite clearly and at a moderate pace. The microphone listens to your entire page — do not stop mid-verse. Speak in a quiet environment for best results.
              </p>
            </div>

            {assignment.notes && (
              <div style={{ background: `${GOLD}12`, borderRadius: 12, padding: "10px 14px", border: `1px solid ${GOLD}33` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#92400E", margin: "0 0 4px" }}>📝 Teacher's Note</p>
                <p style={{ fontSize: 12, color: INK, margin: 0 }}>{assignment.notes}</p>
              </div>
            )}

            <Btn label="Begin Session →" onClick={() => setPhase("reading")} />
          </div>
        </>
      )}

      {/* ════════ READING ════════ */}
      {phase === "reading" && (
        <>
          <Hdr
            title={`Page ${pagesToRevise[pageIdx]} — Recite Aloud`}
            sub={`Page ${pageIdx + 1} of ${pagesToRevise.length}${retryCount > 0 ? ` · Attempt ${retryCount + 1}` : ""}`}
          />
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 90px", display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Retry encouragement (only on retries) */}
            {retryMsg && retryCount > 0 && (
              <div style={{ padding: "10px 12px", borderRadius: 12, background: `${GOLD}12`, border: `1px solid ${GOLD}44`, animation: "slideUp .3s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <Heart size={14} color={GOLD} style={{ marginTop: 1, flexShrink: 0 }} />
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#92400E", margin: 0, lineHeight: 1.5 }}>{retryMsg}</p>
                </div>
              </div>
            )}

            {/* When recording: full-screen waveform (student recites from memory) */}
            {isListening ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "48px 16px", background: W, borderRadius: 16, border: `2px solid ${PASS_COLOR}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                  {[6,14,22,30,18,26,12,20,8,16,24,10].map((h, i) => (
                    <div key={i} style={{
                      width: 5, borderRadius: 4, height: h,
                      background: PASS_COLOR,
                      animation: `wavePulse ${0.55 + i * 0.07}s ease-in-out ${i * 0.06}s infinite`,
                    }} />
                  ))}
                </div>
                <p style={{ fontWeight: 900, fontSize: 17, color: G, margin: 0 }}>Listening…</p>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0, textAlign: "center", maxWidth: 220 }}>
                  Recite the full page from memory
                </p>
                <div style={{ padding: "5px 18px", borderRadius: 20, background: `${PASS_COLOR}15`, border: `1px solid ${PASS_COLOR}44` }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: PASS_COLOR }}>
                    🔴 {Math.floor(recitedSecs / 60)}:{String(recitedSecs % 60).padStart(2, "0")}
                  </span>
                </div>
              </div>
            ) : (
              /* Mushaf full page — shown when NOT yet recording */
              fetchingPage ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Loader2 size={28} color={GOLD} style={{ animation: "spin .8s linear infinite" }} />
                </div>
              ) : pageAyahs.length > 0 ? (
                <div style={{
                  background: "#fdf6e3",
                  borderRadius: 14,
                  border: "2px solid #c9a84c88",
                  padding: "18px 20px",
                  position: "relative",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ position: "absolute", inset: 8, border: "1px solid #c9a84c33", borderRadius: 8, pointerEvents: "none" }} />
                  <p style={{ fontSize: 9, fontWeight: 800, color: "#9CA3AF", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>
                    {pageAyahs[0]?.surah?.englishName} · Page {pagesToRevise[pageIdx]}
                  </p>
                  <div style={{ direction: "rtl", fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 24, fontWeight: 700, color: "#1a1208", lineHeight: 3, textAlign: "justify" }}>
                    {pageAyahs.map((a, i) => (
                      <span key={i}>
                        {a.text}
                        <span style={{ fontSize: 15, color: "#c9a84c", margin: "0 4px", fontFamily: "'Amiri',serif" }}>﴿{a.numberInSurah}﴾</span>
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: "10px 0 0", textAlign: "center" }}>
                    Read carefully, then tap <strong>Start Reciting</strong> below and recite from memory
                  </p>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                  Could not load page — check your internet connection.
                </div>
              )
            )}
          </div>

          {/* Sticky bottom controls */}
          <div style={{ padding: "12px 16px", background: W, borderTop: `1px solid ${BRD}`, display: "flex", gap: 10, flexShrink: 0 }}>
            {!isListening ? (
              <button onClick={startListening}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Mic size={16} /> Start Reciting
              </button>
            ) : (
              <button onClick={handleStopAndEvaluate}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: FAIL_COLOR, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MicOff size={16} /> Finished Reciting — Evaluate
              </button>
            )}
          </div>
        </>
      )}

      {/* ════════ PAGE RESULT ════════ */}
      {phase === "page_result" && currentScore !== null && (
        <>
          <Hdr title={`Page ${pagesToRevise[pageIdx]} — Result`} />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            <ScoreBadge score={currentScore} />

            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <p style={{ fontWeight: 800, fontSize: 16, color: currentScore >= PASS_THRESHOLD ? PASS_COLOR : FAIL_COLOR, margin: 0 }}>
                {currentScore >= PASS_THRESHOLD
                  ? (pageIdx + 1 < pagesToRevise.length ? "ممتاز! Moving to next page…" : "ممتاز! All pages done!")
                  : "يحتاج تحسين — Try Again"}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
                {currentScore >= PASS_THRESHOLD
                  ? `You scored ${currentScore}% — well done!`
                  : `Score below ${PASS_THRESHOLD}% — please recite again more carefully`}
              </p>
            </div>

            {/* Fail: encouragement card */}
            {currentScore < PASS_THRESHOLD && (
              <div style={{ padding: "14px", borderRadius: 14, background: `${GOLD}0d`, border: `1.5px solid ${GOLD}44`, animation: "slideUp .35s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Heart size={18} color={GOLD} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 13, color: "#92400E", margin: "0 0 4px" }}>Focus & Try Again</p>
                    <p style={{ fontSize: 12, color: "#78350F", margin: 0, lineHeight: 1.6 }}>
                      Read the page carefully one more time, then recite it with concentration.
                      Every repetition strengthens your hifdh — this is part of the journey. 🌟
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Full transcription — all words shown, errors highlighted red */}
            {pageAyahs.length > 0 && (() => {
              const errorSet = new Set(errorWords.map(w => normalizeAr(w)));
              const allWords = pageAyahs.flatMap(a =>
                a.text.split(/\s+/).filter(Boolean).map(w => ({
                  display: w,
                  norm: normalizeAr(w),
                }))
              );
              const correctCount = allWords.filter(({ norm }) => {
                if (errorSet.has(norm)) return false;
                for (const e of errorSet) {
                  if (norm.length >= 3 && e.length >= 3 && norm.slice(0, 4) === e.slice(0, 4)) return false;
                }
                return true;
              }).length;
              return (
                <div style={{ background: W, borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "12px 14px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: INK, margin: "0 0 10px" }}>
                    📖 Full Page — Recitation Review
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, direction: "rtl" }}>
                    {allWords.map(({ display, norm }, i) => {
                      let isError = errorSet.has(norm);
                      if (!isError) {
                        for (const e of errorSet) {
                          if (norm.length >= 3 && e.length >= 3 && norm.slice(0, 4) === e.slice(0, 4)) { isError = true; break; }
                        }
                      }
                      return (
                        <span key={i} style={{
                          padding: "4px 10px", borderRadius: 8, fontSize: 15,
                          fontFamily: "'Amiri Quran','Amiri',serif",
                          background: isError ? "#FEE2E2" : "#DCFCE7",
                          color: isError ? FAIL_COLOR : PASS_COLOR,
                        }}>
                          {display}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "#6B7280" }}>
                    <span>🟢 Correct: {correctCount}</span>
                    <span>🔴 Needs attention: {errorWords.length}</span>
                  </div>
                </div>
              );
            })()}

            {currentScore >= PASS_THRESHOLD ? (
              <Btn
                label={pageIdx + 1 < pagesToRevise.length ? "Next Page →" : "Proceed to Test →"}
                onClick={acceptPageResult}
              />
            ) : (
              <Btn
                label="🔄 Read the Page & Recite Again"
                onClick={retryPage}
                color="#D97706"
              />
            )}
          </div>
        </>
      )}

      {/* ════════ TESTING ════════ */}
      {phase === "testing" && testScore === null && testQuestions.length > 0 && (
        <>
          <Hdr
            title={`Verse Test — Q${testIdx + 1}/${testQuestions.length}`}
            sub="Choose the correct answer"
          />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Progress dots */}
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {testQuestions.map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i < testIdx ? PASS_COLOR : i === testIdx ? GOLD : BRD,
                  transition: "background .2s",
                }} />
              ))}
            </div>

            {(() => {
              const q        = testQuestions[testIdx];
              const answered = testAnswers[testIdx];
              return (
                <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
                  <div style={{ padding: "14px", background: `${G}0a`, borderBottom: `1px solid ${BRD}` }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: .5 }}>
                      {q.type === "next_verse" ? "What comes next?" : "Fill in the blank"} · {q.promptLabel}
                    </p>
                    <p style={{ fontSize: 18, direction: "rtl", fontFamily: "'Amiri Quran','Amiri',serif", color: INK, lineHeight: 2.4, margin: 0 }}>{q.prompt}</p>
                  </div>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {q.options.map((opt, oi) => (
                      <button key={oi} onClick={() => answerQuestion(oi)}
                        style={{
                          width: "100%", padding: "12px 14px", borderRadius: 12,
                          border: `2px solid ${answered === oi ? G : BRD}`,
                          background: answered === oi ? `${G}12` : WARM,
                          cursor: "pointer", textAlign: "right",
                          direction: "rtl", fontFamily: "'Amiri',serif",
                          fontSize: 16, color: INK,
                          fontWeight: answered === oi ? 700 : 400,
                          transition: "all .15s",
                        }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <Btn
              label={testIdx < testQuestions.length - 1 ? "Next →" : "Finish Test"}
              onClick={nextTestQuestion}
              disabled={testAnswers[testIdx] === null}
            />
          </div>
        </>
      )}

      {/* ════════ TEST RESULT ════════ */}
      {phase === "testing" && testScore !== null && (
        <>
          <Hdr title="Test Result" />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <ScoreBadge score={testScore} />

            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <p style={{ fontWeight: 800, fontSize: 16, color: testScore >= PASS_THRESHOLD ? PASS_COLOR : FAIL_COLOR, margin: 0 }}>
                {testScore >= PASS_THRESHOLD ? "ممتاز! Test Passed!" : "يحتاج مراجعة — Below Pass Mark"}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
                {testScore >= PASS_THRESHOLD
                  ? "MashaAllah! Submitting your session now…"
                  : `Score below ${PASS_THRESHOLD}% — review the correct answers and try again`}
              </p>
            </div>

            {/* Question breakdown */}
            <div style={{ background: W, borderRadius: 14, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>Question Breakdown</p>
              {testQuestions.map((q, i) => {
                const userAns   = testAnswers[i];
                const isCorrect = userAns === q.correct;
                return (
                  <div key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: isCorrect ? "#DCFCE7" : "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 800, color: isCorrect ? PASS_COLOR : FAIL_COLOR }}>
                      {isCorrect ? "✓" : "✗"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", margin: 0 }}>Q{i + 1}: {q.promptLabel}</p>
                      {!isCorrect && (
                        <p style={{ fontSize: 12, color: PASS_COLOR, margin: "3px 0 0", direction: "rtl", fontFamily: "'Amiri',serif" }}>
                          ✓ {q.correctText.slice(0, 50)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {testScore >= PASS_THRESHOLD
              ? <Btn label="Submit Session ✓" onClick={() => submitSession(testScore!)} />
              : (
                <>
                  {/* Encouragement for test retry */}
                  <div style={{ padding: "12px 14px", borderRadius: 12, background: `${GOLD}0d`, border: `1px solid ${GOLD}33` }}>
                    <p style={{ fontSize: 12, color: "#92400E", margin: 0, fontWeight: 600, lineHeight: 1.6 }}>
                      💪 You can do better! Review the correct answers above, then take the test again.
                      Focus on the verses you missed.
                    </p>
                  </div>
                  <Btn label="🔄 Retry Test" onClick={retryTest} color="#D97706" />
                </>
              )
            }
          </div>
        </>
      )}

      {/* ════════ SUBMITTING ════════ */}
      {phase === "submitting" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
          <Loader2 size={40} color={GOLD} style={{ animation: "spin .8s linear infinite" }} />
          <p style={{ fontWeight: 800, fontSize: 16, color: G, margin: 0 }}>Submitting your session…</p>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Notifying your teacher. Please wait.</p>
        </div>
      )}

      {/* ════════ COMPLETE ════════ */}
      {phase === "complete" && (
        <div style={{ flex: 1, overflowY: "auto", background: `linear-gradient(160deg,${G} 0%,${GM} 60%,#1e5c3b 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 20 }}>

          <div style={{ width: 90, height: 90, borderRadius: "50%", background: `${GOLD}22`, border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={40} color={GOLD} />
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 900, fontSize: 22, color: "#fff", margin: 0 }}>اليوم مكتمل! 🎉</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.7)", margin: "6px 0 0" }}>
              Today's session is complete — well done!
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, width: "100%" }}>
            {[
              { label: "Overall Score", value: `${finalScore}%`, color: finalScore >= 80 ? "#86EFAC" : finalScore >= 60 ? GOLD : "#FCA5A5" },
              { label: "Pages Done",    value: String(pagesToRevise.length), color: GOLD },
              { label: "Duration",      value: `${Math.round((Date.now() - sessionStart) / 60000)}m`, color: "#93C5FD" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,.12)" }}>
                <p style={{ fontWeight: 900, fontSize: 20, color: s.color, margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,.5)", margin: "3px 0 0", fontWeight: 600 }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 16, padding: "16px", border: `1px solid ${GOLD}33`, textAlign: "center", width: "100%" }}>
            <p style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD, direction: "rtl", lineHeight: 2, margin: "0 0 8px" }}>{verse.ar}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", fontStyle: "italic", margin: "0 0 4px" }}>{verse.en}</p>
            <p style={{ fontSize: 10, color: `${GOLD}88`, fontWeight: 700, margin: 0 }}>— {verse.ref}</p>
          </div>

          <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 16px", width: "100%", textAlign: "center", border: "1px solid rgba(255,255,255,.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0 }}>
              📨 Your teacher has been notified. Come back tomorrow for your next revision, biiznillah!
            </p>
          </div>

          <button onClick={onClose}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: `2px solid ${GOLD}`, background: "transparent", color: GOLD, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Return to Dashboard
          </button>
        </div>
      )}

      {/* ════════ EMPTY TEST (not enough verses) ════════ */}
      {phase === "testing" && testScore === null && testQuestions.length === 0 && (
        <>
          <Hdr title="Testing" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
            <Star size={36} color={GOLD} />
            <p style={{ fontWeight: 800, fontSize: 15, color: G, margin: 0 }}>Not enough verses to test</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0, textAlign: "center" }}>
              The assigned pages don't have enough content to generate questions yet. Submitting directly.
            </p>
            <Btn label="Submit Session ✓" onClick={() => submitSession(100)} />
          </div>
        </>
      )}
    </div>
  );
}
