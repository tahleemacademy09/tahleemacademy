// src/components/hifdh/HifdhExercise.tsx
// All-stages exercise: auto-progresses S1→S2→S3→S4→S5→S6 (one question per stage).
// Voice evaluation uses Groq Whisper → Supabase edge function (same as مراجعة).
// FIXES: persistence, no reveal answer, sticky instructions, mobile word chips
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { supabase } from "@/integrations/supabase/client";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

const EXERCISE_KEY = "hifdh_exercise_v3";

interface Ayah { numberInSurah: number; text: string; }
interface Props { reciter?: string; }

function getMime() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

// ── Huruf Muqatta'at normaliser ────────────────────────────────────
function normalizeHurufMuqattaat(text: string): string {
  return text
    .replace(/ألف\s+لام\s+ميم\s+راء/g,     "المر")
    .replace(/ألف\s+لام\s+ميم\s+صاد/g,     "المص")
    .replace(/كاف\s+ها\s+يا\s+عين\s+صاد/g, "كهيعص")
    .replace(/عين\s+سين\s+قاف/g,            "عسق")
    .replace(/طا\s+سين\s+ميم/g,             "طسم")
    .replace(/ألف\s+لام\s+ميم/g,            "الم")
    .replace(/ألف\s+لام\s+راء/g,            "الر")
    .replace(/حا\s+ميم/g,                   "حم")
    .replace(/يا\s+سين/g,                   "يس")
    .replace(/طا\s+سين/g,                   "طس")
    .replace(/طا\s+ها/g,                    "طه")
    .replace(/\bصاد\b/g,  "ص")
    .replace(/\bقاف\b/g,  "ق")
    .replace(/\bنون\b/g,  "ن");
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (groqKey) {
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "recitation.webm", { type: blob.type || "audio/webm" }));
      fd.append("model", "whisper-large-v3");
      fd.append("language", "ar");
      fd.append("response_format", "text");
      fd.append("prompt", "بسم الله الرحمن الرحيم الحمد لله رب العالمين");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: fd,
      });
      if (r.ok) {
        const txt = (await r.text()).trim();
        if (txt.length > 0) return txt;
      }
    } catch { /* fall through */ }
  }
  try {
    const b64 = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const { data } = await supabase.functions.invoke("transcribe-hifdh", {
      body: { audio: b64, mimeType: blob.type || "audio/webm" },
    });
    return data?.text ?? data?.transcript ?? "";
  } catch { return ""; }
}

