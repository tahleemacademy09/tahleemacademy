// src/components/hifdh/HifdhMemorization.tsx
// Structured memorization method: individual → pair → cumulative review
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl } from "./surahData";

const C = { green: "#1a3d24", gold: "#b7791f", light: "#f0fff4", border: "#d4e8d4" };

interface Ayah { numberInSurah: number; text: string; }

type StepType = "overview" | "single" | "pair" | "cumulative";
interface MemStep {
  type: StepType;
  indices: number[]; // which verse indices (0-based) to show
  reps: number;
  label: string;
  labelAr: string;
}

function buildSteps(count: number): MemStep[] {
  if (count === 0) return [];
  const steps: MemStep[] = [];

  // Overview
  steps.push({
    type: "overview",
    indices: Array.from({ length: count }, (_, i) => i),
    reps: 1,
    label: "Read All Verses",
    labelAr: "اقرأ جميع الآيات",
  });

  for (let i = 0; i < count; i++) {
    // Single verse × 10
    steps.push({
      type: "single",
      indices: [i],
      reps: 10,
      label: `Verse ${i + 1} — Repeat 10×`,
      labelAr: `الآية ${toArabicNum(i + 1)} — كرر ١٠ مرات`,
    });

    if (i > 0) {
      // Previous + current pair × 5
      steps.push({
        type: "pair",
        indices: [i - 1, i],
        reps: 5,
        label: `Verses ${i}–${i + 1} Together — Repeat 5×`,
        labelAr: `الآيتان ${toArabicNum(i)}–${toArabicNum(i + 1)} معاً — كرر ٥ مرات`,
      });

      // Cumulative from beginning to current × 5
      steps.push({
        type: "cumulative",
        indices: Array.from({ length: i + 1 }, (_, k) => k),
        reps: 5,
        label: `Verses 1–${i + 1} Cumulative — Repeat 5×`,
        labelAr: `من الآية ١ إلى ${toArabicNum(i + 1)} تراكمياً — كرر ٥ مرات`,
      });
    }
  }

  return steps;
}

