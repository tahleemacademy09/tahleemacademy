// src/components/hifdh/HifdhMemorization.tsx
// STRICT MULTI-VERSE MATCHING + COMPLETELY HIDDEN VERSES
//   • Multi-verse: ALL words from ALL verses required before counting
//   • Non-active verses: display:none + visibility:hidden + pointer-events:none
//   • Cumulative mode: hidden verses completely invisible until peek

import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, RECITERS, audioUrl, DEFAULT_RECITER } from "./surahData";

/* ── Palette ────────────────────────────────────────────────── */
const G      = "#1a3d24";
const GM     = "#276749";
const GOLD   = "#b7791f";
const GOLD_L = "#fef9ee";
const LIGHT  = "#f0fff4";
const BORDER = "#d4e8d4";
const PARCH  = "#faf6ec";
const PARCH2 = "#f3ead8";

const SESSION_KEY = "hifdh_mem_v20";

/* ── Rep count options ───────────────────────────────────────── */
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
      label: `Verse ${i + 1} — Repeat ${R}×`,
      labelAr: `الآية ${toAr(i + 1)} — كرر ${toAr(R)} مرات`,    });
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

/* ── Huruf Muqatta'at normaliser ──────────────────────────────────
   Web Speech API spells out letter names when it hears muqatta'at.
   ASR outputs WITHOUT hamza on alif: "الف لام ميم" (not "ألف لام ميم").
   We normalise alif variants FIRST, then match, so both forms collapse.  */
function normalizeHurufMuqattaat(text: string): string {
  // Step 1: flatten all alif variants so patterns only need "ا"
  const t = text
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[\u064B-\u065F\u0670]/g, ""); // strip diacritics early for matching

  // Step 2: longest combos first to avoid partial matches
  return t
    .replace(/الف\s+لام\s+ميم\s+را/g,         "المر")
    .replace(/الف\s+لام\s+ميم\s+صاد/g,        "المص")
    .replace(/كاف\s+ها\s+يا\s+عين\s+صاد/g,    "كهيعص")
    .replace(/عين\s+سين\s+قاف/g,              "عسق")
    .replace(/طا\s+سين\s+ميم/g,               "طسم")
    .replace(/حا\s+ميم\s+عين\s+سين\s+قاف/g,  "حمعسق")
    .replace(/الف\s+لام\s+ميم/g,              "الم")
    .replace(/الف\s+لام\s+را/g,               "الر")
    .replace(/الف\s+لام\s+ميم\b/g,            "الم")
    .replace(/حا\s+ميم/g,                     "حم")
    .replace(/يا\s+سين/g,                     "يس")
    .replace(/طا\s+سين/g,                     "طس")
    .replace(/طا\s+ها/g,                      "طه")
    // standalone letter names
    .replace(/\bصاد\b/g,   "ص")
    .replace(/\bقاف\b/g,   "ق")
    .replace(/\bنون\b/g,   "ن")
    .replace(/\bالف\b/g,   "ا")
    .replace(/\bلام\b/g,   "ل")
    .replace(/\bميم\b/g,   "م")
    .replace(/\bرا\b/g,    "ر")
    .replace(/\bسين\b/g,   "س")
    .replace(/\bعين\b/g,   "ع")
    .replace(/\bها\b/g,    "ه")
    .replace(/\bكاف\b/g,   "ك");
}

