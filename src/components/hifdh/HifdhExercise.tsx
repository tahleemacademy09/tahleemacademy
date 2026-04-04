// src/components/hifdh/HifdhExercise.tsx
// Hear prompt fixed + voice recitation with AI evaluation
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { supabase } from "@/integrations/supabase/client";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

const QWEN_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_MODEL = "qwen-audio-turbo";

interface Ayah { numberInSurah: number; text: string; }
interface Props { reciter?: string; }

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

function getMime() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

// Normalise Arabic text for comparison
function norm(t: string) {
  return t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "")
    .replace(/[\u0622\u0623\u0625\u0627]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0640/g, "")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function scoreMatch(transcript: string, reference: string[]): number {
  const refText = norm(reference.join(" "));
  const txText  = norm(transcript);
  if (!txText || !refText) return 0;
  const refWords = refText.split(" ").filter(Boolean);
  const txWords  = txText.split(" ").filter(Boolean);
  if (!txWords.length) return 0;
  let matched = 0;
  for (const rw of refWords) {
    if (txWords.some(tw => {
      if (tw === rw) return true;
      if (rw.length >= 3 && tw.length >= 3 && rw.slice(0, 3) === tw.slice(0, 3)) return true;
      return false;
    })) matched++;
  }
  return Math.round((matched / refWords.length) * 100);
}

type StageKey = 1 | 2 | 3 | 4 | 5 | 6;

const STAGE: Record<StageKey, { icon: string; title: string; titleAr: string; desc: string; color: string; bg: string; border: string }> = {
  1: { icon: "📖", title: "Full Verse Prompt",     titleAr: "آية كاملة",          desc: "Full verse shown — read the next 2 after it",           color: G,         bg: LIGHT,     border: BORDER   },
  2: { icon: "📚", title: "Full Verse Extended",   titleAr: "آية كاملة موسعة",    desc: "Full verse shown — read the next 4 after it",           color: "#276749", bg: "#e6ffed", border: "#9ae6b4" },
  3: { icon: "✂️", title: "Half Ayah Prompt",      titleAr: "نصف آية",            desc: "First half shown — complete it + continue 2 more",      color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  4: { icon: "🔤", title: "Half Ayah Extended",    titleAr: "نصف آية موسعة",      desc: "First half shown — complete it + the full next verse",   color: "#1d4ed8", bg: "#dbeafe", border: "#60a5fa" },
  5: { icon: "💡", title: "Single Word Prompt",    titleAr: "كلمة واحدة",         desc: "Only the first word — recite the full verse from there", color: "#7c3aed", bg: "#f5f3ff", border: "#a78bfa" },
  6: { icon: "🏁", title: "Full Section Challenge",titleAr: "تحدي القسم الكامل",  desc: "First verse shown — recite all remaining to end",        color: GOLD,      bg: "#fffbeb", border: "#f6d860" },
};

interface Question {
  stage: StageKey;
  prompt: string;
  promptAyahNum: number;
  promptLabel: string;
  answerLabel: string;
  answer: string[];
}

function generateQ(stage: StageKey, pool: Ayah[], surahName: string): Question | null {
  const n = pool.length;
  if (n < 2) return null;
  try {
    switch (stage) {
      case 1: { const idx = Math.floor(Math.random() * Math.max(1, n - 2)); return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah, promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`, answerLabel: "Now recite the next 2 verses:", answer: pool.slice(idx + 1, idx + 3).map(a => a.text) }; }
      case 2: { const idx = Math.floor(Math.random() * Math.max(1, n - 4)); return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah, promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`, answerLabel: "Now recite the next 4 verses:", answer: pool.slice(idx + 1, idx + 5).map(a => a.text) }; }
      case 3: { const idx = Math.floor(Math.random() * Math.max(1, n - 2)); const words = pool[idx].text.split(" "); const half = Math.max(1, Math.floor(words.length / 2)); return { stage, prompt: words.slice(0, half).join(" ") + " …", promptAyahNum: pool[idx].numberInSurah, promptLabel: `First half of Verse ${pool[idx].numberInSurah}`, answerLabel: "Complete this verse, then recite 2 more:", answer: [words.slice(half).join(" ") + " ← (complete verse)", ...pool.slice(idx + 1, idx + 3).map(a => a.text)] }; }
      case 4: { const idx = Math.floor(Math.random() * Math.max(1, n - 1)); const words = pool[idx].text.split(" "); const half = Math.max(1, Math.floor(words.length / 2)); return { stage, prompt: words.slice(0, half).join(" ") + " …", promptAyahNum: pool[idx].numberInSurah, promptLabel: `First half of Verse ${pool[idx].numberInSurah}`, answerLabel: "Complete this verse and recite the next:", answer: [words.slice(half).join(" ") + " ← (complete verse)", ...(idx + 1 < n ? [pool[idx + 1].text] : [])] }; }
      case 5: { const idx = Math.floor(Math.random() * n); const word = pool[idx].text.split(" ")[0]; return { stage, prompt: word + " …", promptAyahNum: pool[idx].numberInSurah, promptLabel: `First word of Verse ${pool[idx].numberInSurah}`, answerLabel: "Recite the complete verse:", answer: [pool[idx].text] }; }
      case 6: { return { stage, prompt: pool[0].text, promptAyahNum: pool[0].numberInSurah, promptLabel: `Opening verse — ${surahName}`, answerLabel: "Recite all remaining verses to the end:", answer: pool.slice(1).map(a => a.text) }; }
    }
  } catch { return null; }
}

