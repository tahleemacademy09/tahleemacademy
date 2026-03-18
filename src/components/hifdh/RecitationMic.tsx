/*  src/components/hifdh/RecitationMic.tsx  — fully automatic speech-driven rewrite */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ──────────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WordState = "hidden" | "correct" | "current" | "wrong";
interface Word  { raw: string; norm: string; state: WordState; }
interface Ayah  { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ─── Arabic normaliser — strips diacritics & homoglyph-normalises ── */
const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "")   // strip all harakat
   .replace(/[أإآٱ]/g, "ا")                  // alef variants → bare alef
   .replace(/ة/g, "ه")                        // ta marbuta → ha
   .replace(/ى/g, "ي")                        // alef maqsura → ya
   .replace(/\u0640/g, "")                    // tatweel
   .trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g, "").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: norm(w), state: "hidden" as WordState }));

/* ─── Similarity: does spoken token match ayah word? ─────────── */
const matches = (spoken: string, target: string): boolean => {
  if (!spoken || !target) return false;
  const s = norm(spoken);
  const t = norm(target);
  if (s === t) return true;
  // prefix match — first 4 chars (covers partial recognition of long words)
  const len = Math.min(4, Math.min(s.length, t.length));
  if (len >= 3 && s.slice(0, len) === t.slice(0, len)) return true;
  // substring match for longer words
  if (t.length >= 4 && s.includes(t)) return true;
  if (s.length >= 4 && t.includes(s)) return true;
  return false;
};

/* ─── Levenshtein distance (fuzzy fallback for noisy mic) ───── */
const lev = (a: string, b: string): number => {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
};

const fuzzyMatch = (spoken: string, target: string): boolean => {
  const s = norm(spoken); const t = norm(target);
  if (s.length < 3 || t.length < 3) return s === t;
  const maxDist = Math.floor(Math.max(s.length, t.length) * 0.3); // 30% tolerance
  return lev(s, t) <= maxDist;
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ─── Colour tokens ──────────────────────────────────────────── */
const G900 = "#0f2d1f";
const G700 = "#1a3d24";
const G500 = "#276749";
const G100 = "#f0fff4";
const GOLD = "#b7791f";
const GOLD_LT = "#fffbeb";
const CREAM = "#fffdf5";
const RED   = "#c0392b";
const RED_LT = "#fff5f5";
const BORDER = "#e2e8f0";
const MUTED  = "#7a9e88";

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
  const [micStatus,    setMicStatus]    = useState<"off"|"on"|"error">("off");
  const [micMsg,       setMicMsg]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, ayahs: 0 });

  /* refs */
  const recogRef      = useRef<any>(null);
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const ayahIdxRef    = useRef(0);
  const ayahsRef      = useRef<Ayah[]>([]);
  const pointerRef    = useRef(0);        // next expected word index
  const phaseRef      = useRef<Phase>("idle");
  const finalBufRef   = useRef<string[]>([]);  // accumulates final transcripts
  const restartingRef = useRef(false);

  useEffect(() => { ayahIdxRef.current = ayahIdx; }, [ayahIdx]);
  useEffect(() => { ayahsRef.current   = ayahs;   }, [ayahs]);
  useEffect(() => { phaseRef.current   = phase;   }, [phase]);

  /* ── Load surah list ─────────────────────────────────────────── */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json())
      .then(d => { if (d.code === 200) setSurahs(d.data); });
    return () => stopEverything();
  }, []);

  /* ── Load ayahs ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    setLoadingAyahs(true);
    setAyahIdx(0); setAyahs([]); setPhase("idle");
    pointerRef.current = 0; finalBufRef.current = [];
    stopEverything();
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

  /* ── Timer tick ─────────────────────────────────────────────── */
  useEffect(() => {
    if (phase === "listening") {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  /* ══ Core: process speech transcript ══════════════════════════
     Called on every interim/final result from SpeechRecognition.
     Advances pointerRef as words are matched sequentially.
  ════════════════════════════════════════════════════════════════ */
  const processSpeech = useCallback((spokenText: string) => {
    const idx   = ayahIdxRef.current;
    const words = ayahsRef.current[idx]?.words;
    if (!words || phaseRef.current !== "listening") return;

    // Build full corpus from accumulated finals + current interim
    const spokenTokens = norm(spokenText).split(/\s+/).filter(Boolean);
    let ptr = pointerRef.current;

    // Try to advance pointer by matching spoken tokens against ayah words in order
    while (ptr < words.length) {
      const target = words[ptr].norm;
      const found  = spokenTokens.some(tok =>
        matches(tok, target) || fuzzyMatch(tok, target)
      );
      if (found) {
        ptr++;
      } else {
        break;
      }
    }

    if (ptr === pointerRef.current) return; // nothing new matched
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

      // All words matched → advance
      if (ptr >= ayah.words.length && phaseRef.current === "listening") {
        setSessionStats(s => ({
          ...s,
          correct: s.correct + ayah.words.filter(w => w.state === "correct").length,
        }));
        setTimeout(() => beginCountdown(), 200);
      }

      return updated;
    });
  }, []);

  /* ══ Speech Recognition engine ═══════════════════════════════ */
  const startRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicStatus("error");
      setMicMsg("Speech recognition not supported on this browser. Please use Chrome.");
      return;
    }

    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
      recogRef.current = null;
    }

    const rec = new SR();
    rec.lang            = "ar-SA";
