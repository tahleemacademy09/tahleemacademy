// src/components/hifdh/HifdhDailySession.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full daily Hifdh session flow for students:
//
//  INTRO → READING (per page, 75% gate) → ERROR_PRACTICE (if errors exist)
//        → TESTING (smart page-aware MCQ, 75% gate) → COMPLETE
//
// • Recitation: Web Speech API (ar-SA) — word-overlap scoring
// • Pass gate: 75% — student must re-read if below
// • Testing: only from pages actually read; cross-page questions only once
//   2+ pages are read; if starting at juz boundary, test only that page
// • Submission: writes hifdh_daily_logs + notifies assigned teacher/admin
// • Completion: motivational verse + full stats
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, MicOff, ChevronRight, CheckCircle2, AlertTriangle,
  Loader2, BookOpen, X, RefreshCcw, Trophy, Star,
  ArrowRight, Volume2,
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
  number: number; // absolute
  text: string;
  surah: { number: number; name: string; englishName: string };
}

interface Assignment {
  id: string;
  student_id: string;
  mode: "juz" | "hizb" | "surah";
  selected_items: number[];
  daily_pages: number;
  program_start?: string;
  days_off?: number[];
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
  | "error_practice"
  | "testing"
  | "submitting"
  | "complete";

interface Props {
  assignment: Assignment;
  userId: string;
  onClose: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now   = new Date(); now.setHours(0, 0, 0, 0);
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
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "")
    .replace(/[\u0622\u0623\u0625\u0627]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0640/g, "")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function scoreText(transcript: string, ayahs: Ayah[]): number {
  const ref    = ayahs.map(a => a.text).join(" ");
  const refW   = normalizeAr(ref).split(" ").filter(Boolean);
  const gotW   = normalizeAr(transcript).split(" ").filter(Boolean);
  if (!refW.length) return 0;
  const used = new Set<number>();
  let matches = 0;
  for (const rw of refW) {
    for (let i = 0; i < gotW.length; i++) {
      if (used.has(i)) continue;
      if (
        rw === gotW[i] ||
        (rw.length >= 3 && gotW[i].length >= 3 && rw.slice(0, 4) === gotW[i].slice(0, 4))
      ) { matches++; used.add(i); break; }
    }
  }
  return Math.round((matches / refW.length) * 100);
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
      if (rw === gotW[i] || (rw.length >= 3 && gotW[i].length >= 3 && rw.slice(0, 4) === gotW[i].slice(0, 4))) {
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

// Smart question builder — respects the 2-page combine rule and juz-boundary rule
function buildQuestions(pageResults: PageResult[], isJuzStart: boolean): Question[] {
  const allAyahs = pageResults.flatMap(r => r.ayahs);
  const pagesRead = pageResults.length;
  const questions: Question[] = [];
  let id = 0;

  // Use only single-page ayahs if we're at juz start and only 1 page read
  const ayahsForQuestions = (pagesRead < 2 && isJuzStart)
    ? pageResults[0]?.ayahs ?? []
    : allAyahs;

  if (ayahsForQuestions.length < 3) return [];

  // ── MCQ: next verse (up to 5 spread evenly) ────────────────────
  const nvTarget = Math.min(5, ayahsForQuestions.length - 1);
  const nvStep   = Math.max(1, Math.floor(ayahsForQuestions.length / nvTarget));
  for (let i = 0; i < ayahsForQuestions.length - 1 && questions.filter(q => q.type === "next_verse").length < nvTarget; i += nvStep) {
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

  // ── MCQ: missing word (up to 4) ────────────────────────────────
  const mwTarget = Math.min(4, ayahsForQuestions.length);
  const mwStep   = Math.max(1, Math.floor(ayahsForQuestions.length / mwTarget));
  for (let i = 0; i < ayahsForQuestions.length && questions.filter(q => q.type === "missing_word").length < mwTarget; i += mwStep) {
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

// Detect juz start: Quran pages 1-604, each juz ~20 pages
function isJuzStartPage(pageNum: number): boolean {
  // Juz boundaries (first page of each juz in the Uthmani mus-haf)
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

/* ═════════════════════════════════════════════════════════════════ */
export default function HifdhDailySession({ assignment, userId, onClose }: Props) {
  const [phase,         setPhase]         = useState<Phase>("intro");
  const [pagesToRevise, setPagesToRevise] = useState<number[]>([]);
  const [pageIdx,       setPageIdx]       = useState(0);          // which page we're on
  const [pageAyahs,     setPageAyahs]     = useState<Ayah[]>([]);
  const [fetchingPage,  setFetchingPage]  = useState(false);
  const [pageResults,   setPageResults]   = useState<PageResult[]>([]);
  const [currentScore,  setCurrentScore]  = useState<number | null>(null);
  const [currentTx,     setCurrentTx]     = useState("");
  const [errorWords,    setErrorWords]    = useState<string[]>([]);
  const [retryCount,    setRetryCount]    = useState(0);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [testIdx,       setTestIdx]       = useState(0);
  const [testAnswers,   setTestAnswers]   = useState<(number | null)[]>([]);
  const [testScore,     setTestScore]     = useState<number | null>(null);
  const [testRetries,   setTestRetries]   = useState(0);
  const [finalScore,    setFinalScore]    = useState(0);
  const [sessionStart]                    = useState(Date.now());
  const [isListening,   setIsListening]   = useState(false);
  const [liveText,      setLiveText]      = useState("");
  const [errPracticeOk, setErrPracticeOk]= useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  const recognRef  = useRef<any>(null);
  const liveRef    = useRef("");

  /* ── Calculate pages to revise today ─────────────────────────── */
  useEffect(() => {
    const daysOff   = assignment.days_off ?? [];
    const elapsed   = assignment.program_start
      ? workingDaysElapsed(assignment.program_start, daysOff)
      : 0;
    const startPage = Math.floor(elapsed * assignment.daily_pages) + 1;
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

  /* ── Speech recognition ───────────────────────────────────────── */
  const startListening = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition not supported on this device.");
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    liveRef.current = "";
    setLiveText("");

    rec.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      if (final) liveRef.current += final;
      setLiveText(liveRef.current + interim);
    };

    rec.onerror = () => { setIsListening(false); };
    rec.onend   = () => { setIsListening(false); };

    rec.start();
    recognRef.current = rec;
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognRef.current?.stop();
    setIsListening(false);
  }, []);

  /* ── Evaluate current page ──────────────────────────────────────*/
  const evaluatePage = useCallback(() => {
    const tx    = liveRef.current.trim();
    const score = scoreText(tx, pageAyahs);
    const errs  = getErrorWords(tx, pageAyahs);
    setCurrentScore(score);
    setCurrentTx(tx);
    setErrorWords(errs);
    setPhase("page_result");
    setLiveText("");
    liveRef.current = "";
  }, [pageAyahs]);

  const handleStopAndEvaluate = () => {
    stopListening();
    evaluatePage();
  };

  /* ── Accept page result ─────────────────────────────────────────*/
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
      // Move to next page
      setPageIdx(nextIdx);
      setPhase("reading");
    } else {
      // All pages done — check for errors
      const allErrors = newResults.flatMap(r => r.errorWords);
      if (allErrors.length > 0) {
        setPhase("error_practice");
      } else {
        startTesting(newResults);
      }
    }
  };

  const retryPage = () => {
    setCurrentScore(null);
    setRetryCount(c => c + 1);
    setLiveText("");
    liveRef.current = "";
    setPhase("reading");
  };

  /* ── Error practice ─────────────────────────────────────────────*/
  const finishErrorPractice = () => {
    startTesting(pageResults);
  };

  /* ── Build and start test ───────────────────────────────────────*/
  const startTesting = (results: PageResult[]) => {
    const firstPage    = results[0]?.pageNum ?? 1;
    const isJuzStart   = isJuzStartPage(firstPage);
    const questions    = buildQuestions(results, isJuzStart);
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
    // else: show retry option in UI
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
      page_results:     pageResults.map(r => ({
        pageNum: r.pageNum, score: r.score, errorWords: r.errorWords,
      })),
      test_retries: testRetries,
      errors: pageResults.flatMap(r =>
        r.errorWords.map(w => ({ word: w, page: r.pageNum }))
      ).slice(0, 20),
    };

    // Upsert daily log
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
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      const studentName = (profile as any)?.full_name || "A student";
      const modeLabel   = assignment.mode === "juz" ? "Juz" : assignment.mode === "hizb" ? "Hizb" : "Surah";
      const itemsStr    = assignment.selected_items.slice(0, 3).join(", ");

      // Notify admin
      const { data: admins } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("role", "admin" as any);

      // Find teacher assigned to student
      const { data: enrollments } = await supabase
        .from("subject_enrollments" as any)
        .select("subjects(teacher_id)")
        .eq("student_id", userId)
        .limit(1);
      const teacherId = (enrollments as any)?.[0]?.subjects?.teacher_id;

      const notifTargets = [
        ...((admins as any[]) ?? []).map((a: any) => a.user_id),
        teacherId,
      ].filter(Boolean);

      for (const targetId of [...new Set(notifTargets)]) {
        await supabase.from("notifications").insert({
          user_id: targetId,
          title:   `📖 Hifdh Completed — ${studentName}`,
          message: `${studentName} completed today's ${modeLabel} ${itemsStr} revision. Score: ${overallScore}%. Duration: ${Math.round(durationSecs/60)}min.`,
          type:    "hifdh_completed",
          link:    "/admin/hifdh-review",
          is_read: false,
        });
      }
    } catch (e) {
      console.warn("Notification insert failed:", e);
    }

    setSubmitting(false);
    setPhase("complete");
  };

  /* ── Motivational verses for completion ─────────────────────────*/
  const COMPLETION_VERSES = [
    { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", ref: "Bukhari" },
    { ar: "إِنَّ الَّذِي لَيْسَ فِي جَوْفِهِ شَيْءٌ مِنَ الْقُرْآنِ كَالْبَيْتِ الْخَرِبِ", en: "One who has nothing of the Quran in his heart is like a ruined house.", ref: "Tirmidhi" },
    { ar: "اقْرَءُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ", en: "Recite the Quran, for it will come as an intercessor on the Day of Resurrection.", ref: "Muslim" },
    { ar: "مَنْ قَرَأَ حَرْفًا مِنْ كِتَابِ اللَّهِ فَلَهُ بِهِ حَسَنَةٌ", en: "Whoever recites a letter from the Book of Allah earns one good deed.", ref: "Tirmidhi" },
  ];
  const verse = COMPLETION_VERSES[Math.floor(Math.random() * COMPLETION_VERSES.length)];

  /* ── Render helpers ─────────────────────────────────────────────*/
  const Hdr = ({ title, sub }: { title: string; sub?: string }) => (
    <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "16px", position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={15} color="#fff" />
      </button>
      <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: "3px 0 0" }}>{sub}</p>}
    </div>
  );

