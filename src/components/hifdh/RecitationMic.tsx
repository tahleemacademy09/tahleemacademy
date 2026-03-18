/*
  src/components/hifdh/RecitationMic.tsx
  ─────────────────────────────────────────────────────────────────
  Fully automatic Hifdh recitation — uses Deepgram (via the existing
  `transcribe-hifdh` Supabase Edge Function) instead of the broken
  Android Web Speech API.

  Flow:
  1. User taps Start
  2. MediaRecorder records audio in 4-second chunks
  3. Each chunk is sent to transcribe-hifdh → Deepgram → Arabic text
  4. Transcript is matched against ayah words → revealed automatically
  5. When all words revealed → 3s countdown → next ayah auto-loads
*/
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ──────────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WordState = "hidden" | "correct" | "current";
interface Word  { raw: string; norm: string; state: WordState; }
interface Ayah  { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ─── Arabic normaliser ──────────────────────────────────────── */
const normalise = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "")  // strip harakat
   .replace(/[أإآٱ]/g, "ا")                 // alef variants
   .replace(/ة/g, "ه")                       // ta marbuta
   .replace(/ى/g, "ي")                       // alef maqsura
   .replace(/\u0640/g, "")                   // tatweel
   .replace(/\s+/g, " ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g, "").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: normalise(w), state: "hidden" as WordState }));

/* ─── Word matching: strict + fuzzy ─────────────────────────── */
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
  const s = normalise(spoken);
  const t = normalise(target);
  if (!s || !t) return false;
  if (s === t) return true;
  const minLen = Math.min(4, Math.min(s.length, t.length));
  if (minLen >= 3 && s.slice(0, minLen) === t.slice(0, minLen)) return true;
  if (t.length >= 4 && s.includes(t)) return true;
  if (s.length >= 4 && t.includes(s)) return true;
  const maxDist = Math.floor(Math.max(s.length, t.length) * 0.3);
  return lev(s, t) <= maxDist;
};

