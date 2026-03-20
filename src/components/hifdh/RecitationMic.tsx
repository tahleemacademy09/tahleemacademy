/*
  RecitationMic.tsx — Tarteel-style Hifdh Practice
  
  Core matching algorithm:
  - Accumulate ALL transcript text for the current ayah in bufRef
  - On each chunk: append to buf, run greedy forward scan from 0
  - Take max(newPtr, ptrRef) so pointer never goes backwards
  - No transcript box — words reveal directly in the Quran text
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, ChevronLeft, ChevronRight } from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ── Types ────────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WS = "hidden" | "revealed" | "current";
interface Word { raw: string; norm: string; state: WS; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ── Arabic normalization ─────────────────────────────────── */
const stripNoise = (t: string) =>
  // Keep only Arabic Unicode block + spaces; strip Latin, digits, punctuation
  t.replace(/[^\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g, " ")
   .replace(/\s+/g, " ").trim();

const nrm = (t: string) =>
  t
   // Strip ALL Arabic diacritics / harakat
   .replace(/[\u064B-\u065F\u0610-\u061A\u0670\u0671]/g, "")
   // Normalize alef variants → bare alef
   .replace(/[\u0622\u0623\u0625\u0627\u0671\u0672\u0673\u0675]/g, "ا")
   // ٱ (alef wasla)
   .replace(/\u0671/g, "ا")
   // tah marbuta → hah
   .replace(/\u0629/g, "ه")
   // alef maqsura → ya
   .replace(/\u0649/g, "ي")
   // tatweel
   .replace(/\u0640/g, "")
   // Lam-alef ligatures (presentation forms) → ل + ا
   .replace(/[\uFEFB\uFEFC\uFEF7\uFEF8\uFEF5\uFEF6]/g, "لا")
   // Strip remaining non-letter Arabic (punctuation, decorations)
   .replace(/[\u0600-\u060F\u061B-\u061F\u06D4\u06DD\u06DE]/g, "")
   .replace(/\s+/g, " ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g, "").trim()
    .split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: nrm(w), state: "hidden" as WS }));

/* ── Fuzzy word match ─────────────────────────────────────── */
const lev = (a: string, b: string): number => {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
};

const wordMatch = (spoken: string, target: string): boolean => {
  const s = nrm(spoken), t = nrm(target);
  if (!s || !t) return false;
  if (s === t) return true;
  // prefix match (handles partial pronunciation)
  const pLen = Math.min(3, Math.min(s.length, t.length));
  if (pLen >= 2 && s.slice(0, pLen) === t.slice(0, pLen)) return true;
  // substring
  if (t.length >= 3 && s.includes(t)) return true;
  if (s.length >= 3 && t.includes(s)) return true;
  // levenshtein — allow ~30% edit distance
  return lev(s, t) <= Math.max(1, Math.floor(Math.max(s.length, t.length) * 0.35));
};

/*
  matchChunk — matches a NEW transcript chunk against ayah words
  starting from `startPtr` (current position). Never rewinds.

  Algorithm:
  - Walk chunk tokens left→right
  - For each token, try to match against words[ptr], words[ptr+1], words[ptr+2]
    (small lookahead handles reordering / missed words)
  - On match, advance ptr
  - Return highest ptr reached (never < startPtr)
*/
const matchChunk = (tokens: string[], words: Word[], startPtr: number): number => {
  let ptr = startPtr;
  const LOOKAHEAD = 3; // allow skipping up to 3 words for Deepgram gaps
  for (let ti = 0; ti < tokens.length && ptr < words.length; ti++) {
    // Try to match token against the next few words (lookahead)
    for (let la = 0; la < LOOKAHEAD && ptr + la < words.length; la++) {
      if (wordMatch(tokens[ti], words[ptr + la].norm)) {
        ptr = ptr + la + 1; // advance past matched word (and any skipped ones)
        break;
      }
    }
  }
  return ptr; // always >= startPtr since we never decrement
};

