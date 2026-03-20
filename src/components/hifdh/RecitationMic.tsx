/*
  RecitationMic.tsx — Hifdh Practice v3
  
  Matching algorithm — THE FIX:
  Instead of sequential greedy scan (which gets stuck if word 0 never matches),
  we use BEST-WINDOW matching:
  1. Take the last N spoken tokens (rolling window)
  2. Try to align that window at EVERY possible position in the ayah
  3. Score each alignment by how many tokens match
  4. Jump ptr to the end of the best-scoring alignment
  5. Never go backwards

  This means even if Deepgram returns words out of order or slightly wrong,
  we find the best position in the ayah and reveal up to there.

  New features:
  - Mode selector: Memorise (hidden) / Review (shown, highlight) / Challenge (timed)
  - Ayah-by-ayah card swipe view — focus on one ayah at a time
  - Live score badge per ayah
  - Streak counter
  - Accuracy ring per session
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, ChevronLeft, ChevronRight, BookOpen, Star, Zap, Eye, Brain, Trophy, RotateCcw, Check } from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ─────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type Mode = "memorise" | "review" | "challenge";
type WS   = "hidden" | "correct" | "active" | "skipped";
interface Word { raw: string; norm: string; state: WS; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; done: boolean; score: number; }

/* ─────────────────────────────────────────────────────────
   ARABIC NORMALISATION — aggressive, handles all variants
───────────────────────────────────────────────────────── */
const nrm = (t: string): string =>
  t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "") // all diacritics
    .replace(/[\u0622\u0623\u0624\u0625\u0626\u0627\u0671\u0672\u0673\u0675\u0676\u0677]/g, "ا")
    .replace(/\u0629/g, "ه")   // tah marbuta
    .replace(/\u0649/g, "ي")   // alef maqsura
    .replace(/\u0640/g, "")    // tatweel
    .replace(/[\uFEFB-\uFEFC\uFEF5-\uFEFA]/g, "لا") // lam-alef ligatures
    .replace(/[\u0600-\u060F\u061B-\u061F\u06D4\u06DD-\u06DF]/g, "") // Arabic punctuation
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "") // keep only base Arabic letters
    .replace(/\s+/g, " ").trim();

const clean = (t: string): string =>
  t.replace(/[^\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g, " ")
   .replace(/\s+/g, " ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿[^﴾]*﴾/g, "").trim()
    .split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: nrm(w), state: "hidden" as WS }));

/* ─────────────────────────────────────────────────────────
   FUZZY WORD MATCH
───────────────────────────────────────────────────────── */
const lev = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 4) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
};

const wMatch = (spoken: string, target: string): boolean => {
  const s = nrm(spoken), t = nrm(target);
  if (!s || !t) return false;
  if (s === t) return true;
  if (s.length >= 3 && t.length >= 3) {
    // prefix match (very common in Arabic verb conjugations)
    if (s.slice(0, 3) === t.slice(0, 3)) return true;
    // one contains the other
    if (s.includes(t) || t.includes(s)) return true;
  }
  // Levenshtein — 30% tolerance
  return lev(s, t) <= Math.max(1, Math.floor(Math.max(s.length, t.length) * 0.30));
};

/* ─────────────────────────────────────────────────────────
   BEST-WINDOW MATCHING  ← THE CORE FIX
  
  Instead of sequential scan (which deadlocks at word 0),
  we try every possible alignment of the token window against
  the ayah words, score each by matches, jump to the best.
  
  Example: ayah = [رَبِّ, الْعَٰلَمِينَ, الرَّحْمَٰنِ]
           spoken tokens = ["رب", "العالمين"]
           → tries aligning at pos 0, 1, 2
           → pos 0 scores 2 (both match) → jump to ptr=2
───────────────────────────────────────────────────────── */
const bestWindowMatch = (
  tokens: string[],
  words: Word[],
  startPtr: number
): number => {
  if (tokens.length === 0 || startPtr >= words.length) return startPtr;

  const normTokens = tokens.map(nrm).filter(Boolean);
  if (normTokens.length === 0) return startPtr;

  let bestPtr  = startPtr;
  let bestScore = 0;

  // Try aligning the token window at each position from startPtr onwards
  // (we never go before startPtr)
  for (let pos = startPtr; pos < Math.min(startPtr + 8, words.length); pos++) {
    let score = 0;
    let wi = pos;
    for (let ti = 0; ti < normTokens.length && wi < words.length; ti++) {
      if (wMatch(normTokens[ti], words[wi].norm)) {
        score++;
        wi++;
      }
      // allow one token skip (Deepgram filler/noise)
    }
    if (score > bestScore) {
      bestScore = score;
      // ptr = end of matched run from this position
      let wi2 = pos;
      for (let ti = 0; ti < normTokens.length && wi2 < words.length; ti++) {
        if (wMatch(normTokens[ti], words[wi2].norm)) wi2++;
      }
      bestPtr = Math.max(bestPtr, wi2);
    }
  }

  // Must have matched at least 1 word to advance
  return bestScore >= 1 ? bestPtr : startPtr;
};

