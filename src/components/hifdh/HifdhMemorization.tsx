// src/components/hifdh/HifdhMemorization.tsx
// Fixes:
//  1. AI counting  — uses Groq Whisper via updated recitationAi.ts (Arabic works)
//  2. Cumulative step — always hidden; hold-to-reveal (never auto-shows)
//  3. Session persistence — localStorage; resumes from last step on refresh/leave
//  4. Overview step — Quran-recitation style display + reciter selector

import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, RECITERS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { transcribeRecitationAudio } from "@/lib/recitationAi";

/* ── Theme ────────────────────────────────────────────── */
const G      = "#1a3d24";
const GM     = "#276749";
const GOLD   = "#b7791f";
const LIGHT  = "#f0fff4";
const BORDER = "#d4e8d4";
const PARCH  = "#faf6ee";   // parchment — used in overview
const SILENCE_MS  = 1800;   // ms of silence → count one rep
const SESSION_KEY = "hifdh_mem_v3"; // bump version to clear old saves

/* ── Types ────────────────────────────────────────────── */
interface Ayah    { numberInSurah: number; text: string; }
interface Props   { reciter?: string; }
type StepType     = "overview" | "single" | "pair" | "cumulative";
interface MemStep { type: StepType; indices: number[]; reps: number; label: string; labelAr: string; }
interface Saved   { surahNum: number; startVerse: number; endVerse: number; stepIdx: number; repsDone: number; started: boolean; }

/* ── Step builder ─────────────────────────────────────── */
function buildSteps(count: number): MemStep[] {
  if (count === 0) return [];
  const steps: MemStep[] = [];
  steps.push({
    type: "overview", indices: Array.from({ length: count }, (_, i) => i), reps: 1,
    label: "Read All Verses — اقرأ جميع الآيات", labelAr: "تعرّف على النص قبل البدء",
  });
  for (let i = 0; i < count; i++) {
    steps.push({
      type: "single", indices: [i], reps: 10,
      label: `Verse ${i + 1} — Repeat 10×`, labelAr: `الآية ${toAr(i + 1)} — كرر ١٠ مرات`,
    });
    if (i > 0) {
      steps.push({
        type: "pair", indices: [i - 1, i], reps: 5,
        label: `Verses ${i}–${i + 1} Together — 5×`,
        labelAr: `الآيتان ${toAr(i)}–${toAr(i + 1)} معاً — كرر ٥ مرات`,
      });
      steps.push({
        type: "cumulative",
        indices: Array.from({ length: i + 1 }, (_, k) => k), reps: 5,
        label: `Verses 1–${i + 1} Cumulative — 5×`,
        labelAr: `من ١ إلى ${toAr(i + 1)} تراكمياً — كرر ٥ مرات`,
      });
    }
  }
  return steps;
}

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

/* ── Arabic match helper ──────────────────────────────── */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065B\u0670]/g, "")
    .replace(/[\u0640\u061B\u060C\u061F\u06D4\u06D2]/g, "")
    .replace(/[\s\u200F\u200E]+/g, " ")
    .replace(/^[إأآا]/g, "ا").replace(/ى$/g, "ي").replace(/ة$/g, "ه")
    .trim();
}

function isVerseMatch(transcribed: string, targetVerses: Ayah[], threshold = 0.55): boolean {
  const normTrans = normalizeArabic(transcribed);
  if (!normTrans || normTrans.length < 4) return false;
  for (const verse of targetVerses) {
    const normVerse = normalizeArabic(verse.text);
    if (normVerse === normTrans) return true;
    const verseWords = normVerse.split(/\s+/).filter(w => w.length > 2);
    const transWords = normTrans.split(/\s+/);
    if (!verseWords.length) continue;
    const matched = verseWords.filter(
      vw => transWords.some(tw => tw.includes(vw) || vw.includes(tw))
    ).length;
    if (matched / verseWords.length >= threshold) return true;
    if (normVerse.includes(normTrans) && normTrans.length > normVerse.length * 0.4) return true;
  }
  return false;
}

