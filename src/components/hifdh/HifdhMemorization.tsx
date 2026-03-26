// src/components/hifdh/HifdhMemorization.tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl } from "./surahData";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

interface Ayah { numberInSurah: number; text: string; }

type StepType = "overview" | "single" | "pair" | "cumulative";
interface MemStep {
  type: StepType;
  indices: number[];
  reps: number;
  label: string;
  labelAr: string;
}

function buildSteps(count: number): MemStep[] {
  if (count === 0) return [];
  const steps: MemStep[] = [];
  steps.push({ type: "overview", indices: Array.from({ length: count }, (_, i) => i), reps: 1, label: "Read All Verses — اقرأ جميع الآيات", labelAr: "تعرّف على النص قبل البدء" });
  for (let i = 0; i < count; i++) {
    steps.push({ type: "single", indices: [i], reps: 10, label: `Verse ${i + 1} — Repeat 10×`, labelAr: `الآية ${toAr(i + 1)} — كرر ١٠ مرات` });
    if (i > 0) {
      steps.push({ type: "pair", indices: [i - 1, i], reps: 5, label: `Verses ${i}–${i + 1} Together — 5×`, labelAr: `الآيتان ${toAr(i)}–${toAr(i + 1)} معاً — كرر ٥ مرات` });
      steps.push({ type: "cumulative", indices: Array.from({ length: i + 1 }, (_, k) => k), reps: 5, label: `Verses 1–${i + 1} Cumulative — 5×`, labelAr: `من ١ إلى ${toAr(i + 1)} تراكمياً — كرر ٥ مرات` });
    }
  }
  return steps;
}

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