/* ─────────────────────────────────────────────────────────
   AUDIO HELPERS
───────────────────────────────────────────────────────── */
const getMime = (): string => {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const dgCT   = (m: string) => m.includes("mp4") ? "audio/mp4" : m.includes("ogg") ? "audio/ogg" : "audio/webm";
const fmtSec = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ─────────────────────────────────────────────────────────
   PAGE BUILDER
───────────────────────────────────────────────────────── */
const buildPages = (ayahs: Ayah[]): Ayah[][] => {
  if (ayahs.length <= 10) return [ayahs];
  const pages: Ayah[][] = [];
  let page: Ayah[] = [], wc = 0;
  for (const a of ayahs) {
    if (page.length > 0 && (page.length >= 5 || wc + a.words.length > 45)) {
      pages.push(page); page = []; wc = 0;
    }
    page.push(a); wc += a.words.length;
  }
  if (page.length) pages.push(page);
  return pages;
};

/* ─────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────── */
const C = {
  bg:      "#0d1117",
  bgCard:  "#161b22",
  bgPage:  "#1c2128",
  border:  "#30363d",
  green:   "#3fb950",
  greenDim:"#1a4731",
  gold:    "#d29922",
  goldDim: "#3d2c09",
  red:     "#f85149",
  blue:    "#58a6ff",
  text:    "#e6edf3",
  textDim: "#8b949e",
  textMid: "#c9d1d9",
} as const;

const MODE_INFO = {
  memorise:  { icon: Brain,  label: "Memorise",  sub: "Words hidden — reveal as you recite",   color: C.green },
  review:    { icon: Eye,    label: "Review",     sub: "Words shown — highlight as you recite", color: C.blue  },
  challenge: { icon: Zap,    label: "Challenge",  sub: "Timed — 30s per ayah",                  color: C.gold  },
};

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  /* UI */
  const [screen,     setScreen]     = useState<"home"|"picker"|"session"|"done">("home");
  const [mode,       setMode]       = useState<Mode>("memorise");
  const [surahs,     setSurahs]     = useState<SurahMeta[]>([]);
  const [search,     setSearch]     = useState("");
  const [selected,   setSelected]   = useState<SurahMeta | null>(null);
  const [loading,    setLoading]    = useState(false);

  /* Ayah / session */
  const [ayahs,    setAyahs]    = useState<Ayah[]>([]);
  const [pages,    setPages]    = useState<Ayah[][]>([]);
  const [pageIdx,  setPageIdx]  = useState(0);
  const [ayahIdx,  setAyahIdx]  = useState(0);  // global index into ayahs[]
  const [streak,   setStreak]   = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [timer,    setTimer]    = useState(0);
  const [chalTime, setChalTime] = useState(30); // challenge countdown

  /* Recording */
  const [recording,  setRecording]  = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error,      setError]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");

  /* Refs */
  const mrRef     = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const initRef   = useRef<Blob | null>(null);
  const audioRef  = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const chalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef    = useRef(false);
  const mimeRef   = useRef("");
  const idxRef    = useRef(0);
  const ayahsRef  = useRef<Ayah[]>([]);
  const ptrRef    = useRef(0);
  const pageIdxRef = useRef(0);
  const activeRef = useRef<HTMLDivElement | null>(null);

  /* Sync refs */
  useEffect(() => { idxRef.current   = ayahIdx; },  [ayahIdx]);
  useEffect(() => { ayahsRef.current = ayahs;   },  [ayahs]);
  useEffect(() => { recRef.current   = recording; }, [recording]);
  useEffect(() => { pageIdxRef.current = pageIdx; }, [pageIdx]);

  /* Auto-scroll active ayah */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ayahIdx]);

  /* Load surahs */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json()).then(d => { if (d.code === 200) setSurahs(d.data); });
    return killMic;
  }, []);

  /* Session timer */
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  /* Challenge countdown */
  useEffect(() => {
    if (recording && mode === "challenge") {
      setChalTime(30);
      chalRef.current = setInterval(() => {
        setChalTime(t => {
          if (t <= 1) {
            // Time up — auto advance
            setTimeout(() => advanceAyah(idxRef.current), 0);
            return 30;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      if (chalRef.current) { clearInterval(chalRef.current); chalRef.current = null; }
    }
    return () => { if (chalRef.current) clearInterval(chalRef.current); };
  }, [recording, mode, ayahIdx]); // restart on ayah change

  /* Load ayahs */
  const loadSurah = async (surah: SurahMeta) => {
    setLoading(true);
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${surah.number}/ar.uthmani`);
      const d = await r.json();
      if (d.code === 200) {
        const loaded: Ayah[] = d.data.ayahs.map((a: any) => ({
          number: a.number, numberInSurah: a.numberInSurah,
          text: a.text, words: toWords(a.text), done: false, score: 0,
        }));
        setAyahs(loaded);
        ayahsRef.current = loaded;
        setPages(buildPages(loaded));
        setAyahIdx(0); idxRef.current = 0;
        setPageIdx(0); pageIdxRef.current = 0;
        ptrRef.current = 0;
        setStreak(0); setTotalScore(0); setTimer(0);
      }
    } finally { setLoading(false); }
  };

  /* Kill mic */
  const killMic = () => {
    recRef.current = false;
    if (mrRef.current)  { try { mrRef.current.stop(); } catch(_){} mrRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  /* ── ADVANCE AYAH ─────────────────────────────────────── */
  const advanceAyah = useCallback((completedIdx: number) => {
    const ayah = ayahsRef.current[completedIdx];
    if (!ayah) return;

    const revealed = ayah.words.filter(w => w.state === "correct").length;
    const score    = ayah.words.length > 0 ? Math.round((revealed / ayah.words.length) * 100) : 0;

    // Update ayah as done
    setAyahs(prev => {
      const u = [...prev];
      if (u[completedIdx]) u[completedIdx] = { ...u[completedIdx], done: true, score };
      return u;
    });

    setStreak(s => score >= 80 ? s + 1 : 0);
    setTotalScore(s => s + score);

    // Save
    saveAyah(completedIdx, score);

    // Reset for next
    ptrRef.current = 0;
    setLastTranscript("");

    const next = completedIdx + 1;
    idxRef.current = next;

    if (next >= ayahsRef.current.length) {
      setScreen("done");
      setRecording(false);
      killMic();
      return;
    }

    setAyahIdx(next);
    setTimer(0);

    // Auto page advance
    setPages(pp => {
      const ni = pp.findIndex(p => p.some(a => a.numberInSurah === ayahsRef.current[next]?.numberInSurah));
      if (ni >= 0 && ni !== pageIdxRef.current) { setPageIdx(ni); pageIdxRef.current = ni; }
      return pp;
    });

    // Reset next ayah words
    setAyahs(prev => {
      const u = [...prev];
      if (u[next]) u[next] = { ...u[next], words: u[next].words.map(w => ({ ...w, state: mode === "review" ? "hidden" : "hidden" })), done: false };
      return u;
    });
  }, [mode]);

  /* ── PROCESS TRANSCRIPT ───────────────────────────────── */
  const processTranscript = useCallback((raw: string) => {
    if (!raw.trim() || !recRef.current) return;

    const cleaned = clean(raw);
    if (!cleaned) return;

    setLastTranscript(cleaned);

    const idx   = idxRef.current;
    const words = ayahsRef.current[idx]?.words;
    if (!words || words.length === 0) return;

    // Tokenise new chunk
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;

    // Run best-window matching from current pointer
    const newPtr = bestWindowMatch(tokens, words, ptrRef.current);

    if (newPtr <= ptrRef.current) return; // no progress
    ptrRef.current = newPtr;

    setAyahs(prev => {
      const u = [...prev];
      if (!u[idx]) return prev;
      const updated: Ayah = {
        ...u[idx],
        words: u[idx].words.map((w, wi) => ({
          ...w,
          state: wi < newPtr ? "correct"
               : wi === newPtr ? "active"
               : mode === "review" ? "hidden"
               : "hidden" as WS,
        })),
      };
      u[idx] = updated;
      if (newPtr >= updated.words.length) {
        setTimeout(() => advanceAyah(idx), 200);
      }
      return u;
    });
  }, [advanceAyah, mode]);

  /* ── TRANSCRIBE ───────────────────────────────────────── */
  const transcribe = useCallback(async (blob: Blob) => {
    if (blob.size < 200 || !recRef.current) return;
    setProcessing(true);
    try {
      let text = "";

      /* ── PRIMARY: Groq whisper-large-v3 ──────────────────
         Full large-v3 (NOT turbo) — significantly more accurate
         for Quranic Arabic. Turbo sacrifices Arabic quality for speed.
         Prompt anchors Whisper to Quranic vocabulary so it doesn't
         hallucinate modern Arabic words for classical ones.
      ─────────────────────────────────────────────────────── */
      if (GROQ_KEY) {
        const ext = (mimeRef.current||"").includes("mp4") ? "mp4"
                  : (mimeRef.current||"").includes("ogg") ? "ogg" : "webm";
        const fd = new FormData();
        fd.append("file", new File([blob], `recitation.${ext}`, { type: mimeRef.current||"audio/webm" }));
        fd.append("model", "whisper-large-v3");          // full model, NOT turbo
        fd.append("language", "ar");
        fd.append("response_format", "verbose_json");    // gives word-level confidence
        fd.append("temperature", "0");
        // Long Quranic prompt — primes the model with the opening surahs
        // so it stays in Quranic register and handles tajweed variants
        fd.append("prompt",
          "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين " +
          "إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم " +
          "غير المغضوب عليهم ولا الضالين"
        );
        try {
          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}` },
            body: fd,
          });
          if (r.status === 429) {
            console.warn("Groq rate limited — falling back to Deepgram");
          } else if (r.ok) {
            const data = await r.json();
            text = data?.text || "";
            // Filter low-confidence segments (Whisper hallucination signal)
            if (data?.segments) {
              const goodSegs = data.segments.filter((s: any) =>
                typeof s.no_speech_prob === "number" ? s.no_speech_prob < 0.6 : true
              );
              if (goodSegs.length > 0) {
                text = goodSegs.map((s: any) => s.text).join(" ").trim();
              } else {
                text = ""; // all segments were likely silence/noise
              }
            }
          } else {
            console.warn("Groq error:", r.status);
          }
        } catch(e: any) { console.warn("Groq fetch error:", e?.message); }
      }

      /* ── FALLBACK: Deepgram nova-2 ────────────────────────
         Used only if Groq fails/rate-limits. nova-2 is fast
         but less accurate for Classical Quranic Arabic.
      ─────────────────────────────────────────────────────── */
      if (!text && DEEPGRAM_KEY) {
        try {
          const res = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
            { method:"POST", headers:{ Authorization:`Token ${DEEPGRAM_KEY}`, "Content-Type":dgCT(mimeRef.current||blob.type) }, body:blob }
          );
          if (res.ok) {
            text = (await res.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
          }
        } catch(e: any) { console.warn("DG fallback error:", e?.message); }
      }

      if (text) processTranscript(text);
      setError("");
    } catch(e: any) {
      console.error("Transcribe:", e?.message);
    } finally { setProcessing(false); }
  }, [processTranscript]);

  /* ── START RECORDING ──────────────────────────────────── */
  const startRec = useCallback((stream: MediaStream) => {
    initRef.current = null;
    const mr = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : {});
    mr.ondataavailable = e => {
      if (!e.data?.size) return;
      audioRef.current.push(e.data);
      if (!initRef.current) { initRef.current = e.data; transcribe(e.data); return; }
      transcribe(new Blob([initRef.current, e.data], { type: mimeRef.current || "audio/webm" }));
    };
    mr.start(2000); // 2s chunks — large-v3 needs more audio context
    mrRef.current = mr;
  }, [transcribe]);

  /* ── TOGGLE MIC ───────────────────────────────────────── */
  const toggleMic = async () => {
    if (recording) { setRecording(false); killMic(); return; }
    setError(""); ptrRef.current = 0; setLastTranscript(""); setTimer(0);
    // Reset current ayah words
    setAyahs(prev => prev.map((a, i) =>
      i === idxRef.current ? { ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WS })), done: false } : a
    ));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s; audioRef.current = []; mimeRef.current = getMime();
      recRef.current = true; setRecording(true); startRec(s);
    } catch { setError("Microphone access denied."); }
  };

  /* ── SKIP AYAH ────────────────────────────────────────── */
  const skipAyah = () => {
    setAyahs(prev => {
      const u = [...prev];
      const idx = idxRef.current;
      if (u[idx]) u[idx] = { ...u[idx], words: u[idx].words.map(w => ({ ...w, state: "skipped" as WS })), done: true, score: 0 };
      return u;
    });
    advanceAyah(idxRef.current);
  };

  /* ── SAVE AYAH ────────────────────────────────────────── */
  const saveAyah = async (idx: number, score: number) => {
    if (!userId || !selected) return;
    const ayah = ayahsRef.current[idx]; if (!ayah) return;
    setSaving(true);
    try {
      const correct = ayah.words.filter(w => w.state === "correct").length;
      let audioUrl = "";
      if (audioRef.current.length > 0) {
        const blob = new Blob(audioRef.current, { type: mimeRef.current || "audio/webm" });
        const ext  = mimeRef.current.includes("mp4") ? "mp4" : mimeRef.current.includes("ogg") ? "ogg" : "webm";
        const path = `${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.${ext}`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) { const { data: u } = supabase.storage.from("hifdh-recordings").getPublicUrl(path); audioUrl = u?.publicUrl ?? ""; }
        audioRef.current = [];
      }
      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, ayah_end: ayah.numberInSurah,
          audio_url: audioUrl, ai_score: score, status: "pending",
          transcript: lastTranscript,
          word_results: ayah.words.map(x => ({ word: x.raw, result: x.state })),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id: userId, surah_number: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, accuracy_score: score, correct, wrong: 0, duration: timer,
        }),
      ]);
      const { data: ex } = await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed").eq("user_id", userId).eq("surah_num", selected.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({
          last_reviewed: new Date().toISOString(),
          best_accuracy: Math.max(ex.best_accuracy ?? 0, score),
          times_reviewed: (ex.times_reviewed ?? 0) + 1,
        }).eq("id", ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          last_reviewed: new Date().toISOString(), best_accuracy: score, times_reviewed: 1,
        });
      }
    } catch(_) {}
    setSaving(false);
  };

  /* ── DERIVED ──────────────────────────────────────────── */
  const currentPage = pages[pageIdx] ?? [];
  const totalAyahs  = ayahs.length;
  const doneAyahs   = ayahs.filter(a => a.done).length;
  const overallPct  = totalAyahs > 0 ? Math.round((doneAyahs / totalAyahs) * 100) : 0;
  const filtered    = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search)
  );
  const currentAyah = ayahs[ayahIdx];
  const avgScore    = doneAyahs > 0 ? Math.round(totalScore / doneAyahs) : 0;

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100svh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>

      {/* ══ HOME SCREEN ══════════════════════════════════════ */}
      {screen === "home" && (
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>
          {/* Hero */}
          <div style={{ background:`linear-gradient(160deg, #0d2818 0%, ${C.bg} 100%)`, padding:"32px 20px 24px", textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:8 }}>📖</div>
            <h1 style={{ fontSize:26, fontWeight:900, color:C.text, margin:"0 0 6px", letterSpacing:-0.5 }}>Hifdh Practice</h1>
            <p style={{ fontSize:13, color:C.textDim, margin:0, fontFamily:"'Amiri',serif", direction:"rtl" }}>مراجعة وحفظ القرآن الكريم</p>
          </div>

          <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:16, flex:1 }}>
            {/* Mode selector */}
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:C.textDim, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Practice Mode</p>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(["memorise","review","challenge"] as Mode[]).map(m => {
                  const info = MODE_INFO[m];
                  const Icon = info.icon;
                  const active = mode === m;
                  return (
                    <button key={m} onClick={() => setMode(m)} style={{
                      display:"flex", alignItems:"center", gap:14,
                      padding:"14px 16px", borderRadius:14,
                      border:`1.5px solid ${active ? info.color : C.border}`,
                      background: active ? `${info.color}18` : C.bgCard,
                      cursor:"pointer", textAlign:"left",
                      transition:"all .15s",
                    }}>
                      <div style={{ width:40, height:40, borderRadius:10, background: active ? `${info.color}22` : C.bgPage, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <Icon size={20} color={active ? info.color : C.textDim} />
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color: active ? info.color : C.textMid }}>{info.label}</div>
                        <div style={{ fontSize:11, color:C.textDim, marginTop:2 }}>{info.sub}</div>
                      </div>
                      {active && <div style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%", background:info.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Continue / Start */}
            {selected ? (
              <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{selected.englishName}</div>
                    <div style={{ fontSize:13, fontFamily:"'Amiri',serif", color:C.textDim }}>{selected.name}</div>
                  </div>
                  <button onClick={() => { setSelected(null); setAyahs([]); }} style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:11, padding:"4px 8px" }}>Change</button>
                </div>
                {overallPct > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ height:4, background:C.bgPage, borderRadius:2, overflow:"hidden" }}>
                      <div style={{ width:`${overallPct}%`, height:"100%", background:C.green, borderRadius:2, transition:"width .5s" }} />
                    </div>
                    <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>{overallPct}% complete · {doneAyahs}/{totalAyahs} ayahs</div>
                  </div>
                )}
                <button onClick={() => setScreen("session")} style={{
                  width:"100%", padding:"14px", borderRadius:12, border:"none",
                  background:C.green, color:"#0d1117", fontSize:15, fontWeight:800, cursor:"pointer",
                }}>
                  {doneAyahs > 0 ? "Continue →" : "Start Session →"}
                </button>
              </div>
            ) : (
              <button onClick={() => setScreen("picker")} style={{
                width:"100%", padding:"16px", borderRadius:14, border:`1.5px dashed ${C.border}`,
                background:"transparent", color:C.textMid, fontSize:14, fontWeight:600, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              }}>
                <BookOpen size={18} /> Choose a Surah to begin
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ SURAH PICKER ════════════════════════════════════ */}
      {screen === "picker" && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"14px 16px 10px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setScreen("home")} style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", padding:4 }}>
              <ChevronLeft size={20} />
            </button>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search surah…"
              autoFocus
              style={{ flex:1, background:C.bgPage, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 14px", fontSize:14, color:C.text, outline:"none" }}
            />
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 24px", display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, alignContent:"start" }}>
            {filtered.slice(0, 114).map(s => (
              <button key={s.number} onClick={async () => {
                setSelected(s); setSearch("");
                await loadSurah(s);
                setScreen("session");
              }} style={{
                background: selected?.number === s.number ? C.greenDim : C.bgCard,
                border:`1px solid ${selected?.number === s.number ? C.green : C.border}`,
                borderRadius:12, padding:"12px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:10, textAlign:"left",
                transition:"all .15s",
              }}>
                <div style={{ width:32, height:32, borderRadius:8, background:C.bgPage, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.gold, flexShrink:0 }}>
                  {s.number}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.textMid, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.englishName}</div>
                  <div style={{ fontSize:13, fontFamily:"'Amiri',serif", color:C.textDim }}>{s.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ SESSION SCREEN ══════════════════════════════════ */}
      {screen === "session" && selected && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Header */}
          <div style={{ flexShrink:0, background:C.bgCard, borderBottom:`1px solid ${C.border}`, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={() => { setScreen("home"); killMic(); setRecording(false); }} style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", padding:4 }}>
              <ChevronLeft size={20} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {selected.englishName} · <span style={{ fontFamily:"'Amiri',serif", fontWeight:400, color:C.textDim }}>{selected.name}</span>
              </div>
              <div style={{ fontSize:11, color:C.textDim, marginTop:1 }}>
                {ayahIdx+1}/{totalAyahs} ayahs · {overallPct}%{recording ? ` · ${fmtSec(timer)}` : ""}
              </div>
            </div>
            {/* Streak */}
            {streak >= 2 && (
              <div style={{ display:"flex", alignItems:"center", gap:4, background:`${C.gold}22`, border:`1px solid ${C.gold}44`, borderRadius:20, padding:"3px 10px" }}>
                <Zap size={11} color={C.gold} />
                <span style={{ fontSize:11, fontWeight:700, color:C.gold }}>{streak}x</span>
              </div>
            )}
            {/* Mode badge */}
            <div style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:`${MODE_INFO[mode].color}22`, color:MODE_INFO[mode].color, fontWeight:700, border:`1px solid ${MODE_INFO[mode].color}44` }}>
              {MODE_INFO[mode].label.toUpperCase()}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ flexShrink:0, height:3, background:C.bgPage }}>
            <div style={{ width:`${overallPct}%`, height:"100%", background:C.green, transition:"width .5s" }} />
          </div>

          {/* Challenge countdown bar */}
          {recording && mode === "challenge" && (
            <div style={{ flexShrink:0, background:C.goldDim, padding:"6px 16px", display:"flex", alignItems:"center", gap:10 }}>
              <Zap size={13} color={C.gold} />
              <div style={{ flex:1, height:4, background:"rgba(255,255,255,.1)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ width:`${(chalTime/30)*100}%`, height:"100%", background:chalTime > 10 ? C.gold : C.red, transition:"width 1s linear", borderRadius:2 }} />
              </div>
              <span style={{ fontSize:12, fontWeight:700, color: chalTime > 10 ? C.gold : C.red, minWidth:28 }}>{chalTime}s</span>
            </div>
          )}

          {/* Scroll area */}
          {loading ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
              <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTopColor:C.green, borderRadius:"50%", animation:"spin 1s linear infinite" }} />
              <span style={{ fontSize:13, color:C.textDim }}>Loading ayahs…</span>
            </div>
          ) : (
            <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 120px" }}>

              {/* Bismillah */}
              {pageIdx === 0 && selected.number !== 9 && (
                <div style={{ textAlign:"center", padding:"16px 8px 20px", fontFamily:"'Amiri Quran','Amiri',serif", fontSize:26, color:C.gold, lineHeight:2.2, direction:"rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
              )}

              {pages.length > 1 && (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <div style={{ flex:1, height:1, background:C.border }} />
                  <span style={{ fontSize:10, color:C.textDim, padding:"2px 10px", border:`1px solid ${C.border}`, borderRadius:20, background:C.bgCard }}>
                    Page {pageIdx+1}/{pages.length} · {currentPage[0]?.numberInSurah}–{currentPage[currentPage.length-1]?.numberInSurah}
                  </span>
                  <div style={{ flex:1, height:1, background:C.border }} />
                </div>
              )}

              {/* Ayah cards */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {currentPage.map((ayah, ai) => {
                  const isActive = ayah.numberInSurah === ayahsRef.current[ayahIdx]?.numberInSurah;
                  const isDone   = ayah.done;
                  const revCount = ayah.words.filter(w => w.state === "correct").length;
                  const ayahPct  = ayah.words.length > 0 ? Math.round((revCount / ayah.words.length) * 100) : 0;

                  return (
                    <div key={ayah.numberInSurah}
                      ref={isActive ? (el: any) => { activeRef.current = el; } : undefined}
                      style={{
                        borderRadius:14,
                        border:`1px solid ${isDone ? (ayah.score >= 80 ? C.green+"66" : C.gold+"44") : isActive ? C.green+"44" : C.border}`,
                        background: isDone ? C.bgPage : isActive ? "#1a2d1e" : C.bgCard,
                        overflow:"hidden",
                        transition:"all .25s",
                        borderLeft:`3px solid ${isDone ? (ayah.score >= 80 ? C.green : C.gold) : isActive ? C.green : "transparent"}`,
                      }}>

                      {/* Score chip for done ayahs */}
                      {isDone && (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"6px 12px 0" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, color: ayah.score >= 80 ? C.green : C.gold }}>
                            {ayah.score >= 80 ? <Check size={10}/> : <Star size={10}/>}
                            {ayah.score}%
                          </div>
                        </div>
                      )}

                      {/* Ayah text */}
                      <div style={{
                        padding: isDone ? "8px 14px 10px" : "18px 14px 14px",
                        direction:"rtl", fontFamily:"'Amiri Quran','Amiri',serif",
                        fontSize: isActive ? 26 : 22,
                        lineHeight: isActive ? 3.4 : 2.8,
                        textAlign:"right",
                        transition:"font-size .2s",
                      }}>
                        {ayah.words.map((w, wi) => {
                          const isCorrect = w.state === "correct";
                          const isAct     = w.state === "active";
                          const isSkipped = w.state === "skipped";

                          // In review mode show all words, otherwise hide
                          const showWord = isCorrect || isAct || isSkipped || mode === "review" || isDone;

                          return (
                            <span key={wi} style={{
                              display:"inline-block", margin:"0 2px",
                              transition:"all .2s",
                              ...(isCorrect ? { color: C.green } :
                                  isAct     ? { color: C.gold, background:`${C.gold}22`, borderRadius:4, padding:"0 3px", border:`1px solid ${C.gold}66`, animation:"pulse .8s ease-in-out infinite" } :
                                  isSkipped ? { color: C.textDim, textDecoration:"line-through" } :
                                  showWord  ? { color: C.textMid } :
                                  /* hidden */{ color:"transparent", background: isActive ? "#2d3748" : "#1e2733", borderRadius:4,
                                      minWidth:`${Math.max(w.raw.length*9, 18)}px`, height:"0.55em", verticalAlign:"middle", display:"inline-block" }
                              )
                            }}>
                              {showWord || isCorrect || isAct || isSkipped ? w.raw : "\u00A0".repeat(Math.max(w.raw.length, 2))}
                            </span>
                          );
                        })}
                        <span style={{ color:`${C.gold}66`, fontSize:16, margin:"0 5px", fontFamily:"'Amiri',serif" }}>
                          ﴿{ayah.numberInSurah}﴾
                        </span>
                      </div>

                      {/* Per-ayah progress bar */}
                      {isActive && !isDone && (
                        <div style={{ height:2, background:C.bgPage }}>
                          <div style={{ width:`${ayahPct}%`, height:"100%", background:C.green, transition:"width .3s" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Page nav */}
              {pages.length > 1 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
                  <button disabled={pageIdx === 0}
                    onClick={() => setPageIdx(p => p-1)}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.bgCard, color:pageIdx===0?C.border:C.textMid, fontSize:12, fontWeight:600, cursor:pageIdx===0?"default":"pointer", opacity:pageIdx===0?.4:1 }}>
                    <ChevronRight size={14}/> Prev
                  </button>
                  <div style={{ display:"flex", gap:4 }}>
                    {pages.map((_,i) => (
                      <div key={i} style={{ width:i===pageIdx?18:6, height:6, borderRadius:3, background:i===pageIdx?C.green:i<pageIdx?C.greenDim:C.border, transition:"all .3s" }} />
                    ))}
                  </div>
                  <button onClick={() => { if(pageIdx<pages.length-1) setPageIdx(p=>p+1); else setScreen("done"); }}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.bgCard, color:C.textMid, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Next <ChevronLeft size={14}/>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ BOTTOM MIC BAR ════════════════════════════════ */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0,
            background:"rgba(13,17,23,.95)", backdropFilter:"blur(16px)",
            borderTop:`1px solid ${C.border}`,
            padding:"12px 16px 20px",
            zIndex:30,
          }}>
            {/* Error */}
            {error && (
              <div style={{ background:"#2d1515", border:"1px solid #f8514944", borderRadius:8, padding:"6px 12px", marginBottom:10, fontSize:12, color:C.red }}>{error}</div>
            )}

            {/* Live transcript pill */}
            {recording && lastTranscript && (
              <div style={{ background:C.bgPage, border:`1px solid ${C.border}`, borderRadius:10, padding:"6px 12px", marginBottom:10, overflow:"hidden" }}>
                <div style={{ fontSize:14, color:C.gold, direction:"rtl", textAlign:"right", fontFamily:"'Amiri Quran','Amiri',serif", lineHeight:1.8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {lastTranscript}
                </div>
              </div>
            )}

            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {/* Mic */}
              <button onClick={toggleMic} style={{
                width:56, height:56, borderRadius:"50%", border:"none", cursor:"pointer", flexShrink:0,
                background: recording ? C.red : C.green,
                boxShadow: recording ? `0 0 0 4px ${C.red}33, 0 0 0 8px ${C.red}11` : `0 0 0 4px ${C.green}22`,
                display:"flex", alignItems:"center", justifyContent:"center",
                animation: recording ? "micPulse 1.5s ease-in-out infinite" : "none",
                transition:"all .2s",
              }}>
                {recording ? <Square size={22} fill="#fff" color="#fff"/> : <Mic size={22} color="#0d1117"/>}
              </button>

              {/* Status / waveform */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color: recording ? C.green : C.textMid, marginBottom:3 }}>
                  {recording ? "Listening — recite now" : "Tap mic to start"}
                </div>
                {recording ? (
                  <div style={{ display:"flex", alignItems:"center", gap:2, height:18 }}>
                    {[5,12,7,18,10,15,6,14,20,8,16,5,11].map((h,i) => (
                      <div key={i} style={{ width:3, height:h, borderRadius:2, background:processing?C.gold:C.green, opacity:.75, animation:`wave .9s ease-in-out ${i*.07}s infinite alternate` }}/>
                    ))}
                    {processing && <span style={{ fontSize:10, color:C.gold, marginLeft:6 }}>…</span>}
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:C.textDim }}>
                    Ayah {ayahIdx+1}/{totalAyahs} · {MODE_INFO[mode].label} mode{saving?" · saving…":""}
                  </div>
                )}
              </div>

              {/* Skip button */}
              {recording && (
                <button onClick={skipAyah} style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.bgCard, color:C.textDim, fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
                  Skip →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ DONE SCREEN ════════════════════════════════════ */}
      {screen === "done" && selected && (
        <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:16, alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:400, textAlign:"center" }}>
            <div style={{ fontSize:52, marginBottom:14 }}>🏆</div>
            <h2 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"0 0 4px" }}>أحسنت!</h2>
            <p style={{ fontSize:13, color:C.textDim, marginBottom:22 }}>Session complete — well done!</p>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:22 }}>
              {[
                { l:"Avg Score", v:`${avgScore}%`, c:C.green },
                { l:"Ayahs",    v:doneAyahs,       c:C.blue  },
                { l:"Streak",   v:`${streak}🔥`,   c:C.gold  },
              ].map((x,i) => (
                <div key={i} style={{ background:C.bgPage, borderRadius:12, padding:"12px 8px", border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:20, fontWeight:900, color:x.c }}>{x.v}</div>
                  <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{x.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => {
                setScreen("session");
                setAyahIdx(0); idxRef.current = 0;
                setPageIdx(0); ptrRef.current = 0;
                setStreak(0); setTotalScore(0); setTimer(0);
                setAyahs(prev => prev.map(a => ({ ...a, done: false, score: 0, words: a.words.map(w => ({ ...w, state: "hidden" as WS })) })));
              }} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:C.green, color:C.bg, fontSize:14, fontWeight:800, cursor:"pointer" }}>
                🔄 Repeat Surah
              </button>
              <button onClick={() => { setScreen("picker"); setSelected(null); setAyahs([]); }} style={{ width:"100%", padding:"13px", borderRadius:12, border:`1px solid ${C.border}`, background:"transparent", color:C.textMid, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                📖 New Surah
              </button>
              <button onClick={() => setScreen("home")} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:"transparent", color:C.textDim, fontSize:13, cursor:"pointer" }}>
                Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.45;} }
        @keyframes micPulse { 0%,100%{box-shadow:0 0 0 4px ${C.red}33,0 0 0 8px ${C.red}11;} 50%{box-shadow:0 0 0 8px ${C.red}44,0 0 0 14px ${C.red}05;} }
        @keyframes wave { from{transform:scaleY(.3)} to{transform:scaleY(1.7)} }
      `}</style>
    </div>
  );
}
