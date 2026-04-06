// src/components/hifdh/HifdhMemorization.tsx
// STRICT MATCHING + MUSHAF PAGE LAYOUT
//   • Only counts when 90%+ match with full verse text
//   • Requires transcript length to be ≥85% of expected
//   • Beautiful Mushaf-style centered page layout
//   • Visual match progress indicator

import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, RECITERS, audioUrl, DEFAULT_RECITER } from "./surahData";

/* ── Palette ──────────────────────────────────────────────────── */
const G      = "#1a3d24";
const GM     = "#276749";
const GOLD   = "#b7791f";
const GOLD_L = "#fef9ee";
const LIGHT  = "#f0fff4";
const BORDER = "#d4e8d4";
const PARCH  = "#faf6ec";
const PARCH2 = "#f3ead8";

const SESSION_KEY = "hifdh_mem_v7";

/* ── Rep count options ────────────────────────────────────────── */
const REP_OPTIONS = [5, 7, 10, 15, 20] as const;
type RepOption = typeof REP_OPTIONS[number];

/* ── Types ───────────────────────────────────────────────────── */
interface Ayah    { numberInSurah: number; text: string; }
interface Props   { reciter?: string; }
type StepType     = "overview" | "single" | "pair" | "cumulative";
interface MemStep { type: StepType; indices: number[]; reps: number; label: string; labelAr: string; }
interface Saved   {
  surahNum: number; startVerse: number; endVerse: number;
  stepIdx: number; repsDone: number; started: boolean; repsPerVerse: number;
}

/* ── Step builder ─────────────────────────────────────────────── */
function buildSteps(count: number, R: number): MemStep[] {
  if (count === 0) return [];
  const RP = Math.max(3, Math.round(R * 0.5));
  const RC = Math.max(3, Math.round(R * 0.5));
  const steps: MemStep[] = [];
  steps.push({
    type: "overview", indices: Array.from({ length: count }, (_, i) => i), reps: 1,
    label: "Read All Verses", labelAr: "تعرّف على النص قبل البدء",
  });
  for (let i = 0; i < count; i++) {
    steps.push({
      type: "single", indices: [i], reps: R,
      label: `Verse ${i + 1} — Repeat ${R}×`,      labelAr: `الآية ${toAr(i + 1)} — كرر ${toAr(R)} مرات`,
    });
    if (i > 0) {
      steps.push({
        type: "pair", indices: [i - 1, i], reps: RP,
        label: `Verses ${i}–${i + 1} Together — ${RP}×`,
        labelAr: `الآيتان ${toAr(i)}–${toAr(i + 1)} معاً — ${toAr(RP)} مرات`,
      });
      steps.push({
        type: "cumulative",
        indices: Array.from({ length: i + 1 }, (_, k) => k), reps: RC,
        label: `Verses 1–${i + 1} Cumulative — ${RC}×`,
        labelAr: `من ١ إلى ${toAr(i + 1)} تراكمياً — ${toAr(RC)} مرات`,
      });
    }
  }
  return steps;
}

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

/* ── Arabic normalise ─────────────────────────────────────────── */
function norm(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0640\u061B\u060C\u061F\u06D4]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Combined text builder ───────────────────────────────────── */
function buildCombinedText(targets: Ayah[]): string {
  return targets.map(a => a.text).join(" ");
}

/* ── STRICT MATCHING - Only counts when nearly complete ──────── */
function matchScore(transcript: string, expectedText: string): { 
  score: number; 
  isComplete: boolean;
  progress: number;
} {
  const t = norm(transcript);
  const e = norm(expectedText);
  
  if (!t || t.length < 3) return { score: 0, isComplete: false, progress: 0 };  
  // Length check - transcript must be at least 85% of expected length
  const lengthRatio = t.length / e.length;
  if (lengthRatio < 0.85) {
    // Calculate partial progress for UI
    const partialScore = lengthRatio * 0.8;
    return { score: partialScore, isComplete: false, progress: partialScore * 100 };
  }
  
  // Exact match
  if (e === t) return { score: 1, isComplete: true, progress: 100 };
  
  // Word-by-word matching
  const eWords = e.split(" ").filter(w => w.length > 1);
  const tWords = t.split(" ");
  
  if (!eWords.length) return { score: 0, isComplete: false, progress: 0 };
  
  const matched = eWords.filter(ew => 
    tWords.some(tw => tw.includes(ew) || ew.includes(tw))
  ).length;
  
  const wordRatio = matched / eWords.length;
  
  // Check if transcript contains most of expected text
  const containsRatio = e.split(" ").filter(w => t.includes(w)).length / eWords.length;
  
  const finalScore = Math.max(wordRatio, containsRatio);
  
  // REQUIRE 90%+ match AND proper length to count as complete
  const isComplete = finalScore >= 0.90 && lengthRatio >= 0.85 && lengthRatio <= 1.3;
  
  return { 
    score: finalScore, 
    isComplete, 
    progress: Math.min(finalScore * 100, 100) 
  };
}