rec.continuous      = false;   // false is more reliable on Android/Kiwi
rec.interimResults  = true;
rec.maxAlternatives = 5;

    rec.onstart = () => {
      setMicStatus("on");
      setMicMsg("");
      restartingRef.current = false;
    };

    rec.onresult = (e: any) => {
      if (phaseRef.current !== "listening") return;

      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        // collect best alternative from each result
        const best = Array.from({ length: e.results[i].length }, (_, k) =>
          e.results[i][k].transcript
        ).join(" ");

        if (e.results[i].isFinal) {
          finalBufRef.current.push(best);
        } else {
          interim = best;
        }
      }

      const full = [...finalBufRef.current, interim].join(" ").trim();
      setTranscript(full);
      if (full) processSpeech(full);
    };

    rec.onerror = (e: any) => {
      if (e.error === "aborted" || e.error === "no-speech") return; // non-fatal, will restart
      if (e.error === "not-allowed") {
        setMicStatus("error");
        setMicMsg("Microphone permission denied. Please allow mic access and try again.");
        return;
      }
      // other errors — just restart
      setMicMsg(`Mic: ${e.error} — restarting…`);
    };

    rec.onend = () => {
      // Auto-restart as long as we're still in listening phase
      if (phaseRef.current === "listening" && !restartingRef.current) {
        restartingRef.current = true;
        setTimeout(() => {
          if (phaseRef.current === "listening") {
            startRecognition();
          }
        }, 150);
      }
    };

    recogRef.current = rec;
    try {
      rec.start();
    } catch (err: any) {
      setMicStatus("error");
      setMicMsg(`Could not start mic: ${err?.message ?? err}`);
    }
  }, [processSpeech]);

  /* ══ Start full session ═══════════════════════════════════════ */
  const startSession = async () => {
    pointerRef.current   = 0;
    finalBufRef.current  = [];
    restartingRef.current = false;
    setTimer(0);
    setTranscript("");
    setMicMsg("");
    setSessionStats({ correct: 0, wrong: 0, ayahs: 0 });

    // Reset current ayah words
    resetWords(ayahIdxRef.current);

    setPhase("listening");

    // Start audio capture for admin
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecRef.current = mr;
    } catch (_) { /* mic permission for recording — non-fatal */ }

    // Start speech recognition
    startRecognition();
  };

  /* ── Stop everything ──────────────────────────────────────────── */
  const stopEverything = () => {
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
      recogRef.current = null;
    }
    if (mediaRecRef.current) {
      try { mediaRecRef.current.stop(); } catch (_) {}
      mediaRecRef.current = null;
    }
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
    if (countRef.current)  { clearInterval(countRef.current);  countRef.current  = null; }
    setMicStatus("off");
    restartingRef.current = false;
  };

  /* ── Reset word states ───────────────────────────────────────── */
  const resetWords = (idx: number) => {
    setAyahs(prev => {
      const u = [...prev];
      if (u[idx]) u[idx] = { ...u[idx], words: u[idx].words.map(w => ({ ...w, state: "hidden" as WordState })) };
      return u;
    });
  };

  /* ── Countdown 3-2-1 then advance ─────────────────────────────── */
  const beginCountdown = () => {
    if (countRef.current || phaseRef.current !== "listening") return;
    setPhase("countdown");

    // Stop recognition during countdown — no interference
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
      recogRef.current = null;
    }

    let c = 3;
    setCountdown(c);
    countRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countRef.current!);
        countRef.current = null;
        setCountdown(null);
        doAdvance();
      } else {
        setCountdown(c);
      }
    }, 1000);
  };

  /* ── Advance to next ayah or end ─────────────────────────────── */
  const doAdvance = () => {
    const idx = ayahIdxRef.current;
    saveAyahToSupabase(idx);

    setSessionStats(s => ({ ...s, ayahs: s.ayahs + 1 }));
    pointerRef.current  = 0;
    finalBufRef.current = [];
    setTranscript("");

    if (idx < ayahsRef.current.length - 1) {
      const next = idx + 1;
      setAyahIdx(next);
      setTimer(0);
      resetWords(next);
      setPhase("listening");
      startRecognition();
    } else {
      // Surah complete
      setPhase("done");
      stopEverything();
    }
  };

  /* ── Skip to next manually ───────────────────────────────────── */
  const skipAyah = () => {
    if (countRef.current) { clearInterval(countRef.current); countRef.current = null; setCountdown(null); }
    doAdvance();
  };

  /* ── End session early ───────────────────────────────────────── */
  const endSession = () => {
    stopEverything();
    setPhase("idle");
    setCountdown(null);
  };

  /* ── Save one ayah to Supabase ───────────────────────────────── */
  const saveAyahToSupabase = async (idx: number) => {
    if (!userId || !selected) return;
    const ayah = ayahsRef.current[idx];
    if (!ayah) return;
    setSaving(true);
    try {
      let audioUrl = "";
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const path = `${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.webm`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) {
          const { data: urlData } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          audioUrl = urlData?.publicUrl ?? "";
        }
        chunksRef.current = []; // reset for next ayah
      }
      const correct = ayah.words.filter(w => w.state === "correct").length;
      const scorePct = ayah.words.length > 0
        ? Math.round((correct / ayah.words.length) * 100) : 0;

      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, ayah_end: ayah.numberInSurah,
          audio_url: audioUrl, ai_score: scorePct, status: "pending",
          transcript: transcript,
          word_results: ayah.words.map(x => ({ word: x.raw, result: x.state })),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id: userId, surah_number: selected.number, surah_name: selected.englishName,
          ayah_start: ayah.numberInSurah, accuracy_score: scorePct,
          correct, wrong: ayah.words.filter(w => w.state === "wrong").length, duration: timer,
        }),
      ]);

      const { data: ex } = await supabase.from("hifdh_progress").select("id,best_accuracy,times_reviewed")
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

  /* ─── Derived ─────────────────────────────────────────────────── */
  const currentAyah = ayahs[ayahIdx];
  const revealed    = currentAyah?.words.filter(w => w.state === "correct").length ?? 0;
  const total       = currentAyah?.words.length ?? 0;
  const pct         = total > 0 ? Math.round((revealed / total) * 100) : 0;
  const filtered    = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search));

  /* ─── Inline style helpers ───────────────────────────────────── */
  const card = (ex: React.CSSProperties = {}): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,.06)", ...ex,
  });
  const pill = (bg: string, color: string, ex: React.CSSProperties = {}): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "13px 20px", borderRadius: 12, border: "none", background: bg, color,
    fontSize: 14, fontWeight: 700, fontFamily: "'Cairo',sans-serif",
    cursor: "pointer", ...ex,
  });

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>

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
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search surah…"
          style={{ width: "100%", background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 13px", fontSize: 13, color: G700, marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
          {filtered.slice(0, 30).map(s => (
            <div key={s.number}
              onClick={() => { if (phase === "idle" || phase === "done") { setSelected(s); setSearch(""); } }}
              style={{
                flexShrink: 0, padding: "6px 13px", borderRadius: 20, fontSize: 12,
                cursor: "pointer", whiteSpace: "nowrap",
                background: selected?.number === s.number ? G700 : "#f8fafb",
                color:      selected?.number === s.number ? "#fff" : G700,
                border: `1px solid ${selected?.number === s.number ? G700 : BORDER}`,
                fontWeight: selected?.number === s.number ? 700 : 400,
              }}>
              {s.englishName}
              <br />
              <span style={{ fontSize: 10, fontFamily: "'Amiri',serif", opacity: .8 }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Empty / loading ── */}
      {!selected && (
        <div style={card({ padding: "48px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>Select a Surah to Begin</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>اختر سورة للبدء</div>
        </div>
      )}
      {selected && loadingAyahs && (
        <div style={card({ padding: 48, textAlign: "center" })}>
          <div style={{ fontSize: 13, color: GOLD, animation: "pulse 1s infinite" }}>Loading…</div>
        </div>
      )}

      {/* ── Session done ── */}
      {phase === "done" && selected && (
        <div style={card({ padding: "44px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: G700, fontFamily: "'Amiri',serif" }}>Surah Complete!</div>
          <div style={{ fontSize: 13, color: GOLD, marginTop: 4, marginBottom: 20 }}>أحسنت — Well done!</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { l: "Words", v: sessionStats.correct, bg: G100,    c: G500 },
              { l: "Ayahs", v: sessionStats.ayahs,   bg: GOLD_LT, c: GOLD },
              { l: "Time",  v: fmt(timer),            bg: "#f8fafb", c: G900 },
            ].map((x, i) => (
              <div key={i} style={{ background: x.bg, borderRadius: 12, padding: "14px 8px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{x.l}</div>
              </div>
            ))}
          </div>
          {saving && <div style={{ fontSize: 11, color: GOLD, marginBottom: 8, animation: "pulse 1s infinite" }}>Saving…</div>}
          <button onClick={() => { setPhase("idle"); setAyahIdx(0); setTimer(0); setSessionStats({ correct: 0, wrong: 0, ayahs: 0 }); setAyahs(p => p.map(a => ({ ...a, words: a.words.map(w => ({ ...w, state: "hidden" as WordState })) }))); }}
            style={pill(G700, "#fff", { width: "100%" })}>
            🔄 Start Again · أعد المحاولة
          </button>
        </div>
      )}

      {/* ══ Main recitation area ══ */}
      {selected && !loadingAyahs && phase !== "done" && currentAyah && (
        <>
          {/* ── Ayah card ── */}
          <div style={card({ overflow: "hidden" })}>

            {/* Header bar */}
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

            {/* Word state legend */}
            <div style={{ display: "flex", gap: 14, padding: "7px 16px", background: "#fafaf8", borderBottom: `1px solid #f0f4f0`, flexWrap: "wrap" as const }}>
              {[[G500,"Correct","صحيح"],[GOLD,"Current","الآن"],["#94a3b8","Hidden","مخفي"]].map(([c,en,ar],i)=>(
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                  <span style={{ fontWeight: 700, color: G700 }}>{en}</span>
                  <span style={{ color: MUTED }}>{ar}</span>
                </div>
              ))}
            </div>

            {/* Bismillah */}
            {currentAyah.numberInSurah === 1 && selected.number !== 9 && (
              <div style={{ textAlign: "center", padding: "14px 20px", borderBottom: `1px solid #f0f4ec`, background: "#fffdf5" }}>
                <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, color: G700, lineHeight: 2.4, direction: "rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>In the name of Allah, the Most Gracious, the Most Merciful</div>
              </div>
            )}

            {/* ── Words display ── */}
            <div style={{ padding: "24px 18px 18px", background: "#fffdf5", minHeight: 160 }}>
              <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 28, fontWeight: 700, lineHeight: 3.2, textAlign: "justify", direction: "rtl", width: "100%" }}>
                {currentAyah.words.map((w, wi) => {
                  const isCurrent = w.state === "current";
                  const isCorrect = w.state === "correct";
                  const isHidden  = w.state === "hidden";
                  return (
                    <span key={wi} style={{
                      display: "inline-block", marginLeft: 8, transition: "all .2s",
                      ...(isCorrect ? {
                        color: G500, background: G100, borderRadius: 5, padding: "0 3px",
                        border: `1px solid #9ae6b4`,
                      } : isCurrent ? {
                        color: GOLD, background: GOLD_LT, borderRadius: 5, padding: "0 3px",
                        border: `2px solid ${GOLD}`, animation: "pulse 1s infinite",
                      } : {
                        color: "transparent", background: "#cbd5e0",
                        borderRadius: 4, userSelect: "none" as const,
                        minWidth: `${Math.max(w.raw.length * 10, 28)}px`,
                        height: "0.75em", verticalAlign: "middle", display: "inline-block",
                      })
                    }}>
                      {isHidden ? "\u00A0".repeat(Math.max(w.raw.length, 2)) : w.raw}
                    </span>
                  );
                })}
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

            {/* Nav row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: `1px solid ${BORDER}`, background: "#f8f4ec" }}>
              <button
                onClick={() => { if (phase !== "listening" && phase !== "countdown") return; const i = ayahIdxRef.current; if (i === 0) return; if (countRef.current){clearInterval(countRef.current);countRef.current=null;setCountdown(null);} pointerRef.current=0;finalBufRef.current=[];setAyahIdx(i-1);setTimer(0);resetWords(i-1);startRecognition(); }}
                disabled={ayahIdx === 0 || phase === "idle"}
                style={pill("#f0f4f0", ayahIdx === 0 ? MUTED : G700, { opacity: ayahIdx === 0 ? .4 : 1, padding: "9px 14px", fontSize: 13 })}>
                ← Prev
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: G700 }}>{ayahIdx + 1} / {ayahs.length}</span>
              <button
                onClick={skipAyah}
                disabled={phase === "idle"}
                style={pill(phase === "idle" ? "#f0f4f0" : G700, phase === "idle" ? MUTED : "#fff", { padding: "9px 14px", fontSize: 13, opacity: phase === "idle" ? .4 : 1 })}>
                Skip →
              </button>
            </div>
          </div>

          {/* ── Mic / control panel ── */}
          <div style={card({ padding: "20px 18px" })}>

            {/* Error message */}
            {micStatus === "error" && (
              <div style={{ background: RED_LT, border: `1px solid #fca5a5`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: RED }}>⚠️ {micMsg}</div>
              </div>
            )}

            {/* Status message (non-error) */}
            {micMsg && micStatus !== "error" && (
              <div style={{ fontSize: 12, color: GOLD, textAlign: "center", marginBottom: 10 }}>{micMsg}</div>
            )}

            {phase === "idle" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 1.7 }}>
                  Press Start — recite aloud and words will reveal automatically
                  <br />
                  <span style={{ fontSize: 12, color: GOLD }}>اضغط ابدأ — تلُ بصوت وستظهر الكلمات تلقائياً</span>
                </div>
                <button onClick={startSession} style={pill(G700, "#fff", { width: "100%", padding: "17px", fontSize: 16 })}>
                  🎙️ Start Recitation · ابدأ التلاوة
                </button>
              </div>
            )}

            {(phase === "listening" || phase === "countdown") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Mic status indicator */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: micStatus === "on" ? G100 : "#f8fafb", borderRadius: 10, border: `1px solid ${micStatus === "on" ? "#9ae6b4" : BORDER}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Animated mic dot */}
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: micStatus === "on" ? G500 : "#94a3b8", animation: micStatus === "on" ? "pulse 1s infinite" : "none" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: G700 }}>
                        {phase === "countdown" ? "✓ Ayah complete!" : micStatus === "on" ? "Listening… recite now" : "Starting mic…"}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED }}>
                        {phase === "countdown" ? "يتم الانتقال تلقائياً" : "يستمع الميكروفون — تلُ الآن"}
                      </div>
                    </div>
                  </div>
                  {/* Sound wave animation */}
                  {micStatus === "on" && phase === "listening" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 24 }}>
                      {[10,16,8,22,12,18,8,14].map((h, i) => (
                        <div key={i} style={{ width: 3, height: h, background: G500, borderRadius: 2, opacity: .6, animation: `wave 1.1s ease-in-out ${i * .1}s infinite` }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Live transcript box */}
                <div style={{ background: transcript ? "#f0fff4" : "#f8fafb", border: `1px solid ${transcript ? "#9ae6b4" : BORDER}`, borderRadius: 10, padding: "10px 14px", minHeight: 52, transition: "all .3s" }}>
                  {transcript ? (
                    <div style={{ fontSize: 17, fontWeight: 700, color: G700, textAlign: "right", direction: "rtl", fontFamily: "'Amiri Quran',serif", lineHeight: 2 }}>
                      {transcript}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>
                      {phase === "listening" ? "🎙️ Speak — transcript appears here · ابدأ التلاوة" : "—"}
                    </div>
                  )}
                </div>

                {/* Words progress */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafb", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12, color: MUTED }}>Words revealed · الكلمات</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: G500 }}>{revealed} / {total}</span>
                </div>

                {/* End session */}
                <button onClick={endSession}
                  style={pill("#fff5f5", RED, { width: "100%", border: `1px solid #fca5a5`, padding: "11px" })}>
                  ⏹ End Session · إنهاء الجلسة
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
