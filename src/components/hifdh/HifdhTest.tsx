// src/components/hifdh/HifdhTest.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { SURAHS, audioUrl } from "./surahData";
import { supabase } from "@/integrations/supabase/client";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

interface Ayah { numberInSurah: number; text: string; }

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type QType = "next_verse" | "missing_word" | "identify_verse";

interface Question {
  id: number;
  type: QType;
  prompt: string;
  promptLabel: string;
  options: string[];
  correct: number;
  ayahNum: number;
}

function buildQuestions(ayahs: Ayah[], surahName: string): Question[] {
  if (ayahs.length < 3) return [];
  const qs: Question[] = [];
  let id = 0;

  // Type 1 — What verse comes after this?
  const t1count = Math.min(4, ayahs.length - 1);
  const usedIdx = new Set<number>();
  let attempts = 0;
  while (qs.filter(q => q.type === "next_verse").length < t1count && attempts < 20) {
    attempts++;
    const idx = Math.floor(Math.random() * (ayahs.length - 1));
    if (usedIdx.has(idx)) continue;
    usedIdx.add(idx);
    const correct = ayahs[idx + 1];
    const wrongs  = shuffle(ayahs.filter((_, j) => j !== idx + 1)).slice(0, 3);
    const opts    = shuffle([correct, ...wrongs]);
    qs.push({
      id: id++, type: "next_verse", ayahNum: ayahs[idx].numberInSurah,
      prompt: ayahs[idx].text,
      promptLabel: `${surahName} · Verse ${ayahs[idx].numberInSurah}`,
      options: opts.map(o => o.text),
      correct: opts.indexOf(correct),
    });
  }

  // Type 2 — Which word is missing?
  const t2count = Math.min(3, ayahs.length);
  const usedAyah = new Set<number>();
  attempts = 0;
  while (qs.filter(q => q.type === "missing_word").length < t2count && attempts < 20) {
    attempts++;
    const ayah = ayahs[Math.floor(Math.random() * ayahs.length)];
    if (usedAyah.has(ayah.numberInSurah)) continue;
    const words = ayah.text.split(" ");
    if (words.length < 4) continue;
    usedAyah.add(ayah.numberInSurah);
    const blankIdx    = 1 + Math.floor(Math.random() * (words.length - 2)); // avoid first/last
    const correctWord = words[blankIdx];
    const blanked     = words.map((w, j) => j === blankIdx ? "____" : w).join(" ");
    const allWords    = ayahs.flatMap(a => a.text.split(" ")).filter(w => w !== correctWord && w.length > 2);
    const wrongs      = shuffle([...new Set(allWords)]).slice(0, 3);
    if (wrongs.length < 3) continue;
    const opts = shuffle([correctWord, ...wrongs]);
    qs.push({
      id: id++, type: "missing_word", ayahNum: ayah.numberInSurah,
      prompt: blanked,
      promptLabel: `Complete Verse ${ayah.numberInSurah}`,
      options: opts,
      correct: opts.indexOf(correctWord),
    });
  }

  // Type 3 — Which verse number is this?
  const t3pool = shuffle([...ayahs]).slice(0, 3);
  for (const ayah of t3pool) {
    const correctLabel = `Verse ${ayah.numberInSurah}`;
    const wrongNums    = shuffle(ayahs.map(a => a.numberInSurah).filter(n => n !== ayah.numberInSurah)).slice(0, 3);
    const wrongLabels  = wrongNums.map(n => `Verse ${n}`);
    const opts         = shuffle([correctLabel, ...wrongLabels]);
    qs.push({
      id: id++, type: "identify_verse", ayahNum: ayah.numberInSurah,
      prompt: ayah.text,
      promptLabel: `Which verse number in ${surahName}?`,
      options: opts,
      correct: opts.indexOf(correctLabel),
    });
  }

  return shuffle(qs).slice(0, 10);
}

const QTYPE_META: Record<QType, { icon: string; label: string }> = {
  next_verse:     { icon: "➡️", label: "What comes next?" },
  missing_word:   { icon: "🔍", label: "Missing word" },
  identify_verse: { icon: "🔢", label: "Verse number" },
};

function getGrade(pct: number) {
  if (pct >= 90) return { letter: "A+", color: "#22c55e", label: "Excellent · ممتاز" };
  if (pct >= 80) return { letter: "A",  color: "#16a34a", label: "Very Good · جيد جداً" };
  if (pct >= 70) return { letter: "B",  color: "#2563eb", label: "Good · جيد" };
  if (pct >= 60) return { letter: "C",  color: GOLD,      label: "Satisfactory · مقبول" };
  if (pct >= 50) return { letter: "D",  color: "#ea580c", label: "Pass · ناجح" };
  return               { letter: "F",   color: "#ef4444", label: "Fail · راسب" };
}