/* ── Speech Recognition wrapper ──────────────────────────────── */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
const SR = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
/* ── Step accent colours ──────────────────────────────────────── */
const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; grad: string }> = {
  overview:   { bg: GOLD_L,    text: GOLD,     border: "#f6d860", icon: "📖", grad: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,         border: BORDER,    icon: "🎯", grad: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", icon: "🔗", grad: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe", icon: "📚", grad: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

/* ══════════════════════════════════════════════════════════════
   COMPONENT - STRICT MATCHING + MUSHAF LAYOUT
══════════════════════════════════════════════════════════════ */
export default function HifdhMemorization({ reciter: reciterProp }: Props) {

  /* ── State ──────────────────────────────────────────────────── */
  const [surahNum,        setSurahNum]        = useState(114);
  const [startVerse,      setStartVerse]      = useState(1);
  const [endVerse,        setEndVerse]        = useState(6);
  const [repsPerVerse,    setRepsPerVerse]    = useState<RepOption>(5);
  const [ayahs,           setAyahs]           = useState<Ayah[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [fetchError,      setFetchError]      = useState("");
  const [started,         setStarted]         = useState(false);
  const [steps,           setSteps]           = useState<MemStep[]>([]);
  const [stepIdx,         setStepIdx]         = useState(0);
  const [repsDone,        setRepsDone]        = useState(0);
  const [completed,       setCompleted]       = useState(false);
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [micActive,       setMicActive]       = useState(false);
  const [liveText,        setLiveText]        = useState("");
  const [micError,        setMicError]        = useState("");
  const [selectedReciter, setSelectedReciter] = useState(reciterProp || DEFAULT_RECITER);
  const [peeking,         setPeeking]         = useState(false);
  const [justCounted,     setJustCounted]     = useState(false);
  const [srAvailable]                         = useState(!!SR);
  const [micTime,         setMicTime]         = useState(0);
  const [recitingVerses,  setRecitingVerses]  = useState<Set<number>>(new Set());
  const [matchProgress,   setMatchProgress]   = useState(0); // 0-100%

  /* ── Refs ───────────────────────────────────────────────────── */
  const sessionAyahsRef    = useRef<Ayah[]>([]);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const playingRef         = useRef(false);
  const srRef              = useRef<any>(null);
  const repsDoneRef        = useRef(0);
  const totalRepsRef       = useRef(5);
  const stepsRef           = useRef<MemStep[]>([]);
  const stepIdxRef         = useRef(0);
  const prevStepIdxRef     = useRef(-1);
  const advanceStepRef     = useRef<() => void>(() => {});
  const pendingRestoreRef  = useRef<Saved | null>(null);  const repsPerVerseRef    = useRef<number>(5);
  const lastCountedText    = useRef("");
  const cooldownRef        = useRef(false);
  const micTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const verseRefs          = useRef<Record<number, HTMLDivElement | null>>({});

  const surah = SURAHS[surahNum - 1];

  /* ── Persistence ────────────────────────────────────────────── */
  const saveSession = useCallback((patch: Partial<Saved> = {}) => {
    try {
      const s: Saved = {
        surahNum, startVerse, endVerse, repsPerVerse,
        stepIdx: stepIdxRef.current, repsDone: repsDoneRef.current, started: true, ...patch,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch { /**/ }
  }, [surahNum, startVerse, endVerse, repsPerVerse]);

  const clearSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /**/ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: Saved = JSON.parse(raw);
      if (!saved.started) return;
      setSurahNum(saved.surahNum);
      setStartVerse(saved.startVerse);
      setEndVerse(saved.endVerse);
      if (saved.repsPerVerse && REP_OPTIONS.includes(saved.repsPerVerse as RepOption)) {
        setRepsPerVerse(saved.repsPerVerse as RepOption);
        repsPerVerseRef.current = saved.repsPerVerse;
      }
      pendingRestoreRef.current = saved;
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fetch ayahs ────────────────────────────────────────────── */
  const fetchAyahs = useCallback(async (num: number) => {
    setLoading(true); setFetchError("");
    try {
      const res  = await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) {
        const loaded: Ayah[] = json.data.ayahs;
        setAyahs(loaded);        const restore = pendingRestoreRef.current;
        if (restore && restore.surahNum === num && restore.started) {
          pendingRestoreRef.current = null;
          const rpv   = REP_OPTIONS.includes(restore.repsPerVerse as RepOption) ? restore.repsPerVerse : repsPerVerseRef.current;
          const slice = loaded.filter(a => a.numberInSurah >= restore.startVerse && a.numberInSurah <= restore.endVerse);
          if (slice.length > 0) {
            sessionAyahsRef.current = slice;
            const ns = buildSteps(slice.length, rpv);
            const si = Math.min(restore.stepIdx, ns.length - 1);
            const rd = Math.min(restore.repsDone, ns[si]?.reps ?? 0);
            stepsRef.current = ns; stepIdxRef.current = si; repsDoneRef.current = rd;
            totalRepsRef.current = ns[si]?.reps ?? rpv; prevStepIdxRef.current = -1;
            setSteps(ns); setStepIdx(si); setRepsDone(rd); setStarted(true); setCompleted(false);
          }
        }
      } else setFetchError("Could not load — please retry.");
    } catch { setFetchError("Network error."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAyahs(surahNum); }, [surahNum, fetchAyahs]);

  /* ── Audio ──────────────────────────────────────────────────── */
  const stopAudio = useCallback(() => {
    playingRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
  }, []);

  const playVerse = useCallback((surahN: number, verseN: number, rec: string) => {
    stopAudio();
    playingRef.current = true; setIsPlaying(true);
    const au = new Audio(audioUrl(surahN, verseN, rec));
    audioRef.current = au;
    au.onended = () => { playingRef.current = false; setIsPlaying(false); };
    au.onerror = () => { playingRef.current = false; setIsPlaying(false); };
    au.play().catch(() => { playingRef.current = false; setIsPlaying(false); });
  }, [stopAudio]);

  /* ── Count one rep ──────────────────────────────────────────── */
  const countOneRep = useCallback(() => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 1500); // Longer cooldown

    const done = repsDoneRef.current + 1;
    repsDoneRef.current = done;
    setRepsDone(done);
    setLiveText("");    setRecitingVerses(new Set());
    setMatchProgress(0);
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 700);
    saveSession({ repsDone: done });

    if (done >= totalRepsRef.current) {
      setTimeout(() => {
        stopSR();
        setTimeout(() => advanceStepRef.current(), 500);
      }, 300);
    }
  }, [saveSession]);

  /* ── Web Speech Recognition - STRICT MATCHING ──────────────── */
  const stopSR = useCallback(() => {
    if (srRef.current) {
      try { srRef.current.stop(); } catch { /**/ }
      srRef.current = null;
    }
    if (micTimerRef.current) clearInterval(micTimerRef.current);
    setMicActive(false);
    setMicTime(0);
    setLiveText("");
    setRecitingVerses(new Set());
    setMatchProgress(0);
  }, []);

  const startSR = useCallback(() => {
    if (!SR) { setMicError("Speech recognition not supported."); return; }
    if (srRef.current) return;

    setMicError("");
    lastCountedText.current = "";
    cooldownRef.current     = false;

    const sr = new SR();
    sr.lang              = "ar-SA";
    sr.continuous        = true;
    sr.interimResults    = true;
    sr.maxAlternatives   = 3;

    sr.onstart = () => {
      setMicActive(true);
      setMicTime(0);
      micTimerRef.current = setInterval(() => setMicTime(t => t + 1), 1000);
    };

    sr.onresult = (event: any) => {
      const step = stepsRef.current[stepIdxRef.current];      if (!step || step.type === "overview") return;
      
      const targets = step.indices.map(i => sessionAyahsRef.current[i]).filter(Boolean);
      if (!targets.length) return;

      const combinedText = buildCombinedText(targets);
      const expectedNorm = norm(combinedText);

      let bestTranscript = "";
      let hasFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          const text = result[j].transcript || "";
          if (!bestTranscript || text.length > bestTranscript.length) bestTranscript = text;
        }
        if (result.isFinal) hasFinal = true;
      }

      if (!bestTranscript.trim()) return;
      setLiveText(bestTranscript.slice(-100));

      // Update highlighting
      const transcriptNorm = norm(bestTranscript);
      const activeVerses = new Set<number>();
      
      targets.forEach((ayah) => {
        const ayahNorm = norm(ayah.text);
        if (transcriptNorm.includes(ayahNorm) || ayahNorm.includes(transcriptNorm)) {
          activeVerses.add(ayah.numberInSurah);
        }
      });
      setRecitingVerses(activeVerses);

      // STRICT MATCHING - Check match quality
      const { score, isComplete, progress } = matchScore(bestTranscript, combinedText);
      setMatchProgress(progress);

      // ONLY COUNT when:
      // 1. Final result (not interim)
      // 2. Match is complete (90%+ score, proper length)
      // 3. Not the same as last counted
      if (hasFinal && isComplete) {
        const normText = norm(bestTranscript);
        if (normText !== lastCountedText.current && normText.length > 10) {
          lastCountedText.current = normText;
          if (repsDoneRef.current < totalRepsRef.current) {
            countOneRep();
          }        }
      }
    };

    sr.onerror = (e: any) => {
      console.warn("SR error:", e.error);
      if (e.error === "not-allowed") {
        setMicError("🎤 Mic access denied");
        stopSR();
      } else if (e.error === "no-speech") {
        // auto-restart
      } else if (e.error === "network") {
        setMicError("Network error");
        stopSR();
      }
    };

    sr.onend = () => {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      const stillActive = !!srRef.current;
      srRef.current = null;
      if (stillActive && repsDoneRef.current < totalRepsRef.current) {
        setTimeout(() => {
          if (repsDoneRef.current < totalRepsRef.current) startSR();
        }, 300);
      } else {
        setMicActive(false);
        setMicTime(0);
        setRecitingVerses(new Set());
        setMatchProgress(0);
      }
    };

    srRef.current = sr;
    try { sr.start(); }
    catch (err) {
      console.warn("SR start error:", err);
      srRef.current = null;
      setMicError("Could not start mic");
    }
  }, [countOneRep, stopSR]);

  /* ── Step navigation ────────────────────────────────────────── */
  const advanceStep = useCallback(() => {
    stopSR();
    const idx = stepIdxRef.current;
    const all = stepsRef.current;
    if (idx < all.length - 1) {
      const next = idx + 1;
      stepIdxRef.current   = next;      repsDoneRef.current  = 0;
      totalRepsRef.current = all[next].reps;
      lastCountedText.current = "";
      setStepIdx(next); setRepsDone(0); setPeeking(false); setRecitingVerses(new Set()); setMatchProgress(0);
      stopAudio();
      saveSession({ stepIdx: next, repsDone: 0 });
    } else {
      stopAudio();
      clearSession();
      setCompleted(true);
    }
  }, [stopAudio, saveSession, clearSession, stopSR]);

  useEffect(() => { advanceStepRef.current = advanceStep; }, [advanceStep]);

  /* ── Auto-start mic when step changes ──────────────────────── */
  useEffect(() => {
    if (!started || steps.length === 0) return;
    const step = steps[stepIdx];
    if (!step || step.type === "overview") { stopSR(); return; }
    if (stepIdx === prevStepIdxRef.current) return;
    prevStepIdxRef.current = stepIdx;
    stopSR();
    const t = setTimeout(() => startSR(), 400);
    return () => clearTimeout(t);
  }, [stepIdx, started, steps, startSR, stopSR]);

  /* ── Scroll active verse into view ─────────────────────────── */
  useEffect(() => {
    const step = steps[stepIdx];
    if (!step || step.type === "overview") return;
    
    const activeIndices = step.indices;
    if (activeIndices.length > 0 && sessionAyahsRef.current.length > 0) {
      const firstActiveVerse = sessionAyahsRef.current[activeIndices[0]]?.numberInSurah;
      if (firstActiveVerse && verseRefs.current[firstActiveVerse]) {
        verseRefs.current[firstActiveVerse]?.scrollIntoView({ 
          behavior: "smooth", 
          block: "center" 
        });
      }
    }
  }, [stepIdx, steps]);

  /* ── Cleanup on unmount ─────────────────────────────────────── */
  useEffect(() => () => {
    audioRef.current?.pause();
    stopSR();
  }, [stopSR]);
  /* ── Manual rep ─────────────────────────────────────────────── */
  const markRep = () => {
    const step = steps[stepIdx];
    if (!step) return;
    if (step.type === "overview") { advanceStep(); return; }
    countOneRep();
  };

  /* ── Play current step ──────────────────────────────────────── */
  const playCurrentStep = () => {
    const step = steps[stepIdx];
    const pool = sessionAyahsRef.current;
    if (!step || !pool.length) return;
    stopAudio(); playingRef.current = true; setIsPlaying(true);
    const toPlay = step.indices.map(i => pool[i]).filter(Boolean);
    let i = 0;
    const playNext = () => {
      if (!playingRef.current || i >= toPlay.length) { setIsPlaying(false); return; }
      const au = new Audio(audioUrl(surahNum, toPlay[i].numberInSurah, selectedReciter));
      audioRef.current = au;
      au.play().catch(() => { setIsPlaying(false); playingRef.current = false; });
      au.onended = () => { i++; playNext(); };
    };
    playNext();
  };

  /* ── Session start ──────────────────────────────────────────── */
  const startSession = () => {
    const s     = Math.max(1, startVerse);
    const e     = Math.min(surah.verses, Math.max(s, endVerse));
    const slice = ayahs.filter(a => a.numberInSurah >= s && a.numberInSurah <= e);
    if (!slice.length) return;
    sessionAyahsRef.current = slice;
    repsPerVerseRef.current = repsPerVerse;
    const ns = buildSteps(slice.length, repsPerVerse);
    stepsRef.current        = ns;
    stepIdxRef.current      = 0;
    repsDoneRef.current     = 0;
    totalRepsRef.current    = ns[0]?.reps ?? repsPerVerse;
    prevStepIdxRef.current  = -1;
    lastCountedText.current = "";
    setSteps(ns); setStepIdx(0); setRepsDone(0);
    setPeeking(false); setCompleted(false); setStarted(true);
    setRecitingVerses(new Set());
    setMatchProgress(0);
    stopAudio(); stopSR();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e, repsPerVerse });
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    boxShadow: "0 2px 10px rgba(26,61,36,.06)", ...ex,
  });

  /* ─────────────────────────────────────────────────────────────
     COMPLETED
  ───────────────────────────────────────────────────────────── */
  if (completed) return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "16px", background: LIGHT }}>
      <div style={card({ padding: "28px 20px", textAlign: "center", maxWidth: 340 })}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🎉</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: G, fontWeight: 700 }}>Session Complete!</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD, marginTop: 4 }}>أحسنت! أكملت الجلسة</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, width: "100%", maxWidth: 340 }}>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); }}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
            background: "#f8fafb", color: G, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ← New
        </button>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
            background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          🔁 Repeat
        </button>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────
     SETUP
  ───────────────────────────────────────────────────────────── */
  if (!started) {
    const verseCount = Math.max(0, endVerse - startVerse + 1);
    const canStart   = !loading && ayahs.length > 0 && endVerse >= startVerse;
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: LIGHT, overflow: "hidden" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; overflow: hidden; }
        `}</style>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "14px 16px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 36 }}>🧠</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#fff", fontWeight: 700 }}>Memorization</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: "rgba(255,255,255,.8)" }}>نظام الحفظ المنهجي</div>
        </div>
        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          
          {/* Speech status */}
          <div style={card({ padding: "8px 12px" })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 18 }}>{srAvailable ? "🎙" : "⚠️"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
                  {srAvailable ? "Strict Matching Active" : "Speech Not Available"}
                </div>
                <div style={{ fontSize: 10, color: "#7a9e88" }}>
                  {srAvailable ? "90% match required to count" : "Use Chrome on Android"}
                </div>
              </div>
              <div style={{ padding: "2px 8px", borderRadius: 12,
                background: srAvailable ? LIGHT : "#fff5f5",
                border: `1px solid ${srAvailable ? BORDER : "#fca5a5"}`,
                fontSize: 10, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
                {srAvailable ? "✓" : "✗"}
              </div>
            </div>
          </div>

          {/* Surah & Verse */}
          <div style={card({ padding: "10px" })}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#7a9e88", marginBottom: 6 }}>
              SURAH & VERSE
            </div>
            <select value={surahNum}
              onChange={e => { setSurahNum(Number(e.target.value)); setStartVerse(1); setEndVerse(1); }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: `1px solid ${BORDER}`,
                fontSize: 13, color: G, background: "#f8fafb", marginBottom: 8 }}>
              {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.verses}v)</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {([
                ["From", startVerse, (v: number) => setStartVerse(v), 1,          surah.verses],
                ["To",   endVerse,   (v: number) => setEndVerse(v),   startVerse, surah.verses],
              ] as const).map(([label, val, setter, min, max], i) => (
                <div key={i}>
                  <div style={{ fontSize: 9, color: "#7a9e88", fontWeight: 600, marginBottom: 2 }}>{label}</div>
                  <input type="number" min={min as number} max={max as number} value={val as number}
                    onChange={e => (setter as Function)(Number(e.target.value))}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${BORDER}`,
                      fontSize: 14, color: G, background: "#f8fafb", fontWeight: 700 }} />
                </div>
              ))}
            </div>
            {/* Rep selector */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "#7a9e88", fontWeight: 700, marginBottom: 4 }}>
                REPETITIONS
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {REP_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => { setRepsPerVerse(opt); repsPerVerseRef.current = opt; }}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${repsPerVerse === opt ? G : BORDER}`,
                      background: repsPerVerse === opt ? G : "#f8fafb",
                      color: repsPerVerse === opt ? "#fff" : "#7a9e88",
                      fontSize: 13, fontWeight: 700,
                    }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {verseCount > 0 && (
              <div style={{ padding: "5px 10px", borderRadius: 8, background: LIGHT, border: `1px solid ${BORDER}`,
                fontSize: 10, color: G, fontWeight: 600, textAlign: "center", marginTop: 6 }}>
                {verseCount} verse{verseCount !== 1 ? "s" : ""} · {buildSteps(verseCount, repsPerVerse).length} steps
              </div>
            )}
          </div>

          {/* Reciter */}
          <div style={card({ padding: "8px 10px" })}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#7a9e88", marginBottom: 4 }}>
              🎙 RECITER
            </div>
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
              {RECITERS.map(r => (
                <button key={r.id} onClick={() => setSelectedReciter(r.id)}
                  style={{
                    flexShrink: 0, padding: "5px 10px", borderRadius: 14,
                    border: `2px solid ${selectedReciter === r.id ? G : BORDER}`,
                    background: selectedReciter === r.id ? G : "#f8fafb",
                    color: selectedReciter === r.id ? "#fff" : "#7a9e88",
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>        </div>

        {/* Bottom Button */}
        <div style={{ padding: "8px 12px 12px", background: "#fff", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button onClick={startSession} disabled={!canStart}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
              cursor: canStart ? "pointer" : "not-allowed",
              background: canStart ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
              color: canStart ? "#fff" : "#7a9e88", fontSize: 14, fontWeight: 800 }}>
            {loading ? "Loading…" : !canStart ? "Adjust range" : "🧠 Begin · ابدأ"}
          </button>
          {fetchError && (
            <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, background: "#fff5f5",
              border: "1px solid #fca5a5", fontSize: 11, color: "#c0392b", textAlign: "center" }}>
              {fetchError} — <button onClick={() => fetchAyahs(surahNum)}
                style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     ACTIVE SESSION - MUSHAF PAGE LAYOUT
  ───────────────────────────────────────────────────────────── */
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT }}>
      <div style={{ fontSize: 12, color: "#7a9e88" }}>Starting…</div>
    </div>
  );

  const col        = STEP_STYLE[currentStep.type];
  const progress   = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool       = sessionAyahsRef.current;
  const isOverview = currentStep.type === "overview";
  const activeSet  = new Set(currentStep.indices);
  const isGoodText = liveText && !liveText.startsWith("…");
  const isMultiVerse = currentStep.indices.length > 1;

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: PARCH, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        @keyframes flashGreen{0%{background:#bbf7d0;transform:scale(1.25)}100%{transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}        @keyframes matchPulse{0%,100%{box-shadow:0 0 0 0 rgba(183,121,31,0.7)}50%{box-shadow:0 0 0 12px rgba(183,121,31,0)}}
        .peek-btn{user-select:none;-webkit-user-select:none}
        .verse-active { 
          background: linear-gradient(135deg, #fffbeb, #fff);
          border: 2px solid ${GOLD};
          border-radius: 12px;
          animation: matchPulse 2s ease-in-out;
        }
        .verse-reciting {
          background: ${LIGHT};
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow: hidden; }
      `}</style>

      {/* ── HEADER - STATIC ──────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: `2px solid ${BORDER}`, padding: "8px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18 }}>{col.icon}</span>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: col.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                {currentStep.label.split("—")[0].trim()}
              </div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 10, color: col.text, opacity: .8 }}>
                {currentStep.labelAr}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#7a9e88", fontWeight: 700 }}>
              {stepIdx + 1}/{steps.length}
            </span>
            <button onClick={() => { stopAudio(); stopSR(); clearSession(); setStarted(false); setStepIdx(0); setRepsDone(0); }}
              style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`,
                background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 2,
            background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .3s ease" }} />
        </div>
      </div>

      {/* ── MUSHAF PAGE - SCROLLABLE QURAN TEXT ──────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",        background: `linear-gradient(180deg, ${PARCH} 0%, ${PARCH2} 100%)`,
        padding: "16px 12px",
      }}>
        {/* Surah Header */}
        <div style={{
          background: `linear-gradient(135deg,${G},${GM})`,
          borderRadius: 12,
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 12px rgba(26,61,36,0.15)",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
              {SURAHS[surahNum - 1]?.name}
            </div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: "rgba(255,255,255,.8)", direction: "rtl" }}>
              {SURAHS[surahNum - 1]?.nameAr} · {toAr(startVerse)}–{toAr(endVerse)}
            </div>
          </div>
          <button onClick={() => isPlaying ? stopAudio() : playCurrentStep()}
            style={{ padding: "6px 14px", borderRadius: 20,
              border: "2px solid rgba(255,255,255,.4)",
              background: isPlaying ? "#dc2626" : "rgba(255,255,255,.15)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {isPlaying ? "⏹ Stop" : "🔊 Listen"}
          </button>
        </div>

        {/* Verses - Mushaf Style */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pool.map((ayah, poolIdx) => {
            const isActive = activeSet.has(poolIdx);
            const isReciting = recitingVerses.has(ayah.numberInSurah);
            const isCumul  = currentStep.type === "cumulative";
            const hideText = isCumul && !peeking && isActive;
            const isHidden = !isActive;

            return (
              <div 
                key={ayah.numberInSurah}
                ref={el => { verseRefs.current[ayah.numberInSurah] = el; }}
                style={{
                  background: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                  borderRadius: 16,
                  padding: isActive ? "20px 16px" : "12px 16px",
                  opacity: isHidden ? 0.4 : 1,
                  filter: isHidden ? "blur(2px)" : "none",                  boxShadow: isActive 
                    ? isReciting 
                      ? "0 6px 20px rgba(183,121,31,0.25)" 
                      : "0 4px 12px rgba(26,61,36,0.1)"
                    : "none",
                  border: isActive ? `2px solid ${isReciting ? GOLD : BORDER}` : "1px solid rgba(200,190,170,0.3)",
                  transition: "all .3s ease",
                  pointerEvents: isHidden ? "none" : "auto",
                  position: "relative",
                }}>

                {isActive && (
                  <>
                    {/* Verse Number Badge */}
                    <div style={{
                      position: "absolute",
                      top: 8,
                      right: 12,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${currentStep.type === "single" ? GOLD : G}, ${GM})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}>
                      <span style={{ fontFamily: "'Amiri',serif", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                        {toAr(ayah.numberInSurah)}
                      </span>
                    </div>

                    {/* Play Button */}
                    <button 
                      onClick={() => playVerse(surahNum, ayah.numberInSurah, selectedReciter)}
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 12,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: `2px solid ${BORDER}`,
                        background: LIGHT,
                        color: G,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",                        justifyContent: "center",
                      }}>
                      ▶
                    </button>

                    {/* Quran Text - Centered Mushaf Style */}
                    <div style={{
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      fontSize: 28,
                      color: G,
                      lineHeight: 2.6,
                      textAlign: "center",
                      direction: "rtl",
                      marginTop: 24,
                      marginBottom: 12,
                      opacity: hideText ? 0.08 : 1,
                      filter: hideText ? "blur(12px)" : "none",
                      transition: "opacity .2s, filter .2s",
                      wordBreak: "break-word",
                      padding: "0 8px",
                    }}>
                      {ayah.text}
                    </div>

                    {/* End of Verse Marker */}
                    <div style={{
                      textAlign: "center",
                      fontSize: 18,
                      color: GOLD,
                      fontFamily: "'Amiri',serif",
                      marginTop: 4,
                      opacity: hideText ? 0.1 : 1,
                    }}>
                      ۝
                    </div>

                    {isCumul && (
                      <button className="peek-btn"
                        onPointerDown={() => setPeeking(true)}
                        onPointerUp={() => setPeeking(false)}
                        onPointerLeave={() => setPeeking(false)}
                        onPointerCancel={() => setPeeking(false)}
                        style={{ width: "100%", padding: "8px 0", borderRadius: 10, marginTop: 12,
                          border: `1.5px solid ${peeking ? G : BORDER}`,
                          background: peeking ? LIGHT : "#f8fafb",
                          color: peeking ? G : "#7a9e88",
                          fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {peeking ? "👁 Showing…" : "👁 Hold to Reveal"}
                      </button>
                    )}                  </>
                )}

                {isHidden && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#d8cfc0",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "'Amiri',serif", fontSize: 11, color: "#888" }}>
                        {toAr(ayah.numberInSurah)}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(180,165,140,0.3)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Text */}
        {isGoodText && (
          <div style={{
            margin: "16px 8px 8px",
            padding: "12px 16px",
            borderRadius: 12,
            background: "#f0fff4",
            border: `2px solid ${BORDER}`,
            fontSize: 18,
            direction: "rtl",
            fontFamily: "'Amiri',serif",
            color: G,
            textAlign: "center",
            animation: "slideIn .25s ease",
          }}>
            {liveText}
          </div>
        )}

        {/* Match Progress Bar */}
        {micActive && matchProgress > 0 && matchProgress < 100 && (
          <div style={{
            margin: "8px",
            padding: "8px 12px",
            borderRadius: 10,
            background: col.bg,
            border: `1.5px solid ${col.border}`,
          }}>
            <div style={{ fontSize: 11, color: col.text, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>
              Matching... {Math.round(matchProgress)}%
            </div>            <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
              <div style={{ 
                width: `${matchProgress}%`, 
                height: "100%", 
                borderRadius: 3,
                background: matchProgress >= 85 ? GOLD : col.text,
                transition: "width .3s ease"
              }} />
            </div>
          </div>
        )}

        {/* Multi-verse indicator */}
        {isMultiVerse && micActive && (
          <div style={{
            margin: "8px",
            padding: "8px 12px",
            borderRadius: 10,
            background: col.bg,
            border: `1.5px solid ${col.border}`,
            fontSize: 11,
            color: col.text,
            fontWeight: 600,
            textAlign: "center",
          }}>
            🔗 Reciting {currentStep.indices.length} verses — Complete all to count
          </div>
        )}
      </div>

      {/* ── FOOTER - STATIC ──────────────────────────────────── */}
      <div style={{ background: "#fff", borderTop: `2px solid ${BORDER}`, flexShrink: 0 }}>
        
        {/* Counting Strip */}
        {!isOverview && (
          <div style={{
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            {/* Mic waveform */}
            {micActive && (
              <div style={{ display: "flex", alignItems: "center", gap: 2.5, marginRight: 2 }}>
                {[5, 10, 7, 14, 8, 12, 6].map((h, i) => (
                  <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: "#ef4444",
                    animation: `wavePulse .75s ease-in-out ${i * 0.09}s infinite alternate` }} />
                ))}
              </div>            )}

            {/* Rep dots */}
            <div style={{ display: "flex", gap: 5, flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
              {Array.from({ length: currentStep.reps }, (_, i) => {
                const done    = i < repsDone;
                const current = i === repsDone;
                return (
                  <div key={i} style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: done
                      ? col.grad
                      : current && justCounted
                      ? "#bbf7d0"
                      : current
                      ? `${col.text}18`
                      : "#f0f4f0",
                    color: done ? "#fff" : current ? col.text : "#ccc",
                    border: `2px solid ${current ? col.text : done ? "transparent" : "#e4e4e4"}`,
                    boxShadow: current ? `0 0 0 3px ${col.text}25` : "none",
                    animation: done && i === repsDone - 1 && justCounted ? "flashGreen .5s ease" : "none",
                    transition: "all .3s ease",
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                );
              })}
            </div>

            {/* Count */}
            <div style={{ textAlign: "center", minWidth: 40 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: G, lineHeight: 1,
                animation: justCounted ? "flashGreen .4s ease" : "none" }}>
                {repsDone}
              </div>
              <div style={{ fontSize: 11, color: "#7a9e88" }}>/ {currentStep.reps}</div>
            </div>

            {micActive && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", minWidth: 40, textAlign: "center" }}>
                {String(Math.floor(micTime / 60)).padStart(2, "0")}:{String(micTime % 60).padStart(2, "0")}
              </div>
            )}
          </div>
        )}

        {/* Mic error */}
        {micError && (          <div style={{ margin: "6px 12px", padding: "6px 10px", borderRadius: 8, background: "#fffbeb",
            border: "1px solid #f6d860", fontSize: 11, color: "#856404", textAlign: "center" }}>
            {micError}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, padding: "12px" }}>
          {!isOverview && (
            micActive ? (
              <button onClick={stopSR}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                  background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                🎙 Stop
              </button>
            ) : (
              <button onClick={startSR}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                🎙 Start
              </button>
            )
          )}

          <button onClick={markRep}
            style={{ flex: isOverview ? 2 : 1, padding: "14px 0", borderRadius: 12, border: "none",
              background: col.grad, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            {isOverview
              ? "Begin →"
              : repsDone + 1 >= currentStep.reps
              ? stepIdx < steps.length - 1 ? "✓ Next" : "🎉 Done"
              : `✓ ${repsDone + 1}`}
          </button>
        </div>

        {/* Back button */}
        <button
          onClick={() => {
            stopAudio(); stopSR(); setPeeking(false); setRecitingVerses(new Set()); setMatchProgress(0);
            if (stepIdx > 0) {
              const prev = stepIdx - 1;
              stepIdxRef.current = prev; repsDoneRef.current = 0;
              totalRepsRef.current = steps[prev].reps;
              prevStepIdxRef.current = -1; lastCountedText.current = "";
              setStepIdx(prev); setRepsDone(0);
              saveSession({ stepIdx: prev, repsDone: 0 });
            } else {
              clearSession(); setStarted(false);
            }          }}
          style={{ margin: "0 12px 12px", padding: "10px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
            background: "#f8fafb", color: "#7a9e88", fontSize: 12, cursor: "pointer", width: "calc(100% - 24px)" }}>
          ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
        </button>
      </div>
    </div>
  );
}