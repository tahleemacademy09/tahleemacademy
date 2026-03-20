/*
  src/components/hifdh/RecitationMic.tsx

  - Single mic button: tap to START, tap again to STOP
  - Words reveal in real-time as you recite each chunk
  - When all words in an ayah are revealed → instantly loads next ayah
  - No countdown, no pause between ayahs
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, MicOff, Square } from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";

/* ─── Types ─────────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WordState = "hidden" | "revealed" | "current";
interface Word { raw: string; norm: string; state: WordState; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ─── Arabic normaliser ─────────────────────────────────────── */
const normalise = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "")
   .replace(/[أإآٱ]/g, "ا")
   .replace(/ة/g, "ه")
   .replace(/ى/g, "ي")
   .replace(/\u0640/g, "")
   .replace(/\s+/g, " ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g, "").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: normalise(w), state: "hidden" as WordState }));

/* ─── Fuzzy word matching ───────────────────────────────────── */
const lev = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

const wordMatches = (spoken: string, target: string): boolean => {
  const s = normalise(spoken), t = normalise(target);
  if (!s || !t) return false;
  if (s === t) return true;
  const minLen = Math.min(4, Math.min(s.length, t.length));
  if (minLen >= 3 && s.slice(0, minLen) === t.slice(0, minLen)) return true;
  if (t.length >= 4 && s.includes(t)) return true;
  if (s.length >= 4 && t.includes(s)) return true;
  return lev(s, t) <= Math.floor(Math.max(s.length, t.length) * 0.3);
};

/* ─── Best mime type for this device ───────────────────────── */
const getBestMimeType = (): string => {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""]) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
};

const toDeepgramCT = (mime: string) =>
  mime.includes("mp4") ? "audio/mp4" : mime.includes("ogg") ? "audio/ogg" : "audio/webm";

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;

