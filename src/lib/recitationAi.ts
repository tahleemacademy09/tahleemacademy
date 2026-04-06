// src/components/hifdh/HifdhMemorization.tsx
// COUNTING FIX:
//   • Uses browser Web Speech API (SpeechRecognition) — NO API KEY needed
//   • Works natively on Android Chrome — real-time Arabic recognition
//   • Counts IMMEDIATELY when recognised text matches the verse
//   • Falls back to manual ✓ button if SpeechRecognition not available
//   • All verses listed; only active verse revealed; others hidden

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

const SESSION_KEY = "hifdh_mem_v5";

/* ── Rep count options ────────────────────────────────────────── */
const REP_OPTIONS = [5, 7, 10, 15, 20] as const;
type RepOption = typeof REP_OPTIONS[number];

/* ── Types ────────────────────────────────────────────────────── */
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
      labelAr: `الآية ${toAr(i + 1)} — كرر ${toAr(R)} مرات`,
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

/* ── Arabic normalise & match ─────────────────────────────────── */
function norm(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")          // strip harakat
    .replace(/[\u0640\u061B\u060C\u061F\u06D4]/g, "") // misc punctuation
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(transcript: string, verse: Ayah): number {
  const t = norm(transcript);
  const v = norm(verse.text);
  if (!t || t.length < 2) return 0;
  if (v === t) return 1;
  const vWords = v.split(" ").filter(w => w.length > 1);
  const tWords = t.split(" ");
  if (!vWords.length) return 0;
  const matched = vWords.filter(vw => tWords.some(tw => tw.includes(vw) || vw.includes(tw))).length;
  const ratio   = matched / vWords.length;
  // also check substring: if transcription is a meaningful portion of the verse
  if (ratio < 0.45 && v.includes(t) && t.length > v.length * 0.3) return 0.5;
  return ratio;
}

function isMatch(transcript: string, targets: Ayah[], threshold = 0.45): boolean {
  return targets.some(a => matchScore(transcript, a) >= threshold);
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
   COMPONENT
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
  const pendingRestoreRef  = useRef<Saved | null>(null);
  const repsPerVerseRef    = useRef<number>(5);
  // guard: don't count the same utterance twice
  const lastCountedText    = useRef("");
  const cooldownRef        = useRef(false);
  const micTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setTimeout(() => { cooldownRef.current = false; }, 800); // 0.8s cooldown between counts

    const done = repsDoneRef.current + 1;
    repsDoneRef.current = done;
    setRepsDone(done);
    setLiveText("");
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 700);
    saveSession({ repsDone: done });

    if (done >= totalRepsRef.current) {
      // Stop mic THEN advance after short pause
      setTimeout(() => {
        stopSR();
        setTimeout(() => advanceStepRef.current(), 500);
      }, 300);
    }
  }, [saveSession]); // stopSR defined below, referenced via closure

  /* ── Web Speech Recognition ─────────────────────────────────── */
  const stopSR = useCallback(() => {
    if (srRef.current) {
      try { srRef.current.stop(); } catch { /**/ }
      srRef.current = null;
    }
    if (micTimerRef.current) clearInterval(micTimerRef.current);
    setMicActive(false);
    setMicTime(0);
    setLiveText("");
  }, []);

  const startSR = useCallback(() => {
    if (!SR) { setMicError("Speech recognition not supported on this browser."); return; }
    if (srRef.current) return; // already running

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
      const step = stepsRef.current[stepIdxRef.current];
      if (!step || step.type === "overview") return;
      const targets = step.indices.map(i => sessionAyahsRef.current[i]).filter(Boolean);

      let bestTranscript = "";
      let hasFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Check all alternatives
        for (let j = 0; j < result.length; j++) {
          const text = result[j].transcript || "";
          if (!bestTranscript || text.length > bestTranscript.length) bestTranscript = text;
        }
        if (result.isFinal) hasFinal = true;
      }

      if (!bestTranscript.trim()) return;
      setLiveText(bestTranscript.slice(-80));

      // Count on final result OR on a high-confidence interim match
      const matched = isMatch(bestTranscript, targets, 0.45);

      if (matched && hasFinal) {
        // Don't double-count the same utterance
        const normText = norm(bestTranscript);
        if (normText !== lastCountedText.current && normText.length > 1) {
          lastCountedText.current = normText;
          if (repsDoneRef.current < totalRepsRef.current) {
            countOneRep();
          }
        }
      }
    };

    sr.onerror = (e: any) => {
      console.warn("SR error:", e.error);
      if (e.error === "not-allowed") {
        setMicError("🎤 Mic access denied — tap Allow and retry.");
        stopSR();
      } else if (e.error === "no-speech") {
        // Auto-restart — no-speech is just silence timeout
        // SR will auto-end; onstop will restart it
      } else if (e.error === "network") {
        setMicError("Network error in speech recognition.");
        stopSR();
      }
    };

    sr.onend = () => {
      // Auto-restart if mic should still be active
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      const stillActive = !!srRef.current;
      srRef.current = null;
      if (stillActive && repsDoneRef.current < totalRepsRef.current) {
        // small delay then restart
        setTimeout(() => {
          if (repsDoneRef.current < totalRepsRef.current) startSR();
        }, 300);
      } else {
        setMicActive(false);
        setMicTime(0);
      }
    };

    srRef.current = sr;
    try { sr.start(); }
    catch (err) {
      console.warn("SR start error:", err);
      srRef.current = null;
      setMicError("Could not start mic. Try tapping Start Mic again.");
    }
  }, [countOneRep, stopSR]);

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
      setStepIdx(next); setRepsDone(0); setPeeking(false);
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
    const t = setTimeout(() => startSR(), 600);
    return () => clearTimeout(t);
  }, [stepIdx, started, steps, startSR, stopSR]);

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
    stopAudio(); stopSR();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e, repsPerVerse });
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  /* ─────────────────────────────────────────────────────────────
     COMPLETED
  ───────────────────────────────────────────────────────────── */
  if (completed) return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card({ padding: "36px 20px", textAlign: "center" })}>
        <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 28, color: G, fontWeight: 700 }}>Session Complete!</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: GOLD, marginTop: 6 }}>أحسنت! أكملت الجلسة</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); }}
          style={{ padding: "14px 0", borderRadius: 12, border: `1px solid ${BORDER}`,
            background: "#f8fafb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          ← New Setup
        </button>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}
          style={{ padding: "14px 0", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
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
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header */}
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "24px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 46 }}>🧠</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: "#fff", fontWeight: 700, marginTop: 8 }}>Memorization</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 15, color: "rgba(255,255,255,.75)", marginTop: 4 }}>نظام الحفظ المنهجي</div>
          </div>
        </div>

        {/* Speech recognition status */}
        <div style={card({ padding: "12px 16px" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22 }}>{srAvailable ? "🎙" : "⚠️"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
                {srAvailable ? "Auto-Counting — Ready" : "Speech Recognition Not Available"}
              </div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 1 }}>
                {srAvailable
                  ? "Reads your recitation in real-time — counts immediately on match"
                  : "Use Chrome or Edge on Android. Manual ✓ button still works."}
              </div>
            </div>
            <div style={{ padding: "3px 10px", borderRadius: 20,
              background: srAvailable ? LIGHT : "#fff5f5",
              border: `1px solid ${srAvailable ? BORDER : "#fca5a5"}`,
              fontSize: 11, fontWeight: 700, color: srAvailable ? G : "#c0392b" }}>
              {srAvailable ? "✓ Active" : "✗ Off"}
            </div>
          </div>
        </div>

        {/* Surah & Verse */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            SURAH & VERSE RANGE · السورة والآيات
          </div>
          <select value={surahNum}
            onChange={e => { setSurahNum(Number(e.target.value)); setStartVerse(1); setEndVerse(1); }}
            style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: `1px solid ${BORDER}`,
              fontSize: 14, color: G, background: "#f8fafb", marginBottom: 12 }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr} ({s.verses}v)</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {([
              ["From Ayah", startVerse, (v: number) => setStartVerse(v), 1,          surah.verses],
              ["To Ayah",   endVerse,   (v: number) => setEndVerse(v),   startVerse, surah.verses],
            ] as const).map(([label, val, setter, min, max], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 600, marginBottom: 4 }}>{label as string}</div>
                <input type="number" min={min as number} max={max as number} value={val as number}
                  onChange={e => (setter as Function)(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
                    fontSize: 15, color: G, background: "#f8fafb", fontWeight: 700 }} />
              </div>
            ))}
          </div>

          {/* Rep count selector */}
          <div>
            <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 700, letterSpacing: .5, marginBottom: 8 }}>
              REPETITIONS PER VERSE · عدد التكرارات
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {REP_OPTIONS.map(opt => (
                <button key={opt} onClick={() => { setRepsPerVerse(opt); repsPerVerseRef.current = opt; }}
                  style={{
                    flex: 1, padding: "11px 0", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${repsPerVerse === opt ? G : BORDER}`,
                    background: repsPerVerse === opt ? G : "#f8fafb",
                    color: repsPerVerse === opt ? "#fff" : "#7a9e88",
                    fontSize: 16, fontWeight: 800, transition: "all .2s",
                  }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {verseCount > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`,
              fontSize: 12, color: G, fontWeight: 600, textAlign: "center", marginTop: 10 }}>
              {verseCount} verse{verseCount !== 1 ? "s" : ""} · {buildSteps(verseCount, repsPerVerse).length} steps total
            </div>
          )}
        </div>

        {/* Reciter */}
        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            🎙 RECITER · القارئ
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {RECITERS.map(r => (
              <button key={r.id} onClick={() => setSelectedReciter(r.id)}
                style={{
                  flexShrink: 0, padding: "7px 13px", borderRadius: 18,
                  border: `2px solid ${selectedReciter === r.id ? G : BORDER}`,
                  background: selectedReciter === r.id ? G : "#f8fafb",
                  color: selectedReciter === r.id ? "#fff" : "#7a9e88",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .2s",
                }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={startSession} disabled={!canStart}
          style={{ padding: "16px 0", borderRadius: 14, border: "none",
            cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 16, fontWeight: 800 }}>
          {loading ? "Loading Quran…" : !canStart ? "Adjust verse range above" : "🧠 Begin Memorization · ابدأ الحفظ"}
        </button>

        {fetchError && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff5f5",
            border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {fetchError} — <button onClick={() => fetchAyahs(surahNum)}
              style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     ACTIVE SESSION
  ───────────────────────────────────────────────────────────── */
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#7a9e88" }}>Starting session…</div>
    </div>
  );

  const col        = STEP_STYLE[currentStep.type];
  const progress   = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool       = sessionAyahsRef.current;
  const isOverview = currentStep.type === "overview";
  const activeSet  = new Set(currentStep.indices);
  const isGoodText = liveText && !liveText.startsWith("…");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingBottom: 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        @keyframes flashGreen{0%{background:#bbf7d0;transform:scale(1.25)}100%{transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .peek-btn{user-select:none;-webkit-user-select:none}
      `}</style>

      {/* ── Progress bar ─────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "10px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 18 }}>{col.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: col.text }}>
                {currentStep.label.split("—")[0].trim()}
              </div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 10, color: col.text, opacity: .8 }}>
                {currentStep.labelAr}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#7a9e88" }}>
              <strong style={{ color: G }}>{stepIdx + 1}</strong>/{steps.length}
            </span>
            <button onClick={() => { stopAudio(); stopSR(); clearSession(); setStarted(false); setStepIdx(0); setRepsDone(0); }}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
              ✕ End
            </button>
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .4s ease" }} />
        </div>
      </div>

      {/* ── QURAN AREA ───────────────────────────────────────── */}
      <div style={{
        background: PARCH,
        backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 55px,${PARCH2}55 55px,${PARCH2}55 56px)`,
        borderBottom: `2px solid #e8d9b5`,
        flex: 1,
      }}>
        {/* Surah header */}
        <div style={{
          background: `linear-gradient(135deg,${G},${GM})`,
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{SURAHS[surahNum - 1]?.name}</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 11, color: "rgba(255,255,255,.7)", direction: "rtl" }}>
              {SURAHS[surahNum - 1]?.nameAr} · آيات {toAr(startVerse)}–{toAr(endVerse)}
            </div>
          </div>
          <button onClick={() => isPlaying ? stopAudio() : playCurrentStep()}
            style={{ padding: "7px 16px", borderRadius: 18,
              border: "2px solid rgba(255,255,255,.35)",
              background: isPlaying ? "#dc2626" : "rgba(255,255,255,.15)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {isPlaying ? "⏹ Stop" : "🔊 Listen"}
          </button>
        </div>

        {/* Verse list — all visible, only active revealed */}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {pool.map((ayah, poolIdx) => {
            const isActive = activeSet.has(poolIdx);
            const isCumul  = currentStep.type === "cumulative";
            const hideText = isCumul && !peeking && isActive;
            const isHidden = !isActive;

            return (
              <div key={ayah.numberInSurah}
                style={{
                  background:  isActive ? "#fff" : "rgba(255,255,255,0.3)",
                  border:      isActive
                    ? `1.5px solid ${currentStep.type === "single" ? GOLD : BORDER}`
                    : "1px solid rgba(200,190,170,0.3)",
                  borderRadius: 14,
                  padding:      isActive ? "14px 16px" : "8px 16px",
                  opacity:      isHidden ? 0.3 : 1,
                  filter:       isHidden ? "blur(2.5px)" : "none",
                  boxShadow:    isActive ? "0 3px 14px rgba(26,61,36,.12)" : "none",
                  transition:   "all .3s ease",
                  pointerEvents: isHidden ? "none" : "auto",
                }}>

                {/* Active verse */}
                {isActive && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, direction: "ltr" }}>
                      <button onClick={() => playVerse(surahNum, ayah.numberInSurah, selectedReciter)}
                        style={{ padding: "4px 12px", borderRadius: 12, border: `1px solid ${BORDER}`,
                          background: LIGHT, color: G, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        ▶ Play
                      </button>
                      <div style={{ width: 30, height: 30, borderRadius: "50%",
                        background: currentStep.type === "single" ? GOLD : G,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: "'Amiri',serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                          {toAr(ayah.numberInSurah)}
                        </span>
                      </div>
                    </div>

                    {/* ── THE ARABIC TEXT ── */}
                    <div style={{
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      fontSize: 32,
                      color: G,
                      lineHeight: 2.5,
                      textAlign: "right",
                      direction: "rtl",
                      opacity:    hideText ? 0.05 : 1,
                      filter:     hideText ? "blur(10px)" : "none",
                      transition: "opacity .2s, filter .2s",
                    }}>
                      {ayah.text}
                    </div>

                    {isCumul && (
                      <button className="peek-btn"
                        onPointerDown={() => setPeeking(true)}
                        onPointerUp={() => setPeeking(false)}
                        onPointerLeave={() => setPeeking(false)}
                        onPointerCancel={() => setPeeking(false)}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 9, marginTop: 10,
                          border: `1.5px solid ${peeking ? G : BORDER}`,
                          background: peeking ? LIGHT : "#f8fafb",
                          color: peeking ? G : "#7a9e88",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {peeking ? "👁 Showing…" : "👁 Hold to Reveal · اضغط مطولاً"}
                      </button>
                    )}
                  </>
                )}

                {/* Hidden verse — placeholder */}
                {isHidden && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, direction: "ltr" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#d8cfc0",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Amiri',serif", fontSize: 10, color: "#888" }}>
                        {toAr(ayah.numberInSurah)}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: "rgba(180,165,140,0.35)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live recognised text */}
        {isGoodText && (
          <div style={{
            margin: "0 14px 12px",
            padding: "9px 14px", borderRadius: 10,
            background: "#f0fff4", border: `1px solid ${BORDER}`,
            fontSize: 18, direction: "rtl", fontFamily: "'Amiri',serif", color: G,
            animation: "slideIn .25s ease",
          }}>
            {liveText}
          </div>
        )}
      </div>

      {/* ── COUNTING STRIP ───────────────────────────────────── */}
      {!isOverview && (
        <div style={{
          background: "#fff",
          borderBottom: `1px solid ${BORDER}`,
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* Mic waveform */}
          {micActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 2.5, marginRight: 2, flexShrink: 0 }}>
              {[5, 10, 7, 14, 8, 12, 6].map((h, i) => (
                <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: "#ef4444",
                  animation: `wavePulse .75s ease-in-out ${i * 0.09}s infinite alternate` }} />
              ))}
            </div>
          )}

          {/* Rep dots — single scrollable line */}
          <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {Array.from({ length: currentStep.reps }, (_, i) => {
              const done    = i < repsDone;
              const current = i === repsDone;
              return (
                <div key={i} style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
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

          {/* Count + timer */}
          <div style={{ flexShrink: 0, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: G, lineHeight: 1,
              animation: justCounted ? "flashGreen .4s ease" : "none" }}>
              {repsDone}
            </div>
            <div style={{ fontSize: 10, color: "#7a9e88" }}>/ {currentStep.reps}</div>
          </div>

          {micActive && (
            <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#ef4444", minWidth: 36 }}>
              {String(Math.floor(micTime / 60)).padStart(2, "0")}:{String(micTime % 60).padStart(2, "0")}
            </div>
          )}
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{ margin: "6px 16px 0", padding: "8px 14px", borderRadius: 10, background: "#fffbeb",
          border: "1px solid #f6d860", fontSize: 12, color: "#856404", textAlign: "center" }}>
          {micError}
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, padding: "12px 16px 0" }}>
        {!isOverview && (
          micActive ? (
            <button onClick={stopSR}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              🎙 Stop Mic
            </button>
          ) : (
            <button onClick={startSR}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              🎙 Start Mic
            </button>
          )
        )}

        <button onClick={markRep}
          style={{ flex: isOverview ? 2 : 1, padding: "14px 0", borderRadius: 12, border: "none",
            background: col.grad, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          {isOverview
            ? "Begin Memorizing →"
            : repsDone + 1 >= currentStep.reps
            ? stepIdx < steps.length - 1 ? "✓ Done → Next" : "🎉 Finish!"
            : `✓ Rep ${repsDone + 1}`}
        </button>
      </div>

      <button
        onClick={() => {
          stopAudio(); stopSR(); setPeeking(false);
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
        style={{ margin: "8px 16px 0", padding: "11px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
        ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
      </button>
    </div>
  );
}
