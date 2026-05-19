/*
  RecitationMic.tsx — Hifdh Memorise & Revise
  
  STRICT HOOK ORDER (React Rules of Hooks):
  1. All useState
  2. All useRef
  3. All useEffect
  4. All useCallback
  5. Derived values (non-hooks) — LAST, before render
*/

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, Square, ChevronLeft, ChevronRight, BookOpen,
  Volume2, RotateCcw, Check, Star, Loader2, AlertCircle
} from "lucide-react";

const DEEPGRAM_KEY  = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY      = import.meta.env.VITE_GROQ_API_KEY || "";
const MIN_REPS      = 7;

// ── Quran transcription style prompt ────────────────────────────────────────
// Must NOT contain full Quranic verses — Whisper treats the prompt as "what
// was said just before this audio" and will hallucinate those exact verses
// instead of transcribing what the student actually recited.
// This hint activates diacritised Uthmani script output without seeding content.
const QURAN_STYLE_PROMPT =
  "قرآن كريم بالتشكيل الكامل. تلاوة قرآنية بالرسم العثماني. صَ ضَ طَ ظَ إِ أَ ئَ ؤَ";
const DEFAULT_SHOWN = 10;
const DEFAULT_HIDDEN= 10;
const DEFAULT_CUMUL = 5;
const SILENCE_MS    = 1500; // 1.5s pause = done reciting one ayah

/* ── Types ─────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface AyahData  { number: number; numberInSurah: number; text: string; }
type AppMode  = "home"|"mem-setup"|"rev-setup"|"mem-session"|"rev-session"|"rev-result";
type MemPhase = "shown"|"hidden"|"cumulative";
interface WordResult { word: string; ok: boolean; note?: string; }
interface RevResult  { overallScore: number; grade: string; summary: string; wordResults: WordResult[]; mainErrors: string[]; }

/* ── Pure helpers ───────────────────────────────────────── */
const nrm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
   .replace(/[\u0622\u0623\u0625\u0627\u0671-\u0677]/g,"\u0627")
   .replace(/\u0629/g,"\u0647").replace(/\u0649/g,"\u064A")
   .replace(/\u0640/g,"").replace(/[\uFEF5-\uFEFC]/g,"\u0644\u0627")
   .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"").replace(/\s+/g," ").trim();

const lev = (a: string, b: string): number => {
  if (Math.abs(a.length-b.length) > 5) return 99;
  const d = Array.from({length:a.length+1}, (_,i) =>
    Array.from({length:b.length+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=a.length;i++)
    for (let j=1;j<=b.length;j++)
      d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1]);
  return d[a.length][b.length];
};

const wOk = (s: string, r: string) => {
  const a=nrm(s), b=nrm(r);
  if (!a||!b) return false;
  if (a===b) return true;
  if (a.length>=3&&b.length>=3&&a.slice(0,3)===b.slice(0,3)) return true;
  if (a.length>=3&&(a.includes(b)||b.includes(a))) return true;
  return lev(a,b)<=Math.max(1,Math.floor(Math.max(a.length,b.length)*0.3));
};

const scoreVsRef = (tx: string, ref: string) => {
  const rw = ref.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).filter(Boolean);
  const tk = tx.replace(/[^\u0600-\u06FF\s]/g," ").trim().split(/\s+/).filter(Boolean);
  if (!tk.length) return { score:0, words:rw.map(w=>({word:w,ok:false})) };
  const words: WordResult[] = [];
  let ti = 0;
  for (let ri=0;ri<rw.length;ri++) {
    let matched = false;
    for (let la=0;la<3&&ti+la<tk.length;la++) {
      if (wOk(tk[ti+la],rw[ri])) { words.push({word:rw[ri],ok:true}); ti+=la+1; matched=true; break; }
    }
    if (!matched) words.push({word:rw[ri],ok:false});
  }
  return { score:Math.round(words.filter(w=>w.ok).length/Math.max(rw.length,1)*100), words };
};