export default function HifdhExercise({ reciter = DEFAULT_RECITER }: Props) {
  const [surahNum, setSurahNum]     = useState(114);
  const [startV, setStartV]         = useState(1);
  const [endV, setEndV]             = useState(6);
  const [stage, setStage]           = useState<StageKey>(1);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [loading, setLoading]       = useState(false);
  const [fetchErr, setFetchErr]     = useState("");
  const [started, setStarted]       = useState(false);
  const [question, setQuestion]     = useState<Question | null>(null);
  const [revealed, setRevealed]     = useState(false);
  const [score, setScore]           = useState({ correct: 0, total: 0 });
  const [noQError, setNoQError]     = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);

  // Voice eval state
  const [micState, setMicState]     = useState<"idle"|"recording"|"evaluating">("idle");
  const [transcript, setTranscript] = useState("");
  const [evalScore, setEvalScore]   = useState<number|null>(null);
  const [autoResult, setAutoResult] = useState<"correct"|"wrong"|null>(null);

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const mrRef       = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const surah       = SURAHS[surahNum - 1];

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

  const stopAudio = () => { audioRef.current?.pause(); audioRef.current = null; setIsPlaying(false); };

  const selectedAyahs = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);

  const resetVoice = () => { setMicState("idle"); setTranscript(""); setEvalScore(null); setAutoResult(null); };

  const nextQ = useCallback(() => {
    const pool = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
    const q    = generateQ(stage, pool, surah.name);
    if (!q) { setNoQError(true); return; }
    setQuestion(q); setRevealed(false); stopAudio(); setNoQError(false); resetVoice();
  }, [ayahs, startV, endV, stage, surah.name]);

  const startSession = () => {
    const pool = ayahs.filter(a => a.numberInSurah >= startV && a.numberInSurah <= endV);
    const q    = generateQ(stage, pool, surah.name);
    if (!q) { setNoQError(true); return; }
    setScore({ correct: 0, total: 0 });
    setQuestion(q); setRevealed(false); setNoQError(false); setStarted(true);
    stopAudio(); resetVoice();
  };

  const markAnswer = (correct: boolean) => {
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    nextQ();
  };

  // ── Hear prompt ──────────────────────────────────────────
  const playPrompt = () => {
    if (!question) return;
    stopAudio();
    setIsPlaying(true);
    const url   = audioUrl(surahNum, question.promptAyahNum, reciter);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {
      // Try fallback CDN
      const fb = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${surahNum * 1000 + question.promptAyahNum}.mp3`;
      const a2 = new Audio(fb); audioRef.current = a2;
      a2.play().catch(() => setIsPlaying(false));
      a2.onended = () => setIsPlaying(false);
    });
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
  };

  // ── Voice recitation eval ────────────────────────────────
  const startRecording = async () => {
    resetVoice();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        setMicState("evaluating");
        transcribeAndEval(blob);
      };
      mr.start(200);
      mrRef.current = mr;
      setMicState("recording");
    } catch { alert("Mic access denied."); }
  };

  const stopRecording = () => { mrRef.current?.stop(); };

  const transcribeAndEval = async (blob: Blob) => {
    if (!question) return;
    let tx = "";
    try {
      // Use Qwen API key from env
      let apiKey = (import.meta as any).env?.VITE_DASHSCOPE_API_KEY || "";

      if (apiKey) {
        const base64Full = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const mimeType   = blob.type || "audio/webm";
        const base64Data = base64Full.split(",")[1];

        const res = await fetch(QWEN_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: QWEN_MODEL,
            input: {
              messages: [{
                role: "user",
                content: [
                  { audio: `data:${mimeType};base64,${base64Data}` },
                  { text: "اكتب النص العربي المنطوق في هذا التسجيل فقط بدون ترجمة أو تعليق." },
                ],
              }],
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Handle qwen-audio-turbo output format + legacy fallback
          const outContent = data?.output?.choices?.[0]?.message?.content;
          if (Array.isArray(outContent)) {
            tx = outContent.find((c: any) => c.text)?.text || "";
          } else if (typeof outContent === "string") {
            tx = outContent;
          } else {
            const legacy = data?.choices?.[0]?.message?.content;
            tx = typeof legacy === "string" ? legacy : "";
          }
        }
      }

      if (tx) {
        setTranscript(tx);
        const cleanAnswers = question.answer.map(a => a.replace("← (complete verse)", "").trim());
        const sc = scoreMatch(tx, cleanAnswers);
        setEvalScore(sc);
        const result = sc >= 70 ? "correct" : "wrong";
        setAutoResult(result);
        setTimeout(() => {
          setScore(s => ({ correct: s.correct + (result === "correct" ? 1 : 0), total: s.total + 1 }));
          nextQ();
        }, 2500);
      } else {
        setMicState("idle");
      }
    } catch { setMicState("idle"); }
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });
  const canStart = !loading && selectedAyahs.length >= 2;

  // ── SETUP ────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GOLD})`, padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🎯</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: "#fff", fontWeight: 700 }}>Exercise</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: "rgba(255,255,255,.75)", marginTop: 4 }}>تمرين الاستماع والاسترجاع</div>
          </div>
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

        <div style={card({ padding: "14px 16px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>SELECT STAGE · اختر المرحلة</div>
          {([1, 2, 3, 4, 5, 6] as StageKey[]).map(s => {
            const info = STAGE[s]; const active = stage === s;
            return (
              <div key={s} onClick={() => setStage(s)}
                style={{ display: "flex", gap: 12, padding: "11px 12px", borderRadius: 12, cursor: "pointer",
                  marginBottom: s < 6 ? 8 : 0, background: active ? info.bg : "#fafafa",
                  border: `1.5px solid ${active ? info.border : "#f0f4f0"}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: active ? info.color : "#f0f4f0",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  {info.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? info.color : G }}>
                    Stage {s}: {info.title}
                    <span style={{ fontFamily: "'Amiri',serif", color: GOLD, fontSize: 12, marginLeft: 6 }}>· {info.titleAr}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>{info.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {noQError && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff5f5",
            border: "1px solid #fca5a5", fontSize: 13, color: "#c0392b", textAlign: "center" }}>
            Need at least 2 verses for this stage — increase the verse range above.
          </div>
        )}

        <button onClick={startSession} disabled={!canStart}
          style={{ padding: "15px 0", borderRadius: 14, border: "none", cursor: canStart ? "pointer" : "not-allowed",
            background: canStart ? `linear-gradient(135deg,${G},${GOLD})` : "#f0f4f0",
            color: canStart ? "#fff" : "#7a9e88", fontSize: 15, fontWeight: 800 }}>
          {loading ? "Loading…" : `🎯 Start Stage ${stage} · ابدأ المرحلة`}
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

  if (!question) return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#7a9e88", marginBottom: 12 }}>Generating question…</div>
      <button onClick={nextQ} style={{ padding: "10px 20px", borderRadius: 10, border: "none",
        background: G, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Try Again</button>
    </div>
  );

  const info = STAGE[stage];

  // ── ACTIVE ───────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ padding: "5px 12px", borderRadius: 10, background: info.bg, border: `1px solid ${info.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.icon} Stage {stage}: {info.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {score.total > 0 && (
            <span style={{ fontSize: 12, color: "#7a9e88" }}>
              ✅ <strong style={{ color: G }}>{score.correct}</strong>/{score.total}
            </span>
          )}
          <button onClick={() => { stopAudio(); mrRef.current?.stop(); setStarted(false); setQuestion(null); resetVoice(); }}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "#f8fafb", color: "#7a9e88", cursor: "pointer" }}>
            ✕ End
          </button>
        </div>
      </div>

      {/* Prompt card */}
      <div style={card({ padding: "18px 16px" })}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
          {question.promptLabel.toUpperCase()}
        </div>
        <div style={{ direction: "rtl", fontFamily: "'Amiri Quran',serif", fontSize: 24,
          color: G, lineHeight: 2.1, textAlign: "right",
          padding: "10px 12px", borderRadius: 12, background: LIGHT, border: `1px solid ${BORDER}` }}>
          {question.prompt}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          {isPlaying
            ? <button onClick={stopAudio}
                style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                  background: "#fee2e2", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ⏹ Stop
              </button>
            : <button onClick={playPrompt}
                style={{ flex: 1, padding: "9px 0", borderRadius: 10,
                  border: `1px solid ${BORDER}`, background: "#f8fafb",
                  color: G, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🔊 Hear Prompt
              </button>}
          <button onClick={nextQ}
            style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${BORDER}`,
              background: "#f8fafb", color: "#7a9e88", fontSize: 13, cursor: "pointer" }}>
            Skip →
          </button>
        </div>
      </div>

      {/* Task description */}
      <div style={{ padding: "12px 16px", borderRadius: 14, background: info.bg, border: `1px solid ${info.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{question.answerLabel}</div>
        <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 3 }}>{info.desc}</div>
      </div>

      {/* ── Voice recitation section ── */}
      <div style={card({ padding: "14px 16px" })}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>
          🎙 RECITE ALOUD · اتلُ بصوتك
        </div>

        {micState === "idle" && (
          <button onClick={startRecording}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🎙 Recite — Qwen AI Will Evaluate
          </button>
        )}

        {micState === "recording" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "flex-end", height: 28, marginBottom: 8 }}>
              {[8,14,10,20,12,18,8,15,22,9].map((h, i) => (
                <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: "#ef4444",
                  animation: `spin2 0s ${i*0.08}s infinite` }} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 10 }}>Recording… recite clearly</div>
            <button onClick={stopRecording}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#fee2e2", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ⏹ Done — Evaluate
            </button>
          </div>
        )}

        {micState === "evaluating" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 13, color: GOLD, fontWeight: 700, marginBottom: 4 }}>🤖 Qwen AI Evaluating…</div>
            <div style={{ fontSize: 11, color: "#7a9e88" }}>Comparing your recitation</div>
          </div>
        )}

        {evalScore !== null && autoResult && (
          <div style={{ padding: "12px 14px", borderRadius: 12,
            background: autoResult === "correct" ? LIGHT : "#fff5f5",
            border: `1px solid ${autoResult === "correct" ? BORDER : "#fca5a5"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                {autoResult === "correct" ? "✓ Correct! Masha'Allah" : "✗ Needs practice"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                {evalScore}%
              </span>
            </div>
            {transcript && (
              <div style={{ direction: "rtl", fontFamily: "'Amiri',serif", fontSize: 14, color: "#7a9e88",
                background: "#f9fafb", borderRadius: 8, padding: "6px 10px", lineHeight: 1.8 }}>
                {transcript}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 6 }}>Auto-advancing in 2s…</div>
          </div>
        )}
      </div>

      {/* Manual reveal */}
      {!revealed && micState === "idle" && !autoResult ? (
        <button onClick={() => setRevealed(true)}
          style={{ padding: "14px 0", borderRadius: 14,
            border: `2px solid ${info.border}`, background: "#fafafa",
            color: G, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          👁 Reveal Answer · أظهر الإجابة
        </button>
      ) : revealed && !autoResult ? (
        <>
          <div style={card({ padding: "16px" })}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88", letterSpacing: .5, marginBottom: 10 }}>ANSWER · الإجابة</div>
            {question.answer.map((text, i) => (
              <div key={i} style={{ direction: "rtl", fontFamily: "'Amiri Quran',serif",
                fontSize: 22, color: G, lineHeight: 2, textAlign: "right",
                padding: "8px 0",
                borderBottom: i < question.answer.length - 1 ? `1px dashed ${BORDER}` : "none" }}>
                {text}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => markAnswer(false)}
              style={{ padding: "13px 0", borderRadius: 12, border: "none",
                background: "#fee2e2", color: "#c0392b", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              ✗ Wrong
            </button>
            <button onClick={() => markAnswer(true)}
              style={{ padding: "13px 0", borderRadius: 12,
                border: `1px solid ${BORDER}`, background: LIGHT,
                color: GM, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              ✓ Correct
            </button>
          </div>
        </>
      ) : null}

      {/* Session score */}
      {score.total > 0 && (
        <div style={card({ padding: "12px 16px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#7a9e88", fontWeight: 600 }}>Session Score</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: G }}>
              {score.correct}/{score.total} · {Math.round((score.correct / score.total) * 100)}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#f0f4f0", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((score.correct / score.total) * 100)}%`, height: "100%",
              borderRadius: 3, background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .4s" }} />
          </div>
        </div>
      )}

      {/* Stage switch */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 11, color: "#7a9e88", alignSelf: "center" }}>Switch:</span>
        {([1, 2, 3, 4, 5, 6] as StageKey[]).map(s => (
          <button key={s} onClick={() => { setStage(s); setStarted(false); setQuestion(null); stopAudio(); mrRef.current?.stop(); resetVoice(); }}
            style={{ padding: "5px 11px", borderRadius: 8,
              border: `1px solid ${stage === s ? STAGE[s].border : BORDER}`,
              background: stage === s ? STAGE[s].bg : "#fafafa",
              color: stage === s ? STAGE[s].color : "#7a9e88",
              fontSize: 12, fontWeight: stage === s ? 700 : 400, cursor: "pointer" }}>
            S{s}
          </button>
        ))}
      </div>
    </div>
  );
}