/* ── Arabic normalise ─────────────────────────────────────────── */
function norm(text: string): string {
  return normalizeHurufMuqattaat(text)
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

/* ── STRICT MULTI-VERSE MATCHING ─────────────────────────────── */
function isVerseComplete(transcript: string, targets: Ayah[]): {
  isComplete: boolean;
  progress: number;
  missingWords: string[];
} {
  const t = norm(transcript);
  
  // Build combined expected text
  const combinedText = buildCombinedText(targets);
  const e = norm(combinedText);  
  if (!t || t.length < 3) return { isComplete: false, progress: 0, missingWords: [] };
  if (!e) return { isComplete: false, progress: 0, missingWords: [] };
  
  // Get all meaningful words from ALL verses
  const eWords = e.split(" ").filter(w => w.length > 1);
  
  if (eWords.length === 0) {
    const lengthRatio = t.length / Math.max(1, e.length);
    return { 
      isComplete: lengthRatio >= 0.9 && lengthRatio <= 1.2, 
      progress: Math.min(lengthRatio * 100, 100),
      missingWords: []
    };
  }
  
  // ✅ STRICT: Check each word from ALL verses
  const foundWords: string[] = [];
  const missingWords: string[] = [];
  
  for (const ew of eWords) {
    // Word must be contained in transcript (strict containment)
    const isFound = t.includes(ew);
    
    if (isFound) {
      foundWords.push(ew);
    } else {
      missingWords.push(ew);
    }
  }
  
  const coverage = foundWords.length / eWords.length;
  const lengthRatio = t.length / Math.max(1, e.length);
  
  // ✅ MULTI-VERSE STRICT: ALL words from ALL verses must be present
  const isComplete = coverage === 1 && lengthRatio >= 0.85 && lengthRatio <= 1.3;
  const progress = Math.min(coverage * 100, 100);
  
  return { isComplete, progress, missingWords };
}

/* ── Speech Recognition wrapper ──────────────────────────────── */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
const SR = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)  : null;