function toArabicNum(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

const stepColors: Record<StepType, { bg: string; text: string; border: string; icon: string }> = {
  overview:   { bg: "#fffbeb", text: "#b7791f", border: "#f6d860", icon: "📖" },
  single:     { bg: C.light,  text: C.green,   border: C.border,  icon: "🎯" },
  pair:       { bg: "#f0f4ff", text: "#2563eb", border: "#bfdbfe", icon: "🔗" },
  cumulative: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe", icon: "📚" },
};

export default function HifdhMemorization() {
  const [surahNum, setSurahNum] = useState(114);
  const [startVerse, setStartVerse] = useState(1);
  const [endVerse, setEndVerse] = useState(6);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [steps, setSteps] = useState<MemStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [repsDone, setRepsDone] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const surah = SURAHS[surahNum - 1];

  const fetchAyahs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setAyahs(json.data.ayahs as Ayah[]);
      else setError("Failed to load. Try again.");
    } catch { setError("Network error. Check your connection."); }
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);

  const startSession = () => {
    const s = Math.max(1, startVerse);
    const e = Math.min(surah.verses, Math.max(s, endVerse));
    const slice = ayahs.filter(a => a.numberInSurah >= s && a.numberInSurah <= e);
    if (slice.length === 0) return;
    const newSteps = buildSteps(slice.length);
    setSteps(newSteps);
    setStepIdx(0);
    setRepsDone(0);
    setStarted(true);
    setShowHidden(false);
  };

  const currentStep = steps[stepIdx];
  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startVerse && a.numberInSurah <= endVerse);

  const playCurrentStep = () => {
    if (!currentStep) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(true);
    const toPlay = currentStep.indices.map(i => selectedAyahs[i]).filter(Boolean);
    let idx = 0;
    const playNext = () => {
      if (idx >= toPlay.length) { setIsPlaying(false); return; }
      const audio = new Audio(audioUrl(surahNum, toPlay[idx].numberInSurah));
      audioRef.current = audio;
      audio.play().catch(() => { setIsPlaying(false); });
      audio.onended = () => { idx++; playNext(); };
    };
    playNext();
  };

  const stopAudio = () => {
    audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false);
  };

  const markRep = () => {
    const newReps = repsDone + 1;
    if (newReps >= currentStep.reps) {
      // advance
      if (stepIdx < steps.length - 1) {
        setStepIdx(v => v + 1);
        setRepsDone(0);
        setShowHidden(false);
        stopAudio();
      } else {
        // finished!
        setStarted(false);
      }
    } else {
      setRepsDone(newReps);
    }
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", ...ex,
  });

  // ── Setup screen ─────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Header */}
        <div style={card({ padding: "18px", background: "linear-gradient(135deg,#1a3d24,#276749)", border: "none" })}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧠</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#fff", fontWeight: 700 }}>Memorization Mode</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>نظام الحفظ المنهجي</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 8, lineHeight: 1.6 }}>
              Scientific repetition method · verse by verse · pair review · cumulative
            </div>
          </div>
        </div>

        {/* Surah Select */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Select Surah · اختر السورة</div>
          <select value={surahNum} onChange={e => { setSurahNum(Number(e.target.value)); setStartVerse(1); setEndVerse(1); }}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
              fontSize: 14, color: C.green, background: "#f8fafb", marginBottom: 12 }}>
            {SURAHS.map(s => (
              <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr} ({s.verses} v)</option>
            ))}
          </select>

          {/* Verse Range */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>Verse Range · نطاق الآيات</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>From Ayah · من الآية</div>
              <input type="number" min={1} max={surah.verses} value={startVerse}
                onChange={e => setStartVerse(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
                  fontSize: 14, color: C.green, background: "#f8fafb" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>To Ayah · إلى الآية</div>
              <input type="number" min={startVerse} max={surah.verses} value={endVerse}
                onChange={e => setEndVerse(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
                  fontSize: 14, color: C.green, background: "#f8fafb" }} />
            </div>
          </div>

          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: C.light, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: "#7a9e88" }}>
              {Math.max(0, endVerse - startVerse + 1)} verses · Approx {buildSteps(Math.max(0, endVerse - startVerse + 1)).length} steps
            </span>
          </div>
        </div>

        {/* Method Explanation */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Memorization Method · الطريقة</div>
          {[
            { icon: "🎯", title: "Single Verse × 10", desc: "Each verse repeated 10 times to build initial retention", color: C.green },
            { icon: "🔗", title: "Pair Review × 5",   desc: "Previous + current verse together, 5 repetitions",       color: "#2563eb" },
            { icon: "📚", title: "Cumulative × 5",    desc: "All verses from beginning to current, 5 repetitions",    color: "#7c3aed" },
          ].map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10,
              padding: "10px 12px", borderRadius: 10, background: "#fafafa", border: "1px solid #f0f4f0" }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>{m.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Start */}
        <button onClick={startSession} disabled={loading || ayahs.length === 0 || endVerse < startVerse}
          style={{ padding: "14px 0", borderRadius: 14, border: "none",
            background: loading || ayahs.length === 0 || endVerse < startVerse
              ? "#f0f4f0" : "linear-gradient(135deg,#1a3d24,#276749)",
            color: loading || ayahs.length === 0 || endVerse < startVerse ? "#7a9e88" : "#fff",
            fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Loading Quran…" : "🧠 Begin Memorization · ابدأ الحفظ"}
        </button>

        {error && (
          <div style={{ padding: "12px", borderRadius: 10, background: "#fff5f5", border: "1px solid #fca5a5",
            fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {error} <button onClick={fetchAyahs} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  // ── Active memorization session ───────────────────────────────────
  if (!currentStep) return null;
  const col = stepColors[currentStep.type];
  const progress = (stepIdx / steps.length) * 100;
  const versesToShow = currentStep.type === "overview"
    ? selectedAyahs
    : currentStep.indices.map(i => selectedAyahs[i]).filter(Boolean);

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Progress Header */}
      <div style={card({ padding: "14px 16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>
            Step <strong style={{ color: C.green }}>{stepIdx + 1}</strong> of <strong style={{ color: C.green }}>{steps.length}</strong>
          </div>
          <button onClick={() => { stopAudio(); setStarted(false); }}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End Session
          </button>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 4,
            background: "linear-gradient(90deg,#1a3d24,#b7791f)", transition: "width .5s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 6, textAlign: "right" }}>{Math.round(progress)}% complete</div>
      </div>

      {/* Step Type Badge */}
      <div style={{ padding: "12px 16px", borderRadius: 14, background: col.bg, border: `1px solid ${col.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{col.icon}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: col.text }}>{currentStep.label}</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: col.text, opacity: 0.85, marginTop: 3 }}>{currentStep.labelAr}</div>
      </div>

      {/* Verses Display */}
      <div style={card({ padding: "20px 16px" })}>
        {currentStep.type === "overview" ? (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#7a9e88" }}>Read through all verses to familiarize yourself</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: C.gold, marginTop: 2 }}>اقرأ جميع الآيات للتعرف عليها أولاً</div>
          </div>
        ) : null}

        <div style={{ textAlign: "right", direction: "rtl", lineHeight: 2.4 }}>
          {versesToShow.map((ayah, i) => (
            <div key={ayah.numberInSurah} style={{
              padding: "12px 14px", borderRadius: 12, marginBottom: 8,
              background: i === 0 && currentStep.type === "single" ? "#fffbeb" : "#fafafa",
              border: `1px solid ${i === 0 && currentStep.type === "single" ? "#f6d860" : "#f0f4f0"}`,
            }}>
              <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, color: C.green, lineHeight: 2 }}>
                {showHidden || currentStep.type !== "cumulative" ? ayah.text : (
                  <span style={{ opacity: 0.3, letterSpacing: 2 }}>
                    {Array.from({ length: ayah.text.length }).fill("█").join("")}
                  </span>
                )}
                <span style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: C.gold, marginRight: 6 }}>
                  ﴿{toArabicNum(ayah.numberInSurah)}﴾
                </span>
              </div>
            </div>
          ))}
        </div>

        {currentStep.type === "cumulative" && !showHidden && (
          <button onClick={() => setShowHidden(true)}
            style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`,
              background: "#f8fafb", color: "#7a9e88", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
            👁 Show Text · أظهر النص
          </button>
        )}
      </div>

      {/* Repetition Counter */}
      {currentStep.type !== "overview" && (
        <div style={card({ padding: "16px", textAlign: "center" })}>
          <div style={{ fontSize: 12, color: "#7a9e88", marginBottom: 8 }}>Repetitions · التكرارات</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
            {Array.from({ length: currentStep.reps }, (_, i) => (
              <div key={i} style={{
                width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: i < repsDone ? C.green : "#f0f4f0",
                color: i < repsDone ? "#fff" : "#7a9e88",
                border: i === repsDone ? `2px solid ${C.gold}` : "2px solid transparent",
                transition: "all .2s",
              }}>
                {i < repsDone ? "✓" : i + 1}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: C.green }}>
            {repsDone} / {currentStep.reps}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        {isPlaying ? (
          <button onClick={stopAudio}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
              background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ⏹ Stop Audio
          </button>
        ) : (
          <button onClick={playCurrentStep}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
              background: "#f0fff4", color: C.green, fontSize: 14, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${C.border}` as any }}>
            🔊 Play Audio
          </button>
        )}
        <button onClick={markRep}
          style={{ flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#1a3d24,#276749)", color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {currentStep.type === "overview"
            ? "Start Memorizing →"
            : repsDone + 1 >= currentStep.reps
              ? stepIdx < steps.length - 1 ? "✓ Done → Next Step" : "🎉 Complete!"
              : `✓ Rep ${repsDone + 1}/${currentStep.reps} · Repeat`}
        </button>
      </div>

      {/* Back */}
      <button onClick={() => { stopAudio(); if (stepIdx > 0) { setStepIdx(v => v - 1); setRepsDone(0); } else setStarted(false); }}
        style={{ padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "#f8fafb",
          color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
        ← {stepIdx === 0 ? "Back to Setup" : "Previous Step"}
      </button>
    </div>
  );
}
