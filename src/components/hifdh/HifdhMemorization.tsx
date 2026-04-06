// src/components/hifdh/HifdhMemorization.tsx
// REDESIGN:
//   • Quran text dominates the screen
//   • All verses listed — only current one revealed, others blurred/hidden
//   • Counting on a single compact line below the Quran card
//   • Rep count options: 5, 7, 10, 15, 20 (configurable in setup)
//   • Qwen AI (DashScope paraformer-v2) primary → Groq Whisper fallback
//   • Immediate counting: counts as soon as verse is matched + silence

import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, RECITERS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { transcribeRecitationAudio } from "@/lib/recitationAi";

/* ── Palette ──────────────────────────────────────────────────── */
const G      = "#1a3d24";
const GM     = "#276749";
const GOLD   = "#b7791f";
const GOLD_L = "#fef9ee";
const LIGHT  = "#f0fff4";
const BORDER = "#d4e8d4";
const PARCH  = "#faf6ec";
const PARCH2 = "#f3ead8";

const SILENCE_MS  = 1100;   // ms after match → count (faster = more immediate)
const SESSION_KEY = "hifdh_mem_v4";

/* ── Rep count options ────────────────────────────────────────── */
const REP_OPTIONS = [5, 7, 10, 15, 20] as const;
type RepOption = typeof REP_OPTIONS[number];

/* ── Types ────────────────────────────────────────────────────── */
interface Ayah    { numberInSurah: number; text: string; }
interface Props   { reciter?: string; }
type StepType     = "overview" | "single" | "pair" | "cumulative";
interface MemStep { type: StepType; indices: number[]; reps: number; label: string; labelAr: string; }
interface Saved   { surahNum: number; startVerse: number; endVerse: number; stepIdx: number; repsDone: number; started: boolean; repsPerVerse: number; }

/* ── Step builder ─────────────────────────────────────────────── */
function buildSteps(count: number, repsPerVerse: number): MemStep[] {
  if (count === 0) return [];
  const R  = repsPerVerse;
  const RP = Math.max(3, Math.round(R * 0.5));   // pair reps = 50% of single
  const RC = Math.max(3, Math.round(R * 0.5));   // cumulative reps
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
        labelAr: `الآيتان ${toAr(i)}–${toAr(i + 1)} معاً — كرر ${toAr(RP)} مرات`,
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

/* ── Arabic matching ──────────────────────────────────────────── */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065B\u0670]/g, "")
    .replace(/[\u0640\u061B\u060C\u061F\u06D4\u06D2]/g, "")
    .replace(/[\s\u200F\u200E]+/g, " ")
    .replace(/^[إأآا]/g, "ا").replace(/ى$/g, "ي").replace(/ة$/g, "ه")
    .trim();
}

function isVerseMatch(transcribed: string, targetVerses: Ayah[], threshold = 0.50): boolean {
  const normTrans = normalizeArabic(transcribed);
  if (!normTrans || normTrans.length < 3) return false;
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
    if (normVerse.includes(normTrans) && normTrans.length > normVerse.length * 0.35) return true;
  }
  return false;
}

