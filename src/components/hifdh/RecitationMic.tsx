/*
  RecitationMic.tsx — Hifdh Page Practice
  
  Flow (mirrors entrance recitation test):
  1. Pick a Quran page (1–604, standard Madinah Mushaf)
  2. See all ayahs on that page
  3. Record full page recitation in one go
  4. Stop → full blob sent to Deepgram / Groq → full transcript
  5. Claude AI evaluates transcript vs reference → graded report
     with per-word error annotations shown inline on the page text
*/

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, Square, RotateCcw, ChevronLeft, ChevronRight,
  BookOpen, CheckCircle2, AlertCircle, Loader2, Star,
  Upload, ArrowRight, Search
} from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ── Types ──────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface PageAyah {
  number: number;
  numberInSurah: number;
  text: string;
  surah: { number: number; name: string; englishName: string; };
}
type ErrorType = "correct" | "wrong" | "skipped" | "added" | "uncertain";
interface WordResult { raw: string; type: ErrorType; spoken?: string; }
interface AyahResult {
  numberInSurah: number;
  surahName: string;
  score: number;      // 0–100
  words: WordResult[];
  note?: string;
}
interface PageEval {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  ayahResults: AyahResult[];
  mainErrors: string[];
}

/* ── Design tokens ──────────────────────────────────────── */
const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const WAVE_H = [4,8,14,10,18,12,6,16,9,13,7,15,11,5,17,8,12,6,14,10];

const scoreColor = (s: number) => s >= 85 ? "#16A34A" : s >= 70 ? "#D97706" : s >= 50 ? "#EA580C" : "#DC2626";
const gradeColor = (g: string) => ({ A:"#16A34A", B:"#2563EB", C:"#D97706", D:"#EA580C", F:"#DC2626" }[g] || "#666");
const errColor   = (t: ErrorType) => ({
  correct:   "#16A34A",
  wrong:     "#DC2626",
  skipped:   "#9CA3AF",
  added:     "#7C3AED",
  uncertain: "#D97706",
}[t]);

/* ── Arabic normalisation ───────────────────────────────── */
const nrm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "")
   .replace(/[\u0622\u0623\u0625\u0627\u0671-\u0677]/g, "ا")
   .replace(/\u0629/g, "ه").replace(/\u0649/g, "ي")
   .replace(/\u0640/g, "")
   .replace(/[\uFEF5-\uFEFC]/g, "لا")
   .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
   .replace(/\s+/g, " ").trim();