/* ─── Helpers ────────────────────────────────────────────────── */
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ─── Colours ────────────────────────────────────────────────── */
const G700  = "#1a3d24", G500 = "#276749", G100 = "#f0fff4";
const GOLD  = "#b7791f", GOLD_LT = "#fffbeb";
const RED   = "#c0392b", RED_LT  = "#fff5f5";
const MUTED = "#7a9e88", BORDER  = "#e2e8f0", CREAM = "#fffdf5";

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

  type Phase = "idle" | "listening" | "countdown" | "done";
  const [phase,        setPhase]        = useState<Phase>("idle");
  const [timer,        setTimer]        = useState(0);
  const [countdown,    setCountdown]    = useState<number | null>(null);
  const [transcript,   setTranscript]   = useState("");
  const [statusMsg,    setStatusMsg]    = useState("");
  const [error,        setError]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [processing,   setProcessing]   = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, ayahs: 0 });

  /* refs */
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const chunkBufRef   = useRef<Blob[]>([]);      // current recording chunk
  const fullAudioRef  = useRef<Blob[]>([]);      // full session audio
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ayahIdxRef    = useRef(0);
  const ayahsRef      = useRef<Ayah[]>([]);
  const pointerRef    = useRef(0);
  const phaseRef      = useRef<Phase>("idle");
  const fullTransRef  = useRef("");   // cumulative transcript for this ayah

  useEffect(() => { ayahIdxRef.current = ayahIdx; }, [ayahIdx]);
  useEffect(() => { ayahsRef.current   = ayahs;   }, [ayahs]);
  useEffect(() => { phaseRef.current   = phase;   }, [phase]);

  /* ── Load surah list ─────────────────────────────────────────── */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json())
      .then(d => { if (d.code === 200) setSurahs(d.data); });
    return () => hardStop();
  }, []);

  /* ── Load ayahs ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    setLoadingAyahs(true);
    setAyahIdx(0); setAyahs([]); setPhase("idle");
    pointerRef.current = 0; fullTransRef.current = "";
    hardStop();
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

  /* ── Timer ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase === "listening") {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  /* ══ Process transcript from Deepgram ════════════════════════
     Advances the word pointer as spoken words are matched
  ════════════════════════════════════════════════════════════════ */
  const processTranscript = useCallback((newText: string) => {
    if (!newText.trim() || phaseRef.current !== "listening") return;

    // Accumulate into full transcript for this ayah
    fullTransRef.current = (fullTransRef.current + " " + newText).trim();
    setTranscript(fullTransRef.current);

    const idx    = ayahIdxRef.current;
    const words  = ayahsRef.current[idx]?.words;
    if (!words) return;

    const spokenTokens = fullTransRef.current.split(/\s+/).filter(Boolean);
    let ptr = pointerRef.current;

    // Sequential matching: advance pointer for each matched word
    while (ptr < words.length) {
      const target  = words[ptr].norm;
      const matched = spokenTokens.some(tok => wordMatches(tok, target));
      if (matched) ptr++;
      else break;
    }

    if (ptr === pointerRef.current) return; // nothing new
    pointerRef.current = ptr;

    setAyahs(prev => {
      const updated = [...prev];
      const ayah    = { ...updated[idx], words: [...updated[idx].words] };
      ayah.words = ayah.words.map((w, wi) => {
        if (wi < ptr)  return { ...w, state: "correct" as WordState };
        if (wi === ptr) return { ...w, state: "current" as WordState };
        return { ...w, state: "hidden" as WordState };
      });
      updated[idx] = ayah;

      if (ptr >= ayah.words.length && phaseRef.current === "listening") {
        setSessionStats(s => ({ ...s, correct: s.correct + ayah.words.length }));
        setTimeout(() => beginCountdown(), 300);
      }
      return updated;
    });
  }, []);

  /* ══ Send audio chunk to Deepgram via Edge Function ══════════ */
  const sendChunkToDeepgram = useCallback(async (blob: Blob) => {
    if (blob.size < 1000) return;
    setProcessing(true);
    try {
      // Convert blob → base64 so supabase.functions.invoke can send it
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      uint8.forEach(b => binary += String.fromCharCode(b));
      const base64Audio = btoa(binary);

      const { data, error: fnError } = await supabase.functions.invoke("transcribe-hifdh", {
        body: { audio: base64Audio, mimeType: blob.type || "audio/webm" },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.transcript) processTranscript(data.transcript);
      setError("");
    } catch (e: any) {
      console.warn("Transcription error:", e?.message);
      setError("Transcription failed — ensure DEEPGRAM_API_KEY is set in Supabase secrets");
    } finally {
      setProcessing(false);
    }
  }, [processTranscript]);

  /* ══ Recording: slice audio every 4 seconds and send ════════ */
  const startChunkRecording = useCallback((stream: MediaStream) => {
    // Determine supported mime type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/ogg;codecs=opus";

    const startNewChunk = () => {
      if (phaseRef.current !== "listening") return;

      chunkBufRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = e => {
        if (e.data?.size > 0) {
          chunkBufRef.current.push(e.data);
          fullAudioRef.current.push(e.data); // also keep full audio
        }
      };
      mr.onstop = () => {
        const blob = new Blob(chunkBufRef.current, { type: mimeType });
        sendChunkToDeepgram(blob);
        // Start next chunk immediately
        if (phaseRef.current === "listening") startNewChunk();
      };
      mr.start();
      mediaRecRef.current = mr;

      // Stop after 4 seconds → triggers onstop → sends chunk → restarts
      setTimeout(() => {
        if (mr.state === "recording") mr.stop();
      }, 4000);
    };

    startNewChunk();
  }, [sendChunkToDeepgram]);

  /* ══ Start session ══════════════════════════════════════════ */
  const startSession = async () => {
    setError("");
    setStatusMsg("Starting mic…");
    pointerRef.current  = 0;
    fullTransRef.current = "";
    setTimer(0);
    setTranscript("");
    setSessionStats({ correct: 0, ayahs: 0 });
    resetWords(ayahIdxRef.current);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current   = stream;
      fullAudioRef.current = [];
      setPhase("listening");
      setStatusMsg("Listening — recite now");
      startChunkRecording(stream);
    } catch (e: any) {
      setError("Microphone access denied. Please allow mic and try again.");
      setStatusMsg("");
    }
  };

  /* ── Hard stop all recording ─────────────────────────────── */
  const hardStop = () => {
    if (mediaRecRef.current) {
      try { mediaRecRef.current.stop(); } catch (_) {}
      mediaRecRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current)    { clearInterval(timerRef.current);    timerRef.current    = null; }
    if (countRef.current)    { clearInterval(countRef.current);    countRef.current    = null; }
    if (chunkTimerRef.current){ clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
  };

  /* ── Reset word states ────────────────────────────────────── */
  const resetWords = (idx: number) => {
    setAyahs(prev => {
      const u = [...prev];
      if (u[idx]) u[idx] = { ...u[idx], words: u[idx].words.map(w => ({ ...w, state: "hidden" as WordState })) };
      return u;
    });
  };

  /* ── Countdown 3-2-1 then advance ───────────────────────── */
  const beginCountdown = () => {
    if (countRef.current || phaseRef.current !== "listening") return;
    setPhase("countdown");

    // Stop recording during countdown
    if (mediaRecRef.current) { try { mediaRecRef.current.stop(); } catch (_) {} mediaRecRef.current = null; }

    let c = 3; setCountdown(c);
    countRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countRef.current!); countRef.current = null;
        setCountdown(null);
        doAdvance();
      } else setCountdown(c);
    }, 1000);
  };

  /* ── Advance to next ayah ────────────────────────────────── */
  const doAdvance = () => {
    const idx = ayahIdxRef.current;
    saveAyah(idx);
    setSessionStats(s => ({ ...s, ayahs: s.ayahs + 1 }));
    pointerRef.current   = 0;
    fullTransRef.current = "";
    setTranscript("");

    if (idx < ayahsRef.current.length - 1) {
      const next = idx + 1;
      setAyahIdx(next);
      setTimer(0);
      resetWords(next);
      setPhase("listening");
      if (streamRef.current) startChunkRecording(streamRef.current);
    } else {
      setPhase("done");
      hardStop();
    }
  };

  const skipAyah = () => {
    if (countRef.current) { clearInterval(countRef.current); countRef.current = null; setCountdown(null); }
    doAdvance();
  };

  const endSession = () => {
    hardStop();
    setPhase("idle");
    setCountdown(null);
    setStatusMsg("");
  };

  /* ── Save ayah result to Supabase ───────────────────────── */
  const saveAyah = async (idx: number) => {
    if (!userId || !selected) return;
    const ayah = ayahsRef.current[idx];
    if (!ayah) return;
    setSaving(true);
    try {
      const correct  = ayah.words.filter(w => w.state === "correct").length;
      const scorePct = ayah.words.length > 0 ? Math.round((correct / ayah.words.length) * 100) : 0;

      let audioUrl = "";
      if (fullAudioRef.current.length > 0) {
        const blob = new Blob(fullAudioRef.current, { type: "audio/webm" });
        const path = `${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.webm`;
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

  /* ─── Derived ─────────────────────────────────────────────── */
  const currentAyah = ayahs[ayahIdx];
  const revealed    = currentAyah?.words.filter(w => w.state === "correct").length ?? 0;
  const total       = currentAyah?.words.length ?? 0;
  const pct         = total > 0 ? Math.round((revealed / total) * 100) : 0;
  const filtered    = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search));

  /* ─── Style helpers ───────────────────────────────────────── */
  const card = (ex: React.CSSProperties = {}): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,.06)", ...ex,
  });
  const btn = (bg: string, color: string, ex: React.CSSProperties = {}): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "13px 20px", borderRadius: 12, border: "none", background: bg, color,
    fontSize: 14, fontWeight: 700, fontFamily: "'Cairo',sans-serif", cursor: "pointer", ...ex,
  });

  /* ══ RENDER ═════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>

      {/* Surah picker */}
      <div style={card({ padding: 16 })}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: G700 }}>Select Surah · اختر السورة</div>
          {selected && <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: G500 }}>
            {selected.englishName} — <span style={{ fontFamily: "'Amiri',serif" }}>{selected.name}</span>
          </div>}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search surah…"
          style={{ width: "100%", background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 13px", fontSize: 13, color: G700, marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
          {filtered.slice(0, 30).map(s => (
            <div key={s.number}
              onClick={() => { if (phase === "idle" || phase === "done") { setSelected(s); setSearch(""); } }}
              style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                background: selected?.number === s.number ? G700 : "#f8fafb",
                color: selected?.number === s.number ? "#fff" : G700,
                border: `1px solid ${selected?.number === s.number ? G700 : BORDER}`,
                fontWeight: selected?.number === s.number ? 700 : 400 }}>
              {s.englishName}<br />
              <span style={{ fontSize: 10, fontFamily: "'Amiri',serif", opacity: .8 }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!selected && (
        <div style={card({ padding: "48px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>Select a Surah to Begin</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>اختر سورة للبدء</div>
        </div>
      )}

      {selected && loadingAyahs && (
        <div style={card({ padding: 48, textAlign: "center" })}>
          <div style={{ fontSize: 13, color: GOLD, animation: "pulse 1s infinite" }}>Loading ayahs…</div>
        </div>
      )}

      {/* Session done */}
      {phase === "done" && selected && (
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
          {saving && <div style={{ fontSize: 11, color: GOLD, marginBottom: 8, animation: "pulse 1s infinite" }}>Saving…</div>}
          <button onClick={() => { setPhase("idle"); setAyahIdx(0); setTimer(0); setSessionStats({ correct: 0, ayahs: 0 }); setAyahs(p => p.map(a => ({ ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WordState })) }))); }}
            style={btn(G700, "#fff", { width: "100%" })}>
            🔄 Start Again · أعد المحاولة
          </button>
        </div>
      )}

      {/* Main recitation */}
      {selected && !loadingAyahs && phase !== "done" && currentAyah && (<>

        {/* Ayah display card */}
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
              {saving && <div style={{ fontSize: 10, color: GOLD, animation: "pulse 1s infinite" }}>Saving…</div>}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, padding: "7px 16px", background: "#fafaf8", borderBottom: `1px solid #f0f4f0`, flexWrap: "wrap" as const }}>
            {[[G500,"Correct","صحيح"],[GOLD,"Current","الآن"],["#94a3b8","Hidden","مخفي"]].map(([c,en,ar],i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                <span style={{ fontWeight: 700, color: G700 }}>{en}</span>
                <span style={{ color: MUTED }}>{ar}</span>
              </div>
            ))}
          </div>

          {/* Bismillah */}
          {currentAyah.numberInSurah === 1 && selected.number !== 9 && (
            <div style={{ textAlign: "center", padding: "14px 20px", borderBottom: `1px solid #f0f4ec`, background: CREAM }}>
              <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, color: G700, lineHeight: 2.4, direction: "rtl" }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>In the name of Allah, the Most Gracious, the Most Merciful</div>
            </div>
          )}

          {/* Words */}
          <div style={{ padding: "24px 18px 18px", background: CREAM, minHeight: 160 }}>
            <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 28, fontWeight: 700, lineHeight: 3.2, textAlign: "justify", direction: "rtl", width: "100%" }}>
              {currentAyah.words.map((w, wi) => (
                <span key={wi} style={{
                  display: "inline-block", marginLeft: 8, transition: "all .2s",
                  ...(w.state === "correct" ? {
                    color: G500, background: G100, borderRadius: 5, padding: "0 3px",
                    border: `1px solid #9ae6b4`,
                  } : w.state === "current" ? {
                    color: GOLD, background: GOLD_LT, borderRadius: 5, padding: "0 3px",
                    border: `2px solid ${GOLD}`, animation: "pulse 1s infinite",
                  } : {
                    color: "transparent", background: "#cbd5e0", borderRadius: 4,
                    userSelect: "none" as const,
                    minWidth: `${Math.max(w.raw.length * 10, 28)}px`,
                    height: "0.75em", verticalAlign: "middle", display: "inline-block",
                  })
                }}>
                  {w.state !== "hidden" ? w.raw : "\u00A0".repeat(Math.max(w.raw.length, 2))}
                </span>
              ))}
              <span style={{ color: "rgba(183,121,31,.5)", fontSize: 20 }}> ﴿{currentAyah.numberInSurah}﴾</span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: "#f0f4f0" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${G500},${GOLD})`, transition: "width .4s" }} />
          </div>

          {/* Countdown banner */}
          {countdown !== null && (
            <div style={{ padding: "12px 16px", background: G100, borderTop: `1px solid #9ae6b4`, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: G500 }}>
                ✓ Ayah complete — Next in {countdown}… · التالية خلال {countdown}
              </div>
            </div>
          )}

          {/* Nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: `1px solid ${BORDER}`, background: "#f8f4ec" }}>
            <button
              disabled={ayahIdx === 0 || phase === "idle"}
              onClick={() => {
                if (countRef.current) { clearInterval(countRef.current); countRef.current = null; setCountdown(null); }
                const i = ayahIdxRef.current; if (i === 0) return;
                pointerRef.current = 0; fullTransRef.current = "";
                setAyahIdx(i - 1); setTimer(0); resetWords(i - 1);
                if (streamRef.current) startChunkRecording(streamRef.current);
              }}
              style={btn("#f0f4f0", ayahIdx === 0 ? MUTED : G700, { opacity: ayahIdx === 0 ? .4 : 1, padding: "9px 14px", fontSize: 13 })}>
              ← Prev
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: G700 }}>{ayahIdx + 1} / {ayahs.length}</span>
            <button onClick={skipAyah} disabled={phase === "idle"}
              style={btn(phase === "idle" ? "#f0f4f0" : G700, phase === "idle" ? MUTED : "#fff", { padding: "9px 14px", fontSize: 13, opacity: phase === "idle" ? .4 : 1 })}>
              Skip →
            </button>
          </div>
        </div>

        {/* Controls card */}
        <div style={card({ padding: "20px 18px" })}>

          {error && (
            <div style={{ background: RED_LT, border: `1px solid #fca5a5`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: RED }}>⚠️ {error}</div>
            </div>
          )}

          {phase === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 1.8 }}>
                Press Start and recite aloud — words reveal automatically
                <br />
                <span style={{ fontSize: 12, color: GOLD }}>اضغط ابدأ وتلُ بصوت — ستظهر الكلمات تلقائياً</span>
              </div>
              <button onClick={startSession} style={btn(G700, "#fff", { width: "100%", padding: "17px", fontSize: 16 })}>
                🎙️ Start Recitation · ابدأ التلاوة
              </button>
            </div>
          )}

          {(phase === "listening" || phase === "countdown") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Status bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: phase === "countdown" ? G100 : "#f0fff4", borderRadius: 10, border: `1px solid ${phase === "countdown" ? "#9ae6b4" : "#9ae6b4"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: G500, animation: "pulse 1s infinite" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G700 }}>
                      {phase === "countdown" ? "✓ Ayah complete!" : processing ? "Processing…" : statusMsg}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED }}>
                      {phase === "countdown" ? "ينتقل تلقائياً" : "يسمع ويحلل صوتك — تلُ الآن"}
                    </div>
                  </div>
                </div>
                {phase === "listening" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, height: 24 }}>
                    {[10,16,8,22,12,18,8,14].map((h, i) => (
                      <div key={i} style={{ width: 3, height: h, background: processing ? GOLD : G500, borderRadius: 2, opacity: .6, animation: `wave 1.1s ease-in-out ${i * .1}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Transcript */}
              <div style={{ background: transcript ? "#f0fff4" : "#f8fafb", border: `1px solid ${transcript ? "#9ae6b4" : BORDER}`, borderRadius: 10, padding: "10px 14px", minHeight: 52, transition: "all .3s" }}>
                {transcript ? (
                  <div style={{ fontSize: 17, fontWeight: 700, color: G700, textAlign: "right", direction: "rtl", fontFamily: "'Amiri Quran',serif", lineHeight: 2 }}>
                    {transcript}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>
                    🎙️ Speak — transcript appears here · ابدأ التلاوة
                  </div>
                )}
              </div>

              {/* Word count */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafb", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, color: MUTED }}>Words revealed · الكلمات المكشوفة</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: G500 }}>{revealed} / {total}</span>
              </div>

              <button onClick={endSession} style={btn("#fff5f5", RED, { width: "100%", border: `1px solid #fca5a5`, padding: "11px" })}>
                ⏹ End Session · إنهاء الجلسة
              </button>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}
