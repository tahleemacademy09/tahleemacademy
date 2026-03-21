/*
  RecitationMic.tsx — Hifdh Memorisation & Revision System

  MODE 1 — MEMORISE
  ─────────────────
  User picks Surah + from verse → to verse.
  For each verse i:
    • Phase A: Show verse, repeat COUNT_SHOWN times (user recites each time)
    • Phase B: Hide verse, repeat COUNT_HIDDEN times
    • Phase C: Cumulative review — recite verses 1..i together (hidden) × CUMULATIVE_REPS
  Then next verse. Same pattern.

  MODE 2 — REVISE
  ───────────────
  User picks Surah + from verse → to verse.
  Full text shown. User records entire portion in one go.
  On stop → Deepgram transcribes → AI (Claude) evaluates word-by-word.
  Results: highlighted mistakes + proficiency score.
*/

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, Square, ChevronLeft, BookOpen, Volume2,
  Eye, EyeOff, RotateCcw, Check, X, Star,
  ChevronRight, Play, Loader2, AlertCircle
} from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

const MIN_REPS = 7;   // minimum allowed repetitions

// Default repetition counts — overridable by user in settings
const DEFAULT_SHOWN     = 10;
const DEFAULT_HIDDEN    = 10;
const DEFAULT_CUMUL     = 5;
const SILENCE_MS        = 2000; // ms of silence = end of one recitation attempt
const MATCH_THRESHOLD   = 55;   // % of words needed to count as a complete recitation

/* ─── Types ───────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface AyahData  { number: number; numberInSurah: number; text: string; }
type AppMode    = "home" | "mem-setup" | "rev-setup" | "mem-session" | "rev-session" | "rev-result";
type MemPhase   = "shown" | "hidden" | "cumulative";
type RecState   = "idle" | "recording" | "done";
interface WordResult { word: string; ok: boolean; note?: string; }
interface RevResult  { overallScore: number; grade: string; summary: string; wordResults: WordResult[]; mainErrors: string[]; }

/* ─── Arabic helpers ──────────────────────────────────────── */
const nrm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
   .replace(/[\u0622\u0623\u0625\u0627\u0671-\u0677]/g,"ا")
   .replace(/\u0629/g,"ه").replace(/\u0649/g,"ي")
   .replace(/\u0640/g,"").replace(/[\uFEF5-\uFEFC]/g,"لا")
   .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"").replace(/\s+/g," ").trim();

const lev=(a:string,b:string)=>{if(Math.abs(a.length-b.length)>5)return 99;const dp=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[a.length][b.length];};

const wOk=(s:string,r:string)=>{const a=nrm(s),b=nrm(r);if(!a||!b)return false;if(a===b)return true;if(a.length>=3&&b.length>=3&&a.slice(0,3)===b.slice(0,3))return true;if(a.length>=3&&(a.includes(b)||b.includes(a)))return true;return lev(a,b)<=Math.max(1,Math.floor(Math.max(a.length,b.length)*0.30));};

const scoreVsRef=(tx:string,ref:string):{score:number;words:WordResult[];noSpeech:boolean}=>{
  const rw=ref.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).filter(Boolean);
  const tk=tx.replace(/[^\u0600-\u06FF\s]/g," ").trim().split(/\s+/).filter(Boolean);
  if(!tk.length) return {score:0,words:rw.map(w=>({word:w,ok:false})),noSpeech:true};
  const words:WordResult[]=[]; let ti=0;
  for(let ri=0;ri<rw.length;ri++){
    let matched=false;
    for(let la=0;la<3&&ti+la<tk.length;la++){if(wOk(tk[ti+la],rw[ri])){words.push({word:rw[ri],ok:true});ti+=la+1;matched=true;break;}}
    if(!matched) words.push({word:rw[ri],ok:false});
  }
  return {score:Math.round(words.filter(w=>w.ok).length/Math.max(rw.length,1)*100),words,noSpeech:false};
};

/* ─── Audio helpers ───────────────────────────────────────── */
const getMime=()=>{for(const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])if(!t||MediaRecorder.isTypeSupported(t))return t;return "";};
const fmtSec=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ─── Colours ─────────────────────────────────────────────── */
const G="#064E3B", GM="#065f46", GLT="#ecfdf5";
const GOLD="#d97706", GOLDLT="#fffbeb";
const RED="#dc2626", REDLT="#fef2f2";
const BORDER="#e5e7eb", MUTED="#6b7280", TEXT="#111827";