/* ── Audio helpers ──────────────────────────────────────── */
const getMime = () => {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const fmtSec = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  /* Screen */
  type Screen = "picker" | "ready" | "recording" | "recorded" | "evaluating" | "result";
  const [screen,    setScreen]    = useState<Screen>("picker");

  /* Page data */
  const [pageNum,   setPageNum]   = useState<number>(1);
  const [pageInput, setPageInput] = useState("1");
  const [ayahs,     setAyahs]     = useState<PageAyah[]>([]);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError,   setPageError]   = useState("");

  /* Recording */
  const [recTime,   setRecTime]   = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null);

  /* Evaluation */
  const [transcript, setTranscript] = useState("");
  const [evaluation, setEvaluation] = useState<PageEval | null>(null);
  const [evalError,  setEvalError]  = useState("");

  /* Refs */
  const mrRef    = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);

  /* ── Load page ────────────────────────────────────────── */
  const loadPage = async (n: number) => {
    if (n < 1 || n > 604) { setPageError("Page must be 1–604"); return; }
    setLoadingPage(true); setPageError(""); setAyahs([]);
    try {
      const r   = await fetch(`https://api.alquran.cloud/v1/page/${n}/ar.uthmani`);
      const d   = await r.json();
      if (d.code !== 200) throw new Error("Failed to load page");
      setAyahs(d.data.ayahs || []);
      setPageNum(n);
      setScreen("ready");
    } catch(e: any) {
      setPageError(e.message || "Could not load page");
    } finally { setLoadingPage(false); }
  };

  /* ── Recording ────────────────────────────────────────── */
  const startRec = async () => {
    try {
      cancelRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getMime();
      const mr     = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current!); setRecTime(0);
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size === 0) return;
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setScreen("recorded");
      };
      mr.start(200);
      mrRef.current = mr;
      setScreen("recording");
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch {
      alert("Microphone access denied. Please allow microphone in your browser settings.");
    }
  };

  const stopRec = () => { mrRef.current?.stop(); };

  const cancelRec = () => {
    cancelRef.current = true;
    mrRef.current?.stop();
    clearInterval(timerRef.current!);
    setRecTime(0); setScreen("ready");
  };

  const retake = () => {
    setAudioBlob(null); setAudioUrl(null);
    setTranscript(""); setEvaluation(null); setEvalError("");
    setScreen("ready");
  };

  /* ── Step 1: Transcribe ────────────────────────────────── */
  const transcribeAudio = async (blob: Blob): Promise<string> => {
    /* PRIMARY: Deepgram nova-2 — fastest for real-time */
    if (DEEPGRAM_KEY) {
      try {
        const res = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
          { method:"POST", headers:{ Authorization:`Token ${DEEPGRAM_KEY}`, "Content-Type": blob.type || "audio/webm" }, body: blob }
        );
        if (res.ok) {
          const text = (await res.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
          if (text) return text;
        }
      } catch(e: any) { console.warn("Deepgram:", e.message); }
    }

    /* FALLBACK: Groq whisper-large-v3 */
    if (GROQ_KEY) {
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const fd  = new FormData();
      fd.append("file", new File([blob], `recitation.${ext}`, { type: blob.type }));
      fd.append("model", "whisper-large-v3");
      fd.append("language", "ar");
      fd.append("response_format", "verbose_json");
      fd.append("temperature", "0");
      fd.append("prompt",
        "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين " +
        "إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم " +
        "غير المغضوب عليهم ولا الضالين قل هو الله أحد الله الصمد"
      );
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method:"POST", headers:{ Authorization:`Bearer ${GROQ_KEY}` }, body: fd
      });
      if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text().catch(()=>"")}`);
      const data = await r.json();
      // Filter out silence-only segments
      if (data.segments) {
        const good = data.segments.filter((s: any) => (s.no_speech_prob ?? 0) < 0.6);
        return good.map((s: any) => s.text).join(" ").trim() || data.text || "";
      }
      return data.text || "";
    }

    throw new Error("No transcription API key available.");
  };

  /* ── Step 2: Evaluate with Claude ─────────────────────── */
  const evaluateWithClaude = async (transcript: string, referenceText: string, pageAyahs: PageAyah[]): Promise<PageEval> => {
    // Build ayah reference list for Claude
    const ayahList = pageAyahs.map(a =>
      `[Surah ${a.surah.englishName}, Ayah ${a.numberInSurah}]: ${a.text}`
    ).join("\n");

    const prompt = `You are an expert Quran teacher evaluating a student's Hifdh (memorisation) recitation.

REFERENCE (correct Quran text for this page):
${ayahList}

STUDENT'S TRANSCRIPTION (what the student actually said):
"${transcript}"

Your task: Compare the student's recitation against the reference word by word. Return ONLY valid JSON, no markdown, no explanation outside the JSON.

JSON structure:
{
  "overallScore": <0-100 integer>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "<2-3 sentence plain English summary of performance>",
  "mainErrors": ["<error pattern 1>", "<error pattern 2>", ...],
  "ayahResults": [
    {
      "numberInSurah": <int>,
      "surahName": "<englishName>",
      "score": <0-100>,
      "note": "<optional specific note about this ayah>",
      "words": [
        { "raw": "<Arabic word from reference>", "type": "<correct|wrong|skipped|uncertain>", "spoken": "<what student said if wrong, omit if correct>" },
        ...
      ]
    },
    ...
  ]
}

Grading scale: A=85-100, B=70-84, C=55-69, D=40-54, F=0-39