  const ScoreBadge = ({ score }: { score: number }) => {
    const pass  = score >= PASS_THRESHOLD;
    const color = pass ? PASS_COLOR : FAIL_COLOR;
    const bg    = pass ? "#DCFCE7"  : "#FEE2E2";
    return (
      <div style={{ width: 90, height: 90, borderRadius: "50%", border: `4px solid ${color}`, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <span style={{ fontSize: 24, fontWeight: 900, color }}>{score}%</span>
        <span style={{ fontSize: 9, fontWeight: 700, color, opacity: .7 }}>{pass ? "PASSED ✓" : "RETRY ↩"}</span>
      </div>
    );
  };

  const Btn = ({ label, onClick, color = G, disabled = false }: { label: string; onClick: () => void; color?: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: disabled ? "#D1D5DB" : color, color: "#fff", fontWeight: 800, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
      {label}
    </button>
  );

  const modeLabel = assignment.mode === "juz" ? "Juz" : assignment.mode === "hizb" ? "Hizb" : "Surah";

  /* ═══════════════════ RENDER ════════════════════════════════════ */
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: WARM, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* ════════ INTRO ════════ */}
      {phase === "intro" && (
        <>
          <Hdr title="Today's Hifdh Session" sub={`${modeLabel} ${assignment.selected_items.slice(0,3).join(", ")} · ${assignment.daily_pages} page${assignment.daily_pages > 1 ? "s" : ""}`} />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Assignment card */}
            <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#F9FAFB", borderBottom: `1px solid ${BRD}` }}>
                <p style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>Your Assignment</p>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Mode",     value: modeLabel },
                    { label: "Section",  value: assignment.selected_items.slice(0,3).join(", ") + (assignment.selected_items.length > 3 ? "…" : "") },
                    { label: "Pages/day",value: String(assignment.daily_pages) },
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
                    <span style={{ fontSize: 12, fontWeight: 700, color: G }}>
                      Today: Page{pagesToRevise.length > 1 ? "s" : ""} {pagesToRevise[0]}–{pagesToRevise[pagesToRevise.length - 1]}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Session guide */}
            <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
              <p style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>How This Session Works</p>
              {[
                { n: "1", emoji: "📖", label: "Read each page aloud", sub: `Must score ≥ ${PASS_THRESHOLD}% to proceed` },
                { n: "2", emoji: "🔧", label: "Error practice", sub: "Practise any mistakes before the test" },
                { n: "3", emoji: "🎯", label: "Quick test", sub: "MCQ from today's pages — ≥ 75% to pass" },
                { n: "4", emoji: "✅", label: "Submit & complete", sub: "Your teacher is notified automatically" },
              ].map(step => (
                <div key={step.n} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid #F3F4F6` }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14 }}>{step.emoji}</div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0 }}>{step.label}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{step.sub}</p>
                  </div>
                </div>
              ))}
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
            sub={`Page ${pageIdx + 1} of ${pagesToRevise.length} · ${retryCount > 0 ? `Retry ${retryCount}` : "First attempt"}`}
          />
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 80px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Pass threshold reminder */}
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 11, fontWeight: 600, color: "#92400E" }}>
              🎯 You need ≥ {PASS_THRESHOLD}% to pass this page and move on.
            </div>

            {/* Live mic status */}
            <div style={{ background: W, borderRadius: 14, padding: "12px 14px", border: `2px solid ${isListening ? G : BRD}`, textAlign: "center" }}>
              {isListening ? (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", animation: "pulse 1.5s infinite" }}>
                    <Mic size={22} color={PASS_COLOR} />
                  </div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: G, margin: "0 0 4px" }}>Listening… Recite the page</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>Speak clearly in Arabic</p>
                  {liveText && (
                    <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: WARM, border: `1px solid ${BRD}`, fontSize: 13, color: INK, direction: "rtl", fontFamily: "'Amiri',serif", lineHeight: 1.8, maxHeight: 100, overflow: "hidden" }}>
                      {liveText.slice(-200)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                    <MicOff size={22} color={G} />
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0 }}>Tap to start reciting</p>
                </>
              )}
            </div>

            {/* Quran text */}
            {fetchingPage ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Loader2 size={24} color={GOLD} style={{ animation: "spin .8s linear infinite" }} />
              </div>
            ) : pageAyahs.length > 0 ? (
              <div style={{ background: W, borderRadius: 14, border: `1px solid ${BRD}`, padding: "14px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>
                  Page {pagesToRevise[pageIdx]} — {pageAyahs[0]?.surah.englishName}
                </p>
                <div style={{ direction: "rtl", lineHeight: 2.2, fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 18, color: INK }}>
                  {pageAyahs.map((a, i) => (
                    <span key={i}>
                      {a.text}
                      <span style={{ fontSize: 13, color: GOLD, margin: "0 4px" }}>﴿{a.numberInSurah}﴾</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                Could not load page — check your connection.
              </div>
            )}
          </div>

          {/* Sticky bottom controls */}
          <div style={{ padding: "12px 16px", background: W, borderTop: `1px solid ${BRD}`, display: "flex", gap: 10 }}>
            {!isListening ? (
              <button onClick={startListening} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Mic size={16} /> Start Reciting
              </button>
            ) : (
              <button onClick={handleStopAndEvaluate} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: FAIL_COLOR, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MicOff size={16} /> Stop & Evaluate
              </button>
            )}
          </div>
        </>
      )}

      {/* ════════ PAGE RESULT ════════ */}
      {phase === "page_result" && currentScore !== null && (
        <>
          <Hdr title={`Page ${pagesToRevise[pageIdx]} Result`} />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            <ScoreBadge score={currentScore} />

            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <p style={{ fontWeight: 800, fontSize: 16, color: currentScore >= PASS_THRESHOLD ? PASS_COLOR : FAIL_COLOR, margin: 0 }}>
                {currentScore >= PASS_THRESHOLD ? "ممتاز! Well done!" : "يحتاج تحسين — Try again"}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
                {currentScore >= PASS_THRESHOLD
                  ? pageIdx + 1 < pagesToRevise.length ? "Moving to next page…" : "All pages done!"
                  : `Score below ${PASS_THRESHOLD}% — please recite again more carefully`}
              </p>
            </div>

            {/* Error words */}
            {errorWords.length > 0 && (
              <div style={{ background: W, borderRadius: 14, border: "1.5px solid #FECACA", padding: "12px 14px" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: FAIL_COLOR, margin: "0 0 8px" }}>
                  ⚠️ Words that need attention ({errorWords.length})
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, direction: "rtl" }}>
                  {errorWords.slice(0, 20).map((w, i) => (
                    <span key={i} style={{ padding: "3px 10px", borderRadius: 8, background: "#FEE2E2", color: FAIL_COLOR, fontSize: 13, fontFamily: "'Amiri',serif" }}>{w}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            {currentTx && (
              <div style={{ background: W, borderRadius: 14, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 6px" }}>Your Recitation (Recognized)</p>
                <p style={{ fontSize: 13, direction: "rtl", fontFamily: "'Amiri',serif", color: INK, lineHeight: 1.8, margin: 0 }}>{currentTx}</p>
              </div>
            )}

            {currentScore >= PASS_THRESHOLD
              ? <Btn label={pageIdx + 1 < pagesToRevise.length ? "Next Page →" : "Proceed to Practice"} onClick={acceptPageResult} />
              : <Btn label="🔄 Recite Again" onClick={retryPage} color={FAIL_COLOR} />
            }
          </div>
        </>
      )}

      {/* ════════ ERROR PRACTICE ════════ */}
      {phase === "error_practice" && (
        <>
          <Hdr title="Error Practice" sub="Review the words you missed before the test" />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            <div style={{ background: W, borderRadius: 14, border: "1.5px solid #FECACA", padding: "12px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: FAIL_COLOR, margin: "0 0 10px" }}>
                ⚠️ Practise these words — read each one aloud several times:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, direction: "rtl" }}>
                {[...new Set(pageResults.flatMap(r => r.errorWords))].slice(0, 30).map((w, i) => (
                  <span key={i} style={{ padding: "5px 12px", borderRadius: 10, background: "#FFF5F5", border: "1px solid #FECACA", color: FAIL_COLOR, fontSize: 16, fontFamily: "'Amiri',serif" }}>{w}</span>
                ))}
              </div>
            </div>

            {/* Show context verses */}
            <div style={{ background: W, borderRadius: 14, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>Reference Text</p>
              {pageResults.map(r => (
                <div key={r.pageNum} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: GOLD, margin: "0 0 6px" }}>Page {r.pageNum}</p>
                  <div style={{ direction: "rtl", lineHeight: 2.2, fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 16, color: INK }}>
                    {r.ayahs.map((a, i) => (
                      <span key={i}>
                        {a.text.split(" ").map((w, wi) => {
                          const isErr = r.errorWords.includes(normalizeAr(w));
                          return (
                            <span key={wi} style={{ background: isErr ? "#FEE2E2" : "transparent", color: isErr ? FAIL_COLOR : INK, borderRadius: 3, padding: isErr ? "1px 2px" : 0 }}>
                              {w}{" "}
                            </span>
                          );
                        })}
                        <span style={{ fontSize: 11, color: GOLD, margin: "0 3px" }}>﴿{a.numberInSurah}﴾</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn label="I've Practised — Take the Test →" onClick={finishErrorPractice} />
            </div>
          </div>
        </>
      )}

      {/* ════════ TESTING ════════ */}
      {phase === "testing" && testScore === null && testQuestions.length > 0 && (
        <>
          <Hdr
            title={`Test — Question ${testIdx + 1} / ${testQuestions.length}`}
            sub="Choose the correct answer"
          />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Progress dots */}
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {testQuestions.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < testIdx ? PASS_COLOR : i === testIdx ? GOLD : BRD }} />
              ))}
            </div>

            {(() => {
              const q = testQuestions[testIdx];
              const answered = testAnswers[testIdx];
              return (
                <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
                  {/* Prompt */}
                  <div style={{ padding: "14px", background: `${G}0a`, borderBottom: `1px solid ${BRD}` }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: .5 }}>
                      {q.type === "next_verse" ? "What comes next?" : "Fill in the blank"} · {q.promptLabel}
                    </p>
                    <p style={{ fontSize: 16, direction: "rtl", fontFamily: "'Amiri',serif", color: INK, lineHeight: 2, margin: 0 }}>{q.prompt}</p>
                  </div>

                  {/* Options */}
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {q.options.map((opt, oi) => (
                      <button key={oi} onClick={() => answerQuestion(oi)}
                        style={{
                          width: "100%", padding: "12px 14px", borderRadius: 12, border: `2px solid ${answered === oi ? G : BRD}`,
                          background: answered === oi ? `${G}12` : WARM, cursor: "pointer", textAlign: "right",
                          direction: "rtl", fontFamily: "'Amiri',serif", fontSize: 15, color: INK, fontWeight: answered === oi ? 700 : 400,
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
                {testScore >= PASS_THRESHOLD ? "ممتاز! Test Passed!" : "يحتاج مراجعة — Test Failed"}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
                {testScore >= PASS_THRESHOLD
                  ? "You passed the test — submitting your session now…"
                  : `Score below ${PASS_THRESHOLD}% — please retry the test`}
              </p>
            </div>

            {/* Question breakdown */}
            <div style={{ background: W, borderRadius: 14, border: `1px solid ${BRD}`, padding: "12px 14px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>Question Breakdown</p>
              {testQuestions.map((q, i) => {
                const userAns    = testAnswers[i];
                const isCorrect  = userAns === q.correct;
                return (
                  <div key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: isCorrect ? "#DCFCE7" : "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 800, color: isCorrect ? PASS_COLOR : FAIL_COLOR }}>
                      {isCorrect ? "✓" : "✗"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", margin: 0 }}>Q{i + 1}: {q.promptLabel}</p>
                      {!isCorrect && (
                        <p style={{ fontSize: 10, color: PASS_COLOR, margin: "2px 0 0", direction: "rtl", fontFamily: "'Amiri',serif" }}>✓ {q.correctText.slice(0, 40)}…</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {testScore >= PASS_THRESHOLD
              ? <Btn label="Submit Session ✓" onClick={() => submitSession(testScore!)} />
              : <Btn label="🔄 Retry Test" onClick={retryTest} color="#D97706" />
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

          {/* Trophy */}
          <div style={{ width: 90, height: 90, borderRadius: "50%", background: `${GOLD}22`, border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={40} color={GOLD} />
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 900, fontSize: 22, color: "#fff", margin: 0 }}>اليوم مكتمل! 🎉</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.7)", margin: "6px 0 0" }}>
              Today's session is complete — well done!
            </p>
          </div>

          {/* Stats */}
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

          {/* Hadith */}
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

      {/* ════════ EMPTY TEST ════════ */}
      {phase === "testing" && testScore === null && testQuestions.length === 0 && (
        <>
          <Hdr title="Testing" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
            <Star size={36} color={GOLD} />
            <p style={{ fontWeight: 800, fontSize: 15, color: G, margin: 0 }}>Not enough verses to test</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0, textAlign: "center" }}>
              The assigned pages don't have enough content to generate questions yet. Submitting directly.
            </p>
            <Btn label="Submit Session" onClick={() => submitSession(100)} />
          </div>
        </>
      )}
    </div>
  );
}
