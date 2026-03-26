// src/components/hifdh/HifdhExercise.tsx
// 6-stage progressive recall exercise for Quran memorization
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl } from "./surahData";

const C = { green: "#1a3d24", gold: "#b7791f", light: "#f0fff4", border: "#d4e8d4" };

interface Ayah { numberInSurah: number; text: string; }

function toArabicNum(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function getFirstNWords(text: string, n: number): string {
  return text.split(" ").slice(0, n).join(" ");
}

type StageKey = 1 | 2 | 3 | 4 | 5 | 6;

const STAGE_INFO: Record<StageKey, { icon: string; title: string; titleAr: string; desc: string; color: string; bg: string }> = {
  1: { icon: "📖", title: "Full Verse Prompt",     titleAr: "آية كاملة",          desc: "A full verse is shown. Read the next 2 verses after it.",         color: C.green,   bg: C.light },
  2: { icon: "📚", title: "Full Verse — Extended", titleAr: "آية كاملة موسعة",    desc: "A full verse is shown. Read the next 4 verses after it.",         color: "#276749", bg: "#e6ffed" },
  3: { icon: "✂️", title: "Half Ayah Prompt",      titleAr: "نصف آية",             desc: "First half of a verse. Complete the verse and continue 2 more.", color: "#2563eb", bg: "#eff6ff" },
  4: { icon: "🔤", title: "Half Ayah — Extended",  titleAr: "نصف آية موسعة",       desc: "First half shown. Complete and continue through next verse.",    color: "#1d4ed8", bg: "#dbeafe" },
  5: { icon: "💡", title: "Single Word Prompt",    titleAr: "كلمة واحدة",          desc: "Only the first word is shown. Continue from there.",             color: "#7c3aed", bg: "#f5f3ff" },
  6: { icon: "🏁", title: "Full Page Challenge",    titleAr: "تحدي الصفحة الكاملة", desc: "First verse of the section shown. Recite all verses to the end.", color: "#b7791f", bg: "#fffbeb" },
};

interface Question {
  stage: StageKey;
  prompt: string;
  answer: string[]; // verses to recite after the prompt
  promptLabel: string;
  answerLabel: string;
}

export default function HifdhExercise() {
  const [surahNum, setSurahNum] = useState(114);
  const [startV, setStartV]     = useState(1);
  const [endV, setEndV]         = useState(6);
  const [stage, setStage]       = useState<StageKey>(1);
  const [ayahs, setAyahs]       = useState<Ayah[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [started, setStarted]   = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore]       = useState({ correct: 0, total: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const surah = SURAHS[surahNum - 1];

  const fetchAyahs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setAyahs(json.data.ayahs as Ayah[]);
      else setError("Failed to load. Try again.");
    } catch { setError("Network error."); }
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);

  const generateQuestion = useCallback((stg: StageKey, pool: Ayah[]) => {
    if (pool.length < 2) return null;

    let promptIdx: number;
    let prompt: string;
    let answer: string[];
    let promptLabel: string;
    let answerLabel: string;

    switch (stg) {
      case 1: {
        // Full verse, read 2 after
        promptIdx = Math.floor(Math.random() * Math.max(1, pool.length - 2));
        prompt = pool[promptIdx].text;
        answer = pool.slice(promptIdx + 1, promptIdx + 3).map(a => a.text);
        promptLabel = `Surah ${SURAHS[surahNum-1].name} • Verse ${pool[promptIdx].numberInSurah}`;
        answerLabel = "Read the next 2 verses:";
        break;
      }
      case 2: {
        // Full verse, read 4 after
        promptIdx = Math.floor(Math.random() * Math.max(1, pool.length - 4));
        prompt = pool[promptIdx].text;
        answer = pool.slice(promptIdx + 1, promptIdx + 5).map(a => a.text);
        promptLabel = `Surah ${SURAHS[surahNum-1].name} • Verse ${pool[promptIdx].numberInSurah}`;
        answerLabel = "Read the next 4 verses:";
        break;
      }
      case 3: {
        // Half verse, complete + 2 more
        promptIdx = Math.floor(Math.random() * Math.max(1, pool.length - 2));
        const words = pool[promptIdx].text.split(" ");
        const half = Math.max(1, Math.floor(words.length / 2));
        prompt = getFirstNWords(pool[promptIdx].text, half) + " …";
        answer = [
          words.slice(half).join(" ") + " (complete verse " + pool[promptIdx].numberInSurah + ")",
          ...pool.slice(promptIdx + 1, promptIdx + 3).map(a => a.text),
        ];
        promptLabel = `Half of Verse ${pool[promptIdx].numberInSurah}`;
        answerLabel = "Complete this verse, then recite 2 more:";
        break;
      }
      case 4: {
        // Half verse, complete + 1 more full verse
        promptIdx = Math.floor(Math.random() * Math.max(1, pool.length - 1));
        const words4 = pool[promptIdx].text.split(" ");
        const half4 = Math.max(1, Math.floor(words4.length / 2));
        prompt = getFirstNWords(pool[promptIdx].text, half4) + " …";
        answer = [
          words4.slice(half4).join(" ") + " (complete verse " + pool[promptIdx].numberInSurah + ")",
          ...pool.slice(promptIdx + 1, promptIdx + 2).map(a => a.text),
        ];
        promptLabel = `Half of Verse ${pool[promptIdx].numberInSurah}`;
        answerLabel = "Complete this verse and the next:";
        break;
      }
      case 5: {
        // First word only
        promptIdx = Math.floor(Math.random() * pool.length);
        const firstWord = pool[promptIdx].text.split(" ")[0];
        prompt = firstWord + " …";
        answer = [pool[promptIdx].text + " (full verse " + pool[promptIdx].numberInSurah + ")"];
        promptLabel = `First word of Verse ${pool[promptIdx].numberInSurah}`;
        answerLabel = "Complete the full verse:";
        break;
      }
      case 6: {
        // First verse, read all
        prompt = pool[0].text;
        answer = pool.slice(1).map(a => a.text);
        promptLabel = `Beginning of ${SURAHS[surahNum-1].name}`;
        answerLabel = "Recite all remaining verses to the end:";
        break;
      }
    }

    return { stage: stg, prompt, answer: answer!, promptLabel: promptLabel!, answerLabel: answerLabel! };
  }, [surahNum]);

  const nextQuestion = useCallback(() => {
    const q = generateQuestion(stage, selectedAyahs);
    setQuestion(q); setRevealed(false); stopAudio();
  }, [generateQuestion, stage, selectedAyahs]);

  const startSession = () => {
    setScore({ correct: 0, total: 0 });
    setStarted(true);
    setRevealed(false);
    const q = generateQuestion(stage, selectedAyahs);
    setQuestion(q);
  };

  const markAnswer = (correct: boolean) => {
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    nextQuestion();
  };

  const playPrompt = () => {
    if (!question) return;
    // Find the ayah number for this prompt
    const promptAyah = selectedAyahs.find(a => question.prompt.includes(a.text.split(" ")[0]));
    if (!promptAyah) return;
    stopAudio();
    setIsPlaying(true);
    const audio = new Audio(audioUrl(surahNum, promptAyah.numberInSurah));
    audioRef.current = audio;
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => setIsPlaying(false);
  };

  const stopAudio = () => {
    audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false);
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", ...ex,
  });

  // ── Stage Selection Screen ───────────────────────────────────────
  if (!started) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

        <div style={card({ padding: "18px", background: "linear-gradient(135deg,#1a4731,#b7791f)", border: "none" })}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#fff", fontWeight: 700 }}>Listen Exercise</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>تمرين الاستماع والاسترجاع</div>
          </div>
        </div>

        {/* Surah + Range */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>Surah · السورة</div>
          <select value={surahNum} onChange={e => setSurahNum(Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
              fontSize: 14, color: C.green, background: "#f8fafb", marginBottom: 12 }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>From Verse</div>
              <input type="number" min={1} max={surah.verses} value={startV} onChange={e => setStartV(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.green, background: "#f8fafb" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>To Verse</div>
              <input type="number" min={startV} max={surah.verses} value={endV} onChange={e => setEndV(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.green, background: "#f8fafb" }} />
            </div>
          </div>
        </div>

        {/* Stage Selection */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Select Stage · اختر المرحلة</div>
          {([1, 2, 3, 4, 5, 6] as StageKey[]).map(s => {
            const info = STAGE_INFO[s];
            return (
              <div key={s} onClick={() => setStage(s)}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px", borderRadius: 12,
                  marginBottom: 8, cursor: "pointer",
                  background: stage === s ? info.bg : "#fafafa",
                  border: `1.5px solid ${stage === s ? info.color + "44" : "#f0f4f0"}`,
                  transition: "all .15s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 18, background: stage === s ? info.color : "#f0f4f0",
                  flexShrink: 0, transition: "background .15s" }}>
                  <span>{info.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: stage === s ? info.color : C.green }}>
                    Stage {s}: {info.title}
                    <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: C.gold, marginLeft: 6 }}>· {info.titleAr}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>{info.desc}</div>
                </div>
                {stage === s && <div style={{ color: info.color, fontSize: 16, flexShrink: 0 }}>●</div>}
              </div>
            );
          })}
        </div>

        <button onClick={startSession} disabled={loading || selectedAyahs.length < 2}
          style={{ padding: "14px 0", borderRadius: 14, border: "none",
            background: loading || selectedAyahs.length < 2 ? "#f0f4f0" : `linear-gradient(135deg,${STAGE_INFO[stage].color},${C.green})`,
            color: loading || selectedAyahs.length < 2 ? "#7a9e88" : "#fff",
            fontSize: 15, fontWeight: 700, cursor: loading || selectedAyahs.length < 2 ? "not-allowed" : "pointer" }}>
          {loading ? "Loading…" : `🎯 Start Stage ${stage} · ابدأ المرحلة ${toArabicNum(stage)}`}
        </button>

        {error && <div style={{ padding: "12px", borderRadius: 10, background: "#fff5f5", border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>{error}</div>}
      </div>
    );
  }

  // ── Active Exercise Screen ────────────────────────────────────────
  const info = STAGE_INFO[stage];
  if (!question) return null;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ padding: "6px 12px", borderRadius: 10, background: info.bg, border: `1px solid ${info.color}44` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{info.icon} Stage {stage}: {info.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>
            ✅ <strong style={{ color: C.green }}>{score.correct}</strong>/{score.total}
          </div>
          <button onClick={() => { stopAudio(); setStarted(false); }}
            style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div style={card({ padding: "18px" })}>
        <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 600, marginBottom: 6 }}>{question.promptLabel}</div>
        <div style={{ direction: "rtl", textAlign: "right", fontFamily: "'Amiri Quran',serif",
          fontSize: 24, color: C.green, lineHeight: 2, padding: "10px 0",
          borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
          {question.prompt}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={isPlaying ? stopAudio : playPrompt}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`,
              background: isPlaying ? "#fee2e2" : "#f8fafb",
              color: isPlaying ? "#c0392b" : C.green, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {isPlaying ? "⏹ Stop" : "🔊 Hear Prompt"}
          </button>
          <button onClick={nextQuestion}
            style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
              background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
            Skip →
          </button>
        </div>
      </div>

      {/* Task */}
      <div style={{ padding: "12px 16px", borderRadius: 12, background: info.bg, border: `1px solid ${info.color}44` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{question.answerLabel}</div>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
          {info.desc}
        </div>
      </div>

      {/* Answer reveal */}
      {!revealed ? (
        <button onClick={() => setRevealed(true)}
          style={{ padding: "14px 0", borderRadius: 14, border: `2px solid ${info.color}44`,
            background: "#fafafa", color: C.green, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          👁 Reveal Answer · أظهر الإجابة
        </button>
      ) : (
        <>
          <div style={card({ padding: "18px" })}>
            <div style={{ fontSize: 12, color: "#7a9e88", fontWeight: 600, marginBottom: 10 }}>Answer · الإجابة</div>
            {question.answer.map((text, i) => (
              <div key={i} style={{ direction: "rtl", textAlign: "right", fontFamily: "'Amiri Quran',serif",
                fontSize: 22, color: C.green, lineHeight: 2, padding: "8px 0",
                borderBottom: i < question.answer.length - 1 ? `1px dashed ${C.border}` : "none" }}>
                {text}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => markAnswer(false)}
              style={{ padding: "13px 0", borderRadius: 12, border: "none",
                background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✗ Wrong
            </button>
            <button onClick={() => markAnswer(true)}
              style={{ padding: "13px 0", borderRadius: 12,
                background: "#f0fff4", color: "#276749", fontSize: 14, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${C.border}` }}>
              ✓ Correct
            </button>
          </div>
        </>
      )}

      {/* Score summary */}
      {score.total > 0 && (
        <div style={card({ padding: "12px 16px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#7a9e88" }}>Session Score</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.green }}>
              {score.correct}/{score.total} ({Math.round(score.correct / score.total * 100)}%)
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#f0f4f0", overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${Math.round(score.correct / score.total * 100)}%`, height: "100%",
              borderRadius: 3, background: "linear-gradient(90deg,#276749,#b7791f)", transition: "width .4s" }} />
          </div>
        </div>
      )}

      {/* Switch Stage */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        {([1, 2, 3, 4, 5, 6] as StageKey[]).map(s => (
          <button key={s} onClick={() => { setStage(s); setStarted(false); }}
            style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${stage === s ? STAGE_INFO[s].color : C.border}`,
              background: stage === s ? STAGE_INFO[s].bg : "#fafafa",
              color: stage === s ? STAGE_INFO[s].color : "#7a9e88", fontSize: 12, fontWeight: stage === s ? 700 : 400, cursor: "pointer" }}>
            S{s}
          </button>
        ))}
      </div>
    </div>
  );
}