/* ── Audio helpers ────────────────────────────────────────── */
const getMime = (): string => {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const dgContentType = (m: string) =>
  m.includes("mp4") ? "audio/mp4" : m.includes("ogg") ? "audio/ogg" : "audio/webm";
const fmtTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ── Page grouping ────────────────────────────────────────── */
const buildPages = (ayahs: Ayah[]): Ayah[][] => {
  if (ayahs.length <= 10) return [ayahs];
  const pages: Ayah[][] = [];
  let page: Ayah[] = [], wc = 0;
  for (const a of ayahs) {
    if (page.length > 0 && (page.length >= 5 || wc + a.words.length > 50)) {
      pages.push(page); page = []; wc = 0;
    }
    page.push(a); wc += a.words.length;
  }
  if (page.length) pages.push(page);
  return pages;
};

/* ── Colors ───────────────────────────────────────────────── */
const G900 = "#0f2318";
const G700 = "#1a3d24";
const G500 = "#276749";
const G400 = "#38a169";
const GOLD = "#b7791f";
const GOLD_LT = "#fffbeb";
const RED  = "#c0392b";
const MUTED = "#718096";
const BORDER = "#e2e8f0";
const PAGE_BG = "#fdfaf4";

/* ══════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  /* ─ UI state ─ */
  const [surahs,     setSurahs]     = useState<SurahMeta[]>([]);
  const [search,     setSearch]     = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selected,   setSelected]   = useState<SurahMeta | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [finished,   setFinished]   = useState(false);

  /* ─ Ayah / page state ─ */
  const [ayahs,    setAyahs]    = useState<Ayah[]>([]);
  const [pages,    setPages]    = useState<Ayah[][]>([]);
  const [pageIdx,  setPageIdx]  = useState(0);
  const [ayahIdx,  setAyahIdx]  = useState(0);

  /* ─ Recording state ─ */
  const [recording,  setRecording]  = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error,      setError]      = useState("");
  const [timer,      setTimer]      = useState(0);
  const [stats,      setStats]      = useState({ correct: 0, ayahs: 0 });
  const [saving,     setSaving]     = useState(false);

  /* ─ Refs ─ */
  const mrRef      = useRef<MediaRecorder | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const initRef    = useRef<Blob | null>(null);       // WebM header blob
  const audioRef   = useRef<Blob[]>([]);              // full audio for saving
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // These are the core matching refs — sync'd immediately, not via useEffect delay
  const recRef     = useRef(false);
  const mimeRef    = useRef("");
  const idxRef     = useRef(0);         // current global ayah index
  const ayahsRef   = useRef<Ayah[]>([]); // always current ayahs
  const ptrRef     = useRef(0);         // word pointer in current ayah (never goes back)
  const bufRef     = useRef("");        // accumulated transcript for current ayah

  const activeRef  = useRef<HTMLDivElement | null>(null);

  /* Sync refs immediately */
  const syncAyahIdx = (i: number) => { idxRef.current = i; setAyahIdx(i); };

  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);
  useEffect(() => { recRef.current = recording; }, [recording]);

  /* Auto-scroll active ayah */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [ayahIdx]);

  /* Load surah list */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json())
      .then(d => { if (d.code === 200) setSurahs(d.data); });
    return killMic;
  }, []);

  /* Load ayahs when surah selected */
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setAyahs([]); setPages([]); setFinished(false);
    syncAyahIdx(0); setPageIdx(0);
    ptrRef.current = 0; bufRef.current = "";
    killMic();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r => r.json())
      .then(d => {
        if (d.code === 200) {
          const loaded: Ayah[] = d.data.ayahs.map((a: any) => ({
            number: a.number, numberInSurah: a.numberInSurah,
            text: a.text, words: toWords(a.text),
          }));
          setAyahs(loaded);
          ayahsRef.current = loaded;
          setPages(buildPages(loaded));
        }
      })
      .finally(() => setLoading(false));
  }, [selected]);

  /* Timer */
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  /* ── Kill mic ──────────────────────────────────────────── */
  const killMic = () => {
    recRef.current = false;
    if (mrRef.current) { try { mrRef.current.stop(); } catch (_) {} mrRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  /* ── Advance to next ayah ──────────────────────────────── */
  const advanceAyah = useCallback((completedIdx: number) => {
    saveAyah(completedIdx);
    setStats(s => ({ ...s, ayahs: s.ayahs + 1 }));

    // Reset buffer + pointer for next ayah
    ptrRef.current = 0;
    bufRef.current = "";

    const next = completedIdx + 1;
    idxRef.current = next;

    if (next >= ayahsRef.current.length) {
      setFinished(true); setRecording(false); killMic(); return;
    }

    setAyahIdx(next);
    setTimer(0);

    // Auto-advance page if needed
    setPages(pp => {
      const ni = pp.findIndex(p =>
        p.some(a => a.numberInSurah === ayahsRef.current[next]?.numberInSurah)
      );
      if (ni >= 0) setPageIdx(ni);
      return pp;
    });

    // Reset next ayah's word states
    setAyahs(prev => {
      const u = [...prev];
      if (u[next]) u[next] = { ...u[next], words: u[next].words.map(w => ({ ...w, state: "hidden" as WS })) };
      return u;
    });
  }, []);

  /* ── Core: process transcript chunk from Deepgram ─────────
     Algorithm:
     1. Strip non-Arabic noise from chunk
     2. Append to per-ayah buffer
     3. Tokenize full buffer, run greedy scan against ayah words
     4. New pointer = max(greedyResult, currentPtr) — never backtrack
     5. Update word states
  ─────────────────────────────────────────────────────────── */
  const processTranscript = useCallback((raw: string) => {
    if (!raw.trim() || !recRef.current) return;

    const clean = stripNoise(raw);
    if (!clean) return;

    const idx   = idxRef.current;
    const words = ayahsRef.current[idx]?.words;
    if (!words || words.length === 0) return;

    // Tokenize only the NEW chunk — match against words from current pointer
    const tokens = clean.split(/\s+/).filter(Boolean).map(nrm).filter(Boolean);
    if (tokens.length === 0) return;

    console.log("[Hifdh] chunk:", clean, "| tokens:", tokens, "| ptr:", ptrRef.current, "| target:", words[ptrRef.current]?.norm);

    const newPtr = matchChunk(tokens, words, ptrRef.current);

    console.log("[Hifdh] newPtr:", newPtr, "oldPtr:", ptrRef.current);

    if (newPtr === ptrRef.current) return; // nothing matched
    ptrRef.current = newPtr;

    setAyahs(prev => {
      const u = [...prev];
      if (!u[idx]) return prev;
      const ayah = {
        ...u[idx],
        words: u[idx].words.map((w, wi) => ({
          ...w,
          state: wi < newPtr ? "revealed" : wi === newPtr ? "current" : "hidden" as WS,
        })),
      };
      u[idx] = ayah;
      if (newPtr >= ayah.words.length) {
        setStats(s => ({ ...s, correct: s.correct + ayah.words.length }));
        setTimeout(() => advanceAyah(idx), 150);
      }
      return u;
    });
  }, [advanceAyah]);

  /* ── Send audio chunk to Deepgram (then Groq fallback) ──── */
  const transcribe = useCallback(async (blob: Blob) => {
    if (blob.size < 200 || !recRef.current) return;
    setProcessing(true);
    try {
      let text = "";

      if (DEEPGRAM_KEY) {
        const res = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${DEEPGRAM_KEY}`,
              "Content-Type": dgContentType(mimeRef.current || blob.type),
            },
            body: blob,
          }
        );
        if (res.ok) {
          const data = await res.json();
          text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        } else {
          console.warn("Deepgram", res.status);
        }
      }

      if (!text && GROQ_KEY) {
        const ext = (mimeRef.current || "").includes("mp4") ? "mp4"
                  : (mimeRef.current || "").includes("ogg") ? "ogg" : "webm";
        const fd = new FormData();
        fd.append("file", new File([blob], `a.${ext}`, { type: mimeRef.current || "audio/webm" }));
        fd.append("model", "whisper-large-v3-turbo");
        fd.append("language", "ar");
        fd.append("response_format", "json");
        fd.append("prompt", "بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        fd.append("temperature", "0");
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: fd,
        });
        if (res.status !== 429 && res.ok) {
          text = (await res.json())?.text || "";
        }
      }

      if (text) processTranscript(text);
      setError("");
    } catch (e: any) {
      console.error("Transcribe error:", e?.message);
    } finally {
      setProcessing(false);
    }
  }, [processTranscript]);

  /* ── Single MediaRecorder, 1.5s timeslice ─────────────────
     First data event = WebM init (headers + audio).
     Subsequent events = prepend init so Deepgram can decode.
  ─────────────────────────────────────────────────────────── */
  const startRec = useCallback((stream: MediaStream) => {
    if (!recRef.current) return;
    initRef.current = null;
    const mr = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : {});
    mr.ondataavailable = e => {
      if (!e.data?.size || e.data.size === 0) return;
      audioRef.current.push(e.data);
      if (!initRef.current) {
        initRef.current = e.data;
        transcribe(e.data);
        return;
      }
      transcribe(new Blob([initRef.current, e.data], { type: mimeRef.current || "audio/webm" }));
    };
    mr.start(1500);
    mrRef.current = mr;
  }, [transcribe]);

  /* ── Toggle mic ────────────────────────────────────────── */
  const toggleMic = async () => {
    if (recording) { setRecording(false); killMic(); return; }
    setError("");
    ptrRef.current = 0; bufRef.current = "";
    setTimer(0); setStats({ correct: 0, ayahs: 0 });
    // Reset all word states
    setAyahs(prev => prev.map(a => ({ ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WS })) })));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s; audioRef.current = []; mimeRef.current = getMime();
      recRef.current = true; setRecording(true);
      startRec(s);
    } catch {
      setError("Microphone access denied.");
    }
  };

  /* ── Save ayah to Supabase ─────────────────────────────── */
  const saveAyah = async (idx: number) => {
    if (!userId || !selected) return;
    const ayah = ayahsRef.current[idx]; if (!ayah) return;
    setSaving(true);
    try {
      const correct = ayah.words.filter(w => w.state === "revealed").length;
      const pct = ayah.words.length > 0 ? Math.round((correct / ayah.words.length) * 100) : 0;
      let audioUrl = "";
      if (audioRef.current.length > 0) {
        const blob = new Blob(audioRef.current, { type: mimeRef.current || "audio/webm" });
        const ext = mimeRef.current.includes("mp4") ? "mp4" : mimeRef.current.includes("ogg") ? "ogg" : "webm";
        const path = `${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.${ext}`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) {
          const { data: u } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          audioUrl = u?.publicUrl ?? "";
        }
        audioRef.current = [];
      }
      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, ayah_end: ayah.numberInSurah,
          audio_url: audioUrl, ai_score: pct, status: "pending",
          transcript: bufRef.current,
          word_results: ayah.words.map(x => ({ word: x.raw, result: x.state })),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id: userId, surah_number: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, accuracy_score: pct, correct, wrong: 0, duration: timer,
        }),
      ]);
      const { data: ex } = await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed").eq("user_id", userId).eq("surah_num", selected.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({
          last_reviewed: new Date().toISOString(),
          best_accuracy: Math.max(ex.best_accuracy ?? 0, pct),
          times_reviewed: (ex.times_reviewed ?? 0) + 1,
        }).eq("id", ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          last_reviewed: new Date().toISOString(), best_accuracy: pct, times_reviewed: 1,
        });
      }
    } catch (_) {}
    setSaving(false);
  };

  /* ── Derived ───────────────────────────────────────────── */
  const currentPage = pages[pageIdx] ?? [];
  const totalW  = ayahs.reduce((s, a) => s + a.words.length, 0);
  const doneW   = ayahs.reduce((s, a) => s + a.words.filter(w => w.state === "revealed").length, 0);
  const pct     = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;
  const filtered = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search)
  );

  /* ══════════════════════ RENDER ═════════════════════════ */
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100svh", background: PAGE_BG,
      maxWidth: 640, margin: "0 auto", overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
    }}>

      {/* ═══ HEADER ════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0, background: G700, zIndex: 20,
        padding: "0 16px",
        display: "flex", alignItems: "stretch",
        minHeight: 60,
      }}>
        {/* Surah info */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{selected.englishName}</span>
                <span style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.65)" }}>{selected.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
                {recording
                  ? `Ayah ${ayahIdx + 1}/${ayahs.length} · ${fmtTime(timer)}${processing ? " · ⏳" : ""}`
                  : `${ayahs.length} ayahs · tap mic to begin`
                }
              </div>
            </>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.8)" }}>Hifdh Practice</span>
          )}
        </div>

        {/* Progress % */}
        {selected && pct > 0 && (
          <div style={{ display: "flex", alignItems: "center", paddingRight: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{pct}%</span>
          </div>
        )}

        {/* Mic button */}
        <button onClick={toggleMic} style={{
          width: 52, alignSelf: "center",
          height: 52, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,.2)",
          cursor: "pointer", flexShrink: 0,
          background: recording ? RED : "rgba(255,255,255,.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .2s",
          animation: recording ? "micRing 1.5s ease-in-out infinite" : "none",
          boxShadow: recording ? `0 0 0 4px ${RED}44` : "none",
        }}>
          {recording
            ? <Square size={20} fill="#fff" color="#fff" />
            : <Mic size={20} color="#fff" />
          }
        </button>

        {/* Change surah */}
        <button onClick={() => setShowPicker(true)} style={{
          marginLeft: 10, alignSelf: "center",
          padding: "6px 11px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,.25)",
          background: "transparent", color: "rgba(255,255,255,.8)",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          {selected ? "Change" : "Select"}
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ flexShrink: 0, height: 3, background: "rgba(0,0,0,.08)" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg,${G500},${GOLD})`,
          transition: "width .5s",
        }} />
      </div>

      {/* Waveform strip when recording */}
      {recording && (
        <div style={{
          flexShrink: 0, background: G900, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
        }}>
          {[7, 14, 9, 20, 11, 17, 8, 15, 22, 10, 16, 8, 13].map((h, i) => (
            <div key={i} style={{
              width: 3, height: h, borderRadius: 2,
              background: processing ? GOLD : G400,
              opacity: .85,
              animation: `waveBar .9s ease-in-out ${i * .07}s infinite alternate`,
            }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ flexShrink: 0, background: "#fff5f5", borderBottom: "1px solid #fca5a5", padding: "6px 14px" }}>
          <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>⚠️ {error}</span>
        </div>
      )}

      {/* ═══ SCROLL AREA ═══════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>

        {/* Empty state */}
        {!selected && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📖</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif", marginBottom: 8 }}>مرحباً بك</div>
            <div style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>Select a surah to begin your Hifdh practice</div>
            <button onClick={() => setShowPicker(true)} style={{
              padding: "13px 32px", borderRadius: 12, border: "none",
              background: G700, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              Choose Surah
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", flexDirection: "column", gap: 12 }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: G500, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: 13, color: MUTED }}>Loading ayahs…</div>
          </div>
        )}

        {/* Finished */}
        {finished && selected && (
          <div style={{ padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, border: `1px solid ${BORDER}`, padding: 28, textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>أحسنت!</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4, marginBottom: 22 }}>Surah Complete — Well done!</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
                {[
                  { l: "Words",  v: stats.correct, c: G500 },
                  { l: "Ayahs", v: stats.ayahs,   c: GOLD },
                  { l: "Time",  v: fmtTime(timer), c: G700 },
                ].map((x, i) => (
                  <div key={i} style={{ background: "#f8fafb", borderRadius: 12, padding: "14px 8px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: x.c }}>{x.v}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setSelected(null); setFinished(false); syncAyahIdx(0); setPageIdx(0); setAyahs([]); setPages([]); setTimer(0); setStats({ correct: 0, ayahs: 0 }); }}
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: G700, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
                📖 New Surah
              </button>
              <button onClick={() => {
                setFinished(false); syncAyahIdx(0); setPageIdx(0); setTimer(0); setStats({ correct: 0, ayahs: 0 });
                ptrRef.current = 0; bufRef.current = "";
                const reset = ayahsRef.current.map(a => ({ ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WS })) }));
                setAyahs(reset); ayahsRef.current = reset;
                setPages(buildPages(reset));
              }}
                style={{ width: "100%", padding: 14, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#fff", color: G700, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                🔄 Repeat Surah
              </button>
            </div>
          </div>
        )}

        {/* ══ QURAN PAGE ═════════════════════════════════════ */}
        {selected && !loading && !finished && currentPage.length > 0 && (
          <div style={{ padding: "16px 14px 32px" }}>

            {/* Bismillah */}
            {pageIdx === 0 && selected.number !== 9 && (
              <div style={{
                textAlign: "center", padding: "20px 8px 24px",
                fontFamily: "'Amiri Quran', 'Amiri', serif",
                fontSize: 28, color: G700, lineHeight: 2.4, direction: "rtl",
              }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </div>
            )}

            {/* Page marker */}
            {pages.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: BORDER }} />
                <div style={{ fontSize: 11, color: MUTED, padding: "2px 10px", border: `1px solid ${BORDER}`, borderRadius: 20, background: "#fff" }}>
                  Page {pageIdx + 1}/{pages.length} · Ayahs {currentPage[0].numberInSurah}–{currentPage[currentPage.length - 1].numberInSurah}
                </div>
                <div style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
            )}

            {/* Ayah cards */}
            {currentPage.map((ayah, ai) => {
              const isActive = ayah.numberInSurah === ayahsRef.current[ayahIdx]?.numberInSurah;
              const isDone   = ayah.words.length > 0 && ayah.words.every(w => w.state === "revealed");
              const revCount = ayah.words.filter(w => w.state === "revealed").length;
              const ayahPct  = ayah.words.length > 0 ? Math.round((revCount / ayah.words.length) * 100) : 0;

              return (
                <div
                  key={ayah.numberInSurah}
                  ref={isActive ? (el: any) => { activeRef.current = el; } : undefined}
                  style={{
                    marginBottom: ai < currentPage.length - 1 ? 6 : 0,
                    borderRadius: 14,
                    border: `1px solid ${isDone ? G500 + "44" : isActive ? GOLD + "55" : BORDER}`,
                    background: isDone ? "rgba(39,103,73,.03)" : isActive ? "rgba(183,121,31,.04)" : "#fff",
                    overflow: "hidden",
                    transition: "border .3s, background .3s",
                    borderLeft: `4px solid ${isDone ? G500 : isActive ? GOLD : "transparent"}`,
                  }}
                >
                  {/* Ayah text */}
                  <div style={{
                    padding: "20px 16px 16px",
                    direction: "rtl",
                    fontFamily: "'Amiri Quran', 'Amiri', serif",
                    fontSize: 26,
                    lineHeight: 3.4,
                    textAlign: "right",
                    wordSpacing: 4,
                  }}>
                    {ayah.words.map((w, wi) => {
                      const rev = w.state === "revealed";
                      const cur = w.state === "current";
                      return (
                        <span key={wi} style={{
                          display: "inline-block",
                          margin: "0 3px",
                          transition: "color .18s, background .18s, transform .18s",
                          transform: rev ? "translateY(0)" : "none",
                          ...(rev ? {
                            color: G500,
                          } : cur ? {
                            color: GOLD,
                            background: GOLD_LT,
                            borderRadius: 6,
                            padding: "0 4px",
                            border: `2px solid ${GOLD}`,
                            animation: "wPulse .8s ease-in-out infinite",
                          } : {
                            // Hidden: grey pill proportional to word length
                            color: "transparent",
                            background: isActive ? "#bbb" : "#d5d5d5",
                            borderRadius: 5,
                            minWidth: `${Math.max(w.raw.length * 10, 22)}px`,
                            height: "0.58em",
                            verticalAlign: "middle",
                            display: "inline-block",
                          })
                        }}>
                          {w.state === "hidden"
                            ? "\u00A0".repeat(Math.max(w.raw.length, 2))
                            : w.raw
                          }
                        </span>
                      );
                    })}
                    {/* Ayah number ornament */}
                    <span style={{
                      fontFamily: "'Amiri', serif",
                      fontSize: 18,
                      margin: "0 6px",
                      color: isDone ? G500 : isActive ? GOLD : "rgba(183,121,31,.35)",
                      fontWeight: isActive ? 700 : 400,
                      transition: "color .3s",
                    }}>
                      ﴿{ayah.numberInSurah}﴾
                    </span>
                  </div>

                  {/* Progress bar — only for active/done ayah */}
                  {(isActive || isDone) && (
                    <div style={{ height: 3, background: "#eee" }}>
                      <div style={{
                        width: `${ayahPct}%`, height: "100%",
                        background: isDone ? G500 : GOLD,
                        transition: "width .3s",
                      }} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Page navigation */}
            {pages.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, padding: "0 4px" }}>
                <button
                  disabled={pageIdx === 0}
                  onClick={() => { if (pageIdx > 0) setPageIdx(p => p - 1); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "9px 16px", borderRadius: 10,
                    border: `1px solid ${BORDER}`, background: "#fff",
                    color: pageIdx === 0 ? MUTED : G700,
                    fontSize: 13, fontWeight: 700,
                    cursor: pageIdx === 0 ? "default" : "pointer",
                    opacity: pageIdx === 0 ? .4 : 1,
                  }}>
                  <ChevronRight size={14} /> Prev
                </button>

                {/* Dots */}
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {pages.map((_, i) => (
                    <div key={i} style={{
                      width: i === pageIdx ? 20 : 6, height: 6, borderRadius: 3,
                      background: i === pageIdx ? G700 : i < pageIdx ? G500 : BORDER,
                      transition: "all .3s",
                    }} />
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (pageIdx < pages.length - 1) setPageIdx(p => p + 1);
                    else setFinished(true);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "9px 16px", borderRadius: 10,
                    border: `1px solid ${BORDER}`, background: "#fff",
                    color: G700, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>
                  Next <ChevronLeft size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ SURAH PICKER (bottom sheet) ═══════════════════ */}
      {showPicker && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", flexDirection: "column" }}
          onClick={e => { if (e.target === e.currentTarget) setShowPicker(false); }}
        >
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "#fff", borderRadius: "20px 20px 0 0",
            maxHeight: "88vh", display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "16px 18px 10px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: G700 }}>اختر السورة · Select Surah</div>
              <button onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", fontSize: 22, color: MUTED, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search surah name…"
                autoFocus
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, color: G700, boxSizing: "border-box" as const, outline: "none" }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 32px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {filtered.slice(0, 114).map(s => (
                <div key={s.number}
                  onClick={() => { setSelected(s); setSearch(""); setShowPicker(false); setFinished(false); }}
                  style={{
                    background: selected?.number === s.number ? "#f0fff4" : "#fafafa",
                    border: `1px solid ${selected?.number === s.number ? G500 : BORDER}`,
                    borderRadius: 12, padding: "10px 12px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "all .15s",
                  }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: GOLD_LT, border: `1.5px solid ${GOLD}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 900, color: GOLD, flexShrink: 0,
                  }}>
                    {s.number}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.englishName}</div>
                    <div style={{ fontSize: 13, fontFamily: "'Amiri',serif", color: GOLD }}>{s.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes micRing {
          0%,100% { box-shadow: 0 0 0 4px ${RED}55, 0 0 0 8px ${RED}22; }
          50%      { box-shadow: 0 0 0 8px ${RED}55, 0 0 0 16px ${RED}0a; }
        }
        @keyframes wPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: .45; }
        }
        @keyframes waveBar {
          from { transform: scaleY(.3); }
          to   { transform: scaleY(1.7); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