Rules:
- "correct": student said this word correctly (exact or valid tajweed variant)
- "wrong": student said a different word (include what they said in "spoken")  
- "skipped": student skipped this word entirely
- "uncertain": word was in transcript but unclear if correct
- Be strict but fair — common tajweed variations (e.g. idgham, ikhfa) should still be "correct"
- If the student did not recite an entire ayah, mark all its words as "skipped"
- mainErrors: list the 2-4 most common error patterns (e.g. "Skipped last word of ayah 3", "Mispronounced 'الرَّحْمَٰنِ'", "Merged ayahs 2 and 3")`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text().catch(()=>"")}`);
    const data  = await res.json();
    const raw   = data.content?.[0]?.text || "";
    // Strip any markdown fences
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(clean) as PageEval;
  };

  /* ── Main evaluate flow ──────────────────────────────── */
  const evaluate = async () => {
    if (!audioBlob) return;
    setScreen("evaluating"); setEvalError("");

    try {
      // 1. Transcribe
      const tx = await transcribeAudio(audioBlob);
      setTranscript(tx);

      // 2. Build reference text from loaded ayahs
      const refText = ayahs.map(a => a.text).join(" ");

      // 3. Evaluate with Claude
      const ev = await evaluateWithClaude(tx, refText, ayahs);
      setEvaluation(ev);
      setScreen("result");

      // 4. Save to Supabase
      if (userId) {
        const ext  = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
        const path = `${userId}/page_${pageNum}_${Date.now()}.${ext}`;
        let audioUrl = "";
        try {
          const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, audioBlob);
          if (up) { const { data: u } = supabase.storage.from("hifdh-recordings").getPublicUrl(path); audioUrl = u?.publicUrl ?? ""; }
        } catch(_) {}
        await supabase.from("hifdh_recordings").insert({
          student_id: userId,
          surah_num: ayahs[0]?.surah?.number ?? 0,
          surah_name: `Page ${pageNum}`,
          ayah_start: ayahs[0]?.numberInSurah ?? 1,
          ayah_end:   ayahs[ayahs.length-1]?.numberInSurah ?? 1,
          audio_url:  audioUrl,
          ai_score:   ev.overallScore,
          status:     "evaluated",
          transcript: tx,
          word_results: ev.ayahResults,
        });
      }
    } catch(e: any) {
      console.error("Evaluate error:", e);
      setEvalError(e.message || "Evaluation failed. Please try again.");
      setScreen("recorded");
    }
  };

  /* ── Derived ──────────────────────────────────────────── */
  const pageInfo = ayahs.length > 0 ? {
    firstSurah: ayahs[0].surah.englishName,
    lastSurah:  ayahs[ayahs.length-1].surah.englishName,
    firstAyah:  ayahs[0].numberInSurah,
    lastAyah:   ayahs[ayahs.length-1].numberInSurah,
  } : null;

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:"100svh", background:`linear-gradient(160deg,${G},${GM},#0a1f12)`, display:"flex", flexDirection:"column", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes waveBar { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
        @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4);} 70%{box-shadow:0 0 0 12px rgba(220,38,38,0);} }
      `}</style>

      {/* Header */}
      <div style={{ padding:"18px 20px 0", display:"flex", alignItems:"center", gap:12, maxWidth:580, margin:"0 auto", width:"100%" }}>
        {screen !== "picker" && (
          <button onClick={() => {
            if (screen === "result" || screen === "recorded") retake();
            else if (screen === "ready") setScreen("picker");
            else if (screen === "recording") cancelRec();
          }} style={{ background:"rgba(255,255,255,.12)", border:"none", borderRadius:10, padding:"8px 10px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
            <ChevronLeft size={16}/> Back
          </button>
        )}
        <div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:16 }}>Hifdh Practice</div>
          {pageInfo && <div style={{ color:"rgba(255,255,255,.6)", fontSize:12 }}>Page {pageNum} · {pageInfo.firstSurah}{pageInfo.firstSurah !== pageInfo.lastSurah ? ` → ${pageInfo.lastSurah}` : ""}</div>}
        </div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"16px 16px 40px" }}>
        <div style={{ width:"100%", maxWidth:580, background:"#fff", borderRadius:24, boxShadow:"0 24px 80px rgba(0,0,0,.35)", overflow:"hidden", animation:"fadeUp .4s ease" }}>

          {/* ══ PAGE PICKER ════════════════════════════════ */}
          {screen === "picker" && (
            <div style={{ padding:28 }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ width:64, height:64, borderRadius:20, background:`linear-gradient(135deg,${G},${GM})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                  <BookOpen size={30} color={GOLD}/>
                </div>
                <h2 style={{ fontSize:20, fontWeight:900, color:G, margin:"0 0 6px" }}>Choose a Quran Page</h2>
                <p style={{ fontSize:13, color:"#666", margin:0 }}>Standard Madinah Mushaf · Pages 1–604</p>
              </div>

              {/* Page number input */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>Page Number</label>
                <div style={{ display:"flex", gap:10 }}>
                  <input
                    type="number" min={1} max={604}
                    value={pageInput}
                    onChange={e => setPageInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") loadPage(parseInt(pageInput)); }}
                    placeholder="e.g. 1"
                    style={{ flex:1, padding:"12px 14px", borderRadius:12, border:"2px solid #e5e7eb", fontSize:15, color:"#111", outline:"none", fontWeight:700 }}
                  />
                  <button onClick={() => loadPage(parseInt(pageInput))} disabled={loadingPage}
                    style={{ padding:"12px 20px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                    {loadingPage ? <Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> : <Search size={16}/>}
                    Load
                  </button>
                </div>
                {pageError && <div style={{ fontSize:12, color:"#DC2626", marginTop:6 }}>{pageError}</div>}
              </div>

              {/* Quick jump buttons */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>Quick Access</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {[
                    { label:"Al-Fatiha (p.1)",   page:1  },
                    { label:"Al-Baqarah (p.2)",  page:2  },
                    { label:"Juz Amma (p.582)",  page:582},
                    { label:"Al-Mulk (p.562)",   page:562},
                    { label:"Yasin (p.440)",      page:440},
                    { label:"Al-Kahf (p.293)",    page:293},
                  ].map(q => (
                    <button key={q.page} onClick={() => { setPageInput(String(q.page)); loadPage(q.page); }}
                      style={{ padding:"7px 13px", borderRadius:20, border:"1.5px solid #e5e7eb", background:"#f9fafb", color:G, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop:20, background:"#F0FDF4", borderRadius:12, padding:"12px 14px", border:"1px solid #86EFAC" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#166534", marginBottom:6 }}>How it works:</div>
                {["Select a Quran page", "Read all ayahs on that page out loud", "Tap Stop — AI grades your full page", "See exactly which words were wrong"].map((t,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#166534", marginBottom:i<3?4:0 }}>
                    <div style={{ width:16,height:16,borderRadius:"50%",background:"#22c55e",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{i+1}</div>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ READY / REFERENCE ═════════════════════════ */}
          {(screen === "ready" || screen === "recording") && ayahs.length > 0 && (
            <div>
              {/* Reference text */}
              <div style={{ padding:"20px 20px 0" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:G }}>Page {pageNum}</div>
                  <div style={{ fontSize:11, color:"#9CA3AF" }}>{ayahs.length} ayahs · {ayahs[0]?.surah?.englishName}</div>
                </div>

                {/* Quran text */}
                <div style={{ background:"#FFFBEB", borderRadius:16, padding:"16px 18px", border:"1px solid #F9D46A", maxHeight: screen === "recording" ? 200 : 320, overflowY:"auto", marginBottom:16 }}>
                  {/* Group by surah */}
                  {(() => {
                    const groups: { surah: PageAyah["surah"]; ayahs: PageAyah[] }[] = [];
                    for (const a of ayahs) {
                      const last = groups[groups.length-1];
                      if (last && last.surah.number === a.surah.number) last.ayahs.push(a);
                      else groups.push({ surah: a.surah, ayahs: [a] });
                    }
                    return groups.map(g => (
                      <div key={g.surah.number} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#92400E", marginBottom:6, textAlign:"center" }}>
                          {g.surah.englishName} — <span style={{ fontFamily:"'Amiri',serif" }}>{g.surah.name}</span>
                        </div>
                        <div style={{ direction:"rtl", fontFamily:"'Amiri Quran','Amiri',serif", fontSize:20, lineHeight:2.8, textAlign:"justify", color:G }}>
                          {g.ayahs.map(a => (
                            <span key={a.numberInSurah}>
                              {a.text}
                              <span style={{ color:GOLD, fontSize:16, margin:"0 4px", fontFamily:"'Amiri',serif" }}>﴿{a.numberInSurah}﴾</span>
                              {" "}
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Recording controls */}
              <div style={{ padding:"0 20px 24px" }}>
                {screen === "ready" && (
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:13, color:"#666", marginBottom:16, lineHeight:1.6 }}>
                      Read the page above clearly.<br/>
                      <strong>Tap the mic when ready — record your entire page in one go.</strong>
                    </p>
                    <button onClick={startRec} style={{
                      width:80, height:80, borderRadius:"50%",
                      background:`linear-gradient(135deg,${G},${GM})`,
                      border:"none", cursor:"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      margin:"0 auto 10px",
                      boxShadow:"0 8px 24px rgba(6,78,59,.3)",
                    }}>
                      <Mic size={32} color="#fff"/>
                    </button>
                    <div style={{ fontSize:14, fontWeight:700, color:G }}>Tap to start</div>
                    <div style={{ fontSize:11, color:"#9CA3AF", marginTop:3 }}>Recite the full page, then tap stop</div>
                  </div>
                )}

                {screen === "recording" && (
                  <div style={{ textAlign:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:2, height:44, marginBottom:10 }}>
                      {WAVE_H.map((h,i) => (
                        <div key={i} style={{ width:3, height:h*2.2, borderRadius:3, background:"#DC2626", animation:`waveBar ${.4+(i%4)*.1}s ease-in-out infinite alternate`, animationDelay:`${i*.04}s` }}/>
                      ))}
                    </div>
                    <div style={{ fontSize:26, fontWeight:900, color:"#DC2626", marginBottom:14 }}>{fmtSec(recTime)}</div>
                    <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                      <button onClick={cancelRec}
                        style={{ padding:"10px 20px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        Cancel
                      </button>
                      <button onClick={stopRec}
                        style={{ padding:"10px 28px", borderRadius:12, border:"none", background:"#DC2626", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8, animation:"micPulse 1.5s infinite" }}>
                        <Square size={16} fill="#fff"/> Stop & Evaluate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ RECORDED — REVIEW ════════════════════════ */}
          {screen === "recorded" && audioBlob && (
            <div style={{ padding:24 }}>
              <div style={{ textAlign:"center", marginBottom:20 }}>
                <CheckCircle2 size={44} color="#16A34A" style={{ margin:"0 auto 10px", display:"block" }}/>
                <div style={{ fontSize:18, fontWeight:800, color:G }}>Recording Complete!</div>
                <div style={{ fontSize:13, color:"#666", marginTop:4 }}>Page {pageNum} · {fmtSec(recTime)} recorded</div>
              </div>

              {audioUrl && (
                <div style={{ background:"#F0FDF4", borderRadius:14, padding:14, border:"1px solid #86EFAC", marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:G, marginBottom:8 }}>Review your recitation:</div>
                  <audio controls src={audioUrl} style={{ width:"100%", height:44, borderRadius:8 }} preload="auto"/>
                </div>
              )}

              {evalError && (
                <div style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 14px", border:"1px solid #FCA5A5", marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#DC2626", display:"flex", alignItems:"center", gap:6 }}>
                    <AlertCircle size={14}/> {evalError}
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={retake}
                  style={{ flex:1, padding:"12px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <RotateCcw size={14}/> Re-record
                </button>
                <button onClick={evaluate}
                  style={{ flex:2, padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <Star size={16}/> Evaluate with AI
                </button>
              </div>
            </div>
          )}

          {/* ══ EVALUATING ════════════════════════════════ */}
          {screen === "evaluating" && (
            <div style={{ padding:"40px 24px", textAlign:"center" }}>
              <Loader2 size={48} color={GM} style={{ margin:"0 auto 16px", display:"block", animation:"spin .8s linear infinite" }}/>
              <div style={{ fontSize:17, fontWeight:800, color:G, marginBottom:6 }}>Evaluating your recitation…</div>
              <div style={{ fontSize:13, color:"#9CA3AF" }}>
                {!transcript ? "Transcribing audio…" : "Analysing with AI…"}
              </div>
              {transcript && (
                <div style={{ background:"#f9fafb", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb", marginTop:16, textAlign:"right" }}>
                  <div style={{ fontSize:10, color:"#9CA3AF", textAlign:"left", marginBottom:4 }}>Heard:</div>
                  <div style={{ fontSize:13, fontFamily:"'Amiri',serif", direction:"rtl", color:"#333", lineHeight:1.8 }}>{transcript.slice(0,200)}{transcript.length>200?"…":""}</div>
                </div>
              )}
            </div>
          )}

          {/* ══ RESULT ════════════════════════════════════ */}
          {screen === "result" && evaluation && (
            <div style={{ animation:"fadeUp .4s ease" }}>
              {/* Score header */}
              <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"24px", textAlign:"center" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,.7)", marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Page {pageNum} · Overall Score</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16 }}>
                  <div style={{ width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,.12)", border:`4px solid ${gradeColor(evaluation.grade)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ fontSize:30, fontWeight:900, color:"#fff" }}>{evaluation.overallScore}%</div>
                  </div>
                  <div style={{ textAlign:"left" }}>
                    <div style={{ fontSize:42, fontWeight:900, color:gradeColor(evaluation.grade), lineHeight:1 }}>{evaluation.grade}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.7)", marginTop:2 }}>
                      {{A:"Excellent",B:"Good",C:"Needs Work",D:"Weak",F:"Needs Review"}[evaluation.grade]}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,.8)", marginTop:12, lineHeight:1.6 }}>{evaluation.summary}</div>
              </div>

              <div style={{ padding:"20px" }}>
                {/* Main errors */}
                {evaluation.mainErrors?.length > 0 && (
                  <div style={{ background:"#FEF2F2", borderRadius:12, padding:"12px 14px", border:"1px solid #FCA5A5", marginBottom:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#991B1B", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                      <AlertCircle size={13}/> Main Errors Found
                    </div>
                    {evaluation.mainErrors.map((err, i) => (
                      <div key={i} style={{ fontSize:12, color:"#DC2626", marginBottom:i<evaluation.mainErrors.length-1?5:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                        <span style={{ fontWeight:800, flexShrink:0 }}>•</span> {err}
                      </div>
                    ))}
                  </div>
                )}

                {/* Legend */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                  {([["correct","✓ Correct"],["wrong","✗ Wrong"],["skipped","— Skipped"],["uncertain","? Uncertain"]] as [ErrorType,string][]).map(([t,l]) => (
                    <div key={t} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                      <div style={{ width:10,height:10,borderRadius:2,background:errColor(t) }}/>
                      <span style={{ color:"#666" }}>{l}</span>
                    </div>
                  ))}
                </div>

                {/* Ayah-by-ayah results */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {evaluation.ayahResults.map(ar => (
                    <div key={ar.numberInSurah} style={{ border:`1px solid ${ar.score >= 85 ? "#86EFAC" : ar.score >= 60 ? "#FCD34D" : "#FCA5A5"}`, borderRadius:12, overflow:"hidden" }}>
                      {/* Ayah header */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background: ar.score >= 85 ? "#F0FDF4" : ar.score >= 60 ? "#FFFBEB" : "#FEF2F2" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#374151" }}>
                          {ar.surahName} · Ayah {ar.numberInSurah}
                        </div>
                        <div style={{ fontSize:13, fontWeight:800, color:scoreColor(ar.score) }}>{ar.score}%</div>
                      </div>

                      {/* Words */}
                      <div style={{ padding:"12px", background:"#fff", direction:"rtl", fontFamily:"'Amiri Quran','Amiri',serif", fontSize:20, lineHeight:2.8, textAlign:"right" }}>
                        {ar.words.map((w, wi) => (
                          <span key={wi} style={{ display:"inline-block", margin:"0 2px", position:"relative" }}>
                            <span style={{
                              color: errColor(w.type),
                              background: w.type !== "correct" ? `${errColor(w.type)}18` : "transparent",
                              borderRadius: w.type !== "correct" ? 4 : 0,
                              padding: w.type !== "correct" ? "0 3px" : "0",
                              borderBottom: w.type === "wrong" || w.type === "uncertain" ? `2px solid ${errColor(w.type)}` : "none",
                              textDecoration: w.type === "skipped" ? "line-through" : "none",
                              opacity: w.type === "skipped" ? .55 : 1,
                            }}>
                              {w.raw}
                            </span>
                            {/* Tooltip for wrong words */}
                            {w.type === "wrong" && w.spoken && (
                              <span style={{ display:"block", fontSize:9, color:"#DC2626", direction:"rtl", textAlign:"center", marginTop:-6, fontFamily:"system-ui" }}>
                                ↑ "{w.spoken}"
                              </span>
                            )}
                          </span>
                        ))}
                        <span style={{ color:`${GOLD}77`, fontSize:16, margin:"0 4px" }}>﴿{ar.numberInSurah}﴾</span>
                      </div>

                      {ar.note && (
                        <div style={{ padding:"6px 12px 10px", fontSize:11, color:"#6B7280", fontStyle:"italic" }}>
                          💬 {ar.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display:"flex", gap:10, marginTop:20 }}>
                  <button onClick={retake}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:G, fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <RotateCcw size={14}/> Retry Page
                  </button>
                  <button onClick={() => { setScreen("picker"); setEvaluation(null); setTranscript(""); }}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <BookOpen size={14}/> New Page
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
