// src/components/hifdh/HifdhTest.tsx
// v2.0 — Advanced Hifdh Test
//  ✅ 8 distinct question types, zero ayah reuse across types
//  ✅ Questions use mid-verse fragments (not always from verse start)
//  ✅ Partial audio playback — student hears first half, recites second half
//  ✅ Mixed MCQ + Audio answer format
//  ✅ "Hear & Choose" type: listen to audio, pick correct next verse (MCQ)
//  ✅ LCS-based transcription scoring (tolerates Whisper word-skipping)
//  ✅ Intro screen — no hints about weak areas before test
//  ✅ Full proctoring integration (camera, face detection, violations stored)
//  ✅ Results saved to hifdh_sessions with proctoring_session_id

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { SURAHS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { supabase } from "@/integrations/supabase/client";
import { useProctoring } from "@/hooks/useProctoring";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { H_G, H_GM, H_GOLD, H_LIGHT, H_BORDER } from "./hifdhTokens";

// ── Brand tokens ──────────────────────────────────────────────────────
const G = H_G, GM = H_GM, GOLD = H_GOLD;
const LIGHT = H_LIGHT, BORDER = H_BORDER;

// ── Types ─────────────────────────────────────────────────────────────
interface Ayah { numberInSurah: number; text: string; }
interface Props { reciter?: string; onSessionSaved?: () => void; }
const DEEPGRAM_KEY = (import.meta as any).env?.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = (import.meta as any).env?.VITE_GROQ_API_KEY     || "";

// 8 question types for comprehensive testing
type QType =
  | "missing_word_mcq"       // see mid-verse fragment with blank → choose word
  | "last_word_mcq"          // see phrase, last word is blank → choose it
  | "next_fragment_mcq"      // see 3-4 words mid-verse → choose what comes after
  | "hear_and_choose"        // listen to verse N audio → choose correct verse N+1 (MCQ)
  | "recite_from_words"      // see first 2-3 words of verse → record the rest
  | "recite_after_text"      // see full verse N text → record verse N+1
  | "recite_after_audio"     // hear full verse N → record verse N+1
  | "continue_partial_audio" // hear FIRST HALF of verse → record SECOND HALF

interface Question {
  id: number;
  type: QType;
  surahName: string;
  // Cue
  cueText:      string | null;   // text displayed as cue (may be a fragment)
  cueAyahNum:   number | null;   // ayah number to play as full audio cue
  cuePartial:   boolean;         // true → stop audio at 50% (continue_partial_audio)
  cueSplitIdx:  number;          // word-split index when cuePartial=true
  // Answer
  correctText:  string;          // expected recitation / correct word / correct verse
  correctAyahNum: number;
  // MCQ only
  options:    string[];
  correctIdx: number;
}

// ── Utilities ─────────────────────────────────────────────────────────
const toAr = (n: number) =>
  String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMime() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** Normalize Arabic text: strip diacritics, unify alef forms, etc. */
function norm(t: string) {
  return t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "")
    .replace(/[\u0622\u0623\u0625\u0627]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0640/g, "")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * LCS-based scoring — handles Whisper skipping words.
 * Scores what fraction of the reference words appear (in order) in the transcript.
 * Much fairer than linear matching when the ASR omits words.
 */
function scoreAudio(transcript: string, reference: string): number {
  const tw = norm(transcript).split(" ").filter(Boolean);
  const rw = norm(reference).split(" ").filter(Boolean);
  if (!rw.length) return 100;
  if (!tw.length) return 0;

  // Cap at 80 words for performance
  const m = Math.min(tw.length, 80), n = Math.min(rw.length, 80);
  const ts = tw.slice(0, m), rs = rw.slice(0, n);
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const a = ts[i - 1], b = rs[j - 1];
      // Exact match OR stem match (first 3 chars)
      const hit = a === b || (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3));
      dp[i][j] = hit ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return Math.min(100, Math.round((dp[m][n] / rw.length) * 100));
}

function getGrade(pct: number) {
  if (pct >= 90) return { letter: "A+", color: "#22c55e", label: "Excellent · ممتاز" };
  if (pct >= 80) return { letter: "A",  color: "#16a34a", label: "Very Good · جيد جداً" };
  if (pct >= 70) return { letter: "B",  color: "#2563eb", label: "Good · جيد" };
  if (pct >= 60) return { letter: "C",  color: GOLD,      label: "Satisfactory · مقبول" };
  if (pct >= 50) return { letter: "D",  color: "#ea580c", label: "Pass · ناجح" };
  return             { letter: "F",  color: "#ef4444", label: "Fail · راسب" };
}

// ── Question builder ──────────────────────────────────────────────────
function buildQuestions(ayahs: Ayah[], surahName: string): Question[] {
  if (ayahs.length < 4) return [];
  const qs: Question[] = [];
  let id = 0;
  // Track which ayah indices have been "consumed" as question subject
  const used = new Set<number>();

  const pick = (): number | null => {
    const avail = ayahs.map((_, i) => i).filter(i => !used.has(i));
    if (!avail.length) return null;
    const i = avail[Math.floor(Math.random() * avail.length)];
    used.add(i); return i;
  };

  const pickPair = (): [number, number] | null => {
    const avail = ayahs
      .map((_, i) => i)
      .filter(i => i < ayahs.length - 1 && !used.has(i) && !used.has(i + 1));
    if (!avail.length) return null;
    const i = avail[Math.floor(Math.random() * avail.length)];
    used.add(i); used.add(i + 1);
    return [i, i + 1];
  };

  // MCQ distractors from the full surah (don't need to be "unused")
  const distractors = (correct: string, count = 3): string[] =>
    shuffle(ayahs.map(a => a.text).filter(t => t !== correct)).slice(0, count);

  const wordDistractors = (correct: string, count = 3): string[] =>
    shuffle([...new Set(
      ayahs.flatMap(a => a.text.split(" ")).filter(w => w !== correct && w.length > 2)
    )]).slice(0, count);

  // ── 1. missing_word_mcq (3 questions) ──────────────────────────────
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "missing_word_mcq").length < 3; attempts++) {
    const i = pick(); if (i === null) break;
    const words = ayahs[i].text.split(" ");
    if (words.length < 5) { used.delete(i); continue; }
    // Choose a position in 1/4 to 3/4 of the verse (mid-verse, not start or end)
    const bi = Math.floor(words.length * 0.25) + Math.floor(Math.random() * Math.floor(words.length * 0.5));
    const cw = words[bi];
    // Show a ~6-word window around the blank (not the full verse)
    const winStart = Math.max(0, bi - 3);
    const winEnd   = Math.min(words.length, bi + 3);
    const fragment = words.slice(winStart, winEnd).map((w, j) => j === bi - winStart ? "____" : w).join(" ");
    const wrongs = wordDistractors(cw);
    if (wrongs.length < 3) { used.delete(i); continue; }
    const opts = shuffle([cw, ...wrongs]);
    qs.push({
      id: id++, type: "missing_word_mcq", surahName,
      cueText: fragment, cueAyahNum: null, cuePartial: false, cueSplitIdx: 0,
      correctText: cw, correctAyahNum: ayahs[i].numberInSurah,
      options: opts, correctIdx: opts.indexOf(cw),
    });
  }

  // ── 2. last_word_mcq (2 questions) ─────────────────────────────────
  // Show last 4-6 words of a verse, blank the FINAL word
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "last_word_mcq").length < 2; attempts++) {
    const i = pick(); if (i === null) break;
    const words = ayahs[i].text.split(" ");
    if (words.length < 5) { used.delete(i); continue; }
    const phraseStart = Math.max(0, words.length - 5);
    const phrase = words.slice(phraseStart);
    const lastWord = phrase[phrase.length - 1];
    const blanked = [...phrase.slice(0, -1), "____"].join(" ");
    const wrongs = wordDistractors(lastWord);
    if (wrongs.length < 3) { used.delete(i); continue; }
    const opts = shuffle([lastWord, ...wrongs]);
    qs.push({
      id: id++, type: "last_word_mcq", surahName,
      cueText: blanked, cueAyahNum: null, cuePartial: false, cueSplitIdx: 0,
      correctText: lastWord, correctAyahNum: ayahs[i].numberInSurah,
      options: opts, correctIdx: opts.indexOf(lastWord),
    });
  }

  // ── 3. next_fragment_mcq (2 questions) ─────────────────────────────
  // Show 3 mid-verse words, choose what SINGLE WORD comes immediately after
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "next_fragment_mcq").length < 2; attempts++) {
    const i = pick(); if (i === null) break;
    const words = ayahs[i].text.split(" ");
    if (words.length < 7) { used.delete(i); continue; }
    // Fragment from 1/4 into the verse
    const fStart = Math.floor(words.length * 0.15) + Math.floor(Math.random() * Math.floor(words.length * 0.4));
    const fEnd   = fStart + 2 + Math.floor(Math.random() * 2); // 2-3 words
    if (fEnd >= words.length) { used.delete(i); continue; }
    const fragment = words.slice(fStart, fEnd).join(" ");
    const nextWord = words[fEnd];
    const wrongs = wordDistractors(nextWord);
    if (wrongs.length < 3) { used.delete(i); continue; }
    const opts = shuffle([nextWord, ...wrongs]);
    qs.push({
      id: id++, type: "next_fragment_mcq", surahName,
      cueText: fragment + " ___", cueAyahNum: null, cuePartial: false, cueSplitIdx: 0,
      correctText: nextWord, correctAyahNum: ayahs[i].numberInSurah,
      options: opts, correctIdx: opts.indexOf(nextWord),
    });
  }

  // ── 4. hear_and_choose (2 questions) ──────────────────────────────
  // Listen to verse N audio → pick correct verse N+1 from 4 options (MCQ)
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "hear_and_choose").length < 2; attempts++) {
    const pair = pickPair(); if (!pair) break;
    const [i, j] = pair;
    const correct = ayahs[j].text;
    const wrongs  = distractors(correct);
    if (wrongs.length < 3) continue;
    const opts = shuffle([correct, ...wrongs]);
    qs.push({
      id: id++, type: "hear_and_choose", surahName,
      cueText: null, cueAyahNum: ayahs[i].numberInSurah, cuePartial: false, cueSplitIdx: 0,
      correctText: correct, correctAyahNum: ayahs[j].numberInSurah,
      options: opts, correctIdx: opts.indexOf(correct),
    });
  }

  // ── 5. recite_from_words (3 questions) ─────────────────────────────
  // Show first 2-3 words of verse, student records the REST of that verse
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "recite_from_words").length < 3; attempts++) {
    const i = pick(); if (i === null) break;
    const words = ayahs[i].text.split(" ");
    if (words.length < 6) { used.delete(i); continue; }
    const showCount = 2 + Math.floor(Math.random() * 2); // show 2 or 3 words
    const cueText    = words.slice(0, showCount).join(" ") + " ...";
    const correctText = words.slice(showCount).join(" ");
    qs.push({
      id: id++, type: "recite_from_words", surahName,
      cueText, cueAyahNum: null, cuePartial: false, cueSplitIdx: showCount,
      correctText, correctAyahNum: ayahs[i].numberInSurah,
      options: [], correctIdx: -1,
    });
  }

  // ── 6. recite_after_text (2 questions) ────────────────────────────
  // See full verse N text → record verse N+1
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "recite_after_text").length < 2; attempts++) {
    const pair = pickPair(); if (!pair) break;
    const [i, j] = pair;
    qs.push({
      id: id++, type: "recite_after_text", surahName,
      cueText: ayahs[i].text, cueAyahNum: null, cuePartial: false, cueSplitIdx: 0,
      correctText: ayahs[j].text, correctAyahNum: ayahs[j].numberInSurah,
      options: [], correctIdx: -1,
    });
  }

  // ── 7. recite_after_audio (2 questions) ───────────────────────────
  // Hear full verse N (audio) → record verse N+1
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "recite_after_audio").length < 2; attempts++) {
    const pair = pickPair(); if (!pair) break;
    const [i, j] = pair;
    qs.push({
      id: id++, type: "recite_after_audio", surahName,
      cueText: null, cueAyahNum: ayahs[i].numberInSurah, cuePartial: false, cueSplitIdx: 0,
      correctText: ayahs[j].text, correctAyahNum: ayahs[j].numberInSurah,
      options: [], correctIdx: -1,
    });
  }

  // ── 8. continue_partial_audio (2 questions) ───────────────────────
  // Hear FIRST HALF of verse (audio stops midway) → record SECOND HALF
  for (let attempts = 0; attempts < 30 && qs.filter(q => q.type === "continue_partial_audio").length < 2; attempts++) {
    const i = pick(); if (i === null) break;
    const words = ayahs[i].text.split(" ");
    if (words.length < 7) { used.delete(i); continue; }
    const splitIdx    = Math.ceil(words.length * 0.5); // stop at ~50%
    const correctText = words.slice(splitIdx).join(" ");
    qs.push({
      id: id++, type: "continue_partial_audio", surahName,
      cueText: null, cueAyahNum: ayahs[i].numberInSurah, cuePartial: true, cueSplitIdx: splitIdx,
      correctText, correctAyahNum: ayahs[i].numberInSurah,
      options: [], correctIdx: -1,
    });
  }

  return shuffle(qs);
}

// ── Question metadata ─────────────────────────────────────────────────
const QMETA: Record<QType, { icon: string; label: string; desc: string; isAudio: boolean; isMCQ: boolean }> = {
  missing_word_mcq:       { icon:"🔍", label:"Fill the blank",           desc:"Choose the correct missing word",            isAudio:false, isMCQ:true  },
  last_word_mcq:          { icon:"✏️",  label:"What's the last word?",    desc:"Choose the word that ends this phrase",       isAudio:false, isMCQ:true  },
  next_fragment_mcq:      { icon:"➡️", label:"What comes next?",          desc:"Choose the word that follows this fragment",  isAudio:false, isMCQ:true  },
  hear_and_choose:        { icon:"🔊", label:"Listen & Choose",           desc:"Hear the verse, pick what comes after",       isAudio:false, isMCQ:true  },
  recite_from_words:      { icon:"🎙", label:"Complete the verse",        desc:"You see the beginning — recite the rest",     isAudio:true,  isMCQ:false },
  recite_after_text:      { icon:"📖", label:"Recite the next verse",     desc:"Read this verse, then recite what follows",   isAudio:true,  isMCQ:false },
  recite_after_audio:     { icon:"🎧", label:"Listen then recite",        desc:"Hear the verse, then recite what comes next", isAudio:true,  isMCQ:false },
  continue_partial_audio: { icon:"⏯",  label:"Continue the recitation",   desc:"Audio stops midway — continue from there",    isAudio:true,  isMCQ:false },
};

// ── Main component ────────────────────────────────────────────────────
export default function HifdhTest({ reciter = DEFAULT_RECITER, onSessionSaved }: Props) {
  const [surahNum, setSurahNum]   = useState(114);
  const [ayahs, setAyahs]         = useState<Ayah[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetchErr, setFetchErr]   = useState("");
  const [buildErr, setBuildErr]   = useState("");
  const [userId, setUserId]       = useState("");
  const [testSessionId, setTestSessionId] = useState("");

  // Flow states
  const [stage, setStage] = useState<"setup"|"intro"|"active"|"results">("setup");

  // Test state
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [qIdx, setQIdx]             = useState(0);
  const [answers, setAnswers]       = useState<(number|null)[]>([]);     // MCQ answers
  const [audioScores, setAudioScores] = useState<(number|null)[]>([]);   // audio scores
  const [selected, setSelected]     = useState<number|null>(null);
  const [confirmed, setConfirmed]   = useState(false);
  const [timeLeft, setTimeLeft]     = useState(0);
  const [timerOn, setTimerOn]       = useState(false);

  // Audio
  const [isPlaying, setIsPlaying]   = useState(false);
  const [partialReady, setPartialReady] = useState(false); // partial audio finished → show record
  const [micState, setMicState]     = useState<"idle"|"recording"|"evaluating"|"done">("idle");
  const [audioResult, setAudioResult] = useState<{score:number;tx:string}|null>(null);

  const audioRef        = useRef<HTMLAudioElement|null>(null);
  const timerRef        = useRef<ReturnType<typeof setTimeout>>();
  const questionsRef    = useRef<Question[]>([]);
  const answersRef      = useRef<(number|null)[]>([]);
  const audioScoresRef  = useRef<(number|null)[]>([]);
  const mrRef           = useRef<MediaRecorder|null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const partialIvRef    = useRef<ReturnType<typeof setInterval>>();

  const surah = SURAHS[surahNum - 1];

  // Keep refs in sync
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { audioScoresRef.current = audioScores; }, [audioScores]);

  // Get user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // Proctoring — only active when test is running
  const proctoringConfig = useMemo(() => ({
    attemptId:  testSessionId,
    userId,
    proctoring_enabled:           true,
    webcam_required:              true,
    screenshot_interval_seconds:  30,
    max_warnings:                 5,
    auto_submit_on_violation:     false,
    tab_switch_limit:             3,
    sessionType:                  "hifdh" as const,
    contextLabel:                 `Hifdh Test: ${surah?.name || ""}`,
  }), [testSessionId, userId, surah?.name]);

  const procState = useProctoring(
    proctoringConfig,
    stage === "active" && !!testSessionId && !!userId,
  );

  // Fetch verses when surah changes
  const fetchAyahs = useCallback(async () => {
    setLoading(true); setFetchErr("");
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const j = await r.json();
      if (j.code === 200) setAyahs(j.data.ayahs);
      else setFetchErr("Failed to load verses — tap Retry.");
    } catch { setFetchErr("Network error. Check connection."); }
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);

  useEffect(() => () => {
    audioRef.current?.pause();
    clearTimeout(timerRef.current);
    clearInterval(partialIvRef.current);
    mrRef.current?.stop();
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!timerOn || timeLeft <= 0) { clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timerOn, timeLeft]);

  const doFinishRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (timerOn && timeLeft === 0 && stage === "active") doFinishRef.current();
  }, [timerOn, timeLeft, stage]);

  // ── Audio playback ─────────────────────────────────────────────────
  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    clearInterval(partialIvRef.current);
    setIsPlaying(false);
  };

  /**
   * Play an ayah — optionally stop at `stopFraction` (0-1) for partial playback.
   * Calls onStopped when playback ends (naturally or via stop fraction).
   */
  const playAyah = useCallback((ayahNum: number, partial = false, onStopped?: () => void) => {
    stopAudio();
    setIsPlaying(true);
    setPartialReady(false);
    const url   = audioUrl(surahNum, ayahNum, reciter);
    const audio = new Audio(url);
    audioRef.current = audio;

    if (partial) {
      audio.addEventListener("loadedmetadata", () => {
        const dur = audio.duration;
        if (!dur || !isFinite(dur)) return;
        const stopAt = dur * 0.5;
        partialIvRef.current = setInterval(() => {
          if (!audioRef.current) { clearInterval(partialIvRef.current); return; }
          if (audio.currentTime >= stopAt) {
            audio.pause();
            clearInterval(partialIvRef.current);
            setIsPlaying(false);
            setPartialReady(true);
            onStopped?.();
          }
        }, 80);
      });
    }

    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => {
      clearInterval(partialIvRef.current);
      setIsPlaying(false);
      if (!partial) onStopped?.();
    };
    audio.onerror = () => {
      clearInterval(partialIvRef.current);
      setIsPlaying(false);
    };
  }, [surahNum, reciter]);

  // ── Recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    setMicState("recording"); setAudioResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getMime();
      const mr     = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        setMicState("evaluating");
        transcribeAndScore(blob);
      };
      mr.start(200); mrRef.current = mr;
    } catch { setMicState("idle"); alert("Mic access denied. Allow microphone to continue."); }
  };

  const stopRecording = () => { mrRef.current?.stop(); };

  const transcribeAndScore = async (blob: Blob) => {
    const q = questionsRef.current[qIdx]; if (!q) return;
    let tx = "";
    try {
      // Primary: Deepgram
      if (DEEPGRAM_KEY) {
        const r = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false",
          { method:"POST", headers:{ Authorization:`Token ${DEEPGRAM_KEY}`, "Content-Type": blob.type || "audio/webm" }, body: blob }
        );
        if (r.ok) tx = (await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      }
      // Fallback: Groq Whisper
      if (!tx && GROQ_KEY) {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const fd  = new FormData();
        fd.append("file", new File([blob], `r.${ext}`, { type: blob.type }));
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("response_format", "verbose_json");
        fd.append("temperature", "0");
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
          { method:"POST", headers:{ Authorization:`Bearer ${GROQ_KEY}` }, body: fd });
        if (r.ok) {
          const data = await r.json();
          // Reject near-silence (no_speech_prob > 0.8)
          if (data.segments?.some((s: any) => s.no_speech_prob < 0.8)) {
            tx = data.text || "";
          } else if (!data.segments) {
            tx = data.text || "";
          }
        }
      }

      const sc = scoreAudio(tx, q.correctText);
      const na = [...audioScoresRef.current]; na[qIdx] = sc;
      setAudioScores(na); audioScoresRef.current = na;
      setAudioResult({ score: sc, tx });
      setMicState("done");
    } catch { setMicState("idle"); }
  };

  // ── Test lifecycle ─────────────────────────────────────────────────
  const startTest = () => {
    const qs = buildQuestions(ayahs, surah.name);
    if (qs.length === 0) { setBuildErr("Need at least 4 verses."); return; }
    setBuildErr("");
    const ans = new Array(qs.length).fill(null) as null[];
    const asc = new Array(qs.length).fill(null) as null[];
    setQuestions(qs); setAnswers(ans); setAudioScores(asc);
    questionsRef.current = qs; answersRef.current = ans; audioScoresRef.current = asc;
    setQIdx(0); setSelected(null); setConfirmed(false);
    setMicState("idle"); setAudioResult(null);
    setTimeLeft(qs.length * 50); setTimerOn(true);
    // Generate proctoring session ID
    const sid = crypto.randomUUID();
    setTestSessionId(sid);
    setStage("active");
  };

  const doFinish = useCallback(() => {
    clearTimeout(timerRef.current); setTimerOn(false);
    stopAudio(); mrRef.current?.stop();
    const qs = questionsRef.current, ans = answersRef.current, asc = audioScoresRef.current;
    let correct = 0;
    qs.forEach((q, i) => {
      const meta = QMETA[q.type];
      if (!meta.isMCQ) { if ((asc[i] ?? 0) >= 60) correct++; }
      else             { if (ans[i] === q.correctIdx) correct++; }
    });
    const pct = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    // Save result to both tables for compatibility
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      const uid = data.user.id;
      const surahName = SURAHS[surahNum - 1]?.name ?? `Surah ${surahNum}`;
      const durationSec = qs.length * 50 - timeLeft;

      // Legacy table (hifdh_sessions) — kept for backward compat
      (supabase as any).from("hifdh_sessions").insert({
        student_id: uid, surah_name: surahName,
        ayah_start: 1, accuracy_score: pct,
        duration: durationSec,
        proctoring_session_id: testSessionId || null,
      }).catch(() => {});

      // New table (hifdh_test_sessions) — read by Overview dashboard
      (supabase as any).from("hifdh_test_sessions").insert({
        student_id:      uid,
        surah_name:      surahName,
        surah_number:    surahNum,
        score:           pct,
        total_questions: qs.length,
        correct_answers: correct,
        duration_seconds: durationSec,
        proctoring_session_id: testSessionId || null,
        completed_at:    new Date().toISOString(),
      }).then(() => { onSessionSaved?.(); }).catch(() => {});
    });
    setStage("results");
  }, [surahNum, timeLeft, testSessionId, onSessionSaved]);

  // Keep the ref in sync now that doFinish is declared above — this used
  // to sit before the doFinish declaration and threw "Cannot access
  // 'doFinish' before initialization" in production builds.
  useEffect(() => { doFinishRef.current = doFinish; }, [doFinish]);

  const confirmAnswer = () => {
    if (selected === null) return;
    const na = [...answers]; na[qIdx] = selected;
    setAnswers(na); answersRef.current = na; setConfirmed(true);
  };

  const nextQuestion = () => {
    stopAudio();
    setPartialReady(false);
    if (qIdx < questions.length - 1) {
      setQIdx(qIdx + 1);
      setSelected(null); setConfirmed(false);
      setMicState("idle"); setAudioResult(null);
    } else doFinish();
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  // ── SETUP SCREEN ───────────────────────────────────────────────────
  if (stage === "setup") {
    return (
      <div style={{ background:"#faf8f4", minHeight:"100%", display:"flex", flexDirection:"column" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');`}</style>

        {/* Header */}
        <div style={{ background:"#fff", borderBottom:`1px solid #e8ddd0`, padding:"16px", position:"relative" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${G},${GM},${GOLD})` }}/>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:`linear-gradient(135deg,${G},#5b21b6)`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>✍️</div>
            <div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:20, color:G, fontWeight:700 }}>Hifdh Test</div>
              <div style={{ fontSize:11, color:GOLD }}>اختبار الحفظ</div>
            </div>
            <div style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:10,
              background:`${G}10`, border:`1px solid ${G}25`,
              fontSize:10, fontWeight:700, color:G }}>8 Question Types</div>
          </div>
        </div>

        <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
          {/* Surah selector */}
          <div style={card({ padding:"16px" })}>
            <div style={{ fontSize:10, fontWeight:800, color:GOLD, letterSpacing:1, marginBottom:10 }}>
              SELECT SURAH · اختر السورة
            </div>
            <select value={surahNum} onChange={e => setSurahNum(Number(e.target.value))}
              style={{ width:"100%", padding:"11px 12px", borderRadius:10,
                border:`1.5px solid #e8ddd0`, fontSize:13, color:G, background:"#faf8f4",
                fontWeight:600, appearance:"none", cursor:"pointer", marginBottom:12 }}>
              {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
            </select>
            <div style={{ display:"flex", gap:8, padding:"10px 14px", borderRadius:12,
              background:`${G}08`, border:`1px solid ${G}18`, alignItems:"center" }}>
              <div style={{ width:32, height:32, borderRadius:8, background:`${G}15`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📖</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:G }}>
                  {loading ? "Loading verses…" : `${ayahs.length} verses available`}
                </div>
                <div style={{ fontSize:10, color:"#9aab94" }}>
                  Mixed question types · MCQ + Voice recording
                </div>
              </div>
            </div>
          </div>

          {buildErr && (
            <div style={{ padding:"12px 14px", borderRadius:12, background:"#fff5f5",
              border:"1px solid #fca5a5", fontSize:13, color:"#c0392b", textAlign:"center" }}>
              {buildErr}
            </div>
          )}
          {fetchErr && (
            <div style={{ padding:"12px", borderRadius:12, background:"#fff5f5",
              border:"1px solid #fca5a5", fontSize:12, color:"#c0392b", textAlign:"center" }}>
              {fetchErr}&nbsp;
              <button onClick={fetchAyahs} style={{ textDecoration:"underline", background:"none", border:"none", color:"#c0392b", cursor:"pointer" }}>Retry</button>
            </div>
          )}

          <button onClick={() => setStage("intro")} disabled={loading || ayahs.length < 4}
            style={{ padding:"16px 0", borderRadius:14, border:"none",
              background: ayahs.length >= 4 ? `linear-gradient(135deg,${G},${GM})` : "#f0f0ee",
              color: ayahs.length >= 4 ? "#fff" : "#9aab94",
              fontSize:16, fontWeight:800, cursor: ayahs.length >= 4 ? "pointer":"not-allowed",
              boxShadow: ayahs.length >= 4 ? `0 4px 16px ${G}40` : "none" }}>
            {loading ? "Loading…" : ayahs.length < 4 ? "Need at least 4 verses" : "Continue →"}
          </button>
        </div>
      </div>
    );
  }

  // ── INTRO / RULES SCREEN ───────────────────────────────────────────
  if (stage === "intro") {
    const rules = [
      { icon:"📷", text:"Your camera will be active throughout the test for proctoring." },
      { icon:"🚫", text:"Do not switch tabs, use other apps, or leave the test window." },
      { icon:"🎙", text:"Some questions require you to record your recitation." },
      { icon:"🔊", text:"Some questions play audio — listen carefully before answering." },
      { icon:"⏱",  text:`You have ${Math.round(ayahs.length * 0.5)} minutes for the full test.` },
      { icon:"📵", text:"Ensure you are alone in a quiet environment." },
    ];
    return (
      <div style={{ background:"#faf8f4", minHeight:"100%", display:"flex", flexDirection:"column" }}>
        <div style={{ background:"#fff", borderBottom:`1px solid #e8ddd0`, padding:"16px", position:"relative" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${G},${GM},${GOLD})` }}/>
          <div style={{ fontSize:18, fontWeight:800, color:G }}>📋 Before You Begin</div>
          <div style={{ fontSize:12, color:GOLD, marginTop:2 }}>اقرأ التعليمات بعناية</div>
        </div>

        <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={card({ padding:"16px" })}>
            <div style={{ fontSize:12, fontWeight:800, color:GOLD, letterSpacing:.5, marginBottom:12 }}>
              TEST RULES · قواعد الاختبار
            </div>
            {rules.map((r, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:10 }}>
                <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{r.icon}</span>
                <span style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>

          <div style={card({ padding:"16px" })}>
            <div style={{ fontSize:12, fontWeight:800, color:G, letterSpacing:.5, marginBottom:10 }}>
              QUESTION TYPES YOU'LL ENCOUNTER
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {(["missing_word_mcq","hear_and_choose","recite_from_words","continue_partial_audio"] as QType[]).map(t => (
                <div key={t} style={{ padding:"8px 10px", borderRadius:10, background:LIGHT, border:`1px solid ${BORDER}` }}>
                  <div style={{ fontSize:14 }}>{QMETA[t].icon}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:G, marginTop:2 }}>{QMETA[t].label}</div>
                  <div style={{ fontSize:10, color:"#7a9e88", marginTop:1 }}>{QMETA[t].desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:"12px 14px", borderRadius:12,
            background:"#fffbeb", border:`1px solid #fde68a`,
            fontSize:12, color:"#78350f", textAlign:"center" }}>
            ⚠️ The test will begin immediately. Proctoring activates on start.
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <button onClick={() => setStage("setup")}
              style={{ padding:"13px 0", borderRadius:12, border:`1px solid #e8ddd0`,
                background:"#f8fafb", color:G, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              ← Back
            </button>
            <button onClick={startTest}
              style={{ padding:"13px 0", borderRadius:12, border:"none",
                background:`linear-gradient(135deg,${G},${GM})`,
                color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer",
                boxShadow:`0 4px 14px ${G}40` }}>
              ✍️ Begin Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS SCREEN ─────────────────────────────────────────────────
  if (stage === "results" && questions.length > 0) {
    let correct = 0;
    questions.forEach((q, i) => {
      const meta = QMETA[q.type];
      if (!meta.isMCQ) { if ((audioScores[i] ?? 0) >= 60) correct++; }
      else             { if (answers[i] === q.correctIdx) correct++; }
    });
    const pct   = Math.round((correct / questions.length) * 100);
    const grade = getGrade(pct);
    return (
      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:14 }}>
        <div style={card({ padding:"28px 20px", textAlign:"center" })}>
          <div style={{ fontSize:52, marginBottom:10 }}>{pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📖"}</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:26, color:G, fontWeight:700 }}>Test Complete!</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:14, color:GOLD, marginTop:4 }}>اكتمل الاختبار</div>

          <div style={{ position:"relative", width:130, height:130, margin:"20px auto" }}>
            <svg width={130} height={130} style={{ transform:"rotate(-90deg)" }}>
              <circle cx={65} cy={65} r={52} fill="none" stroke="#f0f4f0" strokeWidth={12}/>
              <circle cx={65} cy={65} r={52} fill="none" stroke={grade.color} strokeWidth={12}
                strokeDasharray={`${(pct/100)*2*Math.PI*52} ${2*Math.PI*52}`} strokeLinecap="round"/>
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontSize:26, fontWeight:900, color:G }}>{pct}%</div>
              <div style={{ fontSize:18, fontWeight:900, color:grade.color }}>{grade.letter}</div>
            </div>
          </div>

          <div style={{ fontSize:14, fontWeight:700, color:grade.color }}>{grade.label}</div>
          <div style={{ fontSize:12, color:"#7a9e88", marginTop:6 }}>
            {correct} / {questions.length} correct · Score saved ✓
          </div>
          {testSessionId && (
            <div style={{ marginTop:6, padding:"4px 12px", borderRadius:8, background:LIGHT, display:"inline-block" }}>
              <span style={{ fontSize:10, color:G, fontWeight:700 }}>🔒 Proctored session saved</span>
            </div>
          )}
        </div>

        {/* Answer review */}
        <div style={card({ padding:"14px" })}>
          <div style={{ fontSize:11, fontWeight:700, color:"#7a9e88", letterSpacing:.5, marginBottom:10 }}>
            REVIEW · مراجعة
          </div>
          {questions.map((q, i) => {
            const meta = QMETA[q.type];
            const sc = audioScores[i] ?? 0;
            const ok = meta.isMCQ ? (answers[i] === q.correctIdx) : (sc >= 60);
            return (
              <div key={q.id} style={{ padding:"10px 12px", borderRadius:12, marginBottom:8,
                background: ok ? LIGHT : "#fff5f5", border:`1px solid ${ok ? BORDER : "#fca5a5"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:11, color:"#7a9e88" }}>
                    Q{i+1} {meta.icon} {meta.label}
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color: ok ? GM : "#c0392b" }}>
                    {ok ? "✓" : "✗"}{!meta.isMCQ && ` ${sc}%`}
                  </div>
                </div>
                {!ok && meta.isMCQ && (
                  <div style={{ fontSize:11, color:"#7a9e88", direction:"rtl",
                    fontFamily:"'Amiri',serif", marginTop:4, lineHeight:1.7 }}>
                    <span style={{ color:"#c0392b" }}>Your: {answers[i] != null ? q.options[answers[i]!] : "—"}</span>
                    <span style={{ margin:"0 6px" }}>·</span>
                    <span style={{ color:GM, fontWeight:700 }}>Correct: {q.correctText}</span>
                  </div>
                )}
                {!ok && !meta.isMCQ && (
                  <div style={{ fontSize:11, color:G, direction:"rtl",
                    fontFamily:"'Amiri',serif", marginTop:4, lineHeight:1.7 }}>
                    ✔ Expected: {q.correctText.split(" ").slice(0, 8).join(" ")}…
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <button onClick={() => { setStage("setup"); setTestSessionId(""); }}
            style={{ padding:"13px 0", borderRadius:12, border:`1px solid ${BORDER}`,
              background:"#f8fafb", color:G, fontSize:14, fontWeight:700, cursor:"pointer" }}>
            ← New Test
          </button>
          <button onClick={startTest}
            style={{ padding:"13px 0", borderRadius:12, border:"none",
              background:`linear-gradient(135deg,${G},${GM})`,
              color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
            🔁 Retry
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE QUESTION ────────────────────────────────────────────────
  if (stage !== "active" || questions.length === 0) {
    return (
      <div style={{ padding:"20px", textAlign:"center" }}>
        <div style={{ fontSize:13, color:"#7a9e88", marginBottom:12 }}>Building questions…</div>
        <button onClick={() => setStage("setup")}
          style={{ padding:"10px 20px", borderRadius:10, border:"none",
            background:G, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>← Back</button>
      </div>
    );
  }

  const q        = questions[Math.min(qIdx, questions.length - 1)];
  const meta     = QMETA[q.type];
  const progress = (qIdx / questions.length) * 100;
  const timerPct = questions.length > 0 ? (timeLeft / (questions.length * 50)) * 100 : 0;

  return (
    <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12, position:"relative" }}>
      <style>{`@keyframes waveTest{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}}`}</style>

      {/* Proctoring overlay */}
      <ProctoringOverlay
        cameraReady={procState.cameraReady}
        faceDetected={procState.faceDetected}
        integrityScore={procState.integrityScore}
        suspicionLevel={procState.suspicionLevel}
        strikes={procState.strikes}
        maxStrikes={procState.maxStrikes}
        violations={procState.violations}
        lastWarningType={procState.lastWarningType}
        audioMonitoring={procState.audioMonitoring}
        recentViolations={procState.recentViolations}
        getStream={procState.getStream}
        attemptId={testSessionId}
        onPointDeduction={() => {}}
      />

      {/* Progress header */}
      <div style={card({ padding:"12px 14px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:12, color:"#7a9e88" }}>
              Q <strong style={{ color:G }}>{qIdx + 1}</strong>/{questions.length}
            </div>
            <div style={{ padding:"2px 8px", borderRadius:6, background:LIGHT,
              fontSize:10, fontWeight:700, color:G }}>
              {SURAHS[surahNum-1]?.name}
            </div>
          </div>
          {/* Timer circle */}
          <div style={{ position:"relative", width:40, height:40 }}>
            <svg width={40} height={40} style={{ transform:"rotate(-90deg)" }}>
              <circle cx={20} cy={20} r={16} fill="none" stroke="#f0f4f0" strokeWidth={4}/>
              <circle cx={20} cy={20} r={16} fill="none"
                stroke={timeLeft < 30 ? "#ef4444" : G} strokeWidth={4}
                strokeDasharray={`${(timerPct/100)*2*Math.PI*16} ${2*Math.PI*16}`} strokeLinecap="round"/>
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:9, fontWeight:900, color: timeLeft < 30 ? "#ef4444" : G }}>{timeLeft}s</span>
            </div>
          </div>
        </div>
        <div style={{ height:5, borderRadius:3, background:"#f0f4f0", overflow:"hidden" }}>
          <div style={{ width:`${progress}%`, height:"100%", borderRadius:3,
            background:`linear-gradient(90deg,${G},${GOLD})`, transition:"width .3s" }}/>
        </div>
      </div>

      {/* Question type badge */}
      <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px",
        borderRadius:10, background:LIGHT, border:`1px solid ${BORDER}`, alignSelf:"flex-start" }}>
        <span style={{ fontSize:14 }}>{meta.icon}</span>
        <span style={{ fontSize:12, fontWeight:700, color:G }}>{meta.label}</span>
        <span style={{ fontSize:10, color:"#7a9e88" }}>· {meta.desc}</span>
      </div>

      {/* ── CUE CARD ── */}
      <div style={card({ padding:"16px" })}>
        <div style={{ fontSize:10, fontWeight:700, color:"#7a9e88", letterSpacing:.5, marginBottom:8 }}>
          {q.type === "missing_word_mcq"       ? "VERSE FRAGMENT · جزء من الآية" :
           q.type === "last_word_mcq"           ? "PHRASE ENDING · نهاية العبارة" :
           q.type === "next_fragment_mcq"       ? "VERSE FRAGMENT · جزء من الآية" :
           q.type === "hear_and_choose"         ? `AUDIO CUE · VERSE ${q.cueAyahNum}` :
           q.type === "recite_from_words"       ? "VERSE OPENING · بداية الآية" :
           q.type === "recite_after_text"       ? `VERSE ${q.cueAyahNum !== null ? q.cueAyahNum : q.correctAyahNum - 1} · THEN RECITE NEXT` :
           q.type === "recite_after_audio"      ? `AUDIO CUE · VERSE ${q.cueAyahNum}` :
           q.type === "continue_partial_audio"  ? `PARTIAL AUDIO · VERSE ${q.cueAyahNum} (FIRST HALF)` : ""}
        </div>

        {/* Text cue (MCQ and text-based recite types) */}
        {q.cueText && (
          <div style={{ direction:"rtl", fontFamily:"'Amiri Quran', 'Amiri', serif",
            fontSize: q.type === "recite_after_text" ? 20 : 18,
            color:G, lineHeight:2.1, textAlign:"right",
            padding:"10px 12px", borderRadius:12, background:LIGHT, border:`1px solid ${BORDER}` }}>
            {q.cueText}
          </div>
        )}

        {/* Audio cue instructions */}
        {q.cueAyahNum !== null && (
          <div style={{ padding:"12px 16px", borderRadius:12, background:"#fffbeb",
            border:`1px solid #fde68a`, textAlign:"center" }}>
            {q.cuePartial ? (
              <>
                <div style={{ fontSize:26, marginBottom:6 }}>⏯</div>
                <div style={{ fontSize:13, color:GOLD, fontWeight:700, marginBottom:4 }}>
                  Audio will stop midway — recite from that point
                </div>
                <div style={{ fontSize:11, color:"#7a9e88" }}>
                  استمع للنصف الأول ثم اكمل من حيث توقف
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:26, marginBottom:6 }}>🔊</div>
                <div style={{ fontSize:13, color:GOLD, fontWeight:700, marginBottom:4 }}>
                  {q.type === "hear_and_choose"
                    ? "Listen to the verse — then choose what comes after"
                    : "Listen to this verse — then recite the next one"}
                </div>
                <div style={{ fontSize:11, color:"#7a9e88" }}>
                  {q.type === "hear_and_choose"
                    ? "استمع للآية ثم اختر ما يليها"
                    : "استمع للآية ثم اتلُ التي بعدها"}
                </div>
              </>
            )}
          </div>
        )}

        {/* Audio play button */}
        {q.cueAyahNum !== null && (
          <div style={{ marginTop:10 }}>
            <button
              onClick={() => {
                if (isPlaying) { stopAudio(); return; }
                if (q.cuePartial) {
                  playAyah(q.cueAyahNum!, true, () => setPartialReady(true));
                } else {
                  playAyah(q.cueAyahNum!);
                }
              }}
              style={{ width:"100%", padding:"10px 0", borderRadius:10,
                border:`1px solid ${isPlaying ? "#ef4444" : GOLD}`,
                background: isPlaying ? "#fee2e2" : "#fffbeb",
                color: isPlaying ? "#c0392b" : GOLD,
                fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {isPlaying
                ? (q.cuePartial ? "⏹ Playing (first half)…" : "⏹ Stop")
                : (partialReady ? "🔁 Replay first half" : q.cuePartial ? "▶ Play (stops midway)" : "▶ Play Verse")}
            </button>
          </div>
        )}
      </div>

      {/* ── MCQ OPTIONS ── */}
      {meta.isMCQ && (
        <>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {q.options.map((opt, i) => {
              const isSel   = selected === i;
              const isCorr  = confirmed && i === q.correctIdx;
              const isWrong = confirmed && isSel && i !== q.correctIdx;
              return (
                <button key={i} onClick={() => !confirmed && setSelected(i)}
                  style={{ padding:"12px 14px", borderRadius:12, cursor: confirmed ? "default" : "pointer",
                    background: isCorr ? LIGHT : isWrong ? "#fff5f5" : isSel ? "#eff6ff" : "#fafafa",
                    border:`1.5px solid ${isCorr ? BORDER : isWrong ? "#fca5a5" : isSel ? "#93c5fd" : "#f0f4f0"}`,
                    display:"flex", gap:10, alignItems:"center", direction:"rtl", textAlign:"right",
                    transition:"all .15s" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                    background: isCorr ? GM : isWrong ? "#ef4444" : isSel ? "#2563eb" : "#e5e7eb",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:700, color: isCorr||isWrong||isSel ? "#fff" : "#6b7280",
                    fontFamily:"'Cairo',sans-serif" }}>
                    {isCorr ? "✓" : isWrong ? "✗" : String.fromCharCode(65 + i)}
                  </div>
                  <div style={{ flex:1, fontFamily:"'Amiri Quran','Amiri',serif",
                    fontSize: opt.length > 20 ? 15 : 17,
                    color: isCorr ? GM : isWrong ? "#c0392b" : isSel ? "#1d4ed8" : G,
                    lineHeight:1.8 }}>
                    {opt}
                  </div>
                </button>
              );
            })}
          </div>

          {!confirmed ? (
            <button onClick={confirmAnswer} disabled={selected === null}
              style={{ padding:"13px 0", borderRadius:12, border:"none",
                background: selected === null ? "#f0f4f0" : `linear-gradient(135deg,${G},${GM})`,
                color: selected === null ? "#7a9e88" : "#fff",
                fontSize:14, fontWeight:800, cursor: selected === null ? "not-allowed" : "pointer" }}>
              ✓ Confirm Answer · تأكيد
            </button>
          ) : (
            <button onClick={nextQuestion}
              style={{ padding:"13px 0", borderRadius:12, border:"none",
                background: answers[qIdx] === q.correctIdx
                  ? `linear-gradient(135deg,${GM},${G})`
                  : "linear-gradient(135deg,#b91c1c,#ef4444)",
                color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer" }}>
              {qIdx < questions.length - 1 ? "Next Question →" : "See Results 🎉"}
            </button>
          )}
        </>
      )}

      {/* ── AUDIO ANSWER ── */}
      {!meta.isMCQ && (
        <div style={card({ padding:"16px" })}>
          <div style={{ fontSize:11, fontWeight:700, color:"#7a9e88", letterSpacing:.5, marginBottom:12 }}>
            {q.type === "recite_from_words"
              ? `🎙 RECITE VERSE ${q.correctAyahNum} (from the 3rd word onward) · ${toAr(q.correctAyahNum)}`
              : q.type === "continue_partial_audio"
              ? `🎙 CONTINUE FROM WHERE AUDIO STOPPED · الآية ${toAr(q.correctAyahNum)}`
              : `🎙 RECITE VERSE ${q.correctAyahNum} · الآية ${toAr(q.correctAyahNum)}`}
          </div>

          {/* If partial audio, must play first */}
          {q.cuePartial && !partialReady && micState === "idle" && (
            <div style={{ padding:"12px", borderRadius:12, background:"#fffbeb",
              border:`1px solid #fde68a`, textAlign:"center", fontSize:12, color:GOLD, fontWeight:700 }}>
              ⬆ Press "Play" above to hear the first half, then record your continuation
            </div>
          )}

          {micState === "idle" && (q.cuePartial ? partialReady : true) && (
            <button onClick={startRecording}
              style={{ width:"100%", padding:"13px 0", borderRadius:12, border:"none",
                background:`linear-gradient(135deg,${G},${GM})`,
                color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              🎙 Start Reciting
            </button>
          )}

          {micState === "recording" && (
            <div style={{ textAlign:"center" }}>
              <div style={{ display:"flex", gap:3, justifyContent:"center", alignItems:"flex-end",
                height:28, marginBottom:10 }}>
                {[6,12,8,18,10,15,6,12,20,8].map((h, i) => (
                  <div key={i} style={{ width:4, height:h, borderRadius:2, background:"#ef4444",
                    animation:`waveTest .7s ease-in-out ${i * .07}s infinite alternate` }}/>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#ef4444", fontWeight:700, marginBottom:10 }}>
                Recording…
              </div>
              <button onClick={stopRecording}
                style={{ padding:"10px 24px", borderRadius:10, border:"none",
                  background:"#fee2e2", color:"#c0392b", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                ⏹ Done
              </button>
            </div>
          )}

          {micState === "evaluating" && (
            <div style={{ textAlign:"center", padding:"14px" }}>
              <div style={{ fontSize:13, color:GOLD, fontWeight:700 }}>🤖 Evaluating recitation…</div>
            </div>
          )}

          {micState === "done" && audioResult && (
            <div style={{ padding:"12px", borderRadius:12,
              background: audioResult.score >= 60 ? LIGHT : "#fff5f5",
              border:`1px solid ${audioResult.score >= 60 ? BORDER : "#fca5a5"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:14, fontWeight:800,
                  color: audioResult.score >= 60 ? GM : "#c0392b" }}>
                  {audioResult.score >= 60 ? "✓ Good recitation!" : "✗ Needs more practice"}
                </span>
                <span style={{ fontSize:20, fontWeight:900,
                  color: audioResult.score >= 60 ? GM : "#c0392b" }}>
                  {audioResult.score}%
                </span>
              </div>
              {audioResult.tx && (
                <div style={{ direction:"rtl", fontFamily:"'Amiri',serif", fontSize:12,
                  color:"#7a9e88", background:"#f9fafb", borderRadius:8,
                  padding:"6px 10px", marginBottom:8, lineHeight:1.8 }}>
                  {audioResult.tx}
                </div>
              )}
              <div style={{ marginTop:6 }}>
                <div style={{ fontSize:10, color:"#7a9e88", fontWeight:700, marginBottom:4 }}>
                  {q.type === "continue_partial_audio" ? "EXPECTED CONTINUATION" :
                   q.type === "recite_from_words" ? "EXPECTED CONTINUATION" : "CORRECT VERSE"}
                </div>
                <div style={{ direction:"rtl", fontFamily:"'Amiri Quran','Amiri',serif",
                  fontSize:17, color:G, lineHeight:2.1, textAlign:"right" }}>
                  {q.correctText}
                </div>
              </div>
              <button onClick={nextQuestion}
                style={{ marginTop:10, width:"100%", padding:"11px 0", borderRadius:10, border:"none",
                  background:`linear-gradient(135deg,${G},${GM})`,
                  color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {qIdx < questions.length - 1 ? "Next Question →" : "See Results 🎉"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