export default function HifdhTest() {
  const [surahNum, setSurahNum]     = useState(114);
  const [startV, setStartV]         = useState(1);
  const [endV, setEndV]             = useState(6);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [loading, setLoading]       = useState(false);
  const [fetchErr, setFetchErr]     = useState("");
  const [buildErr, setBuildErr]     = useState("");

  // Test state
  const [started, setStarted]       = useState(false);
  const [finished, setFinished]     = useState(false);
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [qIdx, setQIdx]             = useState(0);
  const [answers, setAnswers]       = useState<(number | null)[]>([]);
  const [selected, setSelected]     = useState<number | null>(null);
  const [confirmed, setConfirmed]   = useState(false);
  const [timeLeft, setTimeLeft]     = useState(0);
  const [timerOn, setTimerOn]       = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout>>();
  const questionsRef  = useRef<Question[]>([]);
  const answersRef    = useRef<(number | null)[]>([]);
  const surah         = SURAHS[surahNum - 1];

  // Keep refs in sync for stable callbacks
  useEffect(() => { questionsRef.current  = questions;  }, [questions]);
  useEffect(() => { answersRef.current    = answers;    }, [answers]);

  const fetchAyahs = useCallback(async () => {
    setLoading(true); setFetchErr("");
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const j = await r.json();
      if (j.code === 200) setAyahs(j.data.ayahs);
      else setFetchErr("Failed to load — retry.");
    } catch { setFetchErr("Network error."); }
    setLoading(false);
  }, [surahNum]);

  useEffect(() => { fetchAyahs(); }, [fetchAyahs]);
  useEffect(() => () => { audioRef.current?.pause(); clearTimeout(timerRef.current); }, []);

  // Timer countdown
  useEffect(() => {
    if (!timerOn || timeLeft <= 0) { clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timerOn, timeLeft]);

  // Auto-finish on timer expiry
  useEffect(() => {
    if (timerOn && timeLeft === 0 && started && !finished) {
      doFinish();
    }
  });   // intentionally no deps — run after every render to catch timer=0

  const stopAudio = () => { audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false); };

  const doFinish = useCallback(() => {
    clearTimeout(timerRef.current);
    setTimerOn(false);
    setFinished(true);
    stopAudio();
    // Save to supabase
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    const correct = qs.filter((q, i) => ans[i] === q.correct).length;
    const pct     = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase.from("hifdh_sessions").insert({
        student_id:     data.user.id,
        surah_name:     SURAHS[surahNum - 1].name,
        ayah_start:     startV,
        accuracy_score: pct,
        duration:       qs.length * 30 - timeLeft,
      }).catch(() => {});
    });
  }, [surahNum, startV, timeLeft]);

  const startTest = () => {
    const pool = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
    const qs   = buildQuestions(pool, surah.name);
    if (qs.length === 0) { setBuildErr("Not enough verses — need at least 3. Increase the verse range."); return; }
    setBuildErr("");
    const ans = new Array(qs.length).fill(null) as null[];
    setQuestions(qs);
    setAnswers(ans);
    questionsRef.current = qs;
    answersRef.current   = ans;
    setQIdx(0);
    setSelected(null);
    setConfirmed(false);
    setFinished(false);
    setTimeLeft(qs.length * 30);
    setTimerOn(true);
    setStarted(true);
  };

  const confirmAnswer = () => {
    if (selected === null) return;
    const newAns = [...answers];
    newAns[qIdx] = selected;
    setAnswers(newAns);
    answersRef.current = newAns;
    setConfirmed(true);
  };

  const nextQuestion = () => {
    if (qIdx < questions.length - 1) {
      setQIdx(qIdx + 1); setSelected(null); setConfirmed(false);
    } else {
      doFinish();
    }
  };

  const playAyah = (num: number) => {
    stopAudio();
    setIsPlaying(true);
    const audio = new Audio(audioUrl(surahNum, num));
    audioRef.current = audio;
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => setIsPlaying(false);
  };

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
  const canStart      = !loading && selectedAyahs.length >= 3;

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  // ── RESULTS SCREEN ────────────────────────────────────────────────
  if (finished && questions.length > 0) {
    const correct = questions.filter((q, i) => answers[i] === q.correct).length;
    const pct     = Math.round((correct / questions.length) * 100);
    const grade   = getGrade(pct);

    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card({ padding: "28px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>
            {pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📖"}
          </div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: G, fontWeight: 700 }}>Test Complete!</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 15, color: GOLD, marginTop: 5 }}>اكتمل الاختبار</div>

          {/* Score ring */}
          <div style={{ position: "relative", width: 130, height: 130, margin: "20px auto" }}>
            <svg width={130} height={130} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={65} cy={65} r={52} fill="none" stroke="#f0f4f0" strokeWidth={12} />
              <circle cx={65} cy={65} r={52} fill="none" stroke={grade.color} strokeWidth={12}
                strokeDasharray={`${(pct / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                strokeLinecap="round" style={{ transition: "stroke-dasharray 1.2s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: G }}>{pct}%</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: grade.color }}>{grade.letter}</div>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: grade.color }}>{grade.label}</div>
          <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 6 }}>
            {correct} / {questions.length} correct · Score saved ✓
          </div>
        </div>

        {/* Answer review */}
        <div style={card({ padding: "14px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            REVIEW · مراجعة الإجابات
          </div>
          {questions.map((q, i) => {
            const ok = answers[i] === q.correct;
            return (
              <div key={q.id} style={{ padding: "10px 12px", borderRadius: 12, marginBottom: 8,
                background: ok ? LIGHT : "#fff5f5", border: `1px solid ${ok ? BORDER : "#fca5a5"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ok ? 0 : 6 }}>
                  <div style={{ fontSize: 11, color: "#7a9e88" }}>
                    Q{i + 1} {QTYPE_META[q.type].icon} {QTYPE_META[q.type].label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ok ? GM : "#c0392b" }}>{ok ? "✓" : "✗"}</div>
                </div>
                {!ok && (
                  <div style={{ fontSize: 11, color: "#7a9e88", direction: "rtl", fontFamily: "'Amiri',serif" }}>
                    <span style={{ color: "#c0392b" }}>Your: {answers[i] !== null ? q.options[answers[i]!] : "—"}</span>
                    <span style={{ margin: "0 6px" }}>·</span>
                    <span style={{ color: GM, fontWeight: 700 }}>Correct: {q.options[q.correct]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => { setStarted(false); setFinished(false); }}
            style={{ padding: "13px 0", borderRadius: 12, border: `1px solid ${BORDER}`,
              background: "#f8fafb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ← New Test
          </button>
          <button onClick={startTest}
            style={{ padding: "13px 0", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔁 Retry
          </button>
        </div>
      </div>
    );
  }

  // ── SETUP SCREEN ──────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},#7c3aed)`, padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>✍️</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: "#fff", fontWeight: 700 }}>Hifdh Test</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>
              اختبار الحفظ
            </div>
          </div>
          <div style={{ background: "rgba(26,61,36,.05)", padding: "10px 16px", display: "flex", gap: 16, justifyContent: "center" }}>
            {[["➡️", "Next Verse"], ["🔍", "Fill Blank"], ["🔢", "Verse No."]].map(([icon, lbl], i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: G, display: "flex", alignItems: "center", gap: 4 }}>
                <span>{icon}</span><span>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            SURAH & RANGE · السورة والنطاق
          </div>
          <select value={surahNum} onChange={e => setSurahNum(Number(e.target.value))}
            style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: `1px solid ${BORDER}`,
              fontSize: 14, color: G, background: "#f8fafb", marginBottom: 10 }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[["From", startV, setStartV], ["To", endV, setEndV]].map(([lbl, val, setter], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 600, marginBottom: 4 }}>{lbl as string} Verse</div>
                <input type="number" min={1} max={surah.verses} value={val as number}
                  onChange={e => (setter as Function)(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
                    fontSize: 15, color: G, background: "#f8fafb", fontWeight: 700 }} />
              </div>
            ))}
          </div>
          <div style={{ padding: "9px 12px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`, fontSize: 12, color: G, fontWeight: 600 }}>
            {selectedAyahs.length} verses · ≈{Math.min(10, selectedAyahs.length * 3)} questions · {Math.min(10, selectedAyahs.length * 3) * 30}s
          </div>
        </div>

        {buildErr && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff5f5",
            border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {buildErr}
          </div>
        )}

        <button onClick={startTest} disabled={!canStart}
          style={{ padding: "15px 0", borderRadius: 14, border: "none", cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},#7c3aed)` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 15, fontWeight: 800 }}>
          {loading ? "Loading…" : !canStart ? "Need at least 3 verses" : "✍️ Start Test · ابدأ الاختبار"}
        </button>

        {fetchErr && (
          <div style={{ padding: "12px", borderRadius: 12, background: "#fff5f5",
            border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {fetchErr} <button onClick={fetchAyahs}
              style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE QUESTION ───────────────────────────────────────────────
  // Guard against empty questions (shouldn't happen, but just in case)
  if (questions.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#7a9e88", marginBottom: 12 }}>Building questions…</div>
        <button onClick={() => setStarted(false)}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none",
            background: G, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ← Back
        </button>
      </div>
    );
  }

  const q        = questions[Math.min(qIdx, questions.length - 1)];
  const progress = (qIdx / questions.length) * 100;
  const timerPct = questions.length > 0 ? (timeLeft / (questions.length * 30)) * 100 : 0;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
        boxShadow: "0 2px 12px rgba(26,61,36,.07)", padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>
            Question <strong style={{ color: G }}>{qIdx + 1}</strong> / {questions.length}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Timer ring */}
            <div style={{ position: "relative", width: 42, height: 42 }}>
              <svg width={42} height={42} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={21} cy={21} r={17} fill="none" stroke="#f0f4f0" strokeWidth={4} />
                <circle cx={21} cy={21} r={17} fill="none"
                  stroke={timeLeft < 30 ? "#ef4444" : G} strokeWidth={4}
                  strokeDasharray={`${(timerPct / 100) * 2 * Math.PI * 17} ${2 * Math.PI * 17}`}
                  strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: timeLeft < 30 ? "#ef4444" : G }}>{timeLeft}s</span>
              </div>
            </div>
            <button onClick={doFinish}
              style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8,
                border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
              Finish
            </button>
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "#f0f4f0", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg,${G},#7c3aed)`, transition: "width .3s" }} />
        </div>
      </div>

      {/* Question type */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`,
        alignSelf: "flex-start" }}>
        <span style={{ fontSize: 14 }}>{QTYPE_META[q.type].icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: G }}>{QTYPE_META[q.type].label}</span>
      </div>

      {/* Prompt */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
        boxShadow: "0 2px 12px rgba(26,61,36,.07)", padding: "16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 8 }}>
          {q.promptLabel.toUpperCase()}
        </div>
        <div style={{ direction: "rtl", fontFamily: "'Amiri Quran',serif", fontSize: 22,
          color: G, lineHeight: 2.1, textAlign: "right",
          padding: "10px 12px", borderRadius: 12, background: LIGHT, border: `1px solid ${BORDER}` }}>
          {q.prompt}
        </div>
        {!confirmed && (
          <button onClick={isPlaying ? stopAudio : () => playAyah(q.ayahNum)}
            style={{ marginTop: 8, padding: "8px 14px", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: isPlaying ? "#fee2e2" : "#f8fafb",
              color: isPlaying ? "#c0392b" : G, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {isPlaying ? "⏹ Stop" : "🔊 Hear Ayah"}
          </button>
        )}
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect  = confirmed && i === q.correct;
          const isWrong    = confirmed && isSelected && i !== q.correct;
          const bg   = isCorrect ? LIGHT : isWrong ? "#fff5f5" : isSelected ? "#eff6ff" : "#fafafa";
          const bdr  = isCorrect ? BORDER : isWrong ? "#fca5a5" : isSelected ? "#93c5fd" : "#f0f4f0";
          const col2 = isCorrect ? GM : isWrong ? "#c0392b" : isSelected ? "#1d4ed8" : G;
          return (
            <button key={i} onClick={() => !confirmed && setSelected(i)}
              style={{ padding: "12px 14px", borderRadius: 12, cursor: confirmed ? "default" : "pointer",
                background: bg, border: `1.5px solid ${bdr}`,
                display: "flex", gap: 10, alignItems: "center",
                direction: "rtl", transition: "all .15s", textAlign: "right" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: isCorrect ? GM : isWrong ? "#ef4444" : isSelected ? "#2563eb" : "#e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: isCorrect || isWrong || isSelected ? "#fff" : "#6b7280",
                fontFamily: "'Cairo',sans-serif" }}>
                {isCorrect ? "✓" : isWrong ? "✗" : String.fromCharCode(65 + i)}
              </div>
              <div style={{ flex: 1, fontFamily: "'Amiri Quran',serif", fontSize: 17,
                color: col2, lineHeight: 1.8, fontWeight: isSelected || isCorrect ? 700 : 400 }}>
                {opt}
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm / Next */}
      {!confirmed ? (
        <button onClick={confirmAnswer} disabled={selected === null}
          style={{ padding: "13px 0", borderRadius: 12, border: "none",
            background: selected === null ? "#f0f4f0" : `linear-gradient(135deg,${G},${GM})`,
            color: selected === null ? "#7a9e88" : "#fff",
            fontSize: 14, fontWeight: 800, cursor: selected === null ? "not-allowed" : "pointer" }}>
          ✓ Confirm Answer · تأكيد
        </button>
      ) : (
        <button onClick={nextQuestion}
          style={{ padding: "13px 0", borderRadius: 12, border: "none",
            background: answers[qIdx] === q.correct
              ? `linear-gradient(135deg,${GM},${G})`
              : "linear-gradient(135deg,#b91c1c,#ef4444)",
            color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          {qIdx < questions.length - 1 ? "Next Question →" : "See Results 🎉"}
        </button>
      )}
    </div>
  );
}
