// src/components/hifdh/HifdhMemorization.tsx
// GROQ WHISPER TRANSCRIPTION — VAD-segmented, one call per repetition
//  • Continuous VAD watches for voice onset / sustained silence
//  • Each repetition = its own MediaRecorder (no timeslice) → one
//    complete, properly-headed audio file per Whisper call
//  • Far more accurate than fixed-time chunking (no broken WebM
//    fragments, no mid-word cuts) and just as fast — next repetition
//    starts recording immediately, transcription calls overlap

import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, RECITERS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { G, GM, GOLD, GOLD_L, LIGHT, BORDER, PARCH, PARCH2 } from "./hifdhTheme";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "hifdh_mem_v20";

/* ── VAD / utterance-segmentation tuning ──────────────────────
 * One Whisper call per spoken repetition (not per fixed timeslice).
 * ONSET_MS            — sustained voice needed before we start recording (debounces noise spikes)
 * SILENCE_HANGOVER_MS — sustained silence needed before we consider the repetition finished
 * MIN_UTTERANCE_MS    — discard anything shorter (breath/mic bump)
 * MAX_UTTERANCE_MS     — safety cap in case VAD never sees silence
 * VOICE_ENERGY_MIN    — energy threshold in the 300–3400Hz band counted as "voiced"
 * ────────────────────────────────────────────────── */
const VOICE_ENERGY_MIN    = 14;

const REP_OPTIONS = [5, 7, 10, 15, 20] as const;
type RepOption = typeof REP_OPTIONS[number];

interface Ayah    { numberInSurah: number; text: string; }
interface Props   { reciter?: string; onSessionSaved?: () => void; }
type StepType     = "overview" | "single" | "pair" | "cumulative";
interface MemStep { type: StepType; indices: number[]; reps: number; label: string; labelAr: string; }
interface Saved   {
  surahNum: number; startVerse: number; endVerse: number;
  stepIdx: number; repsDone: number; started: boolean; repsPerVerse: number;
}

function buildSteps(count: number, R: number): MemStep[] {
  if (count === 0) return [];
  const RP = Math.max(3, Math.round(R * 0.5));
  const RC = Math.max(3, Math.round(R * 0.5));
  const steps: MemStep[] = [];
  steps.push({ type: "overview", indices: Array.from({ length: count }, (_, i) => i), reps: 1,
    label: "Read All Verses", labelAr: "تعرّف على النص قبل البدء" });
  for (let i = 0; i < count; i++) {
    steps.push({ type: "single", indices: [i], reps: R,
      label: `Verse ${i + 1} — Repeat ${R}×`, labelAr: `الآية ${toAr(i + 1)} — كرر ${toAr(R)} مرات` });
    if (i > 0) {
      steps.push({ type: "pair", indices: [i - 1, i], reps: RP,
        label: `Verses ${i}–${i + 1} Together — ${RP}×`,
        labelAr: `الآيتان ${toAr(i)}–${toAr(i + 1)} معاً — ${toAr(RP)} مرات` });
      steps.push({ type: "cumulative", indices: Array.from({ length: i + 1 }, (_, k) => k), reps: RC,
        label: `Verses 1–${i + 1} Cumulative — ${RC}×`,
        labelAr: `من ١ إلى ${toAr(i + 1)} تراكمياً — ${toAr(RC)} مرات` });
    }
  }
  return steps;
}

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

function normalizeHurufMuqattaat(text: string): string {
  const t = text.replace(/[أإآٱ]/g, "ا").replace(/[\u064B-\u065F\u0670]/g, "");
  return t
    .replace(/الف\s+لام\s+ميم\s+را/g, "المر").replace(/الف\s+لام\s+ميم\s+صاد/g, "المص")
    .replace(/كاف\s+ها\s+يا\s+عين\s+صاد/g, "كهيعص").replace(/عين\s+سين\s+قاف/g, "عسق")
    .replace(/طا\s+سين\s+ميم/g, "طسم").replace(/حا\s+ميم\s+عين\s+سين\s+قاف/g, "حمعسق")
    .replace(/الف\s+لام\s+ميم/g, "الم").replace(/الف\s+لام\s+را/g, "الر")
    .replace(/حا\s+ميم/g, "حم").replace(/يا\s+سين/g, "يس")
    .replace(/طا\s+سين/g, "طس").replace(/طا\s+ها/g, "طه")
    .replace(/(^|\s)صاد(\s|$)/g, "$1ص$2").replace(/(^|\s)قاف(\s|$)/g, "$1ق$2")
    .replace(/(^|\s)نون(\s|$)/g, "$1ن$2").replace(/(^|\s)الف(\s|$)/g, "$1ا$2")
    .replace(/(^|\s)لام(\s|$)/g, "$1ل$2").replace(/(^|\s)ميم(\s|$)/g, "$1م$2")
    .replace(/(^|\s)را(\s|$)/g, "$1ر$2").replace(/(^|\s)سين(\s|$)/g, "$1س$2")
    .replace(/(^|\s)عين(\s|$)/g, "$1ع$2").replace(/(^|\s)ها(\s|$)/g, "$1ه$2")
    .replace(/(^|\s)كاف(\s|$)/g, "$1ك$2").replace(/(^|\s)حا(\s|$)/g, "$1ح$2");
}

function norm(text: string): string {
  return normalizeHurufMuqattaat(text)
    .replace(/[\u064B-\u065F\u0670]/g, "").replace(/[\u0640\u061B\u060C\u061F\u06D4]/g, "")
    .replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, " ").trim();
}