function norm(t: string) {
  return normalizeHurufMuqattaat(t)
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
    .replace(/[\u0622\u0623\u0624\u0625\u0626\u0627\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0640/g, "")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function stripPrefix(w: string): string {
  if (w.startsWith("\u0627\u0644") && w.length > 3) return w.slice(2);
  if (("\u0648\u0641\u0628\u0644").includes(w[0]) && w.length > 2) return w.slice(1);
  return w;
}

function wordMatch(tw: string, rw: string): boolean {
  if (!tw || !rw) return false;
  if (tw === rw) return true;
  const ts = stripPrefix(tw); const rs = stripPrefix(rw);
  if (ts === rs) return true;
  const minLen = Math.min(ts.length, rs.length);
  if (minLen >= 3 && ts.slice(0, 3) === rs.slice(0, 3)) return true;
  const shorter = ts.length <= rs.length ? ts : rs;
  const longer  = ts.length <= rs.length ? rs : ts;
  if (shorter.length >= 4 && longer.includes(shorter.slice(0, Math.ceil(shorter.length * 0.75)))) return true;
  return false;
}

function scoreMatch(transcript: string, reference: string[]): number {
  const refText = norm(reference.join(" "));
  const txText  = norm(transcript);
  if (!txText || !refText) return 0;
  const refWords = refText.split(" ").filter(w => w.length >= 2);
  const txWords  = txText.split(" ").filter(Boolean);
  if (!txWords.length) return 0;
  let matched = 0;
  for (const rw of refWords) {
    if (txWords.some(tw => wordMatch(tw, rw))) matched++;
  }
  return Math.round((matched / refWords.length) * 100);
}

function diffWords(transcript: string, referenceText: string): { word: string; hit: boolean }[] {
  const txWords = norm(transcript).split(" ").filter(Boolean);
  return referenceText.split(" ").filter(Boolean).map(rw => {
    const nrw = norm(rw);
    const hit = nrw.length < 2 || txWords.some(tw => wordMatch(tw, nrw));
    return { word: rw, hit };
  });
}

type StageKey = 1 | 2 | 3 | 4 | 5 | 6;
const ALL_STAGES: StageKey[] = [1, 2, 3, 4, 5, 6];

const STAGE: Record<StageKey, { icon: string; title: string; titleAr: string; desc: string; color: string; bg: string; border: string }> = {
  1: { icon: "📖", title: "Full Verse Prompt",      titleAr: "آية كاملة",         desc: "Full verse shown — read the next 2 after it",           color: G,         bg: LIGHT,     border: BORDER   },
  2: { icon: "📚", title: "Full Verse Extended",    titleAr: "آية كاملة موسعة",   desc: "Full verse shown — read the next 4 after it",           color: "#276749", bg: "#e6ffed", border: "#9ae6b4" },
  3: { icon: "✂️", title: "Half Ayah Prompt",       titleAr: "نصف آية",           desc: "First half shown — complete it + continue 2 more",      color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  4: { icon: "🔤", title: "Half Ayah Extended",     titleAr: "نصف آية موسعة",     desc: "First half shown — complete it + the full next verse",   color: "#1d4ed8", bg: "#dbeafe", border: "#60a5fa" },
  5: { icon: "💡", title: "Single Word Prompt",     titleAr: "كلمة واحدة",        desc: "Only the first word — recite the full verse from there", color: "#7c3aed", bg: "#f5f3ff", border: "#a78bfa" },
  6: { icon: "🏁", title: "Full Section Challenge", titleAr: "تحدي القسم الكامل", desc: "First verse shown — recite all remaining to end",        color: GOLD,      bg: "#fffbeb", border: "#f6d860" },
};

interface Question {
  stage: StageKey;
  prompt: string;
  promptAyahNum: number;
  promptLabel: string;
  answerLabel: string;
  answer: string[];
}

interface SavedSession {
  surahNum: number;
  startV: number;
  endV: number;
  started: boolean;
  stageIdx: number;
  stageResults: Array<"correct"|"wrong">;
  question: Question | null;
}

function generateQ(stage: StageKey, pool: Ayah[], surahName: string): Question | null {
  const n = pool.length;
  if (n < 2) return null;
  try {
    switch (stage) {
      case 1: {
        const idx = Math.floor(Math.random() * Math.max(1, n - 2));
        return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah,
          promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`,
          answerLabel: "Now recite the next 2 verses:",
          answer: pool.slice(idx + 1, idx + 3).map(a => a.text) };
      }
      case 2: {
        const idx = Math.floor(Math.random() * Math.max(1, n - 4));
        return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah,
          promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`,
          answerLabel: "Now recite the next 4 verses:",
          answer: pool.slice(idx + 1, idx + 5).map(a => a.text) };
      }
      case 3: {
        const idx = Math.floor(Math.random() * Math.max(1, n - 2));
        const words = pool[idx].text.split(" ");
        const variant = Math.random() < 0.5 ? "start" : "end";
        if (variant === "end" && idx + 1 < n) {
          const lastTwo = words.slice(-2).join(" ") + " …";
          return { stage, prompt: lastTwo, promptAyahNum: pool[idx].numberInSurah,
            promptLabel: `End of Verse ${pool[idx].numberInSurah}`,
            answerLabel: "Continue — recite the next verse:",
            answer: pool.slice(idx + 1, idx + 3).map(a => a.text) };
        }
        const half = Math.max(1, Math.floor(words.length / 2));
        return { stage, prompt: words.slice(0, half).join(" ") + " …", promptAyahNum: pool[idx].numberInSurah,
          promptLabel: `First half of Verse ${pool[idx].numberInSurah}`,
          answerLabel: "Complete this verse, then recite 2 more:",
          answer: [words.slice(half).join(" ") + " ← (complete verse)", ...pool.slice(idx + 1, idx + 3).map(a => a.text)] };
      }
      case 4: {
        const idx = Math.floor(Math.random() * Math.max(1, n - 1));
        const words = pool[idx].text.split(" ");
        const half = Math.max(1, Math.floor(words.length / 2));
        return { stage, prompt: words.slice(0, half).join(" ") + " …", promptAyahNum: pool[idx].numberInSurah,
          promptLabel: `First half of Verse ${pool[idx].numberInSurah}`,
          answerLabel: "Complete this verse and recite the next:",
          answer: [words.slice(half).join(" ") + " ← (complete verse)", ...(idx + 1 < n ? [pool[idx + 1].text] : [])] };
      }
      case 5: {
        const idx = Math.floor(Math.random() * n);
        const words = pool[idx].text.split(" ");
        const wordIdx = Math.floor(Math.random() * Math.max(1, Math.ceil(words.length * 0.6)));
        const chosenWord = words[wordIdx];
        const isFirstWord = wordIdx === 0;
        const promptText = isFirstWord ? chosenWord + " …" : "… " + chosenWord + " …";
        return { stage, prompt: promptText, promptAyahNum: pool[idx].numberInSurah,
          promptLabel: isFirstWord ? `First word of Verse ${pool[idx].numberInSurah}` : `A word from Verse ${pool[idx].numberInSurah}`,
          answerLabel: "Recite the complete verse:",
          answer: [pool[idx].text] };
      }
      case 6: {
        return { stage, prompt: pool[0].text, promptAyahNum: pool[0].numberInSurah,
          promptLabel: `Opening verse — ${surahName}`,
          answerLabel: "Recite all remaining verses to the end:",
          answer: pool.slice(1).map(a => a.text) };
      }
    }
  } catch { return null; }
}

export default function HifdhExercise({ reciter = DEFAULT_RECITER }: Props) {
  /* ── Restore from localStorage ── */
  const [surahNum, setSurahNum] = useState(() => {
    try { const s = localStorage.getItem(EXERCISE_KEY); return s ? (JSON.parse(s).surahNum ?? 114) : 114; } catch { return 114; }
  });
  const [startV, setStartV] = useState(() => {
    try { const s = localStorage.getItem(EXERCISE_KEY); return s ? (JSON.parse(s).startV ?? 1) : 1; } catch { return 1; }
  });
  const [endV, setEndV] = useState(() => {
    try { const s = localStorage.getItem(EXERCISE_KEY); return s ? (JSON.parse(s).endV ?? 6) : 6; } catch { return 6; }
  });
  const [stageIdx, setStageIdx]         = useState(0);
  const [stageResults, setStageResults] = useState<Array<"correct"|"wrong">>([]);
  const [ayahs, setAyahs]               = useState<Ayah[]>([]);
  const [loading, setLoading]           = useState(false);
  const [fetchErr, setFetchErr]         = useState("");
  const [started, setStarted]           = useState(false);
  const [finished, setFinished]         = useState(false);
  const [question, setQuestion]         = useState<Question | null>(null);
  const [noQError, setNoQError]         = useState(false);
  const [isPlaying, setIsPlaying]       = useState(false);

  const [micState, setMicState]     = useState<"idle"|"recording"|"evaluating">("idle");
  const [transcript, setTranscript] = useState("");
  const [evalScore, setEvalScore]   = useState<number|null>(null);
  const [autoResult, setAutoResult] = useState<"correct"|"wrong"|null>(null);

  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const surah     = SURAHS[surahNum - 1];

  /* ── Persist setup selection ── */
  useEffect(() => {
    try {
      const prev = localStorage.getItem(EXERCISE_KEY);
      const parsed = prev ? JSON.parse(prev) : {};
      localStorage.setItem(EXERCISE_KEY, JSON.stringify({ ...parsed, surahNum, startV, endV }));
    } catch {}
  }, [surahNum, startV, endV]);

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
  useEffect(() => () => { audioRef.current?.pause(); mrRef.current?.stop(); }, []);

  const stopAudio  = () => { audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false); };
  const resetVoice = () => { setMicState("idle"); setTranscript(""); setEvalScore(null); setAutoResult(null); };

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);

  const advance = useCallback((result: "correct"|"wrong") => {
    const newResults = [...stageResults, result];
    setStageResults(newResults);
    if (stageIdx + 1 >= ALL_STAGES.length) {
      setFinished(true);
    } else {
      const nextIdx = stageIdx + 1;
      setStageIdx(nextIdx);
      const pool = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
      const q    = generateQ(ALL_STAGES[nextIdx], pool, surah.name);
      if (!q) { setNoQError(true); return; }
      setQuestion(q); stopAudio(); setNoQError(false); resetVoice();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx, stageResults, ayahs, startV, endV, surah.name]);

  const startSession = () => {
    const pool = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
    const q    = generateQ(ALL_STAGES[0], pool, surah.name);
    if (!q) { setNoQError(true); return; }
    setStageIdx(0); setStageResults([]);
    setQuestion(q); setNoQError(false);
    setStarted(true); setFinished(false);
    stopAudio(); resetVoice();
  };

  const resetAll = () => {
    setStarted(false); setFinished(false);
    setQuestion(null); setStageIdx(0); setStageResults([]);
    stopAudio(); mrRef.current?.stop(); resetVoice();
  };

  const playPrompt = () => {
    if (!question) return;
    stopAudio(); setIsPlaying(true);
    const url   = audioUrl(surahNum, question.promptAyahNum, reciter);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {
      // fallback to Alafasy on everyayah
      const s2 = String(surahNum).padStart(3, "0");
      const n2 = String(question.promptAyahNum).padStart(3, "0");
      const fb = `https://everyayah.com/data/Alafasy_128kbps/${s2}${n2}.mp3`;
      const a2 = new Audio(fb); audioRef.current = a2;
      a2.play().catch(() => setIsPlaying(false));
      a2.onended = () => setIsPlaying(false);
      a2.onerror = () => setIsPlaying(false);
    });
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getMime();
      const mr     = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 1000) { setMicState("idle"); return; }
        setMicState("evaluating");
        try {
          const tx = await transcribeAudio(blob);
          setTranscript(tx);
          if (tx && question) {
            const sc = scoreMatch(tx, question.answer);
            setEvalScore(sc);
            const result: "correct"|"wrong" = sc >= 55 ? "correct" : "wrong";
            setAutoResult(result);
            setTimeout(() => advance(result), 2500);
          } else {
            setMicState("idle");
          }
        } catch { setMicState("idle"); }
      };
      mrRef.current = mr;
      mr.start(3000);
      setMicState("recording");
    } catch { setMicState("idle"); }
  };

  const stopRecording = () => { mrRef.current?.stop(); };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  const canStart = !loading && selectedAyahs.length >= 2;

  // ── FINISHED ─────────────────────────────────────────────────────
  if (finished) {
    const correct = stageResults.filter(r => r === "correct").length;
    const pct = Math.round((correct / ALL_STAGES.length) * 100);
    return (
      <div style={{ height: "100%", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card({ padding: "28px 20px", textAlign: "center" })}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📖"}</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: G, fontWeight: 700 }}>Exercise Complete!</div>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: GOLD, marginTop: 4 }}>اكتمل التمرين</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: G, marginTop: 16 }}>{correct}/{ALL_STAGES.length}</div>
          <div style={{ fontSize: 14, color: "#7a9e88", marginTop: 4 }}>{pct}% — {pct >= 80 ? "Excellent! Masha'Allah" : pct >= 60 ? "Good work, keep going" : "Keep practicing — you'll get there"}</div>
          <div style={{ marginTop: 14, padding: "8px 14px", borderRadius: 10, background: LIGHT, display: "inline-block" }}>
            <span style={{ fontSize: 12, color: G, fontWeight: 700 }}>📖 {surah.name} · Verses {startV}–{endV}</span>
          </div>
        </div>
        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>STAGE RESULTS · نتائج المراحل</div>
          {ALL_STAGES.map((s, i) => {
            const info = STAGE[s]; const r = stageResults[i]; const ok = r === "correct";
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, marginBottom: i < 5 ? 6 : 0, background: ok ? LIGHT : "#fff5f5", border: `1px solid ${ok ? BORDER : "#fca5a5"}` }}>
                <div style={{ fontSize: 18 }}>{info.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ok ? GM : "#c0392b" }}>Stage {s}: {info.title}</div>
                  <div style={{ fontSize: 10, color: "#7a9e88" }}>{info.titleAr}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: ok ? GM : "#c0392b" }}>{ok ? "✓" : "✗"}</div>
              </div>
            );
          })}
        </div>
        <button onClick={resetAll}
          style={{ padding: "15px 0", borderRadius: 14, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${G},${GOLD})`, color: "#fff", fontSize: 15, fontWeight: 800 }}>
          🔁 Retry · إعادة المحاولة
        </button>
      </div>
    );
  }

  // ── SETUP ─────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ height: "100%", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GOLD})`, padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🎯</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: "#fff", fontWeight: 700 }}>Exercise</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>تمرين الاستماع والاسترجاع</div>
          </div>
        </div>

        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 8 }}>ALL 6 STAGES · جميع المراحل</div>
          <div style={{ padding: "9px 12px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`, fontSize: 12, color: G, fontWeight: 600, marginBottom: 10 }}>
            One question from each stage — you complete all 6 in order, easiest to hardest.
          </div>
          {ALL_STAGES.map(s => {
            const info = STAGE[s];
            return (
              <div key={s} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 10, marginBottom: s < 6 ? 6 : 0, background: "#fafafa", border: "1px solid #f0f4f0" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: info.bg, border: `1px solid ${info.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{info.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>
                    Stage {s}: {info.title}
                    <span style={{ fontFamily: "'Amiri',serif", color: GOLD, fontSize: 11, marginRight: 4 }}> · {info.titleAr}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#7a9e88", marginTop: 1 }}>{info.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={card({ padding: "16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>SURAH & RANGE · السورة والنطاق</div>
          <select value={surahNum} onChange={e => setSurahNum(Number(e.target.value))}
            style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: `1px solid ${BORDER}`, fontSize: 14, color: G, background: "#f8fafb", marginBottom: 10 }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["From", startV, setStartV], ["To", endV, setEndV]].map(([lbl, val, setter], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#7a9e88", fontWeight: 600, marginBottom: 4 }}>{lbl as string} Verse</div>
                <input type="number" min={1} max={surah.verses} value={val as number}
                  onChange={e => (setter as Function)(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 15, color: G, background: "#f8fafb", fontWeight: 700 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: LIGHT, border: `1px solid ${BORDER}`, fontSize: 12, color: G, fontWeight: 600 }}>
            {selectedAyahs.length} verses selected
          </div>
        </div>

        {noQError && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff5f5", border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            Need at least 2 verses — increase the verse range above.
          </div>
        )}

        <button onClick={startSession} disabled={!canStart}
          style={{ padding: "15px 0", borderRadius: 14, border: "none", cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},${GOLD})` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 15, fontWeight: 800 }}>
          {loading ? "Loading…" : "🎯 Start All Stages · ابدأ جميع المراحل"}
        </button>

        {fetchErr && (
          <div style={{ padding: "12px", borderRadius: 12, background: "#fff5f5", border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            {fetchErr} <button onClick={fetchAyahs} style={{ textDecoration: "underline", background: "none", border: "none", color: "#c0392b", cursor: "pointer" }}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  if (!question) return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#7a9e88" }}>Generating question…</div>
    </div>
  );

  const stage = ALL_STAGES[stageIdx];
  const info  = STAGE[stage];

  // ── ACTIVE QUESTION ───────────────────────────────────────────────
  // Layout: fixed header (stage nav + task instruction) + scrollable body
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>

      {/* ── FIXED HEADER: stage dots + instruction ── */}
      <div style={{ flexShrink: 0, background: "#fff", borderBottom: `2px solid ${BORDER}`, padding: "10px 14px 0" }}>
        {/* Stage dots + End */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {ALL_STAGES.map((s, i) => (
              <div key={s} style={{
                width: i === stageIdx ? 32 : 10, height: 10, borderRadius: 5, transition: "all .3s",
                background: i < stageIdx
                  ? (stageResults[i] === "correct" ? GM : "#ef4444")
                  : i === stageIdx ? info.color : "#e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {i === stageIdx && <span style={{ fontSize: 8, color: "#fff", fontWeight: 900 }}>{s}</span>}
              </div>
            ))}
            <span style={{ fontSize: 11, color: "#7a9e88", marginLeft: 4 }}>{stageIdx + 1} / 6</span>
          </div>
          <button onClick={resetAll}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End
          </button>
        </div>

        {/* Stage badge */}
        <div style={{ padding: "5px 10px", borderRadius: 8, background: info.bg, border: `1px solid ${info.border}`, marginBottom: 8, display: "inline-block" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.icon} Stage {stage}: {info.title} · {info.titleAr}</span>
        </div>

        {/* ── TASK INSTRUCTION — always visible ── */}
        <div style={{
          padding: "10px 12px",
          borderRadius: 12,
          background: info.bg,
          border: `1.5px solid ${info.border}`,
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: info.color }}>{question.answerLabel}</div>
          <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>{info.desc}</div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 28px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Prompt */}
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: "0 2px 12px rgba(26,61,36,.07)", padding: "16px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 8 }}>
            {question.promptLabel.toUpperCase()}
          </div>
          <div style={{
            direction: "rtl", fontFamily: "'Amiri Quran',serif", fontSize: 24, color: G,
            lineHeight: 2.1, textAlign: "right", padding: "10px 12px",
            borderRadius: 12, background: LIGHT, border: `1px solid ${BORDER}`,
          }}>
            {question.prompt}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {isPlaying
              ? <button onClick={stopAudio} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "#fee2e2", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⏹ Stop</button>
              : <button onClick={playPrompt} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#f8fafb", color: G, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🔊 Hear Prompt</button>
            }
            <button onClick={() => advance("wrong")}
              style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
              Skip →
            </button>
          </div>
        </div>

        {/* Voice recitation */}
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: "0 2px 12px rgba(26,61,36,.07)", padding: "14px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
            🎙 RECITE ALOUD · اتلُ بصوتك
          </div>

          {micState === "idle" && (
            <button onClick={startRecording}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              🎙 Recite
            </button>
          )}

          {micState === "recording" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "flex-end", height: 28, marginBottom: 8 }}>
                {[8,14,10,20,12,18,8,15,22,9].map((h, i) => (
                  <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: "#ef4444" }} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 10 }}>Recording… recite clearly</div>
              <button onClick={stopRecording}
                style={{ padding: "10px 32px", borderRadius: 10, border: "none", background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ⏹ Done
              </button>
            </div>
          )}

          {micState === "evaluating" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 13, color: GOLD, fontWeight: 700, marginBottom: 4 }}>⏳ Evaluating…</div>
              <div style={{ fontSize: 11, color: "#7a9e88" }}>Comparing your recitation to the expected text</div>
            </div>
          )}

          {evalScore !== null && autoResult && (
            <div style={{ padding: "12px 14px", borderRadius: 12,
              background: autoResult === "correct" ? LIGHT : "#fff5f5",
              border: `1px solid ${autoResult === "correct" ? BORDER : "#fca5a5"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                  {autoResult === "correct" ? "✓ Correct! Masha'Allah" : "✗ Needs more practice"}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                  {evalScore}%
                </span>
              </div>
              {question.answer.map((ansText, ai) => {
                const clean = ansText.replace("← (complete verse)", "").trim();
                const diff  = diffWords(transcript || "", clean);
                return (
                  <div key={ai} style={{
                    direction: "rtl",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 3px",
                    justifyContent: "flex-end",
                    background: "#f9fafb",
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: ai < question.answer.length - 1 ? 8 : 0,
                  }}>
                    {diff.map((d, wi) => (
                      <span key={wi} style={{
                        fontFamily: "'Amiri Quran','Amiri',serif",
                        fontSize: 19,
                        lineHeight: 2,
                        color: d.hit ? "#166534" : "#c0392b",
                        background: d.hit ? "#dcfce7" : "#fee2e2",
                        borderRadius: 6,
                        padding: "1px 6px",
                        fontWeight: d.hit ? 400 : 700,
                        display: "inline-block",
                      }}>{d.word}</span>
                    ))}
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 8, direction: "ltr" }}>
                🟢 Said &nbsp;|&nbsp; 🔴 Missed — advancing in 2s…
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