function getMime() {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/* ── Step styles ──────────────────────────────────────── */
const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; gradient: string }> = {
  overview:   { bg: "#fffbeb", text: GOLD,      border: "#f6d860", icon: "📖", gradient: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,          border: BORDER,    icon: "🎯", gradient: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb",  border: "#bfdbfe", icon: "🔗", gradient: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed",  border: "#ddd6fe", icon: "📚", gradient: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

/* ══════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════ */
export default function HifdhMemorization({ reciter: reciterProp }: Props) {

  /* ── State ─────────────────────────────────────────── */
  const [surahNum,      setSurahNum]      = useState(114);
  const [startVerse,    setStartVerse]    = useState(1);
  const [endVerse,      setEndVerse]      = useState(6);
  const [ayahs,         setAyahs]         = useState<Ayah[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [fetchError,    setFetchError]    = useState("");
  const [started,       setStarted]       = useState(false);
  const [steps,         setSteps]         = useState<MemStep[]>([]);
  const [stepIdx,       setStepIdx]       = useState(0);
  const [repsDone,      setRepsDone]      = useState(0);
  const [completed,     setCompleted]     = useState(false);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [micActive,     setMicActive]     = useState(false);
  const [liveText,      setLiveText]      = useState("");
  const [micError,      setMicError]      = useState("");
  const [micTime,       setMicTime]       = useState(0);
  // FIX 3 — reciter selector (used in overview + audio playback throughout)
  const [selectedReciter, setSelectedReciter] = useState(reciterProp || DEFAULT_RECITER);
  // FIX 2 — hold-to-peek for cumulative (never auto-show)
  const [peeking,       setPeeking]       = useState(false);

  /* ── Refs ──────────────────────────────────────────── */
  const sessionAyahsRef        = useRef<Ayah[]>([]);
  const audioRef               = useRef<HTMLAudioElement | null>(null);
  const playingRef             = useRef(false);
  const mrRef                  = useRef<MediaRecorder | null>(null);
  const initChunkRef           = useRef<Blob | null>(null);
  const silRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repsDoneRef            = useRef(0);
  const totalRepsRef           = useRef(10);
  const stepsRef               = useRef<MemStep[]>([]);
  const stepIdxRef             = useRef(0);
  const micTimerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepIdxRef         = useRef(-1);
  const advanceStepRef         = useRef<() => void>(() => {});
  const transcriptionPendingRef= useRef(false);
  // FIX 4 — restore from localStorage after ayahs load
  const pendingRestoreRef      = useRef<Saved | null>(null);

  const surah = SURAHS[surahNum - 1];

  /* ── Persistence helpers ───────────────────────────── */
  const saveSession = useCallback((patch: Partial<Saved> = {}) => {
    try {
      const current: Saved = {
        surahNum, startVerse, endVerse,
        stepIdx: stepIdxRef.current,
        repsDone: repsDoneRef.current,
        started: true,
        ...patch,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(current));
    } catch { /* storage full or private mode */ }
  }, [surahNum, startVerse, endVerse]);

  const clearSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /**/ }
  }, []);

  // Load saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: Saved = JSON.parse(raw);
      if (!saved.started) return;
      // Apply the surah/verse range immediately (triggers fetchAyahs)
      setSurahNum(saved.surahNum);
      setStartVerse(saved.startVerse);
      setEndVerse(saved.endVerse);
      // Store step/rep to restore AFTER ayahs are fetched
      pendingRestoreRef.current = saved;
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fetch ayahs ───────────────────────────────────── */
  const fetchAyahs = useCallback(async (num: number) => {
    setLoading(true); setFetchError("");
    try {
      const res  = await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) {
        const loaded: Ayah[] = json.data.ayahs;
        setAyahs(loaded);

        // FIX 4 — restore pending session now that ayahs are available
        const restore = pendingRestoreRef.current;
        if (restore && restore.surahNum === num && restore.started) {
          pendingRestoreRef.current = null;
          const sv = restore.startVerse;
          const ev = restore.endVerse;
          const slice = loaded.filter(a => a.numberInSurah >= sv && a.numberInSurah <= ev);
          if (slice.length > 0) {
            sessionAyahsRef.current = slice;
            const newSteps          = buildSteps(slice.length);
            const si                = Math.min(restore.stepIdx, newSteps.length - 1);
            const rd                = Math.min(restore.repsDone, newSteps[si]?.reps ?? 0);
            stepsRef.current        = newSteps;
            stepIdxRef.current      = si;
            repsDoneRef.current     = rd;
            totalRepsRef.current    = newSteps[si]?.reps ?? 1;
            prevStepIdxRef.current  = -1;
            setSteps(newSteps);
            setStepIdx(si);
            setRepsDone(rd);
            setStarted(true);
            setCompleted(false);
          }
        }
      } else {
        setFetchError("Could not load — please retry.");
      }
    } catch { setFetchError("Network error."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAyahs(surahNum); }, [surahNum, fetchAyahs]);
  useEffect(() => () => { audioRef.current?.pause(); stopMicFn(); }, []);

  /* ── Audio ─────────────────────────────────────────── */
  const stopAudio = useCallback(() => {
    playingRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
  }, []);

  const playVerse = useCallback((surahN: number, verseN: number, rec: string) => {
    stopAudio();
    playingRef.current = true;
    setIsPlaying(true);
    const au = new Audio(audioUrl(surahN, verseN, rec));
    audioRef.current  = au;
    au.onended = () => { playingRef.current = false; setIsPlaying(false); };
    au.onerror = () => { playingRef.current = false; setIsPlaying(false); };
    au.play().catch(() => { playingRef.current = false; setIsPlaying(false); });
  }, [stopAudio]);

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startVerse && a.numberInSurah <= endVerse);

  /* ── Mic ───────────────────────────────────────────── */
  function stopMicFn() {
    if (mrRef.current) { mrRef.current.stop(); mrRef.current = null; }
    if (silRef.current) clearTimeout(silRef.current);
    if (micTimerRef.current) clearInterval(micTimerRef.current);
    setMicActive(false); setMicTime(0); setLiveText("");
  }
  const stopMic = useCallback(stopMicFn, []);

  const countOneRep = useCallback(() => {
    const done = repsDoneRef.current + 1;
    repsDoneRef.current = done;
    setRepsDone(done);
    setLiveText("");
    saveSession({ repsDone: done });
    if (done >= totalRepsRef.current) {
      stopMic();
      setTimeout(() => advanceStepRef.current(), 300);
    }
  }, [stopMic, saveSession]);

  /* ── FIX 1: Groq Whisper via recitationAi.ts ──────── */
  const sendChunk = useCallback(async (blob: Blob) => {
    if (transcriptionPendingRef.current) return;
    transcriptionPendingRef.current = true;
    try {
      const transcript = await transcribeRecitationAudio(blob);
      if (transcript.trim().length > 0) {
        const step    = stepsRef.current[stepIdxRef.current];
        const targets = step?.indices.map(i => sessionAyahsRef.current[i]) || [];
        if (isVerseMatch(transcript, targets, 0.55)) {
          setLiveText(transcript.slice(-60));
          if (silRef.current) clearTimeout(silRef.current);
          silRef.current = setTimeout(() => {
            if (repsDoneRef.current < totalRepsRef.current) countOneRep();
          }, SILENCE_MS);
        } else {
          setLiveText(`🔄 ${transcript.slice(0, 35)}…`);
        }
      }
    } catch (err) {
      console.warn("Recitation transcription failed:", err);
    } finally {
      transcriptionPendingRef.current = false;
    }
  }, [countOneRep]);

  const startMic = useCallback(async () => {
    if (mrRef.current) return;
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getMime();
      const mr     = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      initChunkRef.current = null;
      mr.ondataavailable = (e) => {
        if (!e.data?.size) return;
        if (!initChunkRef.current) { initChunkRef.current = e.data; sendChunk(e.data); return; }
        sendChunk(new Blob([initChunkRef.current, e.data], { type: mime || "audio/webm" }));
      };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (micTimerRef.current) clearInterval(micTimerRef.current);
        setMicActive(false); setMicTime(0);
      };
      mr.start(1500);
      mrRef.current = mr;
      setMicActive(true);
      micTimerRef.current = setInterval(() => setMicTime(t => t + 1), 1000);
    } catch {
      setMicError("🎤 Mic access denied — tap Allow and retry.");
    }
  }, [sendChunk]);

  /* ── Step navigation ───────────────────────────────── */
  const advanceStep = useCallback(() => {
    const idx = stepIdxRef.current;
    const all = stepsRef.current;
    if (idx < all.length - 1) {
      const next = idx + 1;
      stepIdxRef.current   = next;
      repsDoneRef.current  = 0;
      totalRepsRef.current = all[next].reps;
      setStepIdx(next); setRepsDone(0); setPeeking(false);
      stopAudio();
      saveSession({ stepIdx: next, repsDone: 0 });
    } else {
      stopAudio();
      clearSession();
      setCompleted(true);
    }
  }, [stopAudio, saveSession, clearSession]);

  useEffect(() => { advanceStepRef.current = advanceStep; }, [advanceStep]);

  /* ── Auto-start mic on step change ────────────────────*/
  useEffect(() => {
    if (!started || steps.length === 0) return;
    const step = steps[stepIdx];
    if (!step || step.type === "overview") { stopMic(); return; }
    if (stepIdx === prevStepIdxRef.current) return;
    prevStepIdxRef.current = stepIdx;
    stopMic();
    const t = setTimeout(() => startMic(), 700);
    return () => clearTimeout(t);
  }, [stepIdx, started, steps, startMic, stopMic]);

  /* ── Manual rep button ─────────────────────────────── */
  const markRep = () => {
    const step = steps[stepIdx];
    if (!step) return;
    const next = repsDone + 1;
    repsDoneRef.current = next;
    saveSession({ repsDone: next });
    if (next >= step.reps) advanceStep();
    else setRepsDone(next);
  };

  /* ── Play current step ─────────────────────────────── */
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

  /* ── Session start ─────────────────────────────────── */
  const startSession = () => {
    const s     = Math.max(1, startVerse);
    const e     = Math.min(surah.verses, Math.max(s, endVerse));
    const slice = ayahs.filter(a => a.numberInSurah >= s && a.numberInSurah <= e);
    if (!slice.length) return;
    sessionAyahsRef.current = slice;
    const newSteps = buildSteps(slice.length);
    stepsRef.current        = newSteps;
    stepIdxRef.current      = 0;
    repsDoneRef.current     = 0;
    totalRepsRef.current    = newSteps[0]?.reps ?? 1;
    prevStepIdxRef.current  = -1;
    setSteps(newSteps); setStepIdx(0); setRepsDone(0);
    setPeeking(false); setCompleted(false); setStarted(true);
    stopAudio(); stopMic();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e });
  };

  /* ── Shared card style ─────────────────────────────── */
  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  /* ────────────────────────────────────────────────────
     COMPLETED
  ──────────────────────────────────────────────────── */
  if (completed) return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card({ padding: "32px 20px", textAlign: "center" })}>
        <div style={{ fontSize: 54, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: G, fontWeight: 700 }}>Session Complete!</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD, marginTop: 6 }}>أحسنت! أكملت الجلسة</div>
        <div style={{ fontSize: 13, color: "#7a9e88", marginTop: 12, lineHeight: 1.6 }}>
          All {steps.length} steps — <strong style={{ color: G }}>Surah {surah.name}</strong> Ayahs {startVerse}–{endVerse}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); }}
          style={{ padding: "13px 0", borderRadius: 12, border: `1px solid ${BORDER}`,
            background: "#f8fafb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          ← New Setup
        </button>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}
          style={{ padding: "13px 0", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          🔁 Repeat
        </button>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────────────
     SETUP
  ──────────────────────────────────────────────────── */
  if (!started) {
    const verseCount = Math.max(0, endVerse - startVerse + 1);
    const canStart   = !loading && ayahs.length > 0 && endVerse >= startVerse;
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header */}
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🧠</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: "#fff", fontWeight: 700 }}>Memorization</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>نظام الحفظ المنهجي</div>
          </div>
        </div>

        {/* AI Status */}
        <div style={card({ padding: "12px 16px" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: G }}>AI Counting — Ready (Whisper)</div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 1 }}>
                Listens as you recite and counts repetitions automatically
              </div>
            </div>
            <div style={{ padding: "3px 10px", borderRadius: 20, background: LIGHT,
              border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: G }}>
              ✓ Active
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {([
              ["From Ayah", startVerse, (v: number) => setStartVerse(v), 1,           surah.verses],
              ["To Ayah",   endVerse,   (v: number) => setEndVerse(v),   startVerse,  surah.verses],
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
          {verseCount > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`,
              fontSize: 12, color: G, fontWeight: 600, textAlign: "center" }}>
              {verseCount} verse{verseCount !== 1 ? "s" : ""} · {buildSteps(verseCount).length} steps total
            </div>
          )}
        </div>

        <button onClick={startSession} disabled={!canStart}
          style={{ padding: "15px 0", borderRadius: 14, border: "none",
            cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 15, fontWeight: 800 }}>
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
        {micError && (
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "#fffbeb",
            border: "1px solid #f6d860", fontSize: 12, color: "#856404", textAlign: "center" }}>
            {micError}
          </div>
        )}
      </div>
    );
  }

  /* ────────────────────────────────────────────────────
     ACTIVE SESSION
  ──────────────────────────────────────────────────── */
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#7a9e88" }}>Starting session…</div>
    </div>
  );

  const col      = STEP_STYLE[currentStep.type];
  const progress = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool     = sessionAyahsRef.current;
  const versesToShow = currentStep.type === "overview"
    ? pool : currentStep.indices.map(i => pool[i]).filter(Boolean);

  /* ── FIX 3: Overview — Quran Recitation style ──────── */
  const isOverview = currentStep.type === "overview";

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        .peek-btn { user-select: none; -webkit-user-select: none; }
      `}</style>

      {/* Progress */}
      <div style={card({ padding: "14px 16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>
            Step <strong style={{ color: G }}>{stepIdx + 1}</strong> / {steps.length}
          </div>
          <button onClick={() => { stopAudio(); stopMic(); clearSession(); setStarted(false); setStepIdx(0); setRepsDone(0); setPeeking(false); }}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: `1px solid ${BORDER}`,
              background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End
          </button>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 4,
            background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .4s ease" }} />
        </div>
      </div>

      {/* Step badge */}
      <div style={{ padding: "14px 16px", borderRadius: 16, background: col.bg,
        border: `1px solid ${col.border}`, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 26 }}>{col.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: col.text }}>
              {currentStep.label.split("—")[0].trim()}
            </div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: col.text, opacity: .85 }}>
              {currentStep.labelAr}
            </div>
          </div>
        </div>
      </div>

      {/* ── OVERVIEW: Quran-recitation style ───────────── */}
      {isOverview ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Reciter selector */}
          <div style={card({ padding: "14px 16px" })}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
              🎙 RECITER · القارئ
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
              {RECITERS.map(r => (
                <button key={r.id} onClick={() => setSelectedReciter(r.id)}
                  style={{
                    flexShrink: 0, padding: "8px 14px", borderRadius: 20,
                    border: `2px solid ${selectedReciter === r.id ? G : BORDER}`,
                    background: selectedReciter === r.id ? G : "#f8fafb",
                    color: selectedReciter === r.id ? "#fff" : "#7a9e88",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    transition: "all .2s",
                  }}>
                  <div>{r.label}</div>
                  <div style={{ fontFamily: "'Amiri',serif", fontSize: 10, opacity: .8, marginTop: 2, direction: "rtl" }}>{r.labelAr}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quran-style verse display — parchment, flowing */}
          <div style={{
            background: PARCH, border: `1px solid #e8d9b5`, borderRadius: 18,
            boxShadow: "0 4px 20px rgba(26,61,36,.10)", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              background: `linear-gradient(135deg,${G},${GM})`,
              padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                  {SURAHS[surahNum - 1]?.name}
                </div>
                <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 2, direction: "rtl" }}>
                  {SURAHS[surahNum - 1]?.nameAr} · آيات {toAr(startVerse)}–{toAr(endVerse)}
                </div>
              </div>
              <button onClick={() => {
                if (isPlaying) { stopAudio(); return; }
                // Play all verses sequentially
                stopAudio();
                playingRef.current = true; setIsPlaying(true);
                let i = 0;
                const playNext = () => {
                  if (!playingRef.current || i >= pool.length) { setIsPlaying(false); return; }
                  const au = new Audio(audioUrl(surahNum, pool[i].numberInSurah, selectedReciter));
                  audioRef.current = au;
                  au.play().catch(() => { playingRef.current = false; setIsPlaying(false); });
                  au.onended = () => { i++; playNext(); };
                };
                playNext();
              }} style={{
                padding: "8px 16px", borderRadius: 20, border: "2px solid rgba(255,255,255,.4)",
                background: isPlaying ? "#dc2626" : "rgba(255,255,255,.15)",
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
                {isPlaying ? "⏹ Stop" : "▶ Play All"}
              </button>
            </div>

            {/* Verses */}
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {pool.map((ayah) => (
                <div key={ayah.numberInSurah} style={{
                  background: "#fff", borderRadius: 14,
                  border: `1px solid #e8d9b5`,
                  padding: "14px 16px",
                  boxShadow: "0 1px 6px rgba(26,61,36,.05)",
                }}>
                  {/* Ayah number + play */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <button onClick={() => playVerse(surahNum, ayah.numberInSurah, selectedReciter)}
                      style={{
                        padding: "4px 10px", borderRadius: 14, border: `1px solid ${BORDER}`,
                        background: LIGHT, color: G, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                      ▶ Play
                    </button>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: G, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                        {toAr(ayah.numberInSurah)}
                      </span>
                    </div>
                  </div>
                  {/* Arabic text */}
                  <div style={{
                    fontFamily: "'Amiri Quran','Amiri',serif",
                    fontSize: 26, color: G, lineHeight: 2.4,
                    textAlign: "right", direction: "rtl",
                  }}>
                    {ayah.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Non-overview: verse cards ─────────────────── */
        <div style={card({ padding: "16px" })}>
          {versesToShow.map((ayah, i) => {
            const isHighlight  = i === 0 && currentStep.type === "single";
            // FIX 2 — cumulative is ALWAYS blurred; only visible while holding peek button
            const isCumul      = currentStep.type === "cumulative";
            const hideContent  = isCumul && !peeking;

            return (
              <div key={ayah.numberInSurah}
                style={{ padding: "12px 14px", borderRadius: 12, marginBottom: 8,
                  background: isHighlight ? "#fffbeb" : "#fafafa",
                  border: `1px solid ${isHighlight ? "#f6d860" : "#f0f4f0"}`, direction: "rtl" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6, direction: "ltr" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%",
                    background: isHighlight ? GOLD : LIGHT, border: `1px solid ${isHighlight ? GOLD : BORDER}`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "'Amiri',serif", fontSize: 11, fontWeight: 700,
                      color: isHighlight ? "#fff" : G }}>
                      {toAr(ayah.numberInSurah)}
                    </span>
                  </div>
                </div>
                <div style={{
                  fontFamily: "'Amiri Quran',serif", fontSize: 24, color: G, lineHeight: 2, textAlign: "right",
                  opacity: hideContent ? 0.08 : 1,
                  filter: hideContent ? "blur(6px)" : "none",
                  transition: "opacity .15s, filter .15s",
                  userSelect: hideContent ? "none" : undefined,
                }}>
                  {ayah.text}
                </div>
              </div>
            );
          })}

          {/* FIX 2 — Cumulative: always-visible hold-to-reveal button */}
          {currentStep.type === "cumulative" && (
            <button
              className="peek-btn"
              onPointerDown={() => setPeeking(true)}
              onPointerUp={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
              onPointerCancel={() => setPeeking(false)}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                border: `1.5px solid ${peeking ? G : BORDER}`,
                background: peeking ? LIGHT : "#f8fafb",
                color: peeking ? G : "#7a9e88",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                marginTop: 4, transition: "all .15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              {peeking ? "👁 Showing…" : "👁 Hold to Reveal · اضغط مطولاً لترى"}
            </button>
          )}
        </div>
      )}

      {/* Rep counter (non-overview) */}
      {currentStep.type !== "overview" && (
        <div style={card({ padding: "14px", textAlign: "center" })}>
          <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 700, letterSpacing: .5, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            REPETITIONS · التكرارات
            {micActive && (
              <span style={{ padding: "2px 8px", borderRadius: 12, background: LIGHT,
                border: `1px solid ${BORDER}`, fontSize: 10, color: G, fontWeight: 600 }}>
                🤖 AI Counting
              </span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {Array.from({ length: currentStep.reps }, (_, i) => (
              <div key={i}
                style={{ width: 34, height: 34, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, transition: "all .2s",
                  background: i < repsDone ? col.gradient : "#f0f4f0",
                  color: i < repsDone ? "#fff" : "#7a9e88",
                  border: `2px solid ${i === repsDone ? GOLD : "transparent"}`,
                  boxShadow: i === repsDone ? `0 0 0 2px ${GOLD}44` : "none" }}>
                {i < repsDone ? "✓" : i + 1}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: G }}>
            {repsDone} <span style={{ fontSize: 14, color: "#7a9e88" }}>/ {currentStep.reps}</span>
          </div>

          {liveText && (
            <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8,
              background: "#f0fff4", border: `1px solid ${BORDER}`,
              fontSize: 14, direction: "rtl", fontFamily: "'Amiri',serif", color: G }}>
              {liveText}
            </div>
          )}

          {micActive && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {[4, 9, 6, 13, 8, 11, 5].map((h, i) => (
                <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: "#ef4444",
                  animation: `wavePulse .8s ease-in-out ${i * 0.09}s infinite alternate` }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginLeft: 4 }}>
                {String(Math.floor(micTime / 60)).padStart(2, "0")}:{String(micTime % 60).padStart(2, "0")}
              </span>
            </div>
          )}

          {!micActive && micError && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#c0392b" }}>{micError}</div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 10 }}>
        {isPlaying ? (
          <button onClick={stopAudio}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
              background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ⏹ Stop Audio
          </button>
        ) : (
          <button onClick={playCurrentStep}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${BORDER}`,
              background: LIGHT, color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔊 Listen
          </button>
        )}

        {currentStep.type !== "overview" && (
          micActive ? (
            <button onClick={stopMic}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              🎙 Stop Mic
            </button>
          ) : (
            <button onClick={startMic}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              🎙 Start Mic
            </button>
          )
        )}

        <button onClick={markRep}
          style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
            background: col.gradient, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          {currentStep.type === "overview"
            ? "Begin Memorizing →"
            : repsDone + 1 >= currentStep.reps
            ? stepIdx < steps.length - 1 ? "✓ Done → Next" : "🎉 Finish!"
            : `✓ Rep ${repsDone + 1}`}
        </button>
      </div>

      <button
        onClick={() => {
          stopAudio(); stopMic(); setPeeking(false);
          if (stepIdx > 0) {
            const prev = stepIdx - 1;
            stepIdxRef.current   = prev; repsDoneRef.current = 0;
            totalRepsRef.current = steps[prev].reps;
            prevStepIdxRef.current = -1;
            setStepIdx(prev); setRepsDone(0);
            saveSession({ stepIdx: prev, repsDone: 0 });
          } else {
            clearSession(); setStarted(false);
          }
        }}
        style={{ padding: "10px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
        ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
      </button>
    </div>
  );
}
