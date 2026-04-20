// src/components/hifdh/HifdhExercise.tsx
// Hear prompt fixed + voice recitation with AI evaluation
import { useState, useCallback, useRef, useEffect } from "react";
import { SURAHS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { supabase } from "@/integrations/supabase/client";
import { transcribeRecitationAudio } from "@/lib/recitationAi";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

interface Ayah { numberInSurah: number; text: string; }
interface Props { reciter?: string; }

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

function getMime() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

// Normalise Arabic text for comparison — lenient version that strips
// diacritics, hamza variants, taa marbuta, alef maqsura, tatweel,
// and common attached prefixes (ال، و، ف، ب، ل) so minor pronunciation
// differences (e.g. wasla, tanween, short vowels) don't count as errors.
function norm(t: string) {
  return t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "") // all diacritics
    .replace(/[\u0622\u0623\u0624\u0625\u0626\u0627\u0671]/g, "\u0627") // all alef variants → ا
    .replace(/\u0629/g, "\u0647")   // taa marbuta → haa
    .replace(/\u0649/g, "\u064A")   // alef maqsura → ya
    .replace(/\u0640/g, "")          // tatweel
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

// Strip common Arabic prefixes (ال، وَ، فَ، بِ، لِ) before root comparison
function stripPrefix(w: string): string {
  if (w.startsWith("\u0627\u0644") && w.length > 3) return w.slice(2); // ال
  if ((w.startsWith("\u0648") || w.startsWith("\u0641") || w.startsWith("\u0628") || w.startsWith("\u0644")) && w.length > 2) return w.slice(1);
  return w;
}

// Fuzzy word match — handles prefix stripping + root proximity
function wordMatch(tw: string, rw: string): boolean {
  if (!tw || !rw) return false;
  if (tw === rw) return true;
  const ts = stripPrefix(tw); const rs = stripPrefix(rw);
  if (ts === rs) return true;
  // Prefix match on roots (first 3 chars of root)
  const minLen = Math.min(ts.length, rs.length);
  if (minLen >= 3 && ts.slice(0, 3) === rs.slice(0, 3)) return true;
  // Containment: short root inside longer word
  const shorter = ts.length <= rs.length ? ts : rs;
  const longer  = ts.length <= rs.length ? rs : ts;
  if (shorter.length >= 4 && longer.includes(shorter.slice(0, Math.ceil(shorter.length * 0.75)))) return true;
  return false;
}

function scoreMatch(transcript: string, reference: string[]): number {
  const refText = norm(reference.join(" "));
  const txText  = norm(transcript);
  if (!txText || !refText) return 0;
  // Filter out very short particles (1-char) which can cause noise
  const refWords = refText.split(" ").filter(w => w.length >= 2);
  const txWords  = txText.split(" ").filter(Boolean);
  if (!txWords.length) return 0;
  let matched = 0;
  for (const rw of refWords) {
    if (txWords.some(tw => wordMatch(tw, rw))) matched++;
  }
  return Math.round((matched / refWords.length) * 100);
}

// Word-level diff: highlight which reference words were said vs missed
function diffWords(transcript: string, referenceText: string): { word: string; hit: boolean }[] {
  const txNorm  = norm(transcript);
  const txWords = txNorm.split(" ").filter(Boolean);
  return referenceText.split(" ").filter(Boolean).map(rw => {
    const nrw = norm(rw);
    const hit = nrw.length < 2 || txWords.some(tw => wordMatch(tw, nrw));
    return { word: rw, hit };
  });
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
      case 1: {
        // Random verse anywhere, ask for next 2
        const idx = Math.floor(Math.random() * Math.max(1, n - 2));
        return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah, promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`, answerLabel: "Now recite the next 2 verses:", answer: pool.slice(idx + 1, idx + 3).map(a => a.text) };
      }
      case 2: {
        // Random verse anywhere, ask for next 4
        const idx = Math.floor(Math.random() * Math.max(1, n - 4));
        return { stage, prompt: pool[idx].text, promptAyahNum: pool[idx].numberInSurah, promptLabel: `${surahName} · Verse ${pool[idx].numberInSurah}`, answerLabel: "Now recite the next 4 verses:", answer: pool.slice(idx + 1, idx + 5).map(a => a.text) };
      }
      case 3: {
        // Randomly show: first half OR last 2 words of verse (to continue into next verse)
        const idx = Math.floor(Math.random() * Math.max(1, n - 2));
        const words = pool[idx].text.split(" ");
        const variant = Math.random() < 0.5 ? "start" : "end";
        if (variant === "end" && idx + 1 < n) {
          // Show last 2 words → user must say the next verse
          const lastTwo = words.slice(-2).join(" ") + " …";
          return { stage, prompt: lastTwo, promptAyahNum: pool[idx].numberInSurah,
            promptLabel: `End of Verse ${pool[idx].numberInSurah}`,
            answerLabel: "Continue — recite the next verse:",
            answer: pool.slice(idx + 1, idx + 3).map(a => a.text) };
        }
        // Default: show first half
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
        // Pick a random verse, then a random WORD within it (not only the first)
        const idx = Math.floor(Math.random() * n);
        const words = pool[idx].text.split(" ");
        // Randomly pick from the first 60% of words so user still has something to continue
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

    try {
      const tx = await transcribeRecitationAudio(blob);

      if (tx) {
        setTranscript(tx);
        const cleanAnswers = question.answer.map(a => a.replace("← (complete verse)", "").trim());
        const sc = scoreMatch(tx, cleanAnswers);
        setEvalScore(sc);
        const result = sc >= 55 ? "correct" : "wrong";
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
            <div style={{ fontSize: 13, color: GOLD, fontWeight: 700, marginBottom: 4 }}>🤖 AI Evaluating…</div>
            <div style={{ fontSize: 11, color: "#7a9e88" }}>Comparing your recitation to the expected text</div>
          </div>
        )}

        {evalScore !== null && autoResult && (
          <div style={{ padding: "12px 14px", borderRadius: 12,
            background: autoResult === "correct" ? LIGHT : "#fff5f5",
            border: `1px solid ${autoResult === "correct" ? BORDER : "#fca5a5"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                {autoResult === "correct" ? "✓ Correct! Masha'Allah" : "✗ Needs more practice"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 900, color: autoResult === "correct" ? GM : "#c0392b" }}>
                {evalScore}%
              </span>
            </div>
            {/* Word-level diff — red = missed, green = recited */}
            {question.answer.map((ansText, ai) => {
              const clean = ansText.replace("← (complete verse)", "").trim();
              const diff  = diffWords(transcript || "", clean);
              return (
                <div key={ai} style={{ direction: "rtl", fontFamily: "'Amiri Quran','Amiri',serif",
                  fontSize: 20, lineHeight: 2.2, textAlign: "right",
                  background: "#f9fafb", borderRadius: 8, padding: "6px 10px",
                  marginBottom: ai < question.answer.length - 1 ? 6 : 0 }}>
                  {diff.map((d, wi) => (
                    <span key={wi} style={{
                      color: d.hit ? "#166534" : "#c0392b",
                      background: d.hit ? "#dcfce7" : "#fee2e2",
                      borderRadius: 4, padding: "1px 3px", margin: "0 2px",
                      fontWeight: d.hit ? 400 : 700,
                    }}>{d.word}</span>
                  ))}
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 6, direction: "ltr" }}>
              🟢 Said &nbsp;|&nbsp; 🔴 Missed — auto-advancing in 2s…
            </div>
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