const getMime = () => {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const fmtSec = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ── Colours ────────────────────────────────────────────── */
const G="#064E3B", GM="#065f46", GLT="#ecfdf5";
const GOLD="#d97706", GOLDLT="#fffbeb";
const RED="#dc2626", BORDER="#e5e7eb", MUTED="#6b7280", TEXT="#111827";

/* ══════════════════════════════════════════════════════════
   COMPONENT — hooks declared in strict order
══════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {

  /* ── 1. ALL useState ───────────────────────────────────── */
  const [appMode,        setAppMode]        = useState<AppMode>("home");
  const [surahs,         setSurahs]         = useState<SurahMeta[]>([]);
  const [search,         setSearch]         = useState("");
  const [loadingSurahs,  setLoadingSurahs]  = useState(false);
  const [selSurah,       setSelSurah]       = useState<SurahMeta|null>(null);
  const [fromVerse,      setFromVerse]      = useState(1);
  const [toVerse,        setToVerse]        = useState(7);
  const [ayahs,          setAyahs]          = useState<AyahData[]>([]);
  const [loadingAyahs,   setLoadingAyahs]   = useState(false);
  // Mem session
  const [memVerseIdx,    setMemVerseIdx]    = useState(0);
  const [memPhase,       setMemPhase]       = useState<MemPhase>("shown");
  const [memTotalReps,   setMemTotalReps]   = useState(DEFAULT_SHOWN);
  const [memRecState,    setMemRecState]    = useState<"idle"|"recording">("idle");
  const [memRecTime,     setMemRecTime]     = useState(0);
  const [memCompCount,   setMemCompCount]   = useState(0);
  const [memLiveText,    setMemLiveText]    = useState("");
  const [repsShown,      setRepsShown]      = useState(DEFAULT_SHOWN);
  const [repsHidden,     setRepsHidden]     = useState(DEFAULT_HIDDEN);
  const [repsCumul,      setRepsCumul]      = useState(DEFAULT_CUMUL);
  const [showRepSettings,setShowRepSettings]= useState(false);
  // Rev session
  const [revRecState,    setRevRecState]    = useState<"idle"|"recording"|"transcribing"|"done">("idle");
  const [revRecTime,     setRevRecTime]     = useState(0);
  const [revTranscript,  setRevTranscript]  = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [revResult,      setRevResult]      = useState<RevResult|null>(null);
  const [revEvaluating,  setRevEvaluating]  = useState(false);
  const [revErr,         setRevErr]         = useState("");
  const [revAudioBlob,   setRevAudioBlob]   = useState<Blob|null>(null);
  const [playing,        setPlaying]        = useState(false);

  /* ── 2. ALL useRef ─────────────────────────────────────── */
  // Rev recording
  const mrRef        = useRef<MediaRecorder|null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const liveRef      = useRef("");
  const revBlobRef   = useRef<Blob|null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval>|null>(null);
  // Mem recording
  const memMrRef     = useRef<MediaRecorder|null>(null);
  const memInitRef   = useRef<Blob|null>(null);
  const memCountRef  = useRef(0);
  const memPhraseRef = useRef("");
  const memTotalRef  = useRef(DEFAULT_SHOWN);
  const memPhaseRef  = useRef<MemPhase>("shown");
  const memVerseRef  = useRef(0);
  const memWindowRef = useRef<string[]>([]);
  const memSilRef    = useRef<ReturnType<typeof setTimeout>|null>(null);
  const memTimerRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  // Sync refs (updated each render — safe, not hook calls)
  const selAyahsRef    = useRef<AyahData[]>([]);
  const repsShownRef   = useRef(DEFAULT_SHOWN);
  const repsHiddenRef  = useRef(DEFAULT_HIDDEN);
  const repsCumulRef   = useRef(DEFAULT_CUMUL);
  const audioElRef     = useRef<HTMLAudioElement|null>(null);

  /* ── 3. ALL useEffect ──────────────────────────────────── */
  useEffect(() => {
    setLoadingSurahs(true);
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json()).then(d=>{
      if (d.code===200) setSurahs(d.data);
    }).finally(()=>setLoadingSurahs(false));
  }, []);

  useEffect(() => {
    if (!selSurah) return;
    setLoadingAyahs(true); setAyahs([]);
    setFromVerse(1); setToVerse(Math.min(7, selSurah.numberOfAyahs));
    fetch(`https://api.alquran.cloud/v1/surah/${selSurah.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if (d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({
          number:a.number, numberInSurah:a.numberInSurah, text:a.text
        })));
      }).finally(()=>setLoadingAyahs(false));
  }, [selSurah]);

  // Transcription useEffect — fires when recording stops
  useEffect(() => {
    if (revRecState !== "transcribing") return;
    const blob = revBlobRef.current;
    if (!blob) { setRevRecState("done"); return; }
    let dead = false;
    (async () => {
      try {
        let tx = "";
        const ext = blob.type.includes("mp4") ? "mp4"
                  : blob.type.includes("ogg") ? "ogg"
                  : "webm";

        // ── 1. Groq Whisper-large-v3 (primary, verbose_json + silence gate) ──
        // Groq is tried first because whisper-large-v3 has the best Quranic
        // Arabic accuracy of any freely available ASR model.
        if (GROQ_KEY) {
          try {
            const fd = new FormData();
            fd.append("file",            new File([blob], `r.${ext}`, { type: blob.type || "audio/webm" }));
            fd.append("model",           "whisper-large-v3");
            fd.append("language",        "ar");
            fd.append("response_format", "verbose_json"); // gives us per-segment no_speech_prob
            fd.append("temperature",     "0");
            fd.append("prompt",          QURAN_STYLE_PROMPT); // style hint ONLY — no verses
            const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
              { method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: fd });
            if (r.ok) {
              const json = await r.json();
              // Per-segment silence gate — lenient (0.55) to allow tajweed madd pauses
              const segs: { no_speech_prob?: number }[] = json.segments ?? [];
              const avgNoSpeech = segs.length > 0
                ? segs.reduce((s, g) => s + (g.no_speech_prob ?? 0), 0) / segs.length
                : 0;
              const candidate = (json.text ?? "").trim();
              if (candidate.length >= 2 && avgNoSpeech < 0.55) tx = candidate;
            }
          } catch { /* fall through to Deepgram */ }
        }

        // ── 2. Deepgram nova-2 (fallback) ────────────────────────────────────
        // Disable smart_format so Deepgram doesn't add non-Arabic punctuation
        // or reformat Arabic numerals — both corrupt the Arabic text comparison.
        if (!tx && DEEPGRAM_KEY) {
          try {
            const r = await fetch(
              "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false&smart_format=false&numerals=false",
              {
                method:  "POST",
                headers: { Authorization: `Token ${DEEPGRAM_KEY}`, "Content-Type": blob.type || "audio/webm" },
                body:    blob,
              }
            );
            if (r.ok) {
              const candidate = ((await r.json())
                ?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
              if (candidate.length >= 2) tx = candidate;
            }
          } catch { /* fall through */ }
        }

        if (dead) return;
        if (tx) {
          liveRef.current = tx;
          setLiveTranscript(tx);
          setRevErr("");
        } else {
          // Distinguish silence from a real API failure so the student knows what to fix
          setRevErr("لم يُسجَّل صوت واضح — تأكّد من قُرب الميكروفون وأعِد التلاوة / No clear recitation detected — move closer to the mic and try again.");
        }
      } catch (e: any) {
        if (!dead) setRevErr(e?.message || "Transcription error");
      } finally {
        if (!dead) setRevRecState("done");
      }
    })();
    return () => { dead = true; };
  }, [revRecState]);

  /* ── 4. ALL useCallback ────────────────────────────────── */

  // Audio playback — everyayah.com CDN using surah + numberInSurah
  const playAudio = useCallback((ayah: { number: number; numberInSurah: number }) => {
    if (!audioElRef.current) audioElRef.current = new Audio();
    if (playing) { audioElRef.current.pause(); setPlaying(false); return; }
    const s = String(selSurah?.number ?? 1).padStart(3, "0");
    const a = String(ayah.numberInSurah).padStart(3, "0");
    audioElRef.current.src = `https://everyayah.com/data/Alafasy_128kbps/${s}${a}.mp3`;
    audioElRef.current.onended = () => setPlaying(false);
    audioElRef.current.onerror = () => setPlaying(false);
    setPlaying(true);
    audioElRef.current.play().catch(() => setPlaying(false));
  }, [playing, selSurah]);

  // Mem: called after SILENCE_MS with no new speech — count the attempt
  // In memorise mode we count ANY Arabic speech attempt (not accuracy)
  // Accuracy scoring is only for Revision mode
  const memScoreAttempt = useCallback(() => {
    const buf = memWindowRef.current.join(" ").trim();
    memWindowRef.current = []; // always clear buffer
    memSilRef.current = null;
    setMemLiveText("");

    // Need at least 2 Arabic tokens to count (avoids counting noise/coughs)
    const arabicTokens = buf.replace(/[^؀-ۿ\s]/g," ").trim().split(/\s+/).filter(Boolean);
    if (arabicTokens.length < 2) return; // too short — ignore

    const n = memCountRef.current + 1;
    memCountRef.current = n;
    setMemCompCount(n);

    if (n >= memTotalRef.current) {
      // Phase complete — stop mic
      setTimeout(() => memMrRef.current?.stop(), 200);
    }
  }, []);

  // Mem: receive transcript chunk
  const memOnTx = useCallback((tx: string) => {
    if (!tx.trim()) return;
    const toks = tx.replace(/[^\u0600-\u06FF\s]/g," ").trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return;
    memWindowRef.current = [...memWindowRef.current, ...toks];
    setMemLiveText(memWindowRef.current.slice(-5).join(" "));
    if (memSilRef.current) clearTimeout(memSilRef.current);
    memSilRef.current = setTimeout(memScoreAttempt, SILENCE_MS);
  }, [memScoreAttempt]);

  // Mem: send one chunk to ASR
  const memSendChunk = useCallback(async (blob: Blob) => {
    try {
      const ext = blob.type.includes("mp4") ? "mp4"
                : blob.type.includes("ogg") ? "ogg"
                : "webm";
      let tx = "";

      // ── 1. Groq Whisper-large-v3 (primary) — verbose_json + silence gate ─
      if (GROQ_KEY) {
        try {
          const fd = new FormData();
          fd.append("file",            new File([blob], `c.${ext}`, { type: blob.type || "audio/webm" }));
          fd.append("model",           "whisper-large-v3");
          fd.append("language",        "ar");
          fd.append("response_format", "verbose_json");
          fd.append("temperature",     "0");
          fd.append("prompt",          QURAN_STYLE_PROMPT);
          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
            { method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: fd });
          if (r.ok) {
            const json = await r.json();
            const segs: { no_speech_prob?: number }[] = json.segments ?? [];
            const avgNoSpeech = segs.length > 0
              ? segs.reduce((s, g) => s + (g.no_speech_prob ?? 0), 0) / segs.length
              : 0;
            const candidate = (json.text ?? "").trim();
            // Threshold 0.55 — lenient for Quranic madd / natural breath pauses
            if (candidate.length >= 2 && avgNoSpeech < 0.55) tx = candidate;
          }
        } catch { /* fall through to Deepgram */ }
      }

      // ── 2. Deepgram nova-2 (fallback) ─────────────────────────────────────
      if (!tx && DEEPGRAM_KEY) {
        try {
          const r = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false&smart_format=false&numerals=false",
            { method: "POST", headers: { Authorization: `Token ${DEEPGRAM_KEY}`, "Content-Type": blob.type || "audio/webm" }, body: blob }
          );
          if (r.ok) {
            const candidate = ((await r.json())
              ?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
            if (candidate.length >= 2) tx = candidate;
          }
        } catch { /* silent — next chunk will retry */ }
      }

      if (tx) memOnTx(tx);
    } catch (_) {}
  }, [memOnTx]);

  // Mem: advance to next phase/verse
  const memAdvance = useCallback((phase: MemPhase, verseIdx: number) => {
    memCountRef.current = 0; memWindowRef.current = [];
    if (memSilRef.current) { clearTimeout(memSilRef.current); memSilRef.current = null; }
    setMemCompCount(0); setMemLiveText(""); setMemRecState("idle");
    if (phase === "shown") {
      const t = repsHiddenRef.current;
      memPhaseRef.current = "hidden"; memTotalRef.current = t;
      memPhraseRef.current = selAyahsRef.current[verseIdx]?.text || "";
      setMemPhase("hidden"); setMemTotalReps(t);
    } else if (phase === "hidden") {
      const t = repsCumulRef.current;
      memPhaseRef.current = "cumulative"; memTotalRef.current = t;
      memPhraseRef.current = selAyahsRef.current.slice(0,verseIdx+1).map(a=>a.text).join(" ");
      setMemPhase("cumulative"); setMemTotalReps(t);
    } else {
      const next = verseIdx + 1;
      if (next >= selAyahsRef.current.length) {
        setAppMode("home");
        setTimeout(() => alert("🎉 Memorisation complete! Masha'Allah!"), 100);
      } else {
        const t = repsShownRef.current;
        memPhaseRef.current = "shown"; memTotalRef.current = t; memVerseRef.current = next;
        memPhraseRef.current = selAyahsRef.current[next]?.text || "";
        setMemVerseIdx(next); setMemPhase("shown"); setMemTotalReps(t);
      }
    }
  }, []);

  // Mem: start recording
  const memStartRec = useCallback(async () => {
    try {
      memCountRef.current = 0; memWindowRef.current = []; memInitRef.current = null;
      memPhaseRef.current = memPhaseRef.current;  // already set
      if (memSilRef.current) clearTimeout(memSilRef.current);
      setMemCompCount(0); setMemLiveText("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount:      1,       // mono — Whisper works best with mono
          echoCancellation:  false,   // off — echo-cancellation distorts Quranic tajweed
          noiseSuppression:  true,    // on  — suppress keyboard / ambient noise
          autoGainControl:   true,    // on  — normalise volume for quiet reciters
        }
      });
      const mime = getMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mr.ondataavailable = e => {
        if (!e.data?.size) return;
        if (!memInitRef.current) { memInitRef.current = e.data; memSendChunk(e.data); return; }
        memSendChunk(new Blob([memInitRef.current, e.data], { type: mime||"audio/webm" }));
      };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(memTimerRef.current!); setMemRecTime(0);
        memAdvance(memPhaseRef.current, memVerseRef.current);
      };
      // 2500 ms chunks — long enough to capture a full Quranic word or short phrase
      // even with tajweed elongation (madd), without starving the first chunk.
      mr.start(2500);
      memMrRef.current = mr; setMemRecState("recording");
      memTimerRef.current = setInterval(() => setMemRecTime(t => t+1), 1000);
    } catch { alert("Microphone access denied."); }
  }, [memSendChunk, memAdvance]);

  const memStopRec = useCallback(() => { memMrRef.current?.stop(); }, []);

  // Rev: start recording
  const revStartRec = useCallback(async () => {
    try {
      liveRef.current = ""; chunksRef.current = []; revBlobRef.current = null;
      setLiveTranscript(""); setRevErr("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount:     1,       // mono — Whisper works best with mono
          echoCancellation: false,   // off — distorts Quranic tajweed voice
          noiseSuppression: true,    // on  — suppress ambient / background noise
          autoGainControl:  true,    // on  — normalise volume for quiet reciters
        }
      });
      const mime = getMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current!);
        const blob = new Blob(chunksRef.current, { type: mime||"audio/webm" });
        if (blob.size < 1000) { setRevErr("تسجيل قصير جداً — يُرجى التلاوة لمدة ثانيتين على الأقل / Too short — recite for at least 2 seconds."); setRevRecState("idle"); return; }
        revBlobRef.current = blob; setRevAudioBlob(blob);
        setRevRecState("transcribing");
      };
      mr.start(200); mrRef.current = mr; setRevRecState("recording");
      timerRef.current = setInterval(() => setRevRecTime(t => t+1), 1000);
    } catch { alert("Microphone access denied."); }
  }, []);

  const revStopRec = useCallback(() => {
    clearInterval(timerRef.current!); mrRef.current?.stop();
  }, []);

  // Rev: evaluate with Claude
  const evaluateRevision = useCallback(async (ayahsSnap: AyahData[], surahSnap: SurahMeta|null, fv: number, tv: number) => {
    const tx = liveRef.current.trim() || liveTranscript.trim();
    if (!tx) { setRevErr("No transcript — please record first."); return; }
    setRevEvaluating(true); setRevErr("");
    const refText = ayahsSnap.map(a=>`[Ayah ${a.numberInSurah}]: ${a.text}`).join("\n");
    const prompt = `You are an expert Quran teacher evaluating a recitation.\n\nREFERENCE (${surahSnap?.englishName} ayahs ${fv}–${tv}):\n${refText}\n\nSTUDENT TRANSCRIPT:\n"${tx}"\n\nReturn ONLY valid JSON, no markdown:\n{"overallScore":<0-100>,"grade":"Excellent|Good|Needs Work|Weak","summary":"<2-3 sentences>","mainErrors":["<err>"],"wordResults":[{"word":"<Arabic>","ok":<bool>,"note":"<optional>"}]}`;
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:3000, messages:[{role:"user",content:prompt}] })
      });
      if (!r.ok) throw new Error(`Claude ${r.status}`);
      const raw = (await r.json()).content?.[0]?.text || "";
      const ev = JSON.parse(raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim()) as RevResult;
      setRevResult(ev); setRevTranscript(tx); setAppMode("rev-result");
      if (userId && surahSnap) {
        await (supabase as any).from("hifdh_recordings").insert({
          student_id:userId, surah_num:surahSnap.number, surah_name:surahSnap.englishName,
          ayah_start:fv, ayah_end:tv, ai_score:ev.overallScore, status:"evaluated",
          transcript:tx, word_results:ev.wordResults
        });
      }
    } catch {
      const combined = ayahsSnap.map(a=>a.text).join(" ");
      const r = scoreVsRef(tx, combined);
      const s = r.score;
      setRevResult({ overallScore:s, grade:s>=85?"Excellent":s>=70?"Good":s>=50?"Needs Work":"Weak", summary:`Score: ${s}%`, mainErrors:[], wordResults:r.words });
      setRevTranscript(tx); setAppMode("rev-result");
    } finally { setRevEvaluating(false); }
  }, [userId, liveTranscript]);

  /* ── 5. Derived values — AFTER all hooks ───────────────── */
  // Update sync refs every render
  selAyahsRef.current   = ayahs.filter(a => a.numberInSurah >= fromVerse && a.numberInSurah <= toVerse);
  repsShownRef.current  = repsShown;
  repsHiddenRef.current = repsHidden;
  repsCumulRef.current  = repsCumul;

  const selAyahs       = selAyahsRef.current;
  const currentAyah    = selAyahs[memVerseIdx];
  const cumulAyahs     = selAyahs.slice(0, memVerseIdx+1);
  const filteredSurahs = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search)
  );
  const gradeCol = (g:string) => ({Excellent:"#16a34a",Good:"#2563eb","Needs Work":"#d97706",Weak:"#dc2626"}[g]||"#666");
  const scoreCol = (s:number) => s>=80?"#16a34a":s>=60?"#d97706":"#dc2626";

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */

  /* ── HOME ─────────────────────────────────────────────── */
  if (appMode==="home") return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"36px 20px 28px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>📖</div>
        <h1 style={{fontSize:22,fontWeight:900,color:"#fff",margin:"0 0 4px"}}>Hifdh Practice</h1>
        <p style={{fontSize:13,color:"rgba(255,255,255,.6)",margin:0,fontFamily:"'Amiri',serif",direction:"rtl"}}>حفظ القرآن الكريم ومراجعته</p>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:12}}>

        <button onClick={()=>setAppMode("mem-setup")} style={{background:"#fff",border:`2px solid ${G}`,borderRadius:14,padding:"18px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28,flexShrink:0}}>🧠</span>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:G}}>Memorise</div>
            <div style={{fontSize:11,color:MUTED,marginTop:2}}>Verse by verse · shown → hidden → cumulative</div>
          </div>
          <ChevronRight size={16} color={MUTED} style={{marginLeft:"auto",flexShrink:0}}/>
        </button>

        <button onClick={()=>setAppMode("rev-setup")} style={{background:"#fff",border:`2px solid ${GOLD}`,borderRadius:14,padding:"18px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28,flexShrink:0}}>📝</span>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:GOLD}}>Revise</div>
            <div style={{fontSize:11,color:MUTED,marginTop:2}}>Record full passage · AI highlights mistakes</div>
          </div>
          <ChevronRight size={16} color={MUTED} style={{marginLeft:"auto",flexShrink:0}}/>
        </button>

        {/* Rep settings */}
        <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,fontWeight:700,color:G}}>⚙️ Repetition Settings</span>
            <button onClick={()=>setShowRepSettings(v=>!v)} style={{fontSize:11,color:MUTED,cursor:"pointer",padding:"3px 10px",borderRadius:6,border:`1px solid ${BORDER}`,background:"#f9fafb"}}>
              {showRepSettings?"Hide":"Edit"}
            </button>
          </div>
          {!showRepSettings && (
            <div style={{fontSize:11,color:MUTED,marginTop:6}}>Shown: {repsShown}× · Hidden: {repsHidden}× · Cumulative: {repsCumul}×</div>
          )}
          {showRepSettings && (
            <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:12}}>
              {([["Shown (verse visible)", repsShown, setRepsShown],["Hidden (from memory)", repsHidden, setRepsHidden],["Cumulative review", repsCumul, setRepsCumul]] as [string,number,React.Dispatch<React.SetStateAction<number>>][]).map(([label,val,set],i)=>(
                <div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,color:TEXT}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:800,color:G}}>{val}×</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>set(v=>Math.max(MIN_REPS,v-1))} style={{width:28,height:28,borderRadius:6,border:`1px solid ${BORDER}`,background:"#f9fafb",fontSize:18,fontWeight:700,color:G,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <input type="range" min={MIN_REPS} max={30} value={val} onChange={e=>set(Math.max(MIN_REPS,parseInt(e.target.value)))} style={{flex:1,accentColor:G}}/>
                    <button onClick={()=>set(v=>Math.min(30,v+1))} style={{width:28,height:28,borderRadius:6,border:`1px solid ${BORDER}`,background:"#f9fafb",fontSize:18,fontWeight:700,color:G,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                </div>
              ))}
              <div style={{fontSize:10,color:MUTED}}>Min {MIN_REPS}× · Max 30×</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ── SETUP (shared for mem + rev) ─────────────────────── */
  if (appMode==="mem-setup" || appMode==="rev-setup") {
    const isMem = appMode==="mem-setup";
    const canStart = !!selSurah && selAyahs.length>0 && !loadingAyahs && fromVerse<=toVerse;
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{background:`linear-gradient(135deg,${isMem?G:GOLD},${isMem?GM:"#b45309"})`,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <button onClick={()=>setAppMode("home")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{isMem?"Memorise":"Revise"} — Choose Verses</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>Pick surah and verse range</div>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
          {/* Surah search */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:TEXT,display:"block",marginBottom:6}}>Surah</label>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search surah…"
              style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:13,color:TEXT,outline:"none",boxSizing:"border-box" as const}}/>
            {search && (
              <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:10,maxHeight:200,overflowY:"auto",marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,.1)"}}>
                {filteredSurahs.slice(0,20).map(s=>(
                  <button key={s.number} onClick={()=>{setSelSurah(s);setSearch("");}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"none",background:"none",cursor:"pointer",textAlign:"left",borderBottom:`1px solid ${BORDER}`}}>
                    <span style={{width:24,height:24,borderRadius:6,background:GOLDLT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:GOLD,flexShrink:0}}>{s.number}</span>
                    <span style={{fontSize:13,fontWeight:600,color:TEXT}}>{s.englishName}</span>
                    <span style={{fontSize:13,fontFamily:"'Amiri',serif",color:MUTED,marginLeft:"auto"}}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selSurah && (
              <div style={{marginTop:8,padding:"10px 14px",background:GLT,borderRadius:10,border:`1px solid ${G}44`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:700,color:G}}>{selSurah.englishName} <span style={{fontFamily:"'Amiri',serif",fontWeight:400}}>— {selSurah.name}</span></span>
                <button onClick={()=>{setSelSurah(null);setAyahs([]);}} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:11}}>Change</button>
              </div>
            )}
          </div>

          {selSurah && (
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,color:TEXT,display:"block",marginBottom:6}}>
                Verse Range {loadingAyahs && <span style={{color:MUTED,fontWeight:400}}>(loading…)</span>}
              </label>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:MUTED,marginBottom:3}}>From</div>
                  <input type="number" min={1} max={selSurah.numberOfAyahs} value={fromVerse}
                    onChange={e=>setFromVerse(Math.max(1,Math.min(selSurah.numberOfAyahs,parseInt(e.target.value)||1)))}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:15,fontWeight:700,textAlign:"center",outline:"none",boxSizing:"border-box" as const}}/>
                </div>
                <span style={{color:MUTED,paddingTop:16,fontWeight:700}}>→</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:MUTED,marginBottom:3}}>To</div>
                  <input type="number" min={fromVerse} max={selSurah.numberOfAyahs} value={toVerse}
                    onChange={e=>setToVerse(Math.max(fromVerse,Math.min(selSurah.numberOfAyahs,parseInt(e.target.value)||fromVerse)))}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:15,fontWeight:700,textAlign:"center",outline:"none",boxSizing:"border-box" as const}}/>
                </div>
              </div>
              {selAyahs.length>0 && <div style={{fontSize:11,color:MUTED,marginTop:5}}>{selAyahs.length} verses · {selAyahs.reduce((s,a)=>s+a.text.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).length,0)} words</div>}
            </div>
          )}

          {/* Preview */}
          {selAyahs.length>0 && !loadingAyahs && (
            <div style={{background:GOLDLT,border:"1px solid #fcd34d",borderRadius:12,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:8}}>Preview</div>
              <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:18,lineHeight:2.8,color:G,textAlign:"right"}}>
                {selAyahs.map(a=>(
                  <span key={a.numberInSurah}>{a.text.replace(/﴿[^﴾]*﴾/g,"")} <span style={{color:GOLD,fontSize:14}}>﴿{a.numberInSurah}﴾</span>{" "}</span>
                ))}
              </div>
            </div>
          )}

          {/* Session plan */}
          {isMem && selAyahs.length>0 && (
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:G,marginBottom:6}}>Session plan</div>
              {selAyahs.map((a,i)=>(
                <div key={i} style={{fontSize:11,color:MUTED,marginBottom:3}}>
                  <strong style={{color:TEXT}}>Verse {a.numberInSurah}:</strong> {repsShown}× shown + {repsHidden}× hidden
                  {i>0 && ` + review v${selAyahs[0].numberInSurah}–${a.numberInSurah} (${repsCumul}×)`}
                </div>
              ))}
            </div>
          )}

          <button disabled={!canStart} onClick={()=>{
            if (isMem) {
              memPhaseRef.current  = "shown";
              memVerseRef.current  = 0;
              memCountRef.current  = 0;
              memWindowRef.current = [];
              memTotalRef.current  = repsShown;
              memPhraseRef.current = selAyahsRef.current[0]?.text || "";
              if (memSilRef.current) clearTimeout(memSilRef.current);
              setMemVerseIdx(0); setMemPhase("shown"); setMemTotalReps(repsShown);
              setMemRecState("idle"); setMemCompCount(0); setMemLiveText("");
              setAppMode("mem-session");
            } else {
              revBlobRef.current = null; liveRef.current = "";
              setRevRecState("idle"); setRevAudioBlob(null); setRevResult(null);
              setRevTranscript(""); setLiveTranscript(""); setRevErr("");
              setRevEvaluating(false); setRevRecTime(0);
              setAppMode("rev-session");
            }
          }} style={{width:"100%",padding:"15px",borderRadius:14,border:"none",
            background:canStart?`linear-gradient(135deg,${isMem?G:GOLD},${isMem?GM:"#b45309"})`:"#e5e7eb",
            color:canStart?"#fff":"#9ca3af",fontSize:15,fontWeight:800,cursor:canStart?"pointer":"not-allowed"}}>
            {loadingAyahs?"Loading…":isMem?"Start Memorising →":"Start Revision →"}
          </button>
        </div>
      </div>
    );
  }

  /* ── MEMORISE SESSION ─────────────────────────────────── */
  if (appMode==="mem-session") {
    if (!currentAyah) return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100svh",flexDirection:"column",gap:16,background:"#fdfaf4"}}>
        <div style={{fontSize:13,color:MUTED}}>Session error — ayah not found.</div>
        <button onClick={()=>setAppMode("mem-setup")} style={{padding:"11px 22px",borderRadius:11,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Back</button>
      </div>
    );
    const isHidden = memPhase==="hidden";
    const isCumul  = memPhase==="cumulative";
    const dispAyahs= isCumul ? cumulAyahs : [currentAyah];
    const phaseLabel = memPhase==="shown"?"📖 Shown":memPhase==="hidden"?"🙈 Hidden":"🔁 Cumulative";
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <style>{`@keyframes wave{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}}`}</style>
        {/* Header */}
        <div style={{flexShrink:0,background:`linear-gradient(135deg,${G},${GM})`,padding:"10px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <button onClick={()=>{memMrRef.current?.stop();setAppMode("mem-setup");}} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{selSurah?.englishName} · Verse {currentAyah.numberInSurah}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>Verse {memVerseIdx+1}/{selAyahs.length} · {phaseLabel} · {memCompCount}/{memTotalReps}</div>
            </div>
          </div>
          {/* Phase pills */}
          <div style={{display:"flex",gap:6}}>
            {(["shown","hidden","cumulative"] as MemPhase[]).map(ph=>(
              <div key={ph} style={{fontSize:10,padding:"3px 8px",borderRadius:20,fontWeight:700,
                background:memPhase===ph?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)",
                color:memPhase===ph?"#fff":"rgba(255,255,255,.4)",
                border:`1px solid ${memPhase===ph?"rgba(255,255,255,.4)":"transparent"}`}}>
                {ph==="shown"?"📖":ph==="hidden"?"🙈":"🔁"} {ph} {memPhase===ph?`${memCompCount}/${memTotalReps}`:""}
              </div>
            ))}
          </div>
        </div>
        {/* Progress */}
        <div style={{height:3,background:"rgba(0,0,0,.08)",flexShrink:0}}>
          <div style={{width:`${((memVerseIdx*3+(memPhase==="shown"?0:memPhase==="hidden"?1:2))/(Math.max(selAyahs.length,1)*3))*100}%`,height:"100%",background:"#4ade80",transition:"width .4s"}}/>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 140px"}}>
          {/* Rep counter */}
          <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:MUTED,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>
              {phaseLabel} — Recite then pause 2s, AI counts
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center",marginBottom:10}}>
              {Array.from({length:memTotalReps},(_,i)=>(
                <div key={i} style={{width:26,height:26,borderRadius:"50%",
                  background:i<memCompCount?"#16a34a":i===memCompCount&&memRecState==="recording"?"#fef3c7":"#f3f4f6",
                  border:`2px solid ${i<memCompCount?"#16a34a":i===memCompCount&&memRecState==="recording"?GOLD:BORDER}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:700,
                  color:i<memCompCount?"#fff":i===memCompCount&&memRecState==="recording"?"#92400e":MUTED}}>
                  {i<memCompCount?"✓":i+1}
                </div>
              ))}
            </div>
            <div style={{fontSize:24,fontWeight:900,color:memCompCount>=memTotalReps?"#16a34a":G}}>
              {memCompCount}/{memTotalReps}
            </div>
            {memLiveText && (
              <div style={{marginTop:8,fontSize:13,direction:"rtl",fontFamily:"'Amiri',serif",color:MUTED,background:"#f9fafb",borderRadius:8,padding:"5px 10px"}}>
                {memLiveText}
              </div>
            )}
          </div>

          {/* Ayah text */}
          <div style={{background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:GOLDLT,borderBottom:"1px solid #fde68a"}}>
              <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
                {isCumul ? `Verses ${selAyahs[0]?.numberInSurah}–${currentAyah.numberInSurah}` : `Verse ${currentAyah.numberInSurah}`}
              </span>
              <button onClick={()=>playAudio(dispAyahs[0])} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:20,border:`1px solid ${playing?"#059669":BORDER}`,background:playing?"#ecfdf5":"#fff",cursor:"pointer",fontSize:11,color:playing?"#059669":MUTED}}>
                <Volume2 size={12}/>{playing?" Stop":" Listen"}
              </button>
            </div>
            <div style={{padding:"18px 16px"}}>
              {dispAyahs.map((a,i)=>(
                <div key={a.numberInSurah} style={{marginBottom:i<dispAyahs.length-1?10:0}}>
                  {isHidden ? (
                    <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:24,lineHeight:3,textAlign:"right",filter:"blur(7px)",userSelect:"none",color:G,opacity:.7}}>
                      {a.text.replace(/﴿[^﴾]*﴾/g,"")}
                      <span style={{color:GOLD,fontSize:16,margin:"0 4px"}}>﴿{a.numberInSurah}﴾</span>
                    </div>
                  ) : (
                    <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:24,lineHeight:3,textAlign:"right",color:G}}>
                      {a.text.replace(/﴿[^﴾]*﴾/g,"")}
                      <span style={{color:GOLD,fontSize:16,margin:"0 4px"}}>﴿{a.numberInSurah}﴾</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mic bar */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"12px 16px 22px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={memRecState==="idle"?memStartRec:memStopRec} style={{width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
            background:memRecState==="recording"?RED:G,
            boxShadow:memRecState==="recording"?`0 0 0 4px ${RED}44`:`0 4px 16px rgba(6,79,58,.3)`,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            {memRecState==="recording"?<Square size={22} fill="#fff" color="#fff"/>:<Mic size={22} color="#fff"/>}
          </button>
          <div style={{flex:1}}>
            {memRecState==="recording" ? (
              <>
                <div style={{display:"flex",gap:2,height:18,marginBottom:2,alignItems:"center"}}>
                  {[4,9,6,16,8,13,5,11,18,7].map((h,i)=>(
                    <div key={i} style={{width:3,height:h,borderRadius:2,background:RED,opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                  ))}
                  <span style={{fontSize:12,fontWeight:800,color:RED,marginLeft:6}}>{fmtSec(memRecTime)}</span>
                </div>
                <div style={{fontSize:11,color:MUTED}}>Recite → pause 2s → AI counts · {memCompCount}/{memTotalReps} ✓</div>
              </>
            ) : (
              <>
                <div style={{fontSize:13,fontWeight:700,color:G,marginBottom:2}}>Tap mic to recite</div>
                <div style={{fontSize:11,color:MUTED}}>Recite, pause 2s after each — auto-counted</div>
              </>
            )}
          </div>
          <button onClick={()=>memAdvance(memPhaseRef.current, memVerseRef.current)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:MUTED,fontSize:11,fontWeight:600,cursor:"pointer"}}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  /* ── REVISE SESSION ───────────────────────────────────── */
  if (appMode==="rev-session") return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes wave{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}}`}</style>
      <div style={{flexShrink:0,background:`linear-gradient(135deg,${GOLD},#b45309)`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>setAppMode("rev-setup")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{selSurah?.englishName} · Verses {fromVerse}–{toVerse}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>Record your full recitation</div>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 130px"}}>
        {/* Full reference */}
        <div style={{background:GOLDLT,border:"1px solid #fcd34d",borderRadius:14,padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#92400e"}}>Reference — recite all</span>
            <button onClick={()=>playAudio(selAyahs[0])} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,border:`1px solid ${BORDER}`,background:"#fff",cursor:"pointer",fontSize:11,color:MUTED}}>
              <Volume2 size={11}/> Listen
            </button>
          </div>
          <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:20,lineHeight:3,textAlign:"right",color:G}}>
            {selAyahs.map(a=>(
              <span key={a.numberInSurah}>{a.text.replace(/﴿[^﴾]*﴾/g,"")} <span style={{color:GOLD,fontSize:14}}>﴿{a.numberInSurah}﴾</span>{" "}</span>
            ))}
          </div>
        </div>

        {/* Transcribing */}
        {revRecState==="transcribing" && (
          <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px",textAlign:"center"}}>
            <Loader2 size={28} color={GOLD} style={{display:"block",margin:"0 auto 10px",animation:"spin .8s linear infinite"}}/>
            <div style={{fontSize:13,fontWeight:700,color:GOLD}}>Transcribing…</div>
          </div>
        )}

        {/* Done */}
        {revRecState==="done" && !revEvaluating && (
          <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px",textAlign:"center"}}>
            <Check size={32} color="#16a34a" style={{display:"block",margin:"0 auto 10px"}}/>
            <div style={{fontSize:14,fontWeight:800,color:G,marginBottom:4}}>Recording Complete!</div>
            <div style={{fontSize:12,color:MUTED,marginBottom:liveTranscript?10:14}}>{fmtSec(revRecTime)}s recorded</div>
            {liveTranscript && (
              <div style={{background:"#f9fafb",borderRadius:8,padding:"8px 10px",marginBottom:12,direction:"rtl",textAlign:"right",fontFamily:"'Amiri',serif",fontSize:13,color:TEXT,lineHeight:1.8}}>
                {liveTranscript}
              </div>
            )}
            {revErr && <div style={{fontSize:12,color:RED,marginBottom:10,background:"#fef2f2",padding:"8px",borderRadius:8}}>{revErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setRevRecState("idle");setLiveTranscript("");liveRef.current="";setRevRecTime(0);}} style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <RotateCcw size={13}/> Re-record
              </button>
              <button onClick={()=>evaluateRevision(selAyahs, selSurah, fromVerse, toVerse)} disabled={!liveTranscript} style={{flex:2,padding:"11px",borderRadius:10,border:"none",
                background:liveTranscript?`linear-gradient(135deg,${GOLD},#b45309)`:"#e5e7eb",
                color:liveTranscript?"#fff":"#9ca3af",fontSize:13,fontWeight:700,cursor:liveTranscript?"pointer":"not-allowed",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <Star size={14}/> Evaluate with AI
              </button>
            </div>
          </div>
        )}

        {revEvaluating && (
          <div style={{textAlign:"center",padding:"24px",background:"#fff",borderRadius:12,border:`1px solid ${BORDER}`}}>
            <Loader2 size={32} color={GOLD} style={{display:"block",margin:"0 auto 10px",animation:"spin .8s linear infinite"}}/>
            <div style={{fontSize:13,fontWeight:700,color:GOLD}}>AI evaluating recitation…</div>
          </div>
        )}
      </div>

      {/* Mic bar */}
      {(revRecState==="idle"||revRecState==="recording") && (
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"12px 16px 22px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={revRecState==="idle"?revStartRec:revStopRec} style={{width:58,height:58,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
            background:revRecState==="recording"?RED:GOLD,
            boxShadow:revRecState==="recording"?`0 0 0 4px ${RED}44`:`0 4px 16px ${GOLD}55`,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            {revRecState==="recording"?<Square size={24} fill="#fff" color="#fff"/>:<Mic size={24} color="#fff"/>}
          </button>
          <div style={{flex:1}}>
            {revRecState==="recording" ? (
              <>
                <div style={{display:"flex",gap:2,height:20,marginBottom:2,alignItems:"center"}}>
                  {[4,9,6,16,8,13,5,11,18,7].map((h,i)=>(
                    <div key={i} style={{width:3,height:h,borderRadius:2,background:RED,opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                  ))}
                  <span style={{fontSize:13,fontWeight:800,color:RED,marginLeft:6}}>{fmtSec(revRecTime)}</span>
                </div>
                <div style={{fontSize:11,color:MUTED}}>Recording… tap stop when done</div>
              </>
            ) : (
              <>
                <div style={{fontSize:13,fontWeight:700,color:GOLD,marginBottom:2}}>Tap to start recording</div>
                <div style={{fontSize:11,color:MUTED}}>Recite all {selAyahs.length} verses then stop</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  /* ── RESULT ───────────────────────────────────────────── */
  if (appMode==="rev-result" && revResult) {
    const gc = gradeCol(revResult.grade);
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <div style={{flexShrink:0,background:`linear-gradient(135deg,${GOLD},#b45309)`,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setAppMode("rev-session")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
          <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>Revision Result</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 14px 32px"}}>
          {/* Score */}
          <div style={{background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`,padding:"18px",textAlign:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:12}}>
              <div style={{width:72,height:72,borderRadius:"50%",background:`${gc}15`,border:`4px solid ${gc}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:24,fontWeight:900,color:gc}}>{revResult.overallScore}%</div>
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:22,fontWeight:900,color:gc}}>{revResult.grade}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:2}}>{selSurah?.englishName} · {fromVerse}–{toVerse}</div>
              </div>
            </div>
            <div style={{fontSize:13,color:TEXT,lineHeight:1.7,background:"#f9fafb",borderRadius:10,padding:"10px 12px"}}>{revResult.summary}</div>
          </div>

          {/* Errors */}
          {revResult.mainErrors?.length>0 && (
            <div style={{background:"#fef2f2",border:`1px solid ${RED}44`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:RED,marginBottom:6,display:"flex",alignItems:"center",gap:5}}><AlertCircle size={13}/>Key Mistakes</div>
              {revResult.mainErrors.map((e,i)=>(
                <div key={i} style={{fontSize:12,color:"#7f1d1d",marginBottom:i<revResult.mainErrors.length-1?4:0}}>• {e}</div>
              ))}
            </div>
          )}

          {/* Word results */}
          <div style={{background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:MUTED,marginBottom:10,display:"flex",gap:14}}>
              <span>🟢 Correct</span><span>🔴 Wrong/Missing</span>
            </div>
            <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:22,lineHeight:3.2,textAlign:"right"}}>
              {revResult.wordResults.map((w,i)=>(
                <span key={i} style={{display:"inline-block",margin:"0 2px",
                  color:w.ok?"#16a34a":RED,
                  background:w.ok?"transparent":`${RED}12`,
                  borderRadius:w.ok?0:4,padding:w.ok?0:"0 3px",
                  borderBottom:w.ok?"none":`2px solid ${RED}55`}}>
                  {w.word}
                </span>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setRevRecState("idle");setLiveTranscript("");liveRef.current="";setRevResult(null);setAppMode("rev-session");}} style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <RotateCcw size={14}/> Try Again
            </button>
            <button onClick={()=>setAppMode("home")} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <BookOpen size={14}/> Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