const STEP_STYLE: Record<StepType, { bg: string; text: string; border: string; icon: string; gradient: string }> = {
  overview:   { bg: "#fffbeb", text: GOLD,       border: "#f6d860", icon: "📖", gradient: `linear-gradient(135deg,${GOLD},#e09b2f)` },
  single:     { bg: LIGHT,     text: G,           border: BORDER,    icon: "🎯", gradient: `linear-gradient(135deg,${G},${GM})` },
  pair:       { bg: "#eff6ff", text: "#2563eb",   border: "#bfdbfe", icon: "🔗", gradient: "linear-gradient(135deg,#2563eb,#3b82f6)" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed",   border: "#ddd6fe", icon: "📚", gradient: "linear-gradient(135deg,#7c3aed,#8b5cf6)" },
};

export default function HifdhMemorization() {
  const [surahNum, setSurahNum]       = useState(114);
  const [startVerse, setStartVerse]   = useState(1);
  const [endVerse, setEndVerse]       = useState(6);
  const [ayahs, setAyahs]             = useState<Ayah[]>([]);
  const [loading, setLoading]         = useState(false);
  const [fetchError, setFetchError]   = useState("");

  // Session state
  const [started, setStarted]         = useState(false);
  const [steps, setSteps]             = useState<MemStep[]>([]);
  const [stepIdx, setStepIdx]         = useState(0);
  const [repsDone, setRepsDone]       = useState(0);
  const [showHidden, setShowHidden]   = useState(false);
  const [completed, setCompleted]     = useState(false);
  const [isPlaying, setIsPlaying]     = useState(false);

  // Store ayahs captured at session start — prevents stale state issues
  const sessionAyahsRef = useRef<Ayah[]>([]);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const playingRef      = useRef(false);

  const surah = SURAHS[surahNum - 1];

  const fetchAyahs = useCallback(async () => {
    setLoading(true); setFetchError("");
    try {
      const res  = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setAyahs(json.data.ayahs as Ayah[]);
      else setFetchError("Could not load — please retry.");
    } catch { setFetchError("Network error."); }
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stopAudio = useCallback(() => {
    playingRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
  }, []);

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startVerse && a.numberInSurah <= endVerse);

  const startSession = () => {
    const s     = Math.max(1, startVerse);
    const e     = Math.min(surah.verses, Math.max(s, endVerse));
    const slice = ayahs.filter(a => a.numberInSurah >= s && a.numberInSurah <= e);
    if (slice.length === 0) return;

    sessionAyahsRef.current = slice;          // capture stable copy
    const newSteps = buildSteps(slice.length);
    setSteps(newSteps);
    setStepIdx(0);
    setRepsDone(0);
    setShowHidden(false);
    setCompleted(false);
    setStarted(true);
    stopAudio();
  };

  const playCurrentStep = () => {
    const step   = steps[stepIdx];
    const pool   = sessionAyahsRef.current;
    if (!step || pool.length === 0) return;

    stopAudio();
    playingRef.current = true;
    setIsPlaying(true);

    const toPlay = step.indices.map(i => pool[i]).filter(Boolean);
    let idx = 0;

    const playNext = () => {
      if (!playingRef.current || idx >= toPlay.length) { setIsPlaying(false); return; }
      const audio = new Audio(audioUrl(surahNum, toPlay[idx].numberInSurah));
      audioRef.current = audio;
      audio.play().catch(() => { setIsPlaying(false); playingRef.current = false; });
      audio.onended = () => { idx++; playNext(); };
    };
    playNext();
  };

  const markRep = () => {
    const step = steps[stepIdx];
    if (!step) return;
    const next = repsDone + 1;
    if (next >= step.reps) {
      if (stepIdx < steps.length - 1) {
        setStepIdx(stepIdx + 1);
        setRepsDone(0);
        setShowHidden(false);
        stopAudio();
      } else {
        stopAudio();
        setCompleted(true);
      }
    } else {
      setRepsDone(next);
    }
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  // ── COMPLETION SCREEN ─────────────────────────────────────────────
  if (completed) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card({ padding: "32px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 54, marginBottom: 12 }}>🎉</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: G, fontWeight: 700 }}>
            Session Complete!
          </div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD, marginTop: 6 }}>
            أحسنت! أكملت الجلسة
          </div>
          <div style={{ fontSize: 13, color: "#7a9e88", marginTop: 12, lineHeight: 1.6 }}>
            You completed all {steps.length} steps for<br />
            <strong style={{ color: G }}>Surah {surah.name}</strong> — Ayahs {startVerse}–{endVerse}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => { setStarted(false); setCompleted(false); }}
            style={{ padding: "13px 0", borderRadius: 12, border: `1px solid ${BORDER}`,
              background: "#f8fafb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ← New Setup
          </button>
          <button onClick={() => { setStarted(false); setCompleted(false); setTimeout(startSession, 100); }}
            style={{ padding: "13px 0", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔁 Repeat
          </button>
        </div>
      </div>
    );
  }

  // ── SETUP SCREEN ─────────────────────────────────────────────────
  if (!started) {
    const verseCount = Math.max(0, endVerse - startVerse + 1);
    const canStart   = !loading && ayahs.length > 0 && endVerse >= startVerse;

    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Hero */}
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🧠</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: "#fff", fontWeight: 700 }}>Memorization</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>
              نظام الحفظ المنهجي
            </div>
          </div>
          {/* Method strip */}
          <div style={{ background: "rgba(26,61,36,.06)", padding: "12px 16px", display: "flex", gap: 8, justifyContent: "center" }}>
            {[["🎯", "Single ×10"], ["🔗", "Pair ×5"], ["📚", "Cumul. ×5"]].map(([icon, lbl], i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: G, display: "flex", alignItems: "center", gap: 4 }}>
                <span>{icon}</span><span>{lbl}</span>
                {i < 2 && <span style={{ color: "#7a9e88", margin: "0 4px" }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Surah + Range */}
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
            {[["From Ayah", startVerse, (v: number) => setStartVerse(v), 1, surah.verses],
              ["To Ayah",   endVerse,   (v: number) => setEndVerse(v), startVerse, surah.verses]]
              .map(([label, val, setter, min, max], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 600, marginBottom: 4 }}>{label as string}</div>
                <input type="number" min={min as number} max={max as number} value={val as number}
                  onChange={e => (setter as Function)(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
                    fontSize: 15, color: G, background: "#f8fafb", fontWeight: 700 }} />
              </div>
            ))}
          </div>

          {/* Summary */}
          <div style={{ padding: "10px 14px", borderRadius: 12, background: LIGHT, border: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: G, fontWeight: 700 }}>{verseCount} verse{verseCount !== 1 ? "s" : ""}</span>
              <span style={{ color: "#7a9e88" }}>≈ {buildSteps(verseCount).length} steps</span>
              <span style={{ color: "#7a9e88" }}>≈ {verseCount * 4}–{verseCount * 6} min</span>
            </div>
          </div>
        </div>

        {/* Method cards */}
        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            METHOD STEPS · خطوات المنهج
          </div>
          {[
            { s: "single",     icon: "🎯", title: "Single Verse × 10",   desc: "Each verse repeated 10 times to build muscle memory",  color: G },
            { s: "pair",       icon: "🔗", title: "Pair Review × 5",     desc: "Previous + current verse together, 5 repetitions",      color: "#2563eb" },
            { s: "cumulative", icon: "📚", title: "Cumulative × 5",      desc: "All verses from verse 1 to current, 5 repetitions",     color: "#7c3aed" },
          ].map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 12px", borderRadius: 12,
              background: STEP_STYLE[m.s as StepType].bg, border: `1px solid ${STEP_STYLE[m.s as StepType].border}`,
              marginBottom: i < 2 ? 8 : 0 }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>{m.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Start button */}
        <button onClick={startSession} disabled={!canStart}
          style={{ padding: "15px 0", borderRadius: 14, border: "none", cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 15, fontWeight: 800 }}>
          {loading ? "Loading Quran…" : !canStart ? "Adjust verse range above" : "🧠 Begin Memorization · ابدأ الحفظ"}
        </button>

        {fetchError && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff5f5",
            border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {fetchError} — <button onClick={fetchAyahs}
              style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE SESSION ────────────────────────────────────────────────
  // Guard — should never be blank even if stepIdx is somehow wrong
  const currentStep = steps[stepIdx] ?? steps[0];
  if (!currentStep) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#7a9e88" }}>Starting session…</div>
      </div>
    );
  }

  const col       = STEP_STYLE[currentStep.type];
  const progress  = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;
  const pool      = sessionAyahsRef.current;
  const versesToShow = currentStep.type === "overview"
    ? pool
    : currentStep.indices.map(i => pool[i]).filter(Boolean);

  const card2 = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Progress bar */}
      <div style={card2({ padding: "14px 16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>
            Step <strong style={{ color: G }}>{stepIdx + 1}</strong> / {steps.length}
          </div>
          <button onClick={() => { stopAudio(); setStarted(false); setStepIdx(0); setRepsDone(0); }}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End
          </button>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 4,
            background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .4s ease" }} />
        </div>
        <div style={{ fontSize: 10, color: "#7a9e88", marginTop: 4, textAlign: "right" }}>{Math.round(progress)}%</div>
      </div>

      {/* Step badge */}
      <div style={{ padding: "14px 16px", borderRadius: 16, background: col.bg,
        border: `1px solid ${col.border}`, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 26 }}>{col.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: col.text }}>{currentStep.label.split("—")[0].trim()}</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: col.text, opacity: .85 }}>{currentStep.labelAr}</div>
          </div>
        </div>
      </div>

      {/* Verse display */}
      <div style={card2({ padding: "16px" })}>
        {currentStep.type === "overview" && (
          <div style={{ textAlign: "center", marginBottom: 10, fontSize: 12, color: "#7a9e88" }}>
            Read all verses to familiarise yourself · اقرأ لتتعرف على النص
          </div>
        )}
        {versesToShow.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#7a9e88", fontSize: 13 }}>Loading verses…</div>
        ) : versesToShow.map((ayah, i) => {
          const isHighlight = i === 0 && currentStep.type === "single";
          const isCumHidden = currentStep.type === "cumulative" && !showHidden;
          return (
            <div key={ayah.numberInSurah} style={{
              padding: "12px 14px", borderRadius: 12, marginBottom: 8,
              background: isHighlight ? "#fffbeb" : "#fafafa",
              border: `1px solid ${isHighlight ? "#f6d860" : "#f0f4f0"}`,
              direction: "rtl"
            }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6, direction: "ltr" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: isHighlight ? GOLD : LIGHT,
                  border: `1px solid ${isHighlight ? GOLD : BORDER}`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Amiri',serif", fontSize: 11, fontWeight: 700,
                    color: isHighlight ? "#fff" : G }}>
                    {toAr(ayah.numberInSurah)}
                  </span>
                </div>
              </div>
              <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 24, color: G,
                lineHeight: 2, textAlign: "right",
                opacity: isCumHidden ? 0.25 : 1, filter: isCumHidden ? "blur(4px)" : "none",
                transition: "all .3s" }}>
                {ayah.text}
              </div>
            </div>
          );
        })}
        {currentStep.type === "cumulative" && !showHidden && (
          <button onClick={() => setShowHidden(true)}
            style={{ width: "100%", padding: "10px 0", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88",
              fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
            👁 Reveal Text · أظهر النص
          </button>
        )}
      </div>

      {/* Rep counter */}
      {currentStep.type !== "overview" && (
        <div style={card2({ padding: "14px", textAlign: "center" })}>
          <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 700, letterSpacing: .5, marginBottom: 10 }}>
            REPETITIONS · التكرارات
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap" as const, marginBottom: 10 }}>
            {Array.from({ length: currentStep.reps }, (_, i) => (
              <div key={i} style={{
                width: 34, height: 34, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, transition: "all .2s",
                background: i < repsDone ? col.gradient : "#f0f4f0",
                color: i < repsDone ? "#fff" : "#7a9e88",
                border: `2px solid ${i === repsDone ? GOLD : "transparent"}`,
                boxShadow: i === repsDone ? `0 0 0 2px ${GOLD}44` : "none",
              }}>
                {i < repsDone ? "✓" : i + 1}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: G }}>
            {repsDone} <span style={{ fontSize: 14, color: "#7a9e88" }}>/ {currentStep.reps}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        {isPlaying ? (
          <button onClick={stopAudio}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
              background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ⏹ Stop Audio
          </button>
        ) : (
          <button onClick={playCurrentStep}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12,
              border: `1px solid ${BORDER}`, background: LIGHT,
              color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔊 Listen
          </button>
        )}
        <button onClick={markRep}
          style={{ flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
            background: col.gradient, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          {currentStep.type === "overview"
            ? "Begin Memorizing →"
            : repsDone + 1 >= currentStep.reps
              ? stepIdx < steps.length - 1 ? "✓ Done → Next" : "🎉 Finish!"
              : `✓ Rep ${repsDone + 1} / ${currentStep.reps}`}
        </button>
      </div>

      {/* Back button */}
      <button onClick={() => {
        stopAudio();
        if (stepIdx > 0) { setStepIdx(stepIdx - 1); setRepsDone(0); setShowHidden(false); }
        else { setStarted(false); }
      }} style={{ padding: "10px 0", borderRadius: 10, border: `1px solid ${BORDER}`,
        background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
        ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
      </button>
    </div>
  );
}