function isVerseComplete(transcript: string, targets: Ayah[]): {
  isComplete: boolean; progress: number; missingWords: string[];
} {
  const t = norm(transcript);
  const e = norm(targets.map(a => a.text).join(" "));
  if (!t || t.length < 3) return { isComplete: false, progress: 0, missingWords: [] };
  if (!e) return { isComplete: false, progress: 0, missingWords: [] };
  const eWords = e.split(" ").filter(w => w.length > 1);
  if (eWords.length === 0) {
    const lr = t.length / Math.max(1, e.length);
    return { isComplete: lr >= 0.8 && lr <= 1.3, progress: Math.min(lr * 100, 100), missingWords: [] };
  }
  const found: string[] = [], missing: string[] = [];
  for (const ew of eWords) {
    if (t.includes(ew)) found.push(ew); else missing.push(ew);
  }
  const coverage = found.length / eWords.length;
  const lr = t.length / Math.max(1, e.length);
  return { isComplete: coverage >= 0.8 && lr >= 0.7 && lr <= 1.4, progress: Math.min(coverage * 100, 100), missingWords: missing };
}

function getBestMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}

const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; grad: string }> = {
  overview:   { bg: GOLD_L,    text: GOLD,     border: "#f6d860", icon: "📖", grad: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,        border: BORDER,    icon: "🎯", grad: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", icon: "🔗", grad: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe", icon: "📚", grad: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

export default function HifdhMemorization({ reciter: reciterProp, onSessionSaved }: Props) {

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
  const [micTime,         setMicTime]         = useState(0);
  const [recitingVerses,  setRecitingVerses]  = useState<Set<number>>(new Set());
  const [matchProgress,   setMatchProgress]   = useState(0);
  const [missingWords,    setMissingWords]    = useState<string[]>([]);
  const [isListening,     setIsListening]     = useState(false);
  const [transcribing,    setTranscribing]    = useState(false);

  const sessionAyahsRef    = useRef<Ayah[]>([]);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const playingRef         = useRef(false);
  const repsDoneRef        = useRef(0);
  const totalRepsRef       = useRef(5);
  const stepsRef           = useRef<MemStep[]>([]);
  const stepIdxRef         = useRef(0);
  const prevStepIdxRef     = useRef(-1);
  const advanceStepRef     = useRef<() => void>(() => {});
  const pendingRestoreRef  = useRef<Saved | null>(null);
  const repsPerVerseRef    = useRef<number>(5);
  const verseRefs          = useRef<Record<number, HTMLDivElement | null>>({});

  /* ══════════════════════════════════════════════════════════════════════
   * STREAMING TRANSCRIPTION
   * Instead of waiting until you finish speaking to send audio to Groq,
   * we send a rolling chunk every CHUNK_MS milliseconds WHILE you're still
   * talking. Each chunk is transcribed in parallel. We accumulate all the
   * partial transcripts and match against the target verse continuously.
   * The moment coverage ≥ threshold the rep is counted — usually before
   * you've even finished the last word.
   * ══════════════════════════════════════════════════════════════════════ */
  const CHUNK_MS     = 2500;   // send a new chunk every 2.5 s while speaking
  const COVERAGE_THR = 0.78;   // 78% word coverage = rep counts

  const sessionActiveRef   = useRef(false);
  const mediaStreamRef     = useRef<MediaStream | null>(null);
  const chunkRecorderRef   = useRef<MediaRecorder | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const analyserRef        = useRef<AnalyserNode | null>(null);
  const vadRafRef          = useRef<number | null>(null);
  const micTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef            = useRef("audio/webm");
  const pendingTxnRef      = useRef(0);

  // Accumulated transcript for the current rep (reset each time a rep is counted)
  const repTranscriptRef   = useRef("");
  // Whether we already counted this rep (prevent double-count while chunks overlap)
  const repCountedRef      = useRef(false);

  /* ── Send one audio chunk to Groq and fold result into running transcript ── */
  const sendChunk = useCallback(async (blob: Blob) => {
    if (!sessionActiveRef.current) return;
    if (blob.size < 800) return; // too small — silence or noise

    const step    = stepsRef.current[stepIdxRef.current];
    const targets = step ? step.indices.map(i => sessionAyahsRef.current[i]).filter(Boolean) : [];
    if (!targets.length) return;

    const prompt  = targets.map(a => a.text).join(" ").slice(0, 224);
    const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
    pendingTxnRef.current += 1;
    setTranscribing(true);

    try {
      let text = "";
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";

      if (groqKey) {
        const fd = new FormData();
        fd.append("file", new File([blob], `chunk.${ext}`, { type: blob.type }));
        fd.append("model", "whisper-large-v3-turbo");
        fd.append("language", "ar");
        fd.append("temperature", "0");
        fd.append("prompt", prompt);
        try {
          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${groqKey}` },
            body: fd,
          });
          if (r.ok) text = ((await r.json()).text ?? "").trim();
        } catch { /**/ }
      }

      // Fallback to edge function
      if (!text) {
        const fd2 = new FormData();
        fd2.append("file", blob, `chunk.webm`);
        fd2.append("prompt", prompt);
        const { data } = await supabase.functions.invoke("groq-transcribe", { body: fd2 });
        text = (data?.text ?? "").trim();
      }

      if (!text || !sessionActiveRef.current) return;

      // Fold into running transcript — append unique words from this chunk
      const existing = norm(repTranscriptRef.current);
      const newWords = norm(text).split(" ").filter(w => w.length > 1 && !existing.includes(w));
      repTranscriptRef.current = (repTranscriptRef.current + " " + text).trim().slice(-600);
      setLiveText(repTranscriptRef.current.slice(-200));

      // Live match check
      const { isComplete, progress, missingWords: missing } = isVerseComplete(repTranscriptRef.current, targets);
      setMatchProgress(progress);
      setMissingWords(missing.slice(0, 4));

      const tNorm = norm(repTranscriptRef.current);
      const activeVerses = new Set<number>();
      targets.forEach(a => {
        if (tNorm.includes(norm(a.text)) || norm(a.text).split(" ").filter(w=>w.length>2).every(w=>tNorm.includes(w)))
          activeVerses.add(a.numberInSurah);
      });
      setRecitingVerses(activeVerses);

      // Count the rep the moment threshold is hit — don't wait for silence
      if (isComplete && !repCountedRef.current && repsDoneRef.current < totalRepsRef.current) {
        repCountedRef.current = true;
        countOneRep();
      }
    } catch (err) {
      console.warn("sendChunk error:", err);
    } finally {
      pendingTxnRef.current = Math.max(0, pendingTxnRef.current - 1);
      if (pendingTxnRef.current === 0) setTranscribing(false);
    }
  }, [countOneRep]);

  /* ── Reset per-rep state when a new rep starts ── */
  const resetRepState = useCallback(() => {
    repTranscriptRef.current = "";
    repCountedRef.current    = false;
    setLiveText("");
    setMatchProgress(0);
    setMissingWords([]);
    setRecitingVerses(new Set());
  }, []);

  /* ── Rolling chunk recorder — uses MediaRecorder timeslice ─────────────
   * MediaRecorder fires ondataavailable every CHUNK_MS ms with a chunk of
   * audio. Each chunk is sent to Groq immediately, overlapping with the
   * next chunk being recorded. This is what makes transcription feel live. ─ */
  const startChunkRecorder = useCallback((stream: MediaStream) => {
    if (chunkRecorderRef.current) return;
    const mime = mimeRef.current;
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 16000 });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && sessionActiveRef.current) {
          sendChunk(new Blob([e.data], { type: mime }));
        }
      };
      rec.onerror = () => setMicError("Recording error — tap ↺");
      rec.start(CHUNK_MS); // fires every CHUNK_MS ms automatically
      chunkRecorderRef.current = rec;
    } catch (e) { console.warn("chunk recorder failed:", e); }
  }, [sendChunk]);

  const stopChunkRecorder = useCallback(() => {
    const rec = chunkRecorderRef.current;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /**/ } }
    chunkRecorderRef.current = null;
  }, []);

  /* ── VAD — only used to show the "listening" pulse indicator ─────────── */
  const startVAD = useCallback((stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.3;
      src.connect(analyser);
      audioCtxRef.current = ctx; analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!sessionActiveRef.current) return;
        analyser.getByteFrequencyData(buf);
        const binHz = ctx.sampleRate / analyser.fftSize;
        const lo = Math.floor(300 / binHz), hi = Math.floor(3400 / binHz);
        let sum = 0;
        for (let i = lo; i < hi && i < buf.length; i++) sum += buf[i];
        setIsListening(sum / Math.max(1, hi - lo) > VOICE_ENERGY_MIN);
        vadRafRef.current = requestAnimationFrame(tick);
      };
      vadRafRef.current = requestAnimationFrame(tick);
    } catch (e) { console.warn("VAD init failed:", e); }
  }, []);

  /* ── Stop mic completely ── */
  const stopMicFn = useCallback(() => {
    sessionActiveRef.current = false;
    if (vadRafRef.current) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (micTimerRef.current) { clearInterval(micTimerRef.current); micTimerRef.current = null; }
    stopChunkRecorder();
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /**/ } audioCtxRef.current = null; }
    analyserRef.current = null;
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    pendingTxnRef.current = 0;
    setMicActive(false); setMicTime(0); setIsListening(false); setTranscribing(false);
  }, [stopChunkRecorder]);

  /* ── Start mic ── */
  const startMic = useCallback(async () => {
    if (sessionActiveRef.current) return;
    setMicError("");
    pendingTxnRef.current = 0;
    mimeRef.current = getBestMime();
    resetRepState();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      sessionActiveRef.current = true;
      setMicActive(true); setMicTime(0);
      micTimerRef.current = setInterval(() => setMicTime(t => t + 1), 1000);
      startVAD(stream);
      startChunkRecorder(stream);
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError")
        setMicError("🎤 Mic access denied — allow microphone in browser settings");
      else setMicError("Could not start microphone");
      stopMicFn();
    }
  }, [startVAD, startChunkRecorder, stopMicFn, resetRepState]);

  const surah = SURAHS[surahNum - 1];

  /* ── Persistence ── */
  const saveSession = useCallback((patch: Partial<Saved> = {}) => {
    try {
      const s: Saved = { surahNum, startVerse, endVerse, repsPerVerse,
        stepIdx: stepIdxRef.current, repsDone: repsDoneRef.current, started: true, ...patch };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch { /**/ }
  }, [surahNum, startVerse, endVerse, repsPerVerse]);

  const clearSession = useCallback(() => { try { localStorage.removeItem(SESSION_KEY); } catch { /**/ } }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: Saved = JSON.parse(raw);
      if (!saved.started) return;
      setSurahNum(saved.surahNum); setStartVerse(saved.startVerse); setEndVerse(saved.endVerse);
      if (saved.repsPerVerse && REP_OPTIONS.includes(saved.repsPerVerse as RepOption)) {
        setRepsPerVerse(saved.repsPerVerse as RepOption);
        repsPerVerseRef.current = saved.repsPerVerse;
      }
      pendingRestoreRef.current = saved;
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fetch ayahs ── */
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

  /* ── Audio playback ── */
  const stopAudio = useCallback(() => {
    playingRef.current = false; audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false);
  }, []);

  const playVerse = useCallback((surahN: number, verseN: number, rec: string) => {
    stopAudio(); playingRef.current = true; setIsPlaying(true);
    const au = new Audio(audioUrl(surahN, verseN, rec)); audioRef.current = au;
    au.onended = () => { playingRef.current = false; setIsPlaying(false); };
    au.onerror = () => { playingRef.current = false; setIsPlaying(false); };
    au.play().catch(() => { playingRef.current = false; setIsPlaying(false); });
  }, [stopAudio]);

  /* ── Count one rep ── */
  const countOneRep = useCallback(() => {
    const done = repsDoneRef.current + 1;
    repsDoneRef.current = done;
    setRepsDone(done);
    // Reset streaming transcript for next rep
    repTranscriptRef.current = "";
    repCountedRef.current    = false;
    setLiveText(""); setRecitingVerses(new Set()); setMatchProgress(0);
    setMissingWords([]);
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 500);
    saveSession({ repsDone: done });
    if (done >= totalRepsRef.current) {
      setTimeout(() => { stopMicFn(); setTimeout(() => advanceStepRef.current(), 500); }, 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSession]);

  /* ── Step navigation ── */
  const advanceStep = useCallback(() => {
    stopMicFn();
    repTranscriptRef.current = "";
    repCountedRef.current    = false;
    const idx = stepIdxRef.current, all = stepsRef.current;
    if (idx < all.length - 1) {
      const next = idx + 1;
      stepIdxRef.current = next; repsDoneRef.current = 0; totalRepsRef.current = all[next].reps;
      setStepIdx(next); setRepsDone(0); setPeeking(false);
      setRecitingVerses(new Set()); setMatchProgress(0); setMissingWords([]);
      setIsListening(false); setLiveText(""); stopAudio();
      saveSession({ stepIdx: next, repsDone: 0 });
    } else {
      stopAudio();
      clearSession();
      // ── Persist session to DB ─────────────────────────────────────────
      supabase.auth.getUser().then(({ data }) => {
        if (!data?.user) return;
        const surah = SURAHS.find(s => s.number === surahNum);
        const versesCount = sessionAyahsRef.current.length;
        const totalReps   = stepsRef.current.reduce((a, s) => a + s.reps, 0);
        // Estimate score as completion rate (they reached the end = 100)
        (supabase as any).from("hifdh_memorization_sessions").insert({
          student_id:     data.user.id,
          surah_name:     surah?.name ?? `Surah ${surahNum}`,
          surah_number:   surahNum,
          verses_count:   versesCount,
          reps_per_verse: repsPerVerseRef.current,
          total_reps:     totalReps,
          score:          100,
          duration_seconds: 0,
          completed_at:   new Date().toISOString(),
        }).then(() => { onSessionSaved?.(); }).catch(() => {});
      });
      setCompleted(true);
    }
  }, [stopAudio, saveSession, clearSession, stopMicFn]);

  useEffect(() => { advanceStepRef.current = advanceStep; }, [advanceStep]);

  /* ── Auto-start mic on step change ── */
  useEffect(() => {
    if (!started || steps.length === 0) return;
    const step = steps[stepIdx];
    if (!step || step.type === "overview") { stopMicFn(); return; }
    if (stepIdx === prevStepIdxRef.current) return;
    prevStepIdxRef.current = stepIdx;
    stopMicFn();
    const t = setTimeout(() => startMic(), 500);
    return () => clearTimeout(t);
  }, [stepIdx, started, steps, startMic, stopMicFn]);

  /* ── Scroll active verse ── */
  useEffect(() => {
    const step = steps[stepIdx];
    if (!step || step.type === "overview") return;
    const firstActiveVerse = sessionAyahsRef.current[step.indices[0]]?.numberInSurah;
    if (firstActiveVerse && verseRefs.current[firstActiveVerse])
      verseRefs.current[firstActiveVerse]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [stepIdx, steps]);

  useEffect(() => () => { audioRef.current?.pause(); stopMicFn(); }, [stopMicFn]);

  const markRep = () => {
    const step = steps[stepIdx]; if (!step) return;
    if (step.type === "overview") { advanceStep(); return; }
    countOneRep();
  };

  const playCurrentStep = () => {
    const step = steps[stepIdx], pool = sessionAyahsRef.current;
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

  const startSession = () => {
    const s     = Math.max(1, startVerse);
    const e     = Math.min(surah.verses, Math.max(s, endVerse));
    const slice = ayahs.filter(a => a.numberInSurah >= s && a.numberInSurah <= e);
    if (!slice.length) return;
    sessionAyahsRef.current = slice; repsPerVerseRef.current = repsPerVerse;
    const ns = buildSteps(slice.length, repsPerVerse);
    stepsRef.current = ns; stepIdxRef.current = 0; repsDoneRef.current = 0;
    totalRepsRef.current = ns[0]?.reps ?? repsPerVerse; prevStepIdxRef.current = -1;
    setSteps(ns); setStepIdx(0); setRepsDone(0); setPeeking(false); setCompleted(false);
    setStarted(true); setRecitingVerses(new Set()); setMatchProgress(0);
    setMissingWords([]); setIsListening(false); setLiveText("");
    stopAudio(); stopMicFn();
    saveSession({ stepIdx: 0, repsDone: 0, started: true, surahNum, startVerse: s, endVerse: e, repsPerVerse });
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    boxShadow: "0 2px 10px rgba(26,61,36,.06)", ...ex,
  });

  /* ── COMPLETED ── */
  if (completed) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"16px", background:LIGHT }}>
      <div style={card({ padding:"28px 20px", textAlign:"center", maxWidth:340 })}>
        <div style={{ fontSize:52, marginBottom:8 }}>🎉</div>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:24, color:G, fontWeight:700 }}>Session Complete!</div>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:16, color:GOLD, marginTop:4 }}>أحسنت! أكملت الجلسة</div>
      </div>
      <div style={{ display:"flex", gap:8, marginTop:16, width:"100%", maxWidth:340 }}>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); }}
          style={{ flex:1, padding:"12px 0", borderRadius:10, border:`1px solid ${BORDER}`, background:"#f8fafb", color:G, fontSize:13, fontWeight:700, cursor:"pointer" }}>← New</button>
        <button onClick={() => { clearSession(); setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}
          style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>🔁 Repeat</button>
      </div>
    </div>
  );

  /* ── SETUP ── */
  if (!started) {
    const verseCount = Math.max(0, endVerse - startVerse + 1);
    const canStart   = !loading && ayahs.length > 0 && endVerse >= startVerse;
    const W = "#ffffff", WARM = "#faf8f4", B = "#e8ddd0", GL = "#b7791f", TXT = "#374151", MUT = "#9aab94";
    const sCard = (ex?: React.CSSProperties): React.CSSProperties => ({
      background:W, border:`1px solid ${B}`, borderRadius:16, boxShadow:"0 1px 8px rgba(26,61,36,.06)", ...ex });

    return (
      <div style={{ height:"100%", display:"flex", flexDirection:"column", background:WARM, overflow:"hidden" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
          *{box-sizing:border-box;} body{margin:0;padding:0;overflow:hidden;}
          .mem-select:focus{outline:2px solid #1a3d24;outline-offset:1px;}
          .mem-btn:active{transform:scale(0.97);}
          .mem-input:focus{outline:2px solid #1a3d24;outline-offset:1px;border-color:#1a3d24!important;}
        `}</style>
        <div style={{ background:W, borderBottom:`1px solid ${B}`, padding:"16px 16px 14px", flexShrink:0, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${G},${GM},${GOLD})` }} />
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${G},${GM})`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0, boxShadow:"0 2px 8px rgba(26,61,36,.25)" }}>🧠</div>
            <div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:20, color:G, fontWeight:700, lineHeight:1.2 }}>Memorization</div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:12, color:GOLD, marginTop:1 }}>نظام الحفظ المنهجي</div>
            </div>
            <div style={{ marginLeft:"auto", padding:"3px 9px", borderRadius:10, background:`${G}10`, border:`1px solid ${G}30`, fontSize:10, fontWeight:700, color:G }}>
              🎙 Groq Whisper
            </div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 100px", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={sCard({ padding:"14px" })}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
              <div style={{ width:3, height:14, borderRadius:2, background:GL }} />
              <span style={{ fontSize:10, fontWeight:800, color:GL, letterSpacing:1, textTransform:"uppercase" }}>Surah & Verse</span>
            </div>
            <select value={surahNum} className="mem-select"
              onChange={e => { setSurahNum(Number(e.target.value)); setStartVerse(1); setEndVerse(1); }}
              style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${B}`,
                fontSize:13, color:G, background:WARM, marginBottom:10, fontWeight:600, appearance:"none", cursor:"pointer" }}>
              {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.verses}v)</option>)}
            </select>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {([["From", startVerse, (v:number)=>setStartVerse(v), 1, surah.verses],
                 ["To",   endVerse,   (v:number)=>setEndVerse(v),   startVerse, surah.verses]] as const)
                .map(([label, val, setter, min, max], i) => (
                <div key={i}>
                  <div style={{ fontSize:10, color:MUT, fontWeight:700, marginBottom:4, letterSpacing:.5 }}>{label}</div>
                  <input type="number" min={min as number} max={max as number} value={val as number} className="mem-input"
                    onChange={e => (setter as Function)(Number(e.target.value))}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1.5px solid ${B}`,
                      fontSize:15, color:G, background:WARM, fontWeight:800, textAlign:"center" }} />
                </div>
              ))}
            </div>
            {verseCount > 0 && (
              <div style={{ marginTop:10, padding:"8px 12px", borderRadius:10, background:`${G}08`, border:`1px solid ${G}20`,
                fontSize:11, color:G, fontWeight:700, textAlign:"center" }}>
                📖 {verseCount} verse{verseCount!==1?"s":""} · {buildSteps(verseCount, repsPerVerse).length} steps
              </div>
            )}
          </div>

          <div style={sCard({ padding:"14px" })}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
              <div style={{ width:3, height:14, borderRadius:2, background:GL }} />
              <span style={{ fontSize:10, fontWeight:800, color:GL, letterSpacing:1, textTransform:"uppercase" }}>Repetitions</span>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {REP_OPTIONS.map(opt => (
                <button key={opt} className="mem-btn" onClick={() => { setRepsPerVerse(opt); repsPerVerseRef.current = opt; }}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, cursor:"pointer", transition:"all .2s",
                    border:`2px solid ${repsPerVerse===opt?G:B}`, background:repsPerVerse===opt?G:W,
                    color:repsPerVerse===opt?"#fff":MUT, fontSize:14, fontWeight:800,
                    boxShadow:repsPerVerse===opt?`0 2px 8px ${G}30`:"none" }}>{opt}</button>
              ))}
            </div>
          </div>

          <div style={sCard({ padding:"14px" })}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
              <div style={{ width:3, height:14, borderRadius:2, background:GL }} />
              <span style={{ fontSize:10, fontWeight:800, color:GL, letterSpacing:1, textTransform:"uppercase" }}>Reciter</span>
            </div>
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2, scrollbarWidth:"none" } as React.CSSProperties}>
              {RECITERS.map(r => (
                <button key={r.id} className="mem-btn" onClick={() => setSelectedReciter(r.id)}
                  style={{ flexShrink:0, padding:"7px 12px", borderRadius:20, cursor:"pointer", transition:"all .2s",
                    border:`2px solid ${selectedReciter===r.id?G:B}`, background:selectedReciter===r.id?G:W,
                    color:selectedReciter===r.id?"#fff":TXT, fontSize:11, fontWeight:700,
                    boxShadow:selectedReciter===r.id?`0 2px 8px ${G}30`:"none" }}>{r.label}</button>
              ))}
            </div>
          </div>

          <button className="mem-btn" onClick={startSession} disabled={!canStart}
            style={{ width:"100%", padding:"16px 0", borderRadius:14, border:"none",
              cursor:canStart?"pointer":"not-allowed", transition:"all .2s",
              background:canStart?`linear-gradient(135deg,${G} 0%,${GM} 100%)`:"#f0f0ee",
              color:canStart?"#fff":MUT, fontSize:16, fontWeight:800,
              boxShadow:canStart?`0 4px 16px ${G}40`:"none", letterSpacing:.3 }}>
            {loading?"Loading…":!canStart?"Adjust range":"🧠 Begin Memorization · ابدأ"}
          </button>

          {fetchError && (
            <div style={{ padding:"10px 14px", borderRadius:10, background:"#fff5f5",
              border:"1px solid #fca5a5", fontSize:12, color:"#c0392b", textAlign:"center" }}>
              {fetchError} — <button onClick={() => fetchAyahs(surahNum)}
                style={{ textDecoration:"underline", background:"none", border:"none", color:"#c0392b", cursor:"pointer" }}>Retry</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── ACTIVE SESSION ── */
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:LIGHT }}>
      <div style={{ fontSize:12, color:"#7a9e88" }}>Starting…</div>
    </div>
  );

  const col          = STEP_STYLE[currentStep.type];
  const progress     = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool         = sessionAyahsRef.current;
  const isOverview   = currentStep.type === "overview";
  const activeSet    = new Set(currentStep.indices);
  const isMultiVerse = currentStep.indices.length > 1;

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:PARCH, overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
        @keyframes wavePulse{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1.6)}}
        @keyframes flashGreen{0%{background:#bbf7d0;transform:scale(1.25)}100%{transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes listeningPulse{0%,100%{opacity:.4}50%{opacity:1}}
        .peek-btn{user-select:none;-webkit-user-select:none}
        .verse-hidden{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important;height:0!important;overflow:hidden!important;}
        *{box-sizing:border-box;} body{margin:0;padding:0;overflow:hidden;}
      `}</style>

      {/* HEADER */}
      <div style={{ background:"#fff", borderBottom:`2px solid ${BORDER}`, padding:"6px 12px", flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:18 }}>{col.icon}</span>
            <div style={{ overflow:"hidden" }}>
              <div style={{ fontSize:12, fontWeight:800, color:col.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"160px" }}>
                {currentStep.label.split("—")[0].trim()}
              </div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:10, color:col.text, opacity:.8 }}>{currentStep.labelAr}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, color:"#7a9e88", fontWeight:700 }}>{stepIdx+1}/{steps.length}</span>
            <button onClick={() => { stopAudio(); stopMicFn(); clearSession(); setStarted(false); setStepIdx(0); setRepsDone(0); }}
              style={{ fontSize:11, padding:"4px 8px", borderRadius:6, border:`1px solid ${BORDER}`, background:"#f8fafb", color:"#7a9e88", cursor:"pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ height:4, borderRadius:2, background:"#f0f4f0", overflow:"hidden" }}>
          <div style={{ width:`${progress}%`, height:"100%", borderRadius:2, background:`linear-gradient(90deg,${G},${GOLD})`, transition:"width .3s ease" }} />
        </div>
      </div>

      {/* MUSHAF */}
      <div style={{ flex:1, overflowY:"auto", background:`linear-gradient(180deg,${PARCH} 0%,${PARCH2} 100%)`, padding:"10px 8px 16px" }}>
        <div style={{ background:"#fdf6e3", border:`2px solid ${GOLD}88`, borderRadius:4, position:"relative",
          maxWidth:420, margin:"0 auto", boxShadow:"0 4px 20px rgba(26,61,36,0.15)" }}>
          <div style={{ position:"absolute", inset:7, border:`1px solid ${GOLD}44`, borderRadius:1, pointerEvents:"none", zIndex:1 }} />

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"8px 16px", background:`linear-gradient(to bottom,${GOLD}18,transparent)`, borderBottom:`1px solid ${GOLD}55` }}>
            <span style={{ fontFamily:"'Amiri',serif", color:"#1c1208", fontSize:"0.8em", fontWeight:700, direction:"rtl" }}>
              {SURAHS[surahNum-1]?.nameAr}
            </span>
            <button onClick={() => isPlaying ? stopAudio() : playCurrentStep()}
              style={{ padding:"3px 9px", borderRadius:12, border:`1.5px solid ${isPlaying?"#dc2626":GOLD+"88"}`,
                background:isPlaying?"#fee2e2":`${GOLD}18`, color:isPlaying?"#dc2626":GOLD,
                fontSize:10, fontWeight:700, cursor:"pointer" }}>
              {isPlaying ? "⏹ Stop" : "🔊 Listen"}
            </button>
            <span style={{ fontFamily:"'Amiri',serif", color:"#5a4a20", fontSize:"0.72em" }}>{SURAHS[surahNum-1]?.name}</span>
          </div>

          <div style={{ padding:"8px 20px 16px" }}>
            <p style={{ fontFamily:"'Amiri Quran','Scheherazade New','Amiri',serif", direction:"rtl",
              textAlign:"justify", lineHeight:2.8, color:"#1c1208", fontSize:24, margin:0, wordBreak:"break-word" }}>
              {pool.map((ayah, poolIdx) => {
                const isActive   = activeSet.has(poolIdx);
                const isReciting = recitingVerses.has(ayah.numberInSurah);
                const isCumul    = currentStep.type === "cumulative";
                const hideText   = isCumul && !peeking && isActive;
                const isHidden   = !isActive;
                return (
                  <span key={ayah.numberInSurah}
                    ref={el => { verseRefs.current[ayah.numberInSurah] = el; }}
                    className={isHidden ? "verse-hidden" : ""}
                    style={{
                      display: isHidden ? "none" : "inline",
                      visibility: isHidden ? "hidden" : "visible",
                      pointerEvents: isHidden ? "none" : "auto",
                      opacity: isActive ? 1 : 0,
                      filter: hideText ? "blur(9px)" : "none",
                      background: isActive ? (isReciting ? `${GOLD}22` : `${GOLD}0d`) : "transparent",
                      borderRadius: isActive ? 3 : 0,
                      outline: isActive ? `1.5px solid ${GOLD}55` : "none",
                      padding: isActive ? "0 3px" : undefined,
                      transition: "all .35s ease",
                      cursor: isActive ? "pointer" : "default",
                      userSelect: "none", WebkitUserSelect: "none",
                    } as React.CSSProperties}
                    onClick={() => isActive && playVerse(surahNum, ayah.numberInSurah, selectedReciter)}>
                    {ayah.text}{" "}
                    <span style={{ fontFamily:"'Amiri',serif", color:isActive?GOLD:"#b0956a",
                      fontSize:"0.68em", margin:"0 1px", opacity:isActive?1:0.5 }}>
                      ۝{toAr(ayah.numberInSurah)}
                    </span>{" "}
                  </span>
                );
              })}
            </p>
          </div>

          {currentStep.type === "cumulative" && (
            <div style={{ padding:"0 16px 12px" }}>
              <button className="peek-btn"
                onPointerDown={() => setPeeking(true)} onPointerUp={() => setPeeking(false)}
                onPointerLeave={() => setPeeking(false)} onPointerCancel={() => setPeeking(false)}
                style={{ width:"100%", padding:"8px 0", borderRadius:10,
                  border:`1.5px solid ${peeking?G:BORDER}`, background:peeking?LIGHT:"#fdf6e3",
                  color:peeking?G:"#7a9e88", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                {peeking ? "👁 Showing…" : "👁 Hold to Reveal"}
              </button>
            </div>
          )}

          <div style={{ borderTop:`1px solid ${GOLD}55`, padding:"4px 16px", textAlign:"center",
            fontFamily:"'Amiri',serif", color:GOLD, fontSize:"0.78em",
            background:`linear-gradient(to top,${GOLD}12,transparent)` }}>
            ─── {toAr(startVerse)}–{toAr(endVerse)} ───
          </div>
        </div>

        {/* Recognized speech — plain, no color coding */}
        {liveText.trim().length > 0 && (
          <div style={{ margin:"10px auto 6px", maxWidth:420, padding:"10px 14px", borderRadius:10,
            background:"#f8fafb", border:`2px solid ${BORDER}`, direction:"rtl",
            fontFamily:"'Amiri Quran','Amiri',serif", fontSize:19, color:G,
            lineHeight:2, textAlign:"right", animation:"slideIn .2s ease" }}>
            {liveText}
          </div>
        )}

        {/* Mic status */}
        {micActive && (
          <div style={{ margin:"8px auto", maxWidth:420, padding:"10px 14px", borderRadius:10,
            background:col.bg, border:`1.5px solid ${col.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:11, color:col.text, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                {transcribing
                  ? <span style={{ display:"inline-block", width:12, height:12, border:`2px solid ${col.text}`,
                      borderTopColor:"transparent", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
                  : isListening
                    ? <span style={{ animation:"listeningPulse 1s ease-in-out infinite" }}>🎤</span>
                    : "⏸"}
                {transcribing ? "Transcribing…" : isListening ? "Listening… Recite now" : "Waiting for voice…"}
              </span>
              {matchProgress >= 100 && <span style={{ fontSize:11, color:G, fontWeight:700 }}>✅ All matched</span>}
            </div>
            <div style={{ height:6, borderRadius:3, background:"rgba(0,0,0,0.1)", overflow:"hidden" }}>
              <div style={{ width:`${matchProgress}%`, height:"100%", borderRadius:3,
                background:matchProgress===100?GOLD:col.text, transition:"width .3s ease" }} />
            </div>
          </div>
        )}

        {isMultiVerse && micActive && (
          <div style={{ margin:"0 auto 8px", maxWidth:420, padding:"8px 12px", borderRadius:10,
            background:col.bg, border:`1.5px solid ${col.border}`,
            fontSize:11, color:col.text, fontWeight:600, textAlign:"center" }}>
            🔗 Reciting {currentStep.indices.length} verses — All words required
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ background:"#fff", borderTop:`2px solid ${BORDER}`, flexShrink:0 }}>
        {!isOverview && (
          <div style={{ padding:"5px 10px", display:"flex", alignItems:"center", gap:6, borderBottom:`1px solid ${BORDER}` }}>
            {micActive && (
              <div style={{ display:"flex", alignItems:"center", gap:2, marginRight:2, flexShrink:0 }}>
                {[4,8,6,12,7,10,5].map((h,i) => (
                  <div key={i} style={{ width:2.5, height:h, borderRadius:2,
                    background:isListening?"#ef4444":"#9ca3af",
                    animation:isListening?`wavePulse .75s ease-in-out ${i*0.09}s infinite alternate`:"none" }} />
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:4, flex:1, overflowX:"auto", scrollbarWidth:"none" } as React.CSSProperties}>
              {Array.from({ length: currentStep.reps }, (_, i) => {
                const done = i < repsDone, current = i === repsDone;
                return (
                  <div key={i} style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700,
                    background: done ? col.grad : current && justCounted ? "#bbf7d0" : current ? `${col.text}18` : "#f0f4f0",
                    color: done ? "#fff" : current ? col.text : "#ccc",
                    border:`2px solid ${current?col.text:done?"transparent":"#e4e4e4"}`,
                    boxShadow: current ? `0 0 0 3px ${col.text}25` : "none",
                    animation: done && i === repsDone-1 && justCounted ? "flashGreen .5s ease" : "none",
                    transition:"all .3s ease" }}>
                    {done ? "✓" : i+1}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign:"center", minWidth:30, flexShrink:0 }}>
              <div style={{ fontSize:16, fontWeight:900, color:G, lineHeight:1,
                animation:justCounted?"flashGreen .4s ease":"none" }}>{repsDone}</div>
              <div style={{ fontSize:9, color:"#7a9e88" }}>/ {currentStep.reps}</div>
            </div>
            {micActive && (
              <div style={{ fontSize:10, fontWeight:700, color:isListening?"#ef4444":"#9ca3af", minWidth:32, textAlign:"center", flexShrink:0 }}>
                {String(Math.floor(micTime/60)).padStart(2,"0")}:{String(micTime%60).padStart(2,"0")}
              </div>
            )}
          </div>
        )}

        {micError && (
          <div style={{ margin:"3px 10px", padding:"4px 10px", borderRadius:8, background:"#fffbeb",
            border:"1px solid #f6d860", fontSize:10, color:"#856404", textAlign:"center" }}>
            {micError}
          </div>
        )}

        <div style={{ display:"flex", gap:6, padding:"6px 10px" }}>
          {!isOverview && (
            micActive ? (
              <>
                <button onClick={stopMicFn}
                  style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none",
                    background:"#fee2e2", color:"#c0392b", fontSize:12, fontWeight:700, cursor:"pointer" }}>⏹ Stop</button>
                <button onClick={() => { stopMicFn(); setTimeout(() => startMic(), 400); }}
                  title="Restart recording"
                  style={{ width:38, height:38, borderRadius:10, border:`1px solid ${BORDER}`,
                    background:"#f8fafb", color:"#7a9e88", fontSize:16, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>↺</button>
              </>
            ) : (
              <button onClick={startMic}
                style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none",
                  background:`linear-gradient(135deg,${G},${GM})`, color:"#fff",
                  fontSize:12, fontWeight:700, cursor:"pointer" }}>🎙 Start Recording</button>
            )
          )}
          <button onClick={markRep}
            style={{ flex:isOverview?2:1, padding:"9px 0", borderRadius:10, border:"none",
              background:col.grad, color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer" }}>
            {isOverview ? "Begin →" : repsDone+1>=currentStep.reps ? stepIdx<steps.length-1?"✓ Next":"🎉 Done" : `✓ ${repsDone+1}`}
          </button>
        </div>

        <button onClick={() => {
          stopAudio(); stopMicFn(); setPeeking(false);
          setRecitingVerses(new Set()); setMatchProgress(0); setMissingWords([]);
          setIsListening(false); setLiveText("");
          if (stepIdx > 0) {
            const prev = stepIdx - 1;
            stepIdxRef.current = prev; repsDoneRef.current = 0;
            totalRepsRef.current = steps[prev].reps; prevStepIdxRef.current = -1;
            setStepIdx(prev); setRepsDone(0);
            saveSession({ stepIdx: prev, repsDone: 0 });
          } else { clearSession(); setStarted(false); }
        }}
          style={{ margin:"0 10px 6px", padding:"6px 0", borderRadius:8, border:`1px solid ${BORDER}`,
            background:"#f8fafb", color:"#7a9e88", fontSize:10, cursor:"pointer", width:"calc(100% - 20px)" }}>
          ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
        </button>
      </div>
    </div>
  );
}