/* ════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  /* Navigation */
  const [appMode,    setAppMode]    = useState<AppMode>("home");

  /* Surah list */
  const [surahs,     setSurahs]     = useState<SurahMeta[]>([]);
  const [search,     setSearch]     = useState("");
  const [loadingSurahs, setLoadingSurahs] = useState(false);

  /* Setup form (shared) */
  const [selSurah,   setSelSurah]   = useState<SurahMeta|null>(null);
  const [fromVerse,  setFromVerse]  = useState(1);
  const [toVerse,    setToVerse]    = useState(7);
  const [ayahs,      setAyahs]      = useState<AyahData[]>([]);
  const [loadingAyahs, setLoadingAyahs] = useState(false);

  /* ── MEMORISE session state ── */
  const [memVerseIdx,  setMemVerseIdx]  = useState(0);   // index into selected ayahs
  const [memPhase,     setMemPhase]     = useState<MemPhase>("shown");

  /* ── REVISE session state ── */
  const [revRecState,  setRevRecState]  = useState<RecState>("idle");
  const [revRecTime,   setRevRecTime]   = useState(0);
  const [revTranscript,setRevTranscript]= useState("");
  const [revResult,    setRevResult]    = useState<RevResult|null>(null);
  const [revEvaluating,setRevEvaluating]= useState(false);
  const [revErr,       setRevErr]       = useState("");
  const [revAudioBlob, setRevAudioBlob] = useState<Blob|null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");

  /* ── Shared recording refs ── */
  const mrRef      = useRef<MediaRecorder|null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const initRef    = useRef<Blob|null>(null);
  const liveRef    = useRef("");
  const revBlobRef = useRef<Blob|null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const audioEl    = useRef<HTMLAudioElement|null>(null);
  const [playing,  setPlaying] = useState(false);

  /* ── Mem recording — continuous auto-count ── */
  const [memTotalReps, setMemTotalReps] = useState(COUNT_SHOWN); // display total for current phase
  const [memRecState,  setMemRecState]  = useState<"idle"|"recording"|"done">("idle");
  const [memRecTime,   setMemRecTime]   = useState(0);
  const [memCompCount, setMemCompCount] = useState(0);  // reps completed this phase
  const [memLiveText,  setMemLiveText]  = useState(""); // live transcript display
  // User-configurable repetition counts
  const [repsShown,  setRepsShown]  = useState(DEFAULT_SHOWN);
  const [repsHidden, setRepsHidden] = useState(DEFAULT_HIDDEN);
  const [repsCumul,  setRepsCumul]  = useState(DEFAULT_CUMUL);
  const [showRepSettings, setShowRepSettings] = useState(false);

  const memMrRef     = useRef<MediaRecorder|null>(null);
  const memInitRef   = useRef<Blob|null>(null);
  const memCountRef  = useRef(0);         // sync count for async callbacks
  const memPhraseRef = useRef<string>(""); // current reference phrase (sync)
  const memTotalRef  = useRef(COUNT_SHOWN);// sync total for async callbacks
  const memPhaseRef  = useRef<MemPhase>("shown");
  const memVerseRef  = useRef(0);
  const memWindowRef  = useRef<string[]>([]); // buffer for current recitation attempt
  const memSilRef     = useRef<ReturnType<typeof setTimeout>|null>(null); // silence detection timer
  const memTimer      = useRef<ReturnType<typeof setInterval>|null>(null);

  /* Load surah list */
  useEffect(()=>{
    setLoadingSurahs(true);
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json()).then(d=>{
      if(d.code===200) setSurahs(d.data);
    }).finally(()=>setLoadingSurahs(false));
  },[]);

  /* Load ayahs when surah selected */
  useEffect(()=>{
    if(!selSurah) return;
    setLoadingAyahs(true); setAyahs([]);
    setFromVerse(1); setToVerse(Math.min(7, selSurah.numberOfAyahs));
    fetch(`https://api.alquran.cloud/v1/surah/${selSurah.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if(d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({number:a.number,numberInSurah:a.numberInSurah,text:a.text})));
      }).finally(()=>setLoadingAyahs(false));
  },[selSurah]);

  /* Derived: selected ayahs slice */
  const selAyahs = ayahs.filter(a=>a.numberInSurah>=fromVerse&&a.numberInSurah<=toVerse);
  const selAyahsRef = useRef<typeof selAyahs>([]);
  selAyahsRef.current = selAyahs; // always current, safe in async callbacks
  const repsShownRef = useRef(DEFAULT_SHOWN);
  repsShownRef.current = repsShown;
  const repsHiddenRef = useRef(DEFAULT_HIDDEN);
  repsHiddenRef.current = repsHidden;
  const repsCumulRef  = useRef(DEFAULT_CUMUL);
  repsCumulRef.current = repsCumul;
  const currentAyah = selAyahs[memVerseIdx];
  const cumulativeAyahs = selAyahs.slice(0, memVerseIdx+1);
  const filteredSurahs  = surahs.filter(s=>s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  /* ── Play reference audio ── */
  const playAudio = useCallback((globalNum: number)=>{
    if(!audioEl.current) audioEl.current=new Audio();
    if(playing){audioEl.current.pause();setPlaying(false);return;}
    audioEl.current.src=`https://cdn.islamic.network/quran/audio/64/ar.alafasy/${globalNum}.mp3`;
    audioEl.current.onended=()=>setPlaying(false);
    audioEl.current.onerror=()=>setPlaying(false);
    setPlaying(true); audioEl.current.play().catch(()=>setPlaying(false));
  },[playing]);

  /* ═══════════════════════════════════════════════════════════
     MEMORISE — silence-detection auto-counting
     
     Algorithm:
     1. Every 1.5s chunk is transcribed and appended to memWindowRef
     2. A 2s silence timer resets on every new transcription
     3. When 2s of silence detected → score the accumulated buffer
     4. If score ≥ MATCH_THRESHOLD → count as 1 complete recitation
     5. Clear buffer, wait for next recitation
     6. When count hits target → auto-advance phase
     
     This means the AI waits for you to finish saying the ayah
     naturally (pause = done) rather than cutting off mid-word.
  ═══════════════════════════════════════════════════════════ */

  /* Called after SILENCE_MS of no new tokens — score the attempt */
  const memScoreAttempt = useCallback(() => {
    const buf = memWindowRef.current.join(" ").trim();
    const ref = memPhraseRef.current;
    if (!buf || !ref) return;

    const result = scoreVsRef(buf, ref);
    memWindowRef.current = []; // always clear buffer for next attempt
    setMemLiveText("");

    if (result.score >= MATCH_THRESHOLD) {
      // ✅ Counted as one complete recitation
      const newCount = memCountRef.current + 1;
      memCountRef.current = newCount;
      setMemCompCount(newCount);

      if (newCount >= memTotalRef.current) {
        // Phase complete — stop mic, advance phase
        memMrRef.current?.stop();
      }
    }
    // If score too low: buffer cleared, user just tries again — no penalty shown
  }, []);

  /* Called for every Deepgram/Groq chunk result */
  const memOnTranscript = useCallback((tx: string) => {
    if (!tx.trim() || !memPhraseRef.current) return;

    // Append new Arabic tokens to buffer
    const toks = tx.replace(/[^؀-ۿ\s]/g," ").trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) return;
    memWindowRef.current = [...memWindowRef.current, ...toks];
    setMemLiveText(memWindowRef.current.slice(-6).join(" "));

    // Reset silence timer — 2s after last token = attempt complete
    if (memSilRef.current) clearTimeout(memSilRef.current);
    memSilRef.current = setTimeout(() => {
      memScoreAttempt();
    }, SILENCE_MS);
  }, [memScoreAttempt]);

  const memChunkSend = useCallback(async (blob: Blob) => {
    if (!DEEPGRAM_KEY && !GROQ_KEY) return;
    try {
      if (DEEPGRAM_KEY) {
        const r = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
          { method:"POST", headers:{ Authorization:`Token ${DEEPGRAM_KEY}`, "Content-Type":blob.type||"audio/webm" }, body:blob }
        );
        if (r.ok) {
          const tx = (await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
          if (tx) memOnTranscript(tx);
        }
      } else if (GROQ_KEY) {
        const ext = blob.type.includes("mp4")?"mp4":blob.type.includes("ogg")?"ogg":"webm";
        const fd = new FormData();
        fd.append("file", new File([blob],`c.${ext}`,{type:blob.type}));
        fd.append("model","whisper-large-v3"); fd.append("language","ar");
        fd.append("response_format","json"); fd.append("temperature","0");
        fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
          {method:"POST", headers:{Authorization:`Bearer ${GROQ_KEY}`}, body:fd});
        if (r.ok) {
          const tx = (await r.json())?.text || "";
          if (tx) memOnTranscript(tx);
        }
      }
    } catch(_) {}
  }, [memOnTranscript]);

  /* Advance to next phase/verse — called when recording stops after phase completes */
  const memAdvancePhase = useCallback((phase: MemPhase, verseIdx: number) => {
    memCountRef.current  = 0;
    memWindowRef.current = [];
    if (memSilRef.current) { clearTimeout(memSilRef.current); memSilRef.current = null; }
    setMemCompCount(0);
    setMemLiveText("");
    setMemRecState("idle");

    if (phase === "shown") {
      memPhaseRef.current="hidden"; memTotalRef.current=repsHiddenRef.current;
      memPhraseRef.current = selAyahsRef.current[verseIdx]?.text||"";
      setMemPhase("hidden"); setMemTotalReps(repsHiddenRef.current);
    } else if (phase === "hidden") {
      memPhaseRef.current="cumulative"; memTotalRef.current=repsCumulRef.current;
      memPhraseRef.current = selAyahsRef.current.slice(0,verseIdx+1).map(a=>a.text).join(" ");
      setMemPhase("cumulative"); setMemTotalReps(repsCumulRef.current);
    } else {
      const nextIdx = verseIdx + 1;
      if (nextIdx >= selAyahsRef.current.length) {
        setAppMode("home");
        setTimeout(()=>alert("\u{1F389} Memorisation complete! Masha'Allah!"), 100);
      } else {
        memPhaseRef.current="shown"; memTotalRef.current=repsShownRef.current; memVerseRef.current=nextIdx;
        memPhraseRef.current = selAyahsRef.current[nextIdx]?.text||"";
        setMemVerseIdx(nextIdx);
        setMemPhase("shown"); setMemTotalReps(repsShownRef.current);
      }
    }
  }, []);

  const memStartRec = async () => {
    try {
      // Sync refs for async chunk callbacks
      memCountRef.current  = 0;
      memWindowRef.current = [];
      memInitRef.current   = null;
      memPhaseRef.current  = memPhase;
      memVerseRef.current  = memVerseIdx;
      // Use user-configured reps
      const phaseTotal = memPhase==="shown" ? repsShown : memPhase==="hidden" ? repsHidden : repsCumul;
      memTotalRef.current = phaseTotal;
      setMemTotalReps(phaseTotal);
      if (memSilRef.current) clearTimeout(memSilRef.current);
      // Set phrase BEFORE async gap so callbacks have correct ref
      if(memPhase==="cumulative"){
        memPhraseRef.current = selAyahsRef.current.slice(0,memVerseIdx+1).map(a=>a.text).join(" ");
      } else {
        memPhraseRef.current = selAyahsRef.current[memVerseIdx]?.text || "";
      }
      setMemCompCount(0); setMemLiveText("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getMime();
      const mr     = new MediaRecorder(stream, mime ? { mimeType: mime } : {});

      mr.ondataavailable = e => {
        if (!e.data?.size) return;
        if (!memInitRef.current) { memInitRef.current = e.data; memChunkSend(e.data); return; }
        memChunkSend(new Blob([memInitRef.current, e.data], { type: mime||"audio/webm" }));
      };

      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(memTimer.current!); setMemRecTime(0);
        // Advance phase using snapshot refs (not stale closure state)
        memAdvancePhase(memPhaseRef.current, memVerseRef.current);
      };

      mr.start(1500);
      memMrRef.current = mr;
      setMemRecState("recording");
      memTimer.current = setInterval(() => setMemRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };

  const memStopRec = () => { memMrRef.current?.stop(); };

  /* ═══════════════════════════════════════════════════════════
     REVISE — record whole passage as one blob, no live chunking.
     Eliminates "Failed to fetch" race between in-flight chunk
     requests and the post-stop full-blob transcription.
  ═══════════════════════════════════════════════════════════ */
  const revStartRec=async()=>{
    try{
      liveRef.current=""; chunksRef.current=[]; revBlobRef.current=null;
      setLiveTranscript(""); setRevErr("");
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=getMime();
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:{});
      // Collect all chunks — NO live API calls during recording
      mr.ondataavailable=e=>{ if(e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(timerRef.current!);
        const blob=new Blob(chunksRef.current,{type:mime||"audio/webm"});
        if(blob.size<500){ setRevErr("Too short — speak for at least 2 seconds."); setRevRecState("idle"); return; }
        revBlobRef.current=blob;
        setRevRecState("transcribing" as any); // triggers useEffect below
      };
      mr.start(200); mrRef.current=mr; setRevRecState("recording");
      timerRef.current=setInterval(()=>setRevRecTime(t=>t+1),1000);
    }catch{ alert("Microphone access denied."); }
  };

  const revStopRec=()=>{
    clearInterval(timerRef.current!);
    mrRef.current?.stop();
  };

  /* Transcription useEffect — fires when recording stops */
  useEffect(()=>{
    if((revRecState as string)!=="transcribing") return;
    const blob=revBlobRef.current;
    if(!blob){ setRevRecState("done"); return; }
    let dead=false;
    (async()=>{
      try{
        let tx="";
        if(DEEPGRAM_KEY){
          const r=await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
            {method:"POST",headers:{Authorization:"Token "+DEEPGRAM_KEY,"Content-Type":blob.type||"audio/webm"},body:blob}
          );
          if(r.ok) tx=(await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";
        }
        if(!tx&&GROQ_KEY){
          const ext=blob.type.includes("mp4")?"mp4":blob.type.includes("ogg")?"ogg":"webm";
          const fd=new FormData();
          fd.append("file",new File([blob],"r."+ext,{type:blob.type}));
          fd.append("model","whisper-large-v3"); fd.append("language","ar");
          fd.append("response_format","json"); fd.append("temperature","0");
          fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله رب العالمين");
          const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
            {method:"POST",headers:{Authorization:"Bearer "+GROQ_KEY},body:fd});
          if(r.status===429){ if(!dead) setRevErr("Rate limited — wait a moment."); }
          else if(r.ok) tx=(await r.json())?.text||"";
        }
        if(dead) return;
        if(tx){ liveRef.current=tx; setLiveTranscript(tx); setRevErr(""); }
        else if(!revErr) setRevErr("Could not transcribe — please speak clearly and try again.");
      }catch(e:any){
        if(!dead) setRevErr(e?.message||"Transcription error");
      }finally{
        if(!dead) setRevRecState("done");
      }
    })();
    return ()=>{ dead=true; };
  },[revRecState]);
  /* ── Evaluate revision with Claude ── */
  const evaluateRevision=useCallback(async()=>{
    const tx=liveRef.current.trim()||liveTranscript.trim()||revTranscript.trim();
    if(!tx){setRevErr("No transcript yet — please record first.");return;}
    setRevEvaluating(true); setRevErr("");

    const refText=selAyahs.map(a=>`[Ayah ${a.numberInSurah}]: ${a.text}`).join("\n");
    const prompt=`You are an expert Quran teacher evaluating a student's recitation for memorisation proficiency.

REFERENCE TEXT (correct Quran text, ${selSurah?.englishName} ayahs ${fromVerse}–${toVerse}):
${refText}

STUDENT'S RECITATION (transcribed):
"${tx}"

Compare word by word. Return ONLY valid JSON, no markdown fences.

{
  "overallScore": <0-100>,
  "grade": <"Excellent"|"Good"|"Needs Work"|"Weak">,
  "summary": "<2–3 sentences on overall performance>",
  "mainErrors": ["<error 1>","<error 2>"],
  "wordResults": [
    {"word":"<Arabic word from reference>","ok":<true|false>,"note":"<optional: what was said instead or why wrong>"}
  ]
}

Rules:
- Mark "ok":true for correct words and acceptable tajweed variations
- Mark "ok":false for wrong, missing, or extra words
- mainErrors: up to 4 most significant mistakes in plain English
- Be strict but fair`;

    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:3000,messages:[{role:"user",content:prompt}]}),
      });
      if(!r.ok) throw new Error(`Claude ${r.status}`);
      const raw=(await r.json()).content?.[0]?.text||"";
      const clean=raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
      const ev=JSON.parse(clean) as RevResult;
      setRevResult(ev); setRevTranscript(tx);
      setAppMode("rev-result");

      // Save to Supabase
      if(userId&&selSurah){
        await supabase.from("hifdh_recordings").insert({
          student_id:userId,surah_num:selSurah.number,surah_name:selSurah.englishName,
          ayah_start:fromVerse,ayah_end:toVerse,ai_score:ev.overallScore,
          status:"evaluated",transcript:tx,word_results:ev.wordResults,
        });
      }
    }catch(e:any){
      // Fallback: local scoring without Claude
      const combined=selAyahs.map(a=>a.text).join(" ");
      const r=scoreVsRef(tx,combined);
      setRevResult({overallScore:r.score,grade:r.score>=85?"Excellent":r.score>=70?"Good":r.score>=50?"Needs Work":"Weak",summary:`You scored ${r.score}%. Review highlighted words.`,mainErrors:[],wordResults:r.words});
      setRevTranscript(tx);
      setAppMode("rev-result");
    }finally{setRevEvaluating(false);}
  },[selAyahs,selSurah,fromVerse,toVerse,userId,revTranscript]);

  /* ── Grade colours ── */
  const gradeCol=(g:string)=>({Excellent:"#16a34a",Good:"#2563eb","Needs Work":"#d97706",Weak:"#dc2626"}[g]||"#666");
  const scoreCol=(s:number)=>s>=80?"#16a34a":s>=60?"#d97706":"#dc2626";

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */

  /* ─── HOME ─────────────────────────────────────────────── */
  if(appMode==="home") return(
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
      <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"36px 20px 28px",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:10}}>📖</div>
        <h1 style={{fontSize:24,fontWeight:900,color:"#fff",margin:"0 0 6px"}}>Hifdh Practice</h1>
        <p style={{fontSize:13,color:"rgba(255,255,255,.65)",margin:0,fontFamily:"'Amiri',serif",direction:"rtl"}}>حفظ القرآن الكريم ومراجعته</p>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"24px 16px",display:"flex",flexDirection:"column",gap:14}}>

        {/* Memorise card */}
        <button onClick={()=>setAppMode("mem-setup")} style={{
          background:"#fff",border:`2px solid ${G}`,borderRadius:16,padding:"20px",
          cursor:"pointer",textAlign:"left",display:"flex",alignItems:"flex-start",gap:14,
        }}>
          <div style={{width:48,height:48,borderRadius:14,background:GLT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🧠</div>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:G,marginBottom:4}}>Memorise</div>
            <div style={{fontSize:12,color:MUTED,lineHeight:1.6}}>Learn verse by verse using the <strong>repetition method</strong>.<br/>10× shown → 10× hidden → cumulative review.</div>
          </div>
          <ChevronRight size={18} color={MUTED} style={{marginLeft:"auto",flexShrink:0,marginTop:4}}/>
        </button>

        {/* Revise card */}
        <button onClick={()=>setAppMode("rev-setup")} style={{
          background:"#fff",border:`2px solid ${GOLD}`,borderRadius:16,padding:"20px",
          cursor:"pointer",textAlign:"left",display:"flex",alignItems:"flex-start",gap:14,
        }}>
          <div style={{width:48,height:48,borderRadius:14,background:GOLDLT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>📝</div>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:GOLD,marginBottom:4}}>Revise</div>
            <div style={{fontSize:12,color:MUTED,lineHeight:1.6}}>Test your memory. Record a full passage and get an <strong>AI-powered evaluation</strong> with mistake highlights.</div>
          </div>
          <ChevronRight size={18} color={MUTED} style={{marginLeft:"auto",flexShrink:0,marginTop:4}}/>
        </button>

        {/* Repetition settings */}
        <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:showRepSettings?12:0}}>
            <p style={{fontSize:12,fontWeight:700,color:G,margin:0}}>⚙️ Repetition Settings</p>
            <button onClick={()=>setShowRepSettings(v=>!v)} style={{background:"none",border:"none",fontSize:11,color:MUTED,cursor:"pointer",padding:"2px 6px",borderRadius:6,background:"#f3f4f6"}}>
              {showRepSettings?"▲ Hide":"▼ Edit"}
            </button>
          </div>
          {showRepSettings&&(
            <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:4}}>
              {[
                {label:"Shown × (verse visible)",val:repsShown,set:setRepsShown},
                {label:"Hidden × (from memory)",val:repsHidden,set:setRepsHidden},
                {label:"Cumulative review ×",val:repsCumul,set:setRepsCumul},
              ].map(({label,val,set},i)=>(
                <div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:11,color:TEXT}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:800,color:G,minWidth:24,textAlign:"center"}}>{val}×</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>set(v=>Math.max(MIN_REPS,v-1))} style={{width:28,height:28,borderRadius:8,border:`1px solid ${BORDER}`,background:"#f9fafb",fontSize:16,fontWeight:700,color:G,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <input type="range" min={MIN_REPS} max={30} value={val}
                      onChange={e=>set(Math.max(MIN_REPS,parseInt(e.target.value)))}
                      style={{flex:1,accentColor:G}}/>
                    <button onClick={()=>set(v=>Math.min(30,v+1))} style={{width:28,height:28,borderRadius:8,border:`1px solid ${BORDER}`,background:"#f9fafb",fontSize:16,fontWeight:700,color:G,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                </div>
              ))}
              <div style={{fontSize:10,color:MUTED,paddingTop:2}}>Minimum {MIN_REPS}× · Maximum 30×</div>
            </div>
          )}
          {!showRepSettings&&(
            <div style={{fontSize:11,color:MUTED,marginTop:4}}>
              Shown: {repsShown}× · Hidden: {repsHidden}× · Cumulative: {repsCumul}×
            </div>
          )}
        </div>

        <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:14}}>
          <p style={{fontSize:12,fontWeight:700,color:G,margin:"0 0 8px"}}>How each mode works</p>
          {[["🧠 Memorise","Verse shown 10× → hidden 10× → then all verses so far 5×, repeat"],
            ["📝 Revise","Record entire portion → AI highlights every wrong word → proficiency score"]].map(([t,d],i)=>(
            <div key={i} style={{marginBottom:i<1?10:0}}>
              <div style={{fontSize:12,fontWeight:700,color:TEXT}}>{t}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:2}}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ─── SHARED SETUP (mem-setup / rev-setup) ─────────────── */
  if(appMode==="mem-setup"||appMode==="rev-setup"){
    const isMem=appMode==="mem-setup";
    const canStart=!!selSurah&&selAyahs.length>0&&!loadingAyahs&&fromVerse<=toVerse;
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{background:`linear-gradient(135deg,${isMem?G:GOLD},${isMem?GM:"#b45309"})`,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <button onClick={()=>setAppMode("home")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{isMem?"Memorise Setup":"Revision Setup"}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>Choose surah and verses</div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px"}}>

          {/* Surah search */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:TEXT,display:"block",marginBottom:6}}>Select Surah</label>
            <div style={{position:"relative"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search surah by name…"
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:13,color:TEXT,outline:"none",boxSizing:"border-box" as const,background:"#fff"}}/>
            </div>
            {search&&(
              <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:10,maxHeight:200,overflowY:"auto",marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,.1)"}}>
                {filteredSurahs.slice(0,20).map(s=>(
                  <button key={s.number} onClick={()=>{setSelSurah(s);setSearch("");}} style={{
                    width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                    border:"none",background:"none",cursor:"pointer",textAlign:"left",
                    borderBottom:`1px solid ${BORDER}`,
                  }}>
                    <span style={{width:24,height:24,borderRadius:6,background:GOLDLT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:GOLD,flexShrink:0}}>{s.number}</span>
                    <span style={{fontSize:13,fontWeight:600,color:TEXT}}>{s.englishName}</span>
                    <span style={{fontSize:13,fontFamily:"'Amiri',serif",color:MUTED,marginLeft:"auto"}}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selSurah&&(
              <div style={{marginTop:8,padding:"10px 14px",background:GLT,borderRadius:10,border:`1px solid ${G}44`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:700,color:G}}>{selSurah.englishName} <span style={{fontFamily:"'Amiri',serif",fontWeight:400}}>— {selSurah.name}</span></span>
                <button onClick={()=>{setSelSurah(null);setAyahs([]);}} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:11}}>Change</button>
              </div>
            )}
          </div>

          {/* Verse range */}
          {selSurah&&(
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,color:TEXT,display:"block",marginBottom:6}}>
                Verse Range {loadingAyahs&&<span style={{color:MUTED,fontWeight:400}}>(loading…)</span>}
              </label>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:MUTED,display:"block",marginBottom:3}}>From verse</label>
                  <input type="number" min={1} max={selSurah.numberOfAyahs} value={fromVerse}
                    onChange={e=>setFromVerse(Math.max(1,Math.min(selSurah.numberOfAyahs,parseInt(e.target.value)||1)))}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:15,fontWeight:700,textAlign:"center",outline:"none",boxSizing:"border-box" as const}}/>
                </div>
                <div style={{color:MUTED,paddingTop:18,fontWeight:700}}>→</div>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:MUTED,display:"block",marginBottom:3}}>To verse</label>
                  <input type="number" min={fromVerse} max={selSurah.numberOfAyahs} value={toVerse}
                    onChange={e=>setToVerse(Math.max(fromVerse,Math.min(selSurah.numberOfAyahs,parseInt(e.target.value)||fromVerse)))}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:15,fontWeight:700,textAlign:"center",outline:"none",boxSizing:"border-box" as const}}/>
                </div>
              </div>
              {selAyahs.length>0&&!loadingAyahs&&(
                <div style={{marginTop:6,fontSize:11,color:MUTED}}>{selAyahs.length} verses selected · {selAyahs.reduce((s,a)=>s+a.text.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).length,0)} words</div>
              )}
            </div>
          )}

          {/* Preview */}
          {selAyahs.length>0&&!loadingAyahs&&(
            <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:8}}>Preview</div>
              <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:18,lineHeight:2.8,color:G,textAlign:"right"}}>
                {selAyahs.map(a=>(
                  <span key={a.numberInSurah}>{a.text.replace(/﴿[^﴾]*﴾/g,"")} <span style={{color:GOLD,fontSize:14}}>﴿{a.numberInSurah}﴾</span>{" "}</span>
                ))}
              </div>
            </div>
          )}

          {/* Session info */}
          {isMem&&selAyahs.length>0&&(
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px 14px",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:G,marginBottom:6}}>Session plan</div>
              {selAyahs.map((a,i)=>(
                <div key={i} style={{fontSize:11,color:MUTED,marginBottom:3,display:"flex",gap:6}}>
                  <span style={{fontWeight:700,color:TEXT}}>Verse {a.numberInSurah}:</span>
                  {repsShown}× shown + {repsHidden}× hidden
                  {i>0&&<span>+ review verses {selAyahs[0].numberInSurah}–{a.numberInSurah} ({repsCumul}×)</span>}
                </div>
              ))}
            </div>
          )}

          <button disabled={!canStart} onClick={()=>{
            if(isMem){
              // Set ALL refs before state change so first render of mem-session is correct
              memTotalRef.current  = repsShown;
              memPhaseRef.current  = "shown";
              memVerseRef.current  = 0;
              memCountRef.current  = 0;
              memWindowRef.current = [];
              if (memSilRef.current) clearTimeout(memSilRef.current);
              memPhraseRef.current = selAyahsRef.current[0]?.text || "";
              setMemVerseIdx(0);
              setMemPhase("shown");
              setMemTotalReps(repsShown);
              setMemRecState("idle");
              setMemCompCount(0);
              setMemLiveText("");
              setAppMode("mem-session");
            } else {
              liveRef.current    = "";
              revBlobRef.current = null;
              setRevRecState("idle");
              setRevAudioBlob(null);
              setRevResult(null);
              setRevTranscript("");
              setLiveTranscript("");
              setRevErr("");
              setRevEvaluating(false);
              setRevRecTime(0);
              setAppMode("rev-session");
            }
          }} style={{
            width:"100%",padding:"15px",borderRadius:14,border:"none",
            background:canStart?`linear-gradient(135deg,${isMem?G:GOLD},${isMem?GM:"#b45309"})`:"#e5e7eb",
            color:canStart?"#fff":"#9ca3af",fontSize:15,fontWeight:800,cursor:canStart?"pointer":"not-allowed",
          }}>
            {loadingAyahs?"Loading…":isMem?"Start Memorising →":"Start Revision →"}
          </button>
        </div>
      </div>
    );
  }

  /* ─── MEMORISE SESSION ─────────────────────────────────── */
  if(appMode==="mem-session"&&!currentAyah){
    return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100svh",flexDirection:"column",gap:16,background:"#fdfaf4"}}>
      <div style={{fontSize:13,color:MUTED}}>Session data not found. Please go back and try again.</div>
      <button onClick={()=>setAppMode("mem-setup")} style={{padding:"11px 22px",borderRadius:11,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Back to Setup</button>
    </div>);
  }
  if(appMode==="mem-session"&&currentAyah){
    const isShown    = memPhase==="shown";
    const isHidden   = memPhase==="hidden";
    const isCumul    = memPhase==="cumulative";
    const displayAyahs = isCumul ? cumulativeAyahs : [currentAyah];
    const phaseLabel = isShown?"📖 Read & Repeat":isHidden?"🧠 From Memory":"🔁 Cumulative Review";
    const phaseDesc  = isShown?"Verse is shown — recite it out loud":
                       isHidden?"Verse is hidden — recite from memory":
                       `Recite all verses so far (${selAyahs[0].numberInSurah}–${currentAyah.numberInSurah}) together`;

    return(
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <style>{`@keyframes wave{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}} @keyframes pop{0%{transform:scale(.95);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>

        {/* Header */}
        <div style={{flexShrink:0,background:`linear-gradient(135deg,${G},${GM})`,padding:"10px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <button onClick={()=>setAppMode("mem-setup")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{selSurah?.englishName} · Verse {currentAyah.numberInSurah}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>
                Verse {memVerseIdx+1}/{selAyahs.length} · {memCompCount}/{memTotalReps} recitations
              </div>
            </div>
          </div>
          {/* Phase + progress pills */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {([["shown","📖 Shown",repsShown],["hidden","🧠 Hidden",repsHidden],["cumulative","🔁 Cumulative",repsCumul]] as [MemPhase,string,number][]).map(([ph,lb,tot])=>(
              <div key={ph} style={{fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:700,
                background:memPhase===ph?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)",
                color:memPhase===ph?"#fff":"rgba(255,255,255,.45)",
                border:`1px solid ${memPhase===ph?"rgba(255,255,255,.4)":"transparent"}`,
              }}>
                {lb} {memPhase===ph?`${memCompCount}/${tot}`:""}
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{height:3,background:"rgba(0,0,0,.08)",flexShrink:0}}>
          <div style={{width:`${((memVerseIdx*3+(memPhase==="shown"?0:memPhase==="hidden"?1:2))/selAyahs.length/3)*100}%`,height:"100%",background:"#4ade80",transition:"width .4s"}}/>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 14px 150px"}}>

          {/* ── BIG REP COUNTER (the main focus) ── */}
          <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:16,padding:"16px 20px",marginBottom:12,textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,.05)"}}>
            <div style={{fontSize:12,fontWeight:700,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>
              {phaseLabel} — recite {memTotalReps}× continuously
            </div>
            {/* Rep dots */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:10}}>
              {Array.from({length:memTotalReps},(_,i)=>(
                <div key={i} style={{
                  width:28,height:28,borderRadius:"50%",
                  background:i<memCompCount?"#16a34a":i===memCompCount&&memRecState==="recording"?"#fde68a":"#f3f4f6",
                  border:`2px solid ${i<memCompCount?"#16a34a":i===memCompCount&&memRecState==="recording"?GOLD:BORDER}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:700,
                  color:i<memCompCount?"#fff":i===memCompCount&&memRecState==="recording"?"#92400e":MUTED,
                  transition:"all .3s",
                }}>
                  {i<memCompCount?"✓":i+1}
                </div>
              ))}
            </div>
            <div style={{fontSize:22,fontWeight:900,color:memCompCount>=memTotalReps?"#16a34a":G}}>
              {memCompCount}/{memTotalReps}
              <span style={{fontSize:13,fontWeight:400,color:MUTED,marginLeft:8}}>
                {memCompCount>=memTotalReps?"✅ Phase complete!":memRecState==="recording"?"keep going…":"tap mic to start"}
              </span>
            </div>
            {/* Live transcript hint */}
            {memRecState==="recording"&&memLiveText&&(
              <div style={{marginTop:8,fontSize:12,direction:"rtl",fontFamily:"'Amiri',serif",color:MUTED,background:"#f9fafb",borderRadius:8,padding:"5px 10px"}}>
                {memLiveText}
              </div>
            )}
          </div>

          {/* Ayah card */}
          <div style={{background:"#fff",borderRadius:16,border:`1px solid ${BORDER}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:GOLDLT,borderBottom:"1px solid #fde68a"}}>
              <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
                {isCumul?`Verses ${selAyahs[0].numberInSurah}–${currentAyah.numberInSurah}`:`Verse ${currentAyah.numberInSurah}`}
              </span>
              <button onClick={()=>playAudio(displayAyahs[0].number)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:20,border:`1px solid ${playing?"#059669":BORDER}`,background:playing?"#ecfdf5":"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:playing?"#059669":MUTED}}>
                <Volume2 size={12}/> {playing?"Stop":"Listen"}
              </button>
            </div>
            <div style={{padding:"20px 16px"}}>
              {displayAyahs.map((a,i)=>(
                <div key={a.numberInSurah} style={{marginBottom:i<displayAyahs.length-1?12:0}}>
                  {isHidden?(
                    <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:24,lineHeight:3,textAlign:"right",filter:"blur(7px)",userSelect:"none",color:G,opacity:.7}}>
                      {a.text.replace(/﴿[^﴾]*﴾/g,"")}
                      <span style={{color:GOLD,fontSize:16,margin:"0 4px"}}>﴿{a.numberInSurah}﴾</span>
                    </div>
                  ):(
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

        {/* ── FIXED MIC BAR ── */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"12px 16px 22px",display:"flex",alignItems:"center",gap:12}}>
          {/* Mic button */}
          <button onClick={memRecState==="idle"?memStartRec:memStopRec} style={{
            width:60,height:60,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
            background:memRecState==="recording"?RED:G,
            boxShadow:memRecState==="recording"?`0 0 0 5px ${RED}44,0 0 0 10px ${RED}11`:`0 4px 16px rgba(6,79,58,.3)`,
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
          }}>
            {memRecState==="recording"?<Square size={24} fill="#fff" color="#fff"/>:<Mic size={24} color="#fff"/>}
          </button>

          <div style={{flex:1}}>
            {memRecState==="recording"?(
              <>
                <div style={{display:"flex",gap:2,height:20,marginBottom:3,alignItems:"center"}}>
                  {[4,9,6,16,8,13,5,11,18,7].map((h,i)=>(
                    <div key={i} style={{width:3,height:h,borderRadius:2,background:RED,opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                  ))}
                  <span style={{fontSize:12,fontWeight:800,color:RED,marginLeft:6}}>{fmtSec(memRecTime)}</span>
                </div>
                <div style={{fontSize:11,color:MUTED}}>
                  Recite → pause 2s → AI counts · {memCompCount}/{memTotalReps} done
                </div>
              </>
            ):(
              <>
                <div style={{fontSize:13,fontWeight:700,color:G,marginBottom:2}}>
                  {memCompCount>=memTotalReps?"Phase complete! Loading next…":"Tap mic to start reciting"}
                </div>
                <div style={{fontSize:11,color:MUTED}}>{phaseLabel} · recite, pause 2s after each — AI auto-counts</div>
              </>
            )}
          </div>

          {/* Manual skip */}
          <button onClick={()=>memAdvancePhase(memPhase,memVerseIdx)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:MUTED,fontSize:11,fontWeight:600,cursor:"pointer"}}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  /* ─── REVISE SESSION ───────────────────────────────────── */
  if(appMode==="rev-session"){
    const refText=selAyahs.map(a=>a.text).join(" ");
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <style>{`@keyframes wave{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <div style={{flexShrink:0,background:`linear-gradient(135deg,${GOLD},#b45309)`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setAppMode("rev-setup")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{selSurah?.englishName} · Verses {fromVerse}–{toVerse}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>Record your full recitation</div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 130px"}}>
          {/* Full reference text */}
          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:16,padding:"16px 18px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Reference Text — read aloud</span>
              <button onClick={()=>playAudio(selAyahs[0].number)} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,border:`1px solid ${playing?"#059669":BORDER}`,background:playing?"#ecfdf5":"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:playing?"#059669":MUTED}}>
                <Volume2 size={11}/> {playing?"Stop":"Listen"}
              </button>
            </div>
            <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:22,lineHeight:3,textAlign:"right",color:G}}>
              {selAyahs.map(a=>(
                <span key={a.numberInSurah}>{a.text.replace(/﴿[^﴾]*﴾/g,"")} <span style={{color:GOLD,fontSize:15}}>﴿{a.numberInSurah}﴾</span>{" "}</span>
              ))}
            </div>
          </div>

          {/* Live transcript pill */}
          {revRecState==="recording"&&liveTranscript&&(
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:10,padding:"8px 12px",marginBottom:12}}>
              <div style={{fontSize:10,color:MUTED,marginBottom:3}}>Heard so far:</div>
              <div style={{fontSize:13,direction:"rtl",textAlign:"right",fontFamily:"'Amiri',serif",color:TEXT,lineHeight:1.8}}>{liveTranscript}</div>
            </div>
          )}

          {/* Transcribing state */}
          {(revRecState as string)==="transcribing"&&(
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:"20px",textAlign:"center"}}>
              <Loader2 size={32} color={GOLD} style={{display:"block",margin:"0 auto 10px",animation:"spin .8s linear infinite"}}/>
              <div style={{fontSize:14,fontWeight:700,color:GOLD}}>Transcribing recording…</div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>Just a moment</div>
            </div>
          )}

          {revRecState==="done"&&!revEvaluating&&(
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
              <Check size={36} color="#16a34a" style={{display:"block",margin:"0 auto 10px"}}/>
              <div style={{fontSize:15,fontWeight:800,color:G,marginBottom:4}}>Recording Complete!</div>
              <div style={{fontSize:12,color:MUTED,marginBottom:liveTranscript?10:14}}>
                {fmtSec(revRecTime)}s recorded · {liveTranscript?`${liveTranscript.trim().split(/\s+/).length} words heard`:"ready to evaluate"}
              </div>
              {liveTranscript&&(
                <div style={{background:"#f9fafb",borderRadius:8,padding:"8px 10px",marginBottom:12,textAlign:"right",direction:"rtl",fontFamily:"'Amiri',serif",fontSize:13,color:TEXT,lineHeight:1.8,maxHeight:80,overflowY:"auto"}}>
                  {liveTranscript}
                </div>
              )}
              {revErr&&<div style={{fontSize:12,color:RED,marginBottom:10,background:REDLT,padding:"8px 12px",borderRadius:8,textAlign:"left"}}>{revErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setRevRecState("idle");setLiveTranscript("");liveRef.current="";setRevRecTime(0);}} style={{flex:1,padding:"11px",borderRadius:11,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <RotateCcw size={13}/> Re-record
                </button>
                <button onClick={evaluateRevision} disabled={!liveTranscript} style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:liveTranscript?`linear-gradient(135deg,${GOLD},#b45309)`:"#e5e7eb",color:liveTranscript?"#fff":"#9ca3af",fontSize:13,fontWeight:700,cursor:liveTranscript?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <Star size={15}/> Evaluate with AI
                </button>
              </div>
            </div>
          )}

          {revEvaluating&&(
            <div style={{textAlign:"center",padding:"24px",background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`}}>
              <Loader2 size={36} color={GOLD} style={{display:"block",margin:"0 auto 12px",animation:"spin .8s linear infinite"}}/>
              <div style={{fontSize:14,fontWeight:700,color:GOLD}}>AI is evaluating your recitation…</div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>Comparing word by word</div>
            </div>
          )}
        </div>

        {/* Mic bar */}
        {(revRecState==="idle"||revRecState==="recording")&&(revRecState as string)!=="transcribing"&&(
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"12px 16px 22px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={revRecState==="idle"?revStartRec:revStopRec} style={{
              width:60,height:60,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
              background:revRecState==="recording"?RED:GOLD,
              boxShadow:revRecState==="recording"?`0 0 0 4px ${RED}44`:`0 4px 16px ${GOLD}55`,
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
            }}>
              {revRecState==="recording"?<Square size={24} fill="#fff" color="#fff"/>:<Mic size={24} color="#fff"/>}
            </button>
            <div style={{flex:1}}>
              {revRecState==="recording"?(
                <>
                  <div style={{display:"flex",gap:2,height:22,marginBottom:2}}>
                    {[4,9,6,16,8,13,5,11,18,7,14,5,10].map((h,i)=>(
                      <div key={i} style={{width:3,height:h,borderRadius:2,background:RED,opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                    ))}
                    <span style={{fontSize:14,fontWeight:800,color:RED,marginLeft:6}}>{fmtSec(revRecTime)}</span>
                  </div>
                  <div style={{fontSize:11,color:MUTED}}>Recording… recite everything, then tap stop</div>
                </>
              ):(
                <>
                  <div style={{fontSize:13,fontWeight:700,color:GOLD,marginBottom:2}}>Tap to start recording</div>
                  <div style={{fontSize:11,color:MUTED}}>Recite all {selAyahs.length} verses, then stop</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── REVISION RESULT ──────────────────────────────────── */
  if(appMode==="rev-result"&&revResult){
    const gc=gradeCol(revResult.grade);
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
        <style>{`@keyframes pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>

        <div style={{flexShrink:0,background:`linear-gradient(135deg,${GOLD},#b45309)`,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setAppMode("rev-session")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}><ChevronLeft size={18}/></button>
          <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>Revision Result</div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 14px 32px"}}>

          {/* Score card */}
          <div style={{background:"#fff",borderRadius:16,border:`1px solid ${BORDER}`,padding:"20px",textAlign:"center",marginBottom:14,animation:"pop .4s ease",boxShadow:"0 2px 16px rgba(0,0,0,.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:14}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:`${gc}12`,border:`4px solid ${gc}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:26,fontWeight:900,color:gc}}>{revResult.overallScore}%</div>
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:24,fontWeight:900,color:gc}}>{revResult.grade}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:2}}>{selSurah?.englishName} · {fromVerse}–{toVerse}</div>
              </div>
            </div>
            <div style={{fontSize:13,color:TEXT,lineHeight:1.7,background:"#f9fafb",borderRadius:10,padding:"10px 14px"}}>{revResult.summary}</div>
          </div>

          {/* Main errors */}
          {revResult.mainErrors?.length>0&&(
            <div style={{background:REDLT,border:`1px solid ${RED}44`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:RED,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><AlertCircle size={13}/> Key Mistakes</div>
              {revResult.mainErrors.map((e,i)=>(
                <div key={i} style={{fontSize:12,color:"#7f1d1d",marginBottom:i<revResult.mainErrors.length-1?5:0,display:"flex",gap:6}}>
                  <span style={{fontWeight:800,flexShrink:0}}>•</span>{e}
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div style={{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap"}}>
            {[[true,"#16a34a","✓ Correct"],[false,RED,"✗ Wrong/Missing"]].map(([ok,col,lb],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
                <div style={{width:10,height:10,borderRadius:2,background:col as string}}/>
                <span style={{color:MUTED}}>{lb as string}</span>
              </div>
            ))}
          </div>

          {/* Word-by-word inline */}
          <div style={{background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`,padding:"18px 16px",marginBottom:16}}>
            <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:22,lineHeight:3.4,textAlign:"right"}}>
              {revResult.wordResults.map((w,i)=>(
                <span key={i} style={{
                  display:"inline-block",margin:"0 2px",
                  color:w.ok?"#16a34a":RED,
                  background:w.ok?"transparent":`${RED}12`,
                  borderRadius:w.ok?0:4,
                  padding:w.ok?0:"0 3px",
                  borderBottom:w.ok?"none":`2px solid ${RED}55`,
                  position:"relative",
                }} title={!w.ok&&w.note?w.note:undefined}>
                  {w.word}
                  {!w.ok&&(
                    <span style={{position:"absolute",bottom:-16,left:"50%",transform:"translateX(-50%)",fontSize:8,color:RED,whiteSpace:"nowrap",fontFamily:"system-ui",fontWeight:700}}>✗</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setRevRecState("idle");setLiveTranscript("");liveRef.current="";setRevResult(null);setAppMode("rev-session");}} style={{flex:1,padding:"13px",borderRadius:12,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <RotateCcw size={14}/> Try Again
            </button>
            <button onClick={()=>setAppMode("home")} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <BookOpen size={14}/> Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