function getMime() {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/* ── Step accent colours ──────────────────────────────────────── */
const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; grad: string }> = {
  overview:   { bg: GOLD_L,    text: GOLD,       border: "#f6d860", icon: "📖", grad: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,           border: BORDER,    icon: "🎯", grad: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb",   border: "#bfdbfe", icon: "🔗", grad: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed",   border: "#ddd6fe", icon: "📚", grad: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

/* ══════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════ */
export default function HifdhMemorization({ reciter: reciterProp }: Props) {

  /* ── State ──────────────────────────────────────────────────── */
  const [surahNum,        setSurahNum]        = useState(114);
  const [startVerse,      setStartVerse]      = useState(1);
  const [endVerse,        setEndVerse]        = useState(6);
  const [repsPerVerse,    setRepsPerVerse]    = useState<RepOption>(7);
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
  const [micTime,         setMicTime]         = useState(0);
  const [selectedReciter, setSelectedReciter] = useState(reciterProp || DEFAULT_RECITER);
  const [peeking,         setPeeking]         = useState(false);
  const [justCounted,     setJustCounted]     = useState(false); // flash on count

  /* ── Refs ───────────────────────────────────────────────────── */
  const sessionAyahsRef        = useRef<Ayah[]>([]);
  const audioRef               = useRef<HTMLAudioElement | null>(null);
  const playingRef             = useRef(false);
  const mrRef                  = useRef<MediaRecorder | null>(null);
  const initChunkRef           = useRef<Blob | null>(null);
  const silRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repsDoneRef            = useRef(0);
  const totalRepsRef           = useRef(7);
  const stepsRef               = useRef<MemStep[]>([]);
  const stepIdxRef             = useRef(0);
  const micTimerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepIdxRef         = useRef(-1);
  const advanceStepRef         = useRef<() => void>(() => {});
  const transcriptionPendingRef= useRef(false);
  const pendingRestoreRef      = useRef<Saved | null>(null);
  const repsPerVerseRef        = useRef<number>(7);

  const surah = SURAHS[surahNum - 1];

  /* ── Persistence ────────────────────────────────────────────── */
  const saveSession = useCallback((patch: Partial<Saved> = {}) => {
    try {
      const current: Saved = {
        surahNum, startVerse, endVerse, repsPerVerse,
        stepIdx: stepIdxRef.current,
        repsDone: repsDoneRef.current,
        started: true,
        ...patch,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(current));
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
          const sv    = restore.startVerse;
          const ev    = restore.endVerse;
          const rpv   = (restore.repsPerVerse && REP_OPTIONS.includes(restore.repsPerVerse as RepOption))
            ? restore.repsPerVerse : repsPerVerseRef.current;
          const slice = loaded.filter(a => a.numberInSurah >= sv && a.numberInSurah <= ev);
          if (slice.length > 0) {
            sessionAyahsRef.current = slice;
            const newSteps = buildSteps(slice.length, rpv);
            const si       = Math.min(restore.stepIdx, newSteps.length - 1);
            const rd       = Math.min(restore.repsDone, newSteps[si]?.reps ?? 0);
            stepsRef.current     = newSteps;
            stepIdxRef.current   = si;
            repsDoneRef.current  = rd;
            totalRepsRef.current = newSteps[si]?.reps ?? rpv;
            prevStepIdxRef.current = -1;
            setSteps(newSteps); setStepIdx(si); setRepsDone(rd);
            setStarted(true); setCompleted(false);
          }
        }
      } else { setFetchError("Could not load — please retry."); }
    } catch { setFetchError("Network error."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAyahs(surahNum); }, [surahNum, fetchAyahs]);
  useEffect(() => () => { audioRef.current?.pause(); stopMicFn(); }, []);

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

  /* ── Mic ────────────────────────────────────────────────────── */
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
    // Flash animation
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 600);
    saveSession({ repsDone: done });
    if (done >= totalRepsRef.current) {
      stopMic();
      setTimeout(() => advanceStepRef.current(), 400);
    }
  }, [stopMic, saveSession]);

  const sendChunk = useCallback(async (blob: Blob) => {
    if (transcriptionPendingRef.current) return;
    transcriptionPendingRef.current = true;
    try {
      const transcript = await transcribeRecitationAudio(blob);
      if (transcript.trim().length > 0) {
        const step    = stepsRef.current[stepIdxRef.current];
        const targets = step?.indices.map(i => sessionAyahsRef.current[i]) || [];
        if (isVerseMatch(transcript, targets, 0.50)) {
          setLiveText(transcript.slice(-70));
          if (silRef.current) clearTimeout(silRef.current);
          // Count immediately after silence — very tight window
          silRef.current = setTimeout(() => {
            if (repsDoneRef.current < totalRepsRef.current) countOneRep();
          }, SILENCE_MS);
        } else {
          setLiveText(`🔄 ${transcript.slice(0, 40)}…`);
        }
      }
    } catch (err) {
      console.warn("Transcription failed:", err);
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
      mr.start(1200);  // chunk every 1.2s — faster response
      mrRef.current = mr;
      setMicActive(true);
      micTimerRef.current = setInterval(() => setMicTime(t => t + 1), 1000);
    } catch {
      setMicError("🎤 Mic access denied — tap Allow and retry.");
    }
  }, [sendChunk]);

  /* ── Step navigation ────────────────────────────────────────── */
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

  /* ── Auto-start mic on step change ─────────────────────────── */
  useEffect(() => {
    if (!started || steps.length === 0) return;
    const step = steps[stepIdx];
    if (!step || step.type === "overview") { stopMic(); return; }
    if (stepIdx === prevStepIdxRef.current) return;
    prevStepIdxRef.current = stepIdx;
    stopMic();
    const t = setTimeout(() => startMic(), 600);
    return () => clearTimeout(t);
  }, [stepIdx, started, steps, startMic, stopMic]);

  /* ── Manual rep ─────────────────────────────────────────────── */
  const markRep = () => {
    const step = steps[stepIdx];
    if (!step) return;
    const next = repsDone + 1;
    repsDoneRef.current = next;
    saveSession({ repsDone: next });
    if (next >= step.reps) advanceStep();
    else setRepsDone(next);
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
    sessionAyahsRef.current  = slice;
    repsPerVerseRef.current  = repsPerVerse;
    const newSteps           = buildSteps(slice.length, repsPerVerse);
    stepsRef.current         = newSteps;
    stepIdxRef.current       = 0;
    repsDoneRef.current      = 0;
    totalRepsRef.current     = newSteps[0]?.reps ?? repsPerVerse;
    prevStepIdxRef.current   = -1;
    setSteps(newSteps); setStepIdx(0); setRepsDone(0);
    setPeeking(false); setCompleted(false); setStarted(true);
    stopAudio(); stopMic();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e, repsPerVerse });
  };

  /* ── Shared styles ──────────────────────────────────────────── */
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
        <div style={{ fontSize: 13, color: "#7a9e88", marginTop: 12, lineHeight: 1.7 }}>
          All {steps.length} steps — <strong style={{ color: G }}>Surah {surah.name}</strong> Ayahs {startVerse}–{endVerse}
        </div>
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
            <div style={{ fontSize: 46, marginBottom: 10 }}>🧠</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: "#fff", fontWeight: 700 }}>Memorization</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 15, color: "rgba(255,255,255,.75)", marginTop: 4 }}>نظام الحفظ المنهجي</div>
          </div>
        </div>

        {/* AI Status */}
        <div style={card({ padding: "12px 16px" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: G }}>Qwen AI Auto-Counting · Active</div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 1 }}>
                Listens, matches your recitation, counts immediately when verse finishes
              </div>
            </div>
            <div style={{ padding: "3px 10px", borderRadius: 20, background: LIGHT,
              border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: G }}>
              ✓ Ready
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

          {/* Rep count selector */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 700, letterSpacing: .5, marginBottom: 8 }}>
              REPETITIONS PER VERSE · عدد التكرارات
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {REP_OPTIONS.map(opt => (
                <button key={opt} onClick={() => { setRepsPerVerse(opt); repsPerVerseRef.current = opt; }}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${repsPerVerse === opt ? G : BORDER}`,
                    background: repsPerVerse === opt ? G : "#f8fafb",
                    color: repsPerVerse === opt ? "#fff" : "#7a9e88",
                    fontSize: 15, fontWeight: 800, transition: "all .2s",
                  }}>
                  {opt}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#7a9e88", textAlign: "center", marginTop: 6 }}>
              Each verse repeated {repsPerVerse}× · كل آية تُكرر {toAr(repsPerVerse)} مرات
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
        {micError && (
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "#fffbeb",
            border: "1px solid #f6d860", fontSize: 12, color: "#856404", textAlign: "center" }}>
            {micError}
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

  const col          = STEP_STYLE[currentStep.type];
  const progress     = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool         = sessionAyahsRef.current;
  const isOverview   = currentStep.type === "overview";
  // which ayah indices are "active" (visible) right now
  const activeIdxSet = new Set(currentStep.indices);

  return (
    <div style={{ padding: "0 0 16px", display: "flex", flexDirection: "column", gap: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        @keyframes countFlash{0%{transform:scale(1.4);background:#fef08a}100%{transform:scale(1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .peek-btn{user-select:none;-webkit-user-select:none}
        .verse-card{transition:opacity .3s,filter .3s,transform .3s}
      `}</style>

      {/* ── Top bar: Progress ─────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "10px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 18 }}>{col.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: col.text }}>
                {currentStep.label.split("—")[0].trim()}
              </div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 11, color: col.text, opacity: .8 }}>
                {currentStep.labelAr}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#7a9e88" }}>
              <strong style={{ color: G }}>{stepIdx + 1}</strong>/{steps.length}
            </div>
            <button onClick={() => { stopAudio(); stopMic(); clearSession(); setStarted(false); setStepIdx(0); setRepsDone(0); }}
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

      {/* ── MAIN QURAN AREA ───────────────────────────────────── */}
      <div style={{
        background: PARCH,
        backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 47px,${PARCH2}44 47px,${PARCH2}44 48px)`,
        borderBottom: `2px solid #e8d9b5`,
        minHeight: 280,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Surah header bar */}
        <div style={{
          background: `linear-gradient(135deg,${G},${GM})`,
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{SURAHS[surahNum - 1]?.name}</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 11, color: "rgba(255,255,255,.7)", direction: "rtl" }}>
              {SURAHS[surahNum - 1]?.nameAr} · آيات {toAr(startVerse)}–{toAr(endVerse)}
            </div>
          </div>
          <button
            onClick={() => isPlaying ? stopAudio() : playCurrentStep()}
            style={{
              padding: "7px 14px", borderRadius: 18,
              border: "2px solid rgba(255,255,255,.35)",
              background: isPlaying ? "#dc2626" : "rgba(255,255,255,.15)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
            {isPlaying ? "⏹ Stop" : "🔊 Listen"}
          </button>
        </div>

        {/* All verses — active revealed, others hidden */}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {pool.map((ayah, poolIdx) => {
            const isActive  = activeIdxSet.has(poolIdx);
            const isCumul   = currentStep.type === "cumulative";
            const hideText  = isCumul && !peeking && isActive;
            const isHidden  = !isActive; // non-active verses are hidden

            return (
              <div key={ayah.numberInSurah}
                className="verse-card"
                style={{
                  background: isActive ? "#fff" : "transparent",
                  border: isActive ? `1.5px solid ${isActive && currentStep.type === "single" ? GOLD : BORDER}` : "1px solid transparent",
                  borderRadius: 14,
                  padding: isActive ? "14px 16px" : "6px 16px",
                  opacity: isHidden ? 0.25 : 1,
                  filter: isHidden ? "blur(3px)" : "none",
                  boxShadow: isActive ? "0 2px 10px rgba(26,61,36,.10)" : "none",
                  transform: isActive ? "scale(1)" : "scale(0.98)",
                  pointerEvents: isHidden ? "none" : "auto",
                }}>

                {/* Active verse content */}
                {isActive && (
                  <>
                    {/* Ayah number + play */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, direction: "ltr" }}>
                      <button onClick={() => playVerse(surahNum, ayah.numberInSurah, selectedReciter)}
                        style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${BORDER}`,
                          background: LIGHT, color: G, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        ▶ Play
                      </button>
                      <div style={{ width: 28, height: 28, borderRadius: "50%",
                        background: currentStep.type === "single" ? GOLD : G,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                          {toAr(ayah.numberInSurah)}
                        </span>
                      </div>
                    </div>

                    {/* Arabic text */}
                    <div style={{
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      fontSize: 28, color: G, lineHeight: 2.4,
                      textAlign: "right", direction: "rtl",
                      opacity: hideText ? 0.06 : 1,
                      filter: hideText ? "blur(8px)" : "none",
                      transition: "opacity .15s, filter .15s",
                      userSelect: hideText ? "none" : undefined,
                    }}>
                      {ayah.text}
                    </div>

                    {/* Peek button for cumulative */}
                    {isCumul && (
                      <button
                        className="peek-btn"
                        onPointerDown={() => setPeeking(true)}
                        onPointerUp={() => setPeeking(false)}
                        onPointerLeave={() => setPeeking(false)}
                        onPointerCancel={() => setPeeking(false)}
                        style={{
                          width: "100%", padding: "8px 0", borderRadius: 8,
                          border: `1.5px solid ${peeking ? G : BORDER}`,
                          background: peeking ? LIGHT : "#f8fafb",
                          color: peeking ? G : "#7a9e88",
                          fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 8,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}>
                        {peeking ? "👁 Showing…" : "👁 Hold to Reveal · اضغط مطولاً"}
                      </button>
                    )}
                  </>
                )}

                {/* Hidden verse — just show ayah number */}
                {isHidden && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, direction: "ltr" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%",
                      background: "#e8e8e8",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "'Amiri',serif", fontSize: 9, color: "#aaa" }}>
                        {toAr(ayah.numberInSurah)}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#e8e8e8" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live transcription text */}
        {liveText && !liveText.startsWith("🔄") && (
          <div style={{
            margin: "0 14px 10px",
            padding: "8px 14px", borderRadius: 10,
            background: `${G}11`, border: `1px solid ${BORDER}`,
            fontSize: 16, direction: "rtl", fontFamily: "'Amiri',serif", color: G,
            animation: "slideUp .3s ease",
          }}>
            {liveText}
          </div>
        )}
      </div>

      {/* ── COUNTING STRIP (single line) ─────────────────────── */}
      {!isOverview && (
        <div style={{
          background: "#fff",
          borderBottom: `1px solid ${BORDER}`,
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* Mic indicator */}
          {micActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 4, flexShrink: 0 }}>
              {[4, 9, 6, 13, 7].map((h, i) => (
                <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: "#ef4444",
                  animation: `wavePulse .7s ease-in-out ${i * 0.1}s infinite alternate` }} />
              ))}
            </div>
          )}

          {/* Rep dots — single line */}
          <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none" }}>
            {Array.from({ length: currentStep.reps }, (_, i) => {
              const done    = i < repsDone;
              const current = i === repsDone;
              return (
                <div key={i}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: done ? col.grad : current && justCounted ? "#fef08a" : current ? `${col.text}18` : "#f0f4f0",
                    color: done ? "#fff" : current ? col.text : "#bbb",
                    border: `2px solid ${current ? col.text : done ? "transparent" : "#e8e8e8"}`,
                    boxShadow: current ? `0 0 0 3px ${col.text}22` : "none",
                    animation: current && justCounted ? "countFlash .5s ease" : "none",
                    transition: "all .25s",
                  }}>
                  {done ? "✓" : i + 1}
                </div>
              );
            })}
          </div>

          {/* Count number */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: G, lineHeight: 1 }}>{repsDone}</div>
            <div style={{ fontSize: 10, color: "#7a9e88" }}>/ {currentStep.reps}</div>
          </div>

          {/* Timer */}
          {micActive && (
            <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#ef4444", minWidth: 34 }}>
              {String(Math.floor(micTime / 60)).padStart(2, "0")}:{String(micTime % 60).padStart(2, "0")}
            </div>
          )}
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{ margin: "0 16px", padding: "8px 14px", borderRadius: 10, background: "#fffbeb",
          border: "1px solid #f6d860", fontSize: 12, color: "#856404", textAlign: "center" }}>
          {micError}
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, padding: "12px 16px 0" }}>
        {!isOverview && (
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
          style={{ flex: isOverview ? 2 : 1, padding: "13px 0", borderRadius: 12, border: "none",
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
        style={{ margin: "8px 16px 0", padding: "10px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
        ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
      </button>
    </div>
  );
}