/* ─── Colours ───────────────────────────────────────────────── */
const G700="#1a3d24", G500="#276749", G100="#f0fff4";
const GOLD="#b7791f", GOLD_LT="#fffbeb";
const RED="#c0392b", RED_LT="#fff5f5";
const MUTED="#7a9e88", BORDER="#e2e8f0", CREAM="#fffdf5";

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  const [surahs,       setSurahs]       = useState<SurahMeta[]>([]);
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<SurahMeta | null>(null);
  const [ayahs,        setAyahs]        = useState<Ayah[]>([]);
  const [ayahIdx,      setAyahIdx]      = useState(0);
  const [loadingAyahs, setLoadingAyahs] = useState(false);

  /* recording is simply on/off — no "countdown" / "done" phase complexity */
  const [recording,    setRecording]    = useState(false);
  const [finished,     setFinished]     = useState(false);

  const [timer,        setTimer]        = useState(0);
  const [transcript,   setTranscript]   = useState("");
  const [error,        setError]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [processing,   setProcessing]   = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, ayahs: 0 });

  /* refs */
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const initChunkRef = useRef<Blob | null>(null);   // WebM header blob (first data event)
  const fullAudioRef = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const ayahIdxRef   = useRef(0);
  const ayahsRef     = useRef<Ayah[]>([]);
  const pointerRef   = useRef(0);
  const recordingRef = useRef(false);          // sync ref for async callbacks
  const mimeRef      = useRef("");
  const fullTransRef = useRef("");             // cumulative transcript per ayah

  useEffect(() => { ayahIdxRef.current = ayahIdx; }, [ayahIdx]);
  useEffect(() => { ayahsRef.current   = ayahs;   }, [ayahs]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  /* ── Load surahs ────────────────────────────────────────────── */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json())
      .then(d => { if (d.code === 200) setSurahs(d.data); });
    return () => killMic();
  }, []);

  /* ── Load ayahs when surah chosen ──────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    setLoadingAyahs(true);
    setAyahIdx(0); setAyahs([]);
    setRecording(false); setFinished(false);
    pointerRef.current = 0; fullTransRef.current = "";
    killMic();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r => r.json())
      .then(d => {
        if (d.code === 200)
          setAyahs(d.data.ayahs.map((a: any) => ({
            number: a.number, numberInSurah: a.numberInSurah,
            text: a.text, words: toWords(a.text),
          })));
      })
      .finally(() => setLoadingAyahs(false));
  }, [selected]);

  /* ── Session timer ──────────────────────────────────────────── */
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  /* ══ Advance to next ayah (instant, no countdown) ═══════════ */
  const advanceAyah = useCallback((idx: number) => {
    saveAyah(idx);
    setSessionStats(s => ({ ...s, ayahs: s.ayahs + 1 }));
    fullTransRef.current = "";
    setTranscript("");
    pointerRef.current = 0;

    const next = idx + 1;
    if (next < ayahsRef.current.length) {
      setAyahIdx(next);
      setTimer(0);
      // Reset words for next ayah
      setAyahs(prev => {
        const u = [...prev];
        if (u[next]) u[next] = { ...u[next], words: u[next].words.map(w => ({ ...w, state: "hidden" as WordState })) };
        return u;
      });
    } else {
      // Surah complete
      setFinished(true);
      setRecording(false);
      killMic();
    }
  }, []);

  /* ══ Process incoming transcript chunk ══════════════════════ */
  const processTranscript = useCallback((newText: string) => {
    if (!newText.trim() || !recordingRef.current) return;

    fullTransRef.current = (fullTransRef.current + " " + newText).trim();
    setTranscript(fullTransRef.current);

    const idx   = ayahIdxRef.current;
    const words = ayahsRef.current[idx]?.words;
    if (!words) return;

    const tokens = fullTransRef.current.split(/\s+/).filter(Boolean);
    let ptr = pointerRef.current;

    // Advance pointer for every matched word
    while (ptr < words.length) {
      if (tokens.some(tok => wordMatches(tok, words[ptr].norm))) ptr++;
      else break;
    }

    if (ptr === pointerRef.current) return;
    pointerRef.current = ptr;

    setAyahs(prev => {
      const updated = [...prev];
      const ayah    = { ...updated[idx], words: updated[idx].words.map((w, wi) => ({
        ...w,
        state: wi < ptr ? "revealed" : wi === ptr ? "current" : "hidden" as WordState,
      })) };
      updated[idx] = ayah;

      // All words revealed → instantly go to next ayah
      if (ptr >= ayah.words.length) {
        setSessionStats(s => ({ ...s, correct: s.correct + ayah.words.length }));
        // Use setTimeout(0) to avoid state-in-state update
        setTimeout(() => advanceAyah(idx), 0);
      }
      return updated;
    });
  }, [advanceAyah]);

  /* ══ Send blob to Deepgram ══════════════════════════════════ */
  const sendToDeepgram = useCallback(async (blob: Blob) => {
    if (blob.size < 500) return;
    console.log(`[DG] Sending blob: size=${blob.size} type=${blob.type} mime=${mimeRef.current} keyLen=${DEEPGRAM_KEY?.length ?? 0}`);
    setProcessing(true);
    try {
      if (!DEEPGRAM_KEY) {
        setError("VITE_DEEPGRAM_API_KEY not set in Vercel environment variables");
        return;
      }
      const res = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false",
        {
          method:  "POST",
          headers: {
            Authorization:  `Token ${DEEPGRAM_KEY}`,
            "Content-Type": toDeepgramCT(mimeRef.current || blob.type),
          },
          body: blob,
        }
      );
      if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text().catch(() => "")}`);
      const data = await res.json();
      const text: string = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      if (text) processTranscript(text);
      setError("");
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      console.error("Deepgram error:", msg);
      setError(`Transcription failed: ${msg}`);
    } finally {
      setProcessing(false);
    }
  }, [processTranscript]);

  /* ══ Single MediaRecorder with timeslice ════════════════════
     WHY: Creating a new MediaRecorder every 4 s means only the
     first instance writes WebM container headers (EBML + Tracks).
     Subsequent instances produce header-less blobs that Deepgram
     cannot decode → 4xx → catch → "Transcription failed".
     FIX: One MediaRecorder, timeslice=4000. Save the first data
     event as the init blob and prepend it to every later chunk so
     every blob sent to Deepgram is a complete decodable file.
  ════════════════════════════════════════════════════════════ */
  const startRecording = useCallback((stream: MediaStream) => {
    if (!recordingRef.current) return;
    initChunkRef.current = null;

    const mr = new MediaRecorder(
      stream,
      mimeRef.current ? { mimeType: mimeRef.current } : {},
    );

    mr.ondataavailable = e => {
      if (!e.data?.size || e.data.size === 0) return;
      fullAudioRef.current.push(e.data);

      if (!initChunkRef.current) {
        // First event: WebM headers + first 4 s of audio — store & send directly.
        initChunkRef.current = e.data;
        if (e.data.size >= 500) sendToDeepgram(e.data);
        return;
      }

      // Subsequent events: prepend init header so Deepgram can decode.
      const blob = new Blob(
        [initChunkRef.current, e.data],
        { type: mimeRef.current || "audio/webm" },
      );
      if (blob.size >= 500) sendToDeepgram(blob);
    };

    mr.start(4000); // fires ondataavailable every 4 s, single instance
    mediaRecRef.current = mr;
  }, [sendToDeepgram]);

  /* ══ Kill mic entirely ══════════════════════════════════════ */
  const killMic = () => {
    recordingRef.current = false;
    if (mediaRecRef.current) { try { mediaRecRef.current.stop(); } catch (_) {} mediaRecRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  /* ══ Toggle mic on / off ════════════════════════════════════ */
  const toggleMic = async () => {
    if (recording) {
      /* ── STOP ── */
      setRecording(false);
      killMic();
      return;
    }

    /* ── START ── */
    setError("");
    setFinished(false);
    pointerRef.current   = 0;
    fullTransRef.current = "";
    setTranscript("");
    setTimer(0);
    setSessionStats({ correct: 0, ayahs: 0 });
    resetWords(ayahIdxRef.current);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current    = stream;
      fullAudioRef.current = [];
      mimeRef.current      = getBestMimeType();
      recordingRef.current = true;
      setRecording(true);
      startRecording(stream);
    } catch {
      setError("Microphone access denied. Please allow mic and try again.");
    }
  };

  /* ── Reset word states for one ayah ─────────────────────────── */
  const resetWords = (idx: number) => {
    setAyahs(prev => {
      const u = [...prev];
      if (u[idx]) u[idx] = { ...u[idx], words: u[idx].words.map(w => ({ ...w, state: "hidden" as WordState })) };
      return u;
    });
  };

  /* ── Save ayah result ────────────────────────────────────────── */
  const saveAyah = async (idx: number) => {
    if (!userId || !selected) return;
    const ayah = ayahsRef.current[idx];
    if (!ayah) return;
    setSaving(true);
    try {
      const correct  = ayah.words.filter(w => w.state === "revealed").length;
      const scorePct = ayah.words.length > 0 ? Math.round((correct / ayah.words.length) * 100) : 0;
      let audioUrl   = "";

      if (fullAudioRef.current.length > 0) {
        const blob = new Blob(fullAudioRef.current, { type: mimeRef.current || "audio/webm" });
        const ext  = mimeRef.current.includes("mp4") ? "mp4" : mimeRef.current.includes("ogg") ? "ogg" : "webm";
        const path = `${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.${ext}`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) {
          const { data: u } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          audioUrl = u?.publicUrl ?? "";
        }
        fullAudioRef.current = [];
      }

      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, ayah_end: ayah.numberInSurah,
          audio_url: audioUrl, ai_score: scorePct, status: "pending",
          transcript: fullTransRef.current,
          word_results: ayah.words.map(x => ({ word: x.raw, result: x.state })),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id: userId, surah_number: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, accuracy_score: scorePct,
          correct, wrong: 0, duration: timer,
        }),
      ]);

      const { data: ex } = await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed")
        .eq("user_id", userId).eq("surah_num", selected.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({
          last_reviewed: new Date().toISOString(),
          best_accuracy: Math.max(ex.best_accuracy ?? 0, scorePct),
          times_reviewed: (ex.times_reviewed ?? 0) + 1,
        }).eq("id", ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          last_reviewed: new Date().toISOString(), best_accuracy: scorePct, times_reviewed: 1,
        });
      }
    } catch (_) {}
    setSaving(false);
  };

  /* ─── Derived ───────────────────────────────────────────────── */
  const currentAyah = ayahs[ayahIdx];
  const revealed    = currentAyah?.words.filter(w => w.state === "revealed").length ?? 0;
  const total       = currentAyah?.words.length ?? 0;
  const pct         = total > 0 ? Math.round((revealed / total) * 100) : 0;
  const filtered    = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search));

  /* ─── Style helpers ─────────────────────────────────────────── */
  const card = (ex: React.CSSProperties = {}): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,.06)", ...ex,
  });

  /* ═══════════════════ RENDER ════════════════════════════════ */
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>

      {/* ── Surah picker ── */}
      <div style={card({ padding: 16 })}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: G700 }}>Select Surah · اختر السورة</div>
          {selected && (
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: G500 }}>
              {selected.englishName} — <span style={{ fontFamily: "'Amiri',serif" }}>{selected.name}</span>
            </div>
          )}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search surah…"
          style={{ width: "100%", background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 13px", fontSize: 13, color: G700, marginBottom: 10, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
          {filtered.slice(0, 30).map(s => (
            <div key={s.number}
              onClick={() => { if (!recording) { setSelected(s); setSearch(""); setFinished(false); } }}
              style={{
                flexShrink: 0, padding: "6px 13px", borderRadius: 20, fontSize: 12,
                cursor: recording ? "default" : "pointer", whiteSpace: "nowrap",
                background: selected?.number === s.number ? G700 : "#f8fafb",
                color:      selected?.number === s.number ? "#fff"  : G700,
                border:    `1px solid ${selected?.number === s.number ? G700 : BORDER}`,
                fontWeight: selected?.number === s.number ? 700 : 400,
              }}>
              {s.englishName}<br />
              <span style={{ fontSize: 10, fontFamily: "'Amiri',serif", opacity: .8 }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── No surah selected ── */}
      {!selected && (
        <div style={card({ padding: "48px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>Select a Surah to Begin</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>اختر سورة للبدء</div>
        </div>
      )}

      {selected && loadingAyahs && (
        <div style={card({ padding: 48, textAlign: "center" })}>
          <div style={{ fontSize: 13, color: GOLD }}>Loading ayahs…</div>
        </div>
      )}

      {/* ── Surah complete ── */}
      {finished && selected && (
        <div style={card({ padding: "44px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>Surah Complete!</div>
          <div style={{ fontSize: 13, color: GOLD, marginTop: 4, marginBottom: 20 }}>أحسنت — Well done!</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { l: "Words",  v: sessionStats.correct, bg: G100,    c: G500 },
              { l: "Ayahs",  v: sessionStats.ayahs,   bg: GOLD_LT, c: GOLD },
              { l: "Time",   v: fmt(timer),            bg: "#f8fafb", c: G700 },
            ].map((x, i) => (
              <div key={i} style={{ background: x.bg, borderRadius: 12, padding: "14px 8px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{x.l}</div>
              </div>
            ))}
          </div>
          {saving && <div style={{ fontSize: 11, color: GOLD, marginBottom: 8 }}>Saving…</div>}
          <button
            onClick={() => {
              setFinished(false); setAyahIdx(0); setTimer(0);
              setSessionStats({ correct: 0, ayahs: 0 });
              setAyahs(p => p.map(a => ({ ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WordState })) })));
            }}
            style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: G700, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔄 Start Again · أعد المحاولة
          </button>
        </div>
      )}

      {/* ══ Main recitation area ══ */}
      {selected && !loadingAyahs && !finished && currentAyah && (
        <>
          {/* Ayah card */}
          <div style={card({ overflow: "hidden" })}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#f8f4ec", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: GOLD_LT, border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: GOLD }}>
                  {selected.number}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: G700 }}>{selected.englishName}</div>
                  <div style={{ fontSize: 11, color: GOLD, fontFamily: "'Amiri',serif", fontWeight: 700 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Ayah {currentAyah.numberInSurah} / {selected.numberOfAyahs}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G700, fontVariantNumeric: "tabular-nums" }}>{fmt(timer)}</div>
                {saving && <div style={{ fontSize: 10, color: GOLD }}>Saving…</div>}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "#e8f0e8" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${G500},${GOLD})`, transition: "width .3s" }} />
            </div>

            {/* Bismillah */}
            {currentAyah.numberInSurah === 1 && selected.number !== 9 && (
              <div style={{ textAlign: "center", padding: "14px 20px", borderBottom: `1px solid #f0f4ec`, background: CREAM }}>
                <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, color: G700, lineHeight: 2.4, direction: "rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
              </div>
            )}

            {/* ── Words ── */}
            <div style={{ padding: "24px 18px 20px", background: CREAM, minHeight: 140 }}>
              <div style={{
                fontFamily: "'Amiri Quran',serif", fontSize: 28, fontWeight: 700,
                lineHeight: 3.4, textAlign: "justify", direction: "rtl", width: "100%",
              }}>
                {currentAyah.words.map((w, wi) => {
                  const isRevealed = w.state === "revealed";
                  const isCurrent  = w.state === "current";
                  const isHidden   = w.state === "hidden";
                  return (
                    <span key={wi} style={{
                      display: "inline-block", marginLeft: 8, transition: "all .25s",
                      ...(isRevealed ? {
                        color: G500, background: G100, borderRadius: 6,
                        padding: "0 4px", border: `1px solid #86efac`,
                      } : isCurrent ? {
                        color: GOLD, background: GOLD_LT, borderRadius: 6,
                        padding: "0 4px", border: `2px solid ${GOLD}`,
                        boxShadow: `0 0 8px ${GOLD}55`,
                        animation: "micPulse .8s ease-in-out infinite",
                      } : /* hidden */ {
                        color: "transparent", background: "#d1d5db", borderRadius: 4,
                        userSelect: "none" as const,
                        minWidth: `${Math.max(w.raw.length * 10, 28)}px`,
                        height: "0.72em", verticalAlign: "middle",
                        display: "inline-block",
                      }),
                    }}>
                      {isHidden ? "\u00A0".repeat(Math.max(w.raw.length, 2)) : w.raw}
                    </span>
                  );
                })}
                <span style={{ color: "rgba(183,121,31,.45)", fontSize: 20, marginRight: 4 }}>
                  ﴿{currentAyah.numberInSurah}﴾
                </span>
              </div>
            </div>

            {/* Word count strip */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", background: "#f8f4ec", borderTop: `1px solid ${BORDER}`, fontSize: 12 }}>
              <span style={{ color: MUTED }}>
                {revealed} / {total} words revealed
              </span>
              <span style={{ color: pct === 100 ? G500 : GOLD, fontWeight: 700 }}>
                {pct}%
              </span>
            </div>

            {/* Nav row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: "#f8f4ec" }}>
              <button
                disabled={ayahIdx === 0 || recording}
                onClick={() => {
                  if (ayahIdx === 0) return;
                  const i = ayahIdx - 1;
                  pointerRef.current = 0; fullTransRef.current = "";
                  setAyahIdx(i); setTimer(0); resetWords(i); setTranscript("");
                }}
                style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: ayahIdx === 0 ? MUTED : G700, fontSize: 13, fontWeight: 700, cursor: ayahIdx === 0 ? "default" : "pointer", opacity: ayahIdx === 0 ? .4 : 1 }}>
                ← Prev
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: G700 }}>{ayahIdx + 1} / {ayahs.length}</span>
              <button
                disabled={recording}
                onClick={() => {
                  const next = ayahIdx + 1;
                  if (next >= ayahs.length) { setFinished(true); return; }
                  pointerRef.current = 0; fullTransRef.current = "";
                  setAyahIdx(next); setTimer(0); resetWords(next); setTranscript("");
                }}
                style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: G700, fontSize: 13, fontWeight: 700, cursor: recording ? "default" : "pointer", opacity: recording ? .4 : 1 }}>
                Skip →
              </button>
            </div>
          </div>

          {/* ── Mic control card ── */}
          <div style={card({ padding: "20px 18px" })}>

            {error && (
              <div style={{ background: RED_LT, border: `1px solid #fca5a5`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: RED }}>⚠️ {error}</div>
              </div>
            )}

            {/* Big mic toggle button */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>

              {/* Mic button */}
              <button
                onClick={toggleMic}
                style={{
                  width: 80, height: 80, borderRadius: "50%", border: "none", cursor: "pointer",
                  background: recording ? RED : G700,
                  boxShadow: recording
                    ? `0 0 0 6px ${RED}33, 0 0 0 12px ${RED}18`
                    : `0 4px 20px rgba(26,61,36,.35)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .2s",
                  animation: recording ? "micRing 1.4s ease-in-out infinite" : "none",
                }}>
                {recording
                  ? <Square size={28} fill="#fff" color="#fff" />
                  : <Mic    size={28} color="#fff" />
                }
              </button>

              {/* Label */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: recording ? RED : G700 }}>
                  {recording ? "Tap to Stop · اضغط للإيقاف" : "Tap to Start · اضغط للبدء"}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                  {recording
                    ? (processing ? "⏳ Analysing…" : "🎙️ Listening — recite now · يسمعك الآن")
                    : "Words reveal automatically as you recite · الكلمات تظهر تلقائياً"}
                </div>
              </div>

              {/* Live waveform when recording */}
              {recording && (
                <div style={{ display: "flex", alignItems: "center", gap: 3, height: 32 }}>
                  {[12,20,10,26,14,22,10,18,24,12].map((h, i) => (
                    <div key={i} style={{
                      width: 4, height: h, borderRadius: 2,
                      background: processing ? GOLD : G500,
                      opacity: .65,
                      animation: `waveBar 1s ease-in-out ${i * .09}s infinite alternate`,
                    }} />
                  ))}
                </div>
              )}

              {/* Live transcript */}
              {recording && (
                <div style={{
                  width: "100%", minHeight: 48,
                  background: transcript ? "#f0fff4" : "#f8fafb",
                  border: `1px solid ${transcript ? "#86efac" : BORDER}`,
                  borderRadius: 10, padding: "10px 14px",
                  transition: "all .3s",
                }}>
                  {transcript
                    ? <div style={{ fontSize: 16, fontWeight: 700, color: G700, direction: "rtl", textAlign: "right", fontFamily: "'Amiri Quran',serif", lineHeight: 2 }}>{transcript}</div>
                    : <div style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>🎙️ Transcript appears here…</div>
                  }
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes micRing {
          0%,100% { box-shadow: 0 0 0 6px ${RED}33, 0 0 0 12px ${RED}18; }
          50%      { box-shadow: 0 0 0 10px ${RED}44, 0 0 0 20px ${RED}10; }
        }
        @keyframes micPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: .6; }
        }
        @keyframes waveBar {
          from { transform: scaleY(.5); }
          to   { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}
