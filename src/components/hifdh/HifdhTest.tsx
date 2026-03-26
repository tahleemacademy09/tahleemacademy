// src/components/hifdh/HifdhTest.tsx
// Hifdh Test: timed test with multiple question types, scoring & report
import { useState, useCallback, useEffect, useRef } from "react";
import { SURAHS, audioUrl } from "./surahData";
import { supabase } from "@/integrations/supabase/client";

const C = { green: "#1a3d24", gold: "#b7791f", light: "#f0fff4", border: "#d4e8d4" };

interface Ayah { numberInSurah: number; text: string; }

function toArabicNum(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type QType = "next_verse" | "missing_word" | "identify_verse" | "order_verses";

interface Question {
  id: number;
  type: QType;
  prompt: string;
  promptAr?: string;
  options: string[];
  correct: number; // index in options
  explanation?: string;
}

function buildQuestions(ayahs: Ayah[], surahName: string): Question[] {
  if (ayahs.length < 3) return [];
  const qs: Question[] = [];
  let id = 0;

  // Q type 1: "What verse comes after this?" (multiple choice)
  for (let i = 0; i < Math.min(3, ayahs.length - 1); i++) {
    const idx = Math.floor(Math.random() * (ayahs.length - 1));
    const correct = ayahs[idx + 1];
    const wrongs = shuffle(ayahs.filter((_, j) => j !== idx + 1)).slice(0, 3);
    const opts = shuffle([correct, ...wrongs]);
    qs.push({
      id: id++,
      type: "next_verse",
      prompt: ayahs[idx].text,
      promptAr: `Verse ${toArabicNum(ayahs[idx].numberInSurah)} • ${surahName}`,
      options: opts.map(o => o.text),
      correct: opts.indexOf(correct),
      explanation: `The next verse is verse ${correct.numberInSurah}`,
    });
  }

  // Q type 2: "Which word is missing?" (fill in blank)
  for (let i = 0; i < Math.min(3, ayahs.length); i++) {
    const ayah = ayahs[Math.floor(Math.random() * ayahs.length)];
    const words = ayah.text.split(" ");
    if (words.length < 4) continue;
    const blankIdx = Math.floor(Math.random() * words.length);
    const correctWord = words[blankIdx];
    const blanked = words.map((w, j) => j === blankIdx ? "____" : w).join(" ");
    // Generate wrong options from other words in the surah
    const allWords = ayahs.flatMap(a => a.text.split(" ")).filter(w => w !== correctWord);
    const wrongs = shuffle(allWords).slice(0, 3);
    const opts = shuffle([correctWord, ...wrongs]);
    qs.push({
      id: id++,
      type: "missing_word",
      prompt: blanked,
      promptAr: `Complete Verse ${toArabicNum(ayah.numberInSurah)}`,
      options: opts,
      correct: opts.indexOf(correctWord),
    });
  }

  // Q type 3: "Which verse number is this?"
  for (let i = 0; i < Math.min(2, ayahs.length); i++) {
    const ayah = ayahs[Math.floor(Math.random() * ayahs.length)];
    const correctNum = ayah.numberInSurah;
    const wrongNums = shuffle(
      ayahs.map(a => a.numberInSurah).filter(n => n !== correctNum)
    ).slice(0, 3);
    const opts = shuffle([correctNum, ...wrongNums]).map(n => `Verse ${n} · آية ${toArabicNum(n)}`);
    const correctOpt = `Verse ${correctNum} · آية ${toArabicNum(correctNum)}`;
    qs.push({
      id: id++,
      type: "identify_verse",
      prompt: ayah.text,
      promptAr: `Which verse number in ${surahName}?`,
      options: opts,
      correct: opts.indexOf(correctOpt),
    });
  }

  return shuffle(qs).slice(0, 10); // max 10 questions
}

export default function HifdhTest() {
  const [surahNum, setSurahNum]   = useState(114);
  const [startV, setStartV]       = useState(1);
  const [endV, setEndV]           = useState(6);
  const [ayahs, setAyahs]         = useState<Ayah[]>([]);
  const [loading, setLoading]     = useState(false);
  const [started, setStarted]     = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx]           = useState(0);
  const [answers, setAnswers]     = useState<(number | null)[]>([]);
  const [selected, setSelected]   = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [finished, setFinished]   = useState(false);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();
  const surah = SURAHS[surahNum - 1];

  const fetchAyahs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setAyahs(json.data.ayahs as Ayah[]);
    } catch {}
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timerActive, timeLeft]);

  useEffect(() => {
    if (timerActive && timeLeft === 0 && !finished) finishTest();
  }, [timeLeft, timerActive]);

  useEffect(() => () => { audioRef.current?.pause(); clearTimeout(timerRef.current); }, []);

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);

  const startTest = () => {
    const qs = buildQuestions(selectedAyahs, surah.name);
    setQuestions(qs);
    setAnswers(new Array(qs.length).fill(null));
    setQIdx(0); setSelected(null); setConfirmed(false);
    setFinished(false);
    setTimeLeft(qs.length * 30); // 30s per question
    setTimerActive(true);
    setStarted(true);
  };

  const confirmAnswer = () => {
    if (selected === null) return;
    const newAnswers = [...answers];
    newAnswers[qIdx] = selected;
    setAnswers(newAnswers);
    setConfirmed(true);
  };

  const nextQuestion = () => {
    if (qIdx < questions.length - 1) {
      setQIdx(v => v + 1); setSelected(null); setConfirmed(false);
    } else {
      finishTest();
    }
  };

  const finishTest = () => {
    setTimerActive(false); setFinished(true); audioRef.current?.pause();
    // Save to supabase
    const correct = questions.filter((q, i) => answers[i] === q.correct).length;
    const pct = Math.round((correct / questions.length) * 100);
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase.from("hifdh_sessions").insert({
        student_id: data.user.id,
        surah_name: surah.name,
        ayah_start: startV,
        accuracy_score: pct,
        duration: questions.length * 30 - timeLeft,
      }).catch(() => {});
    });
  };

  const playAyah = (num: number) => {
    audioRef.current?.pause(); setIsPlaying(true);
    const audio = new Audio(audioUrl(surahNum, num));
    audioRef.current = audio;
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => setIsPlaying(false);
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", ...ex,
  });

  const QTypeLabel: Record<QType, { icon: string; label: string }> = {
    next_verse:     { icon: "➡️", label: "What comes next?" },
    missing_word:   { icon: "🔍", label: "Missing word" },
    identify_verse: { icon: "🔢", label: "Verse number" },
    order_verses:   { icon: "🔀", label: "Order verses" },
  };

  // ── Setup ────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card({ padding: "18px", background: "linear-gradient(135deg,#1a3d24,#7c3aed)", border: "none" })}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✍️</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#fff", fontWeight: 700 }}>Hifdh Test</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>اختبار الحفظ</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 8, lineHeight: 1.6 }}>
              Multiple question types · Timed · Score recorded
            </div>
          </div>
        </div>

        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>Select Surah · اختر السورة</div>
          <select value={surahNum} onChange={e => setSurahNum(Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.green, background: "#f8fafb", marginBottom: 12 }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[["From", startV, (v: number) => setStartV(v)], ["To", endV, (v: number) => setEndV(v)]].map(([label, val, setter], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>{label as string} Verse</div>
                <input type="number" min={1} max={surah.verses} value={val as number}
                  onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.green, background: "#f8fafb" }} />
              </div>
            ))}
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 10, background: C.light, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: "#7a9e88" }}>
              {selectedAyahs.length} verses · ~{selectedAyahs.length >= 3 ? "10" : selectedAyahs.length * 2} questions · ~{(selectedAyahs.length >= 3 ? 10 : selectedAyahs.length * 2) * 30}s
            </div>
          </div>
        </div>

        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Test Types Included</div>
          {Object.entries(QTypeLabel).map(([type, info]) => (
            <div key={type} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8,
              padding: "8px 12px", borderRadius: 8, background: "#fafafa", border: "1px solid #f0f4f0" }}>
              <span style={{ fontSize: 18 }}>{info.icon}</span>
              <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{info.label}</span>
            </div>
          ))}
        </div>

        <button onClick={startTest} disabled={loading || selectedAyahs.length < 3}
          style={{ padding: "14px 0", borderRadius: 14, border: "none",
            background: loading || selectedAyahs.length < 3 ? "#f0f4f0" : "linear-gradient(135deg,#1a3d24,#7c3aed)",
            color: loading || selectedAyahs.length < 3 ? "#7a9e88" : "#fff",
            fontSize: 15, fontWeight: 700, cursor: loading || selectedAyahs.length < 3 ? "not-allowed" : "pointer" }}>
          {loading ? "Loading…" : selectedAyahs.length < 3 ? "Need at least 3 verses" : "✍️ Start Test · ابدأ الاختبار"}
        </button>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────
  if (finished) {
    const correct = questions.filter((q, i) => answers[i] === q.correct).length;
    const pct = Math.round((correct / questions.length) * 100);
    const grade = pct >= 90 ? { letter: "A+", color: "#22c55e", label: "Excellent · ممتاز" }
      : pct >= 80 ? { letter: "A", color: "#16a34a", label: "Very Good · جيد جداً" }
      : pct >= 70 ? { letter: "B", color: "#2563eb", label: "Good · جيد" }
      : pct >= 60 ? { letter: "C", color: C.gold, label: "Satisfactory · مقبول" }
      : pct >= 50 ? { letter: "D", color: "#ea580c", label: "Pass · ناجح" }
      : { letter: "F", color: "#ef4444", label: "Fail · راسب" };

    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card({ padding: "28px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📖"}</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 28, color: C.green, fontWeight: 700 }}>Test Complete!</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: C.gold, marginTop: 4 }}>اكتمل الاختبار</div>

          <div style={{ margin: "24px auto", width: 120, height: 120, borderRadius: "50%",
            background: `conic-gradient(${grade.color} 0deg ${Math.round(pct * 3.6)}deg, #f0f4f0 ${Math.round(pct * 3.6)}deg)`,
            display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ position: "absolute", width: 88, height: 88, borderRadius: "50%", background: "#fff" }} />
            <div style={{ position: "relative", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.green, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: grade.color }}>{grade.letter}</div>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: grade.color }}>{grade.label}</div>
          <div style={{ fontSize: 13, color: "#7a9e88", marginTop: 8 }}>{correct} / {questions.length} correct · Score saved</div>
        </div>

        {/* Question review */}
        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 12 }}>Review Answers</div>
          {questions.map((q, i) => {
            const userAns = answers[i];
            const isCorrect = userAns === q.correct;
            return (
              <div key={q.id} style={{ padding: "12px", borderRadius: 10, marginBottom: 8,
                background: isCorrect ? C.light : "#fff5f5",
                border: `1px solid ${isCorrect ? C.border : "#fca5a5"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "#7a9e88" }}>Q{i + 1} · {QTypeLabel[q.type].icon} {QTypeLabel[q.type].label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isCorrect ? "#276749" : "#c0392b" }}>
                    {isCorrect ? "✓" : "✗"}
                  </div>
                </div>
                {!isCorrect && (
                  <div style={{ fontSize: 11, color: "#7a9e88" }}>
                    Your answer: <span style={{ color: "#c0392b" }}>{userAns !== null ? q.options[userAns] : "Not answered"}</span>
                    <br />Correct: <span style={{ color: "#276749", fontWeight: 700 }}>{q.options[q.correct]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => { setStarted(false); setFinished(false); }}
            style={{ padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "#f8fafb", color: C.green, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ← New Test
          </button>
          <button onClick={startTest}
            style={{ padding: "13px 0", borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🔁 Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Active Question ──────────────────────────────────────────────
  const q = questions[qIdx];
  const progress = ((qIdx) / questions.length) * 100;
  const timerPct = (timeLeft / (questions.length * 30)) * 100;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={card({ padding: "12px 14px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>Q <strong style={{ color: C.green }}>{qIdx + 1}</strong> / {questions.length}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%",
              background: `conic-gradient(${timeLeft < 30 ? "#ef4444" : C.green} 0deg ${Math.round(timerPct * 3.6)}deg, #f0f4f0 ${Math.round(timerPct * 3.6)}deg)`,
              display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ position: "absolute", width: 32, height: 32, borderRadius: "50%", background: "#fff" }} />
              <span style={{ position: "relative", fontSize: 11, fontWeight: 900, color: timeLeft < 30 ? "#ef4444" : C.green }}>{timeLeft}s</span>
            </div>
            <button onClick={finishTest}
              style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
              Finish
            </button>
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: C.green, transition: "width .3s" }} />
        </div>
      </div>

      {/* Question Type Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ padding: "5px 12px", borderRadius: 10, background: C.light, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>
            {QTypeLabel[q.type].icon} {QTypeLabel[q.type].label}
          </span>
        </div>
      </div>

      {/* Question */}
      <div style={card({ padding: "18px" })}>
        {q.promptAr && <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 8, fontWeight: 600 }}>{q.promptAr}</div>}
        <div style={{ direction: "rtl", textAlign: "right", fontFamily: "'Amiri Quran',serif",
          fontSize: 22, color: C.green, lineHeight: 2.2 }}>
          {q.prompt}
        </div>
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = confirmed && i === q.correct;
          const isWrong = confirmed && isSelected && i !== q.correct;
          return (
            <button key={i} onClick={() => !confirmed && setSelected(i)}
              style={{ padding: "14px", borderRadius: 12, cursor: confirmed ? "default" : "pointer",
                textAlign: "right", direction: "rtl",
                background: isCorrect ? C.light : isWrong ? "#fff5f5" : isSelected ? "#f0f8ff" : "#fafafa",
                border: `1.5px solid ${isCorrect ? "#9ae6b4" : isWrong ? "#fca5a5" : isSelected ? "#93c5fd" : "#f0f4f0"}`,
                fontFamily: "'Amiri Quran',serif", fontSize: 18, color: isCorrect ? "#276749" : isWrong ? "#c0392b" : isSelected ? "#1d4ed8" : C.green,
                fontWeight: isSelected || isCorrect ? 700 : 400, lineHeight: 1.8, transition: "all .15s" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", direction: "rtl" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                  background: isCorrect ? "#276749" : isWrong ? "#ef4444" : isSelected ? "#2563eb" : "#e5e7eb",
                  color: isCorrect || isWrong || isSelected ? "#fff" : "#6b7280", fontFamily: "'Cairo',sans-serif" }}>
                  {isCorrect ? "✓" : isWrong ? "✗" : String.fromCharCode(65 + i)}
                </div>
                <span style={{ flex: 1 }}>{opt}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm / Next */}
      {!confirmed ? (
        <button onClick={confirmAnswer} disabled={selected === null}
          style={{ padding: "13px 0", borderRadius: 12, border: "none",
            background: selected === null ? "#f0f4f0" : C.green, color: selected === null ? "#7a9e88" : "#fff",
            fontSize: 14, fontWeight: 700, cursor: selected === null ? "not-allowed" : "pointer" }}>
          ✓ Confirm Answer · تأكيد الإجابة
        </button>
      ) : (
        <button onClick={nextQuestion}
          style={{ padding: "13px 0", borderRadius: 12, border: "none",
            background: answers[qIdx] === q.correct ? "linear-gradient(135deg,#276749,#1a3d24)" : "linear-gradient(135deg,#c0392b,#ef4444)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {qIdx < questions.length - 1 ? "Next Question →" : "See Results 🎉"}
        </button>
      )}
    </div>
  );
}