/* ── Step accent colours ──────────────────────────────────────── */
const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; grad: string }> = {
  overview:   { bg: GOLD_L,    text: GOLD,     border: "#f6d860", icon: "📖", grad: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,         border: BORDER,    icon: "🎯", grad: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", icon: "🔗", grad: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe", icon: "📚", grad: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

/* ══════════════════════════════════════════════════════════════
   COMPONENT - STRICT MULTI-VERSE + COMPLETELY HIDDEN VERSES
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
  const [matchProgress,   setMatchProgress]   = useState(0);
  const [missingWords,    setMissingWords]    = useState<string[]>([]);
  const [isListening,     setIsListening]     = useState(false);

  /* ── Refs ───────────────────────────────────────────────────── */
  const sessionAyahsRef    = useRef<Ayah[]>([]);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const playingRef         = useRef(false);
  const srRef              = useRef<any>(null);
  const repsDoneRef        = useRef(0);
  const totalRepsRef       = useRef(5);
  const stepsRef           = useRef<MemStep[]>([]);  const stepIdxRef         = useRef(0);
  const prevStepIdxRef     = useRef(-1);
  const advanceStepRef     = useRef<() => void>(() => {});
  const pendingRestoreRef  = useRef<Saved | null>(null);
  const repsPerVerseRef    = useRef<number>(5);
  const lastCountedText    = useRef("");
  const lastCountedTimeRef = useRef(0);
  const micTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const verseRefs          = useRef<Record<number, HTMLDivElement | null>>({});
  
  /* ── VOICE ACTIVATION REFS ─────────────────────────────────── */
  const lastVoiceTimeRef   = useRef<number>(0);
  const silenceCheckRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTranscriptRef = useRef("");

  const surah = SURAHS[surahNum - 1];

  /* ── Persistence ──────────────────────────────────────────── */
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
        setAyahs(loaded);
        const restore = pendingRestoreRef.current;
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

  /* ── Audio ─────────────────────────────────────────────────── */
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

  /* ── Count one rep ─────────────────────────────────────────── */  const countOneRep = useCallback(() => {
    const done = repsDoneRef.current + 1;
    repsDoneRef.current = done;
    setRepsDone(done);
    
    // ✅ CLEAR TRANSCRIPTION FOR NEXT REP
    setLiveText("");
    setRecitingVerses(new Set());
    setMatchProgress(0);
    setMissingWords([]);
    setIsListening(false);
    currentTranscriptRef.current = "";
    lastVoiceTimeRef.current = 0;
    
    // Record count time for double-count prevention
    lastCountedTimeRef.current = Date.now();
    
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 500);
    saveSession({ repsDone: done });

    // If all reps done, advance after delay
    if (done >= totalRepsRef.current) {
      setTimeout(() => {
        stopSR();
        setTimeout(() => advanceStepRef.current(), 500);
      }, 300);
    }
  }, [saveSession]);

  /* ── Check for silence (600ms — fast reader friendly) ──────────── */
  const startSilenceChecker = useCallback(() => {
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
    }
    
    const silenceThreshold = 600;
    
    silenceCheckRef.current = setInterval(() => {
      const silenceDuration = Date.now() - lastVoiceTimeRef.current;
      
      if (silenceDuration > silenceThreshold) {
        if (silenceCheckRef.current) {
          clearInterval(silenceCheckRef.current);
          silenceCheckRef.current = null;
        }
        setIsListening(false);
        
        // Try to match and count
        const step = stepsRef.current[stepIdxRef.current];        if (step && step.type !== "overview") {
          const targets = step.indices.map(i => sessionAyahsRef.current[i]).filter(Boolean);
          if (targets.length > 0) {
            const { isComplete } = isVerseComplete(currentTranscriptRef.current, targets);
            
            // ✅ STRICT: Only count if ALL words from ALL verses present
            if (isComplete && repsDoneRef.current < totalRepsRef.current) {
              countOneRep();
            }
          }
        }
      }
    }, 400);
  }, [countOneRep]);

  /* ── Web Speech Recognition ────────────────────────────────── */
  const stopSR = useCallback(() => {
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }
    if (micTimerRef.current) clearInterval(micTimerRef.current);
    if (srRef.current) {
      try { srRef.current.stop(); } catch { /**/ }
      srRef.current = null;
    }
    setMicActive(false);
    setMicTime(0);
    setLiveText("");
    setIsListening(false);
    currentTranscriptRef.current = "";
  }, []);

  const startSR = useCallback(() => {
    if (!SR) { setMicError("Speech recognition not supported."); return; }
    if (srRef.current) return;

    setMicError("");
    lastCountedText.current = "";
    currentTranscriptRef.current = "";
    lastVoiceTimeRef.current = Date.now();
    lastCountedTimeRef.current = 0;
    setIsListening(false);

    const sr = new SR();
    sr.lang = "ar-SA";
    sr.continuous = true;
    sr.interimResults = true;
    sr.maxAlternatives = 3;
    sr.onstart = () => {
      setMicActive(true);
      setMicTime(0);
      micTimerRef.current = setInterval(() => setMicTime(t => t + 1), 1000);
    };

    sr.onresult = (event: any) => {
      const step = stepsRef.current[stepIdxRef.current];
      if (!step || step.type === "overview") return;
      
      const targets = step.indices.map(i => sessionAyahsRef.current[i]).filter(Boolean);
      if (!targets.length) return;

      let bestTranscript = "";
      let hasFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          const text = result[j].transcript || "";
          if (text.length > bestTranscript.length) bestTranscript = text;
        }
        if (result.isFinal) hasFinal = true;
      }

      if (!bestTranscript.trim()) return;
      
      // ✅ VOICE DETECTED - Update immediately
      lastVoiceTimeRef.current = Date.now();
      setIsListening(true);
      
      currentTranscriptRef.current = bestTranscript;
      setLiveText(bestTranscript.slice(-100));

      // Highlighting
      const transcriptNorm = norm(bestTranscript);
      const activeVerses = new Set<number>();
      
      targets.forEach((ayah) => {
        const ayahNorm = norm(ayah.text);
        if (transcriptNorm.includes(ayahNorm) || ayahNorm.includes(transcriptNorm)) {
          activeVerses.add(ayah.numberInSurah);
        }
      });
      setRecitingVerses(activeVerses);

      // ✅ STRICT MULTI-VERSE MATCHING
      const { isComplete, progress, missingWords: missing } = isVerseComplete(bestTranscript, targets);
      setMatchProgress(progress);
      setMissingWords(missing.slice(0, 3));
      // Start silence checker
      if (!silenceCheckRef.current) {
        startSilenceChecker();
      }

      // ✅ Count as soon as complete — don't wait for isFinal (too slow for fast readers)
      const timeSinceLastCount = Date.now() - lastCountedTimeRef.current;
      const normText = norm(bestTranscript);
      
      if (isComplete && 
          normText !== lastCountedText.current && 
          timeSinceLastCount > 500 &&
          repsDoneRef.current < totalRepsRef.current) {
        lastCountedText.current = normText;
        countOneRep();
      }
    };

    sr.onerror = (e: any) => {
      console.warn("SR error:", e.error);
      if (e.error === "not-allowed") {
        setMicError("🎤 Mic access denied");
        stopSR();
      } else if (e.error === "no-speech") {
        // Keep going
      } else if (e.error === "network") {
        setMicError("Network error");
        stopSR();
      }
    };

    sr.onend = () => {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      if (silenceCheckRef.current) {
        clearInterval(silenceCheckRef.current);
        silenceCheckRef.current = null;
      }
      
      const stillActive = !!srRef.current;
      srRef.current = null;
      
      // AUTO-RESTART
      if (stillActive && repsDoneRef.current < totalRepsRef.current) {
        setTimeout(() => {
          if (!srRef.current && repsDoneRef.current < totalRepsRef.current) {
            startSR();
          }
        }, 300);
      } else {        setMicActive(false);
        setIsListening(false);
      }
    };

    srRef.current = sr;
    try { sr.start(); }
    catch (err) {
      console.warn("SR start error:", err);
      srRef.current = null;
      setMicError("Could not start mic");
    }
  }, [countOneRep, stopSR, startSilenceChecker]);

  /* ── Step navigation ────────────────────────────────────────── */
  const advanceStep = useCallback(() => {
    stopSR();
    const idx = stepIdxRef.current;
    const all = stepsRef.current;
    if (idx < all.length - 1) {
      const next = idx + 1;
      stepIdxRef.current   = next;
      repsDoneRef.current  = 0;
      totalRepsRef.current = all[next].reps;
      lastCountedText.current = "";
      currentTranscriptRef.current = "";
      setStepIdx(next); setRepsDone(0); setPeeking(false); setRecitingVerses(new Set()); setMatchProgress(0); setMissingWords([]); setIsListening(false);
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
    if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
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
    currentTranscriptRef.current = "";
    lastVoiceTimeRef.current = 0;
    lastCountedTimeRef.current = 0;
    setSteps(ns); setStepIdx(0); setRepsDone(0);
    setPeeking(false); setCompleted(false); setStarted(true);
    setRecitingVerses(new Set());
    setMatchProgress(0);
    setMissingWords([]);
    setIsListening(false);
    stopAudio(); stopSR();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e, repsPerVerse });
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    boxShadow: "0 2px 10px rgba(26,61,36,.06)", ...ex,
  });

  /* ─────────────────────────────────────────────────────────────
     COMPLETED
  ───────────────────────────────────────────────────────────── */
  if (completed) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "16px", background: LIGHT }}>
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
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
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
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: LIGHT, overflow: "hidden" }}>
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
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 140px", display: "flex", flexDirection: "column", gap: 8 }}>
          
          {/* Speech status */}
          <div style={card({ padding: "8px 12px" })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 18 }}>{srAvailable ? "🎙" : "⚠️"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
                  {srAvailable ? "Strict Multi-Verse Matching" : "Speech Not Available"}
                </div>
                <div style={{ fontSize: 10, color: "#7a9e88" }}>
                  {srAvailable ? "All words from all verses required" : "Use Chrome on Android"}
                </div>
              </div>
              <div style={{ padding: "2px 8px", borderRadius: 12,
                background: srAvailable ? LIGHT : "#fff5f5",
                border: `1px solid ${srAvailable ? BORDER : "#fca5a5"}`,
                fontSize: 10, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
                {srAvailable ? "✓" : "✗"}              </div>
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
          </div>

          {/* BEGIN BUTTON */}
          <div style={{ marginTop: 8 }}>
            <button onClick={startSession} disabled={!canStart}
              style={{ width: "100%", padding: "16px 0", borderRadius: 12, border: "none",
                cursor: canStart ? "pointer" : "not-allowed",
                background: canStart ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
                color: canStart ? "#fff" : "#7a9e88", fontSize: 18, fontWeight: 800 }}>
              {loading ? "Loading…" : !canStart ? "Adjust range" : "🧠 Begin Memorization · ابدأ"}
            </button>
            {fetchError && (
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#fff5f5",
                border: "1px solid #fca5a5", fontSize: 12, color: "#c0392b", textAlign: "center" }}>
                {fetchError} — <button onClick={() => fetchAyahs(surahNum)}
                  style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Fixed bottom spacer */}
        <div style={{ height: 20, flexShrink: 0 }} />
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     ACTIVE SESSION
  ───────────────────────────────────────────────────────────── */
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT }}>
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PARCH, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        @keyframes flashGreen{0%{background:#bbf7d0;transform:scale(1.25)}100%{transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes matchPulse{0%,100%{box-shadow:0 0 0 0 rgba(183,121,31,0.7)}50%{box-shadow:0 0 0 12px rgba(183,121,31,0)}}
        @keyframes listeningPulse{0%,100%{opacity:0.4}50%{opacity:1}}
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
        /* ✅ COMPLETELY HIDE NON-ACTIVE VERSES */
        .verse-hidden {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;          height: 0 !important;
          overflow: hidden !important;
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow: hidden; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────── */}
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

      {/* ── MUSHAF PAGE ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        background: `linear-gradient(180deg, ${PARCH} 0%, ${PARCH2} 100%)`,
        padding: "10px 8px 16px",
      }}>
        <div style={{
          background: "#fdf6e3",
          border: `2px solid ${GOLD}88`,
          borderRadius: 4,
          position: "relative",          maxWidth: 520,
          margin: "0 auto",
          boxShadow: "0 4px 20px rgba(26,61,36,0.15)",
        }}>
          <div style={{
            position: "absolute", inset: 7,
            border: `1px solid ${GOLD}44`,
            borderRadius: 1,
            pointerEvents: "none",
            zIndex: 1,
          }} />

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 16px",
            background: `linear-gradient(to bottom, ${GOLD}18, transparent)`,
            borderBottom: `1px solid ${GOLD}55`,
          }}>
            <span style={{ fontFamily: "'Amiri',serif", color: "#1c1208", fontSize: "0.8em", fontWeight: 700, direction: "rtl" }}>
              {SURAHS[surahNum - 1]?.nameAr}
            </span>
            <button onClick={() => isPlaying ? stopAudio() : playCurrentStep()}
              style={{
                padding: "4px 12px", borderRadius: 14,
                border: `1.5px solid ${isPlaying ? "#dc2626" : GOLD + "88"}`,
                background: isPlaying ? "#fee2e2" : `${GOLD}18`,
                color: isPlaying ? "#dc2626" : GOLD,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>
              {isPlaying ? "⏹ Stop" : "🔊 Listen"}
            </button>
            <span style={{ fontFamily: "'Amiri',serif", color: "#5a4a20", fontSize: "0.72em" }}>
              {SURAHS[surahNum - 1]?.name}
            </span>
          </div>

          {startVerse === 1 && surahNum !== 1 && surahNum !== 9 && (
            <div style={{
              fontFamily: "'Amiri Quran','Amiri',serif",
              direction: "rtl", textAlign: "center",
              color: "#1c1208", margin: "8px 16px 4px",
              fontSize: 22, lineHeight: 2,
            }}>
              بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
            </div>
          )}

          <div style={{ padding: "8px 20px 16px" }}>
            <p style={{
              fontFamily: "'Amiri Quran','Scheherazade New','Amiri',serif",              direction: "rtl",
              textAlign: "justify",
              lineHeight: 2.8,
              color: "#1c1208",
              fontSize: 24,
              margin: 0,
              wordBreak: "break-word",
            }}>
              {pool.map((ayah, poolIdx) => {
                const isActive    = activeSet.has(poolIdx);
                const isReciting  = recitingVerses.has(ayah.numberInSurah);
                const isCumul     = currentStep.type === "cumulative";
                const hideText    = isCumul && !peeking && isActive;
                const isHidden    = !isActive; // ✅ COMPLETELY HIDDEN if not active

                return (
                  <span
                    key={ayah.numberInSurah}
                    ref={el => { verseRefs.current[ayah.numberInSurah] = el; }}
                    className={isHidden ? "verse-hidden" : ""}
                    style={{
                      // ✅ COMPLETE HIDE: Multiple CSS properties ensure nothing shows
                      display: isHidden ? "none" : "inline",
                      visibility: isHidden ? "hidden" : "visible",
                      pointerEvents: isHidden ? "none" : "auto",
                      opacity:    isActive ? 1 : 0,
                      filter:     hideText ? "blur(9px)" : "none",
                      background: isActive
                        ? isReciting
                          ? `${GOLD}22`
                          : `${GOLD}0d`
                        : "transparent",
                      borderRadius:  isActive ? 3 : 0,
                      outline:       isActive ? `1.5px solid ${GOLD}55` : "none",
                      padding:       isActive ? "0 3px" : undefined,
                      transition:    "all .35s ease",
                      cursor:        isActive ? "pointer" : "default",
                      userSelect:    "none",
                      WebkitUserSelect: "none",
                    } as React.CSSProperties}
                    onClick={() => isActive && playVerse(surahNum, ayah.numberInSurah, selectedReciter)}
                  >
                    {ayah.text}{" "}
                    <span style={{
                      fontFamily: "'Amiri',serif",
                      color: isActive ? GOLD : "#b0956a",
                      fontSize: "0.68em",
                      margin: "0 1px",
                      opacity: isActive ? 1 : 0.5,
                    }}>                      ۝{toAr(ayah.numberInSurah)}
                    </span>{" "}
                  </span>
                );
              })}
            </p>
          </div>

          {currentStep.type === "cumulative" && (
            <div style={{ padding: "0 16px 12px" }}>
              <button className="peek-btn"
                onPointerDown={() => setPeeking(true)}
                onPointerUp={() => setPeeking(false)}
                onPointerLeave={() => setPeeking(false)}
                onPointerCancel={() => setPeeking(false)}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 10,
                  border: `1.5px solid ${peeking ? G : BORDER}`,
                  background: peeking ? LIGHT : "#fdf6e3",
                  color: peeking ? G : "#7a9e88",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                {peeking ? "👁 Showing…" : "👁 Hold to Reveal"}
              </button>
            </div>
          )}

          <div style={{
            borderTop: `1px solid ${GOLD}55`,
            padding: "4px 16px",
            textAlign: "center",
            fontFamily: "'Amiri',serif",
            color: GOLD,
            fontSize: "0.78em",
            background: `linear-gradient(to top, ${GOLD}12, transparent)`,
          }}>
            ─── {toAr(startVerse)}–{toAr(endVerse)} ───
          </div>
        </div>

        {isGoodText && (
          <div style={{
            margin: "10px auto 6px",
            maxWidth: 520,
            padding: "10px 14px",
            borderRadius: 10,
            background: "#f0fff4",
            border: `2px solid ${BORDER}`,
            direction: "rtl",
            display: "flex",
            flexWrap: "wrap" as const,
            gap: "4px 6px",
            justifyContent: "flex-end",
            animation: "slideIn .25s ease",
          }}>
            {liveText.trim().split(/\s+/).filter(Boolean).map((word, wi) => (
              <span key={wi} style={{
                fontFamily: "'Amiri',serif",
                fontSize: 19,
                color: G,
                background: "rgba(26,61,36,0.07)",
                borderRadius: 6,
                padding: "2px 8px",
                lineHeight: 2,
                display: "inline-block",
              }}>{word}</span>
            ))}
          </div>
        )}

        {micActive && (
          <div style={{
            margin: "8px auto",
            maxWidth: 520,
            padding: "10px 14px",
            borderRadius: 10,
            background: col.bg,
            border: `1.5px solid ${col.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: col.text, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                {isListening ? (
                  <span style={{ animation: "listeningPulse 1s ease-in-out infinite" }}>🎤</span>
                ) : (
                  "⏸"
                )}
                {isListening ? "Listening… Recite now" : "Waiting for voice…"}
              </span>
              {matchProgress >= 100 && (
                <span style={{ fontSize: 11, color: G, fontWeight: 700 }}>✅ All words matched</span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
              <div style={{ 
                width: `${matchProgress}%`, 
                height: "100%", 
                borderRadius: 3,
                background: matchProgress === 100 ? GOLD : col.text,
                transition: "width .3s ease"
              }} />
            </div>
            {missingWords.length > 0 && matchProgress < 100 && (
              <div style={{ marginTop: 6, fontSize: 10, color: "#7a9e88" }}>
                Still need: {missingWords.join(" · ")}
              </div>
            )}
          </div>
        )}

        {isMultiVerse && micActive && (
          <div style={{            margin: "0 auto 8px",
            maxWidth: 520,
            padding: "8px 12px",
            borderRadius: 10,
            background: col.bg,
            border: `1.5px solid ${col.border}`,
            fontSize: 11,
            color: col.text,
            fontWeight: 600,
            textAlign: "center",
          }}>
            🔗 Reciting {currentStep.indices.length} verses — All words required
          </div>
        )}
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderTop: `2px solid ${BORDER}`, flexShrink: 0 }}>
        
        {!isOverview && (
          <div style={{
            padding: "7px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            {micActive && (
              <div style={{ display: "flex", alignItems: "center", gap: 2, marginRight: 2, flexShrink: 0 }}>
                {[4, 8, 6, 12, 7, 10, 5].map((h, i) => (
                  <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: isListening ? "#ef4444" : "#9ca3af",
                    animation: isListening ? `wavePulse .75s ease-in-out ${i * 0.09}s infinite alternate` : "none" }} />
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto", scrollbarWidth: "none" } as React.CSSProperties}>
              {Array.from({ length: currentStep.reps }, (_, i) => {
                const done    = i < repsDone;
                const current = i === repsDone;
                return (
                  <div key={i} style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                    background: done
                      ? col.grad
                      : current && justCounted
                      ? "#bbf7d0"
                      : current                      ? `${col.text}18`
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

            <div style={{ textAlign: "center", minWidth: 34, flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: G, lineHeight: 1,
                animation: justCounted ? "flashGreen .4s ease" : "none" }}>
                {repsDone}
              </div>
              <div style={{ fontSize: 10, color: "#7a9e88" }}>/ {currentStep.reps}</div>
            </div>

            {micActive && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isListening ? "#ef4444" : "#9ca3af", minWidth: 34, textAlign: "center", flexShrink: 0 }}>
                {String(Math.floor(micTime / 60)).padStart(2, "0")}:{String(micTime % 60).padStart(2, "0")}
              </div>
            )}
          </div>
        )}

        {micError && (
          <div style={{ margin: "4px 10px", padding: "5px 10px", borderRadius: 8, background: "#fffbeb",
            border: "1px solid #f6d860", fontSize: 11, color: "#856404", textAlign: "center" }}>
            {micError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, padding: "8px 10px" }}>
          {!isOverview && (
            micActive ? (
              <>
                <button onClick={stopSR}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
                    background: "#fee2e2", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ⏹ Stop
                </button>
                <button
                  onClick={() => { stopSR(); setTimeout(() => startSR(), 300); }}
                  title="Restart recording"
                  style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${BORDER}`,
                    background: "#f8fafb", color: "#7a9e88", fontSize: 18, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  ↺
                </button>
              </>
            ) : (
              <button onClick={startSR}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🎙 Start Recording
              </button>
            )
          )}

          <button onClick={markRep}
            style={{ flex: isOverview ? 2 : 1, padding: "11px 0", borderRadius: 10, border: "none",
              background: col.grad, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {isOverview
              ? "Begin →"
              : repsDone + 1 >= currentStep.reps
              ? stepIdx < steps.length - 1 ? "✓ Next" : "🎉 Done"
              : `✓ ${repsDone + 1}`}
          </button>
        </div>

        <button
          onClick={() => {
            stopAudio(); stopSR(); setPeeking(false); setRecitingVerses(new Set()); setMatchProgress(0); setMissingWords([]); setIsListening(false);
            currentTranscriptRef.current = "";
            if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
            if (stepIdx > 0) {
              const prev = stepIdx - 1;
              stepIdxRef.current = prev; repsDoneRef.current = 0;
              totalRepsRef.current = steps[prev].reps;
              prevStepIdxRef.current = -1; lastCountedText.current = "";
              setStepIdx(prev); setRepsDone(0);
              saveSession({ stepIdx: prev, repsDone: 0 });
            } else {
              clearSession(); setStarted(false);
            }
          }}
          style={{ margin: "0 10px 8px", padding: "8px 0", borderRadius: 8, border: `1px solid ${BORDER}`,
            background: "#f8fafb", color: "#7a9e88", fontSize: 11, cursor: "pointer", width: "calc(100% - 20px)" }}>
          ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
        </button>
      </div>
    </div>
  );
}