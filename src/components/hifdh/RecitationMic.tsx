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

const COUNT_SHOWN      = 10;   // repetitions per verse while VISIBLE
const COUNT_HIDDEN     = 10;   // repetitions per verse while HIDDEN
const CUMULATIVE_REPS  = 5;    // repetitions of cumulative review block

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
  const [memRep,       setMemRep]       = useState(1);    // current rep (1-based)
  const [memTotalReps, setMemTotalReps] = useState(COUNT_SHOWN);

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
  const timerRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const audioEl    = useRef<HTMLAudioElement|null>(null);
  const [playing,  setPlaying] = useState(false);

  /* ── Mem recording (per repetition) ── */
  const [memRecState, setMemRecState] = useState<RecState>("idle");
  const [memRecTime,  setMemRecTime]  = useState(0);
  const [memScore,    setMemScore]    = useState<number|null>(null);
  const memMrRef   = useRef<MediaRecorder|null>(null);
  const memChunks  = useRef<Blob[]>([]);
  const memInitRef = useRef<Blob|null>(null);
  const memLiveRef = useRef("");
  const memTimer   = useRef<ReturnType<typeof setInterval>|null>(null);

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
     MEMORISE — recording logic (per repetition)
     Sends 1.5s chunks live to Deepgram, accumulates transcript.
     On stop: score immediately from live transcript.
  ═══════════════════════════════════════════════════════════ */
  const memSendChunk = useCallback(async(blob:Blob)=>{
    if(!DEEPGRAM_KEY&&!GROQ_KEY) return;
    try{
      if(DEEPGRAM_KEY){
        const r=await fetch("https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
          {method:"POST",headers:{Authorization:`Token ${DEEPGRAM_KEY}`,"Content-Type":blob.type||"audio/webm"},body:blob});
        if(r.ok){const tx=(await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";if(tx)memLiveRef.current=(memLiveRef.current+" "+tx).trim();}
      }else if(GROQ_KEY){
        const ext=blob.type.includes("mp4")?"mp4":blob.type.includes("ogg")?"ogg":"webm";
        const fd=new FormData();fd.append("file",new File([blob],`c.${ext}`,{type:blob.type}));fd.append("model","whisper-large-v3");fd.append("language","ar");fd.append("response_format","json");fd.append("temperature","0");fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${GROQ_KEY}`},body:fd});
        if(r.ok){const tx=(await r.json())?.text||"";if(tx)memLiveRef.current=(memLiveRef.current+" "+tx).trim();}
      }
    }catch(_){}
  },[]);

  const memStartRec = async()=>{
    try{
      memLiveRef.current=""; memInitRef.current=null; memChunks.current=[];
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=getMime();
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:{});
      mr.ondataavailable=e=>{
        if(!e.data?.size)return;
        memChunks.current.push(e.data);
        if(!memInitRef.current){memInitRef.current=e.data;memSendChunk(e.data);return;}
        memSendChunk(new Blob([memInitRef.current,e.data],{type:mime||"audio/webm"}));
      };
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(memTimer.current!); setMemRecTime(0);
        // Score using live transcript
        const refText = memPhase==="cumulative"
          ? cumulativeAyahs.map(a=>a.text).join(" ")
          : currentAyah?.text||"";
        const tx=memLiveRef.current.trim();
        if(tx){
          const r=scoreVsRef(tx,refText);
          setMemScore(r.score);
        } else {
          setMemScore(0);
        }
        setMemRecState("done");
      };
      mr.start(1500); memMrRef.current=mr; setMemRecState("recording");
      memTimer.current=setInterval(()=>setMemRecTime(t=>t+1),1000);
    }catch{alert("Microphone access denied.");}
  };

  const memStopRec=()=>{memMrRef.current?.stop();};

  /* ── Advance memorise session after each rep ── */
  const memAdvance=useCallback(()=>{
    setMemScore(null);
    setMemRecState("idle");

    if(memPhase==="shown"){
      if(memRep<COUNT_SHOWN){
        setMemRep(r=>r+1);
      } else {
        // Move to hidden phase
        setMemPhase("hidden"); setMemRep(1); setMemTotalReps(COUNT_HIDDEN);
      }
    } else if(memPhase==="hidden"){
      if(memRep<COUNT_HIDDEN){
        setMemRep(r=>r+1);
      } else {
        // Move to cumulative phase
        setMemPhase("cumulative"); setMemRep(1); setMemTotalReps(CUMULATIVE_REPS);
      }
    } else if(memPhase==="cumulative"){
      if(memRep<CUMULATIVE_REPS){
        setMemRep(r=>r+1);
      } else {
        // Move to next verse
        const nextIdx=memVerseIdx+1;
        if(nextIdx>=selAyahs.length){
          // All done
          setAppMode("home");
          alert("🎉 Memorisation complete! Masha'Allah!");
        } else {
          setMemVerseIdx(nextIdx);
          setMemPhase("shown"); setMemRep(1); setMemTotalReps(COUNT_SHOWN);
        }
      }
    }
  },[memPhase,memRep,memVerseIdx,selAyahs.length]);

  /* ═══════════════════════════════════════════════════════════
     REVISE — record full portion, then evaluate with Claude
  ═══════════════════════════════════════════════════════════ */
  const revSendChunk = useCallback(async(blob:Blob)=>{
    if(!DEEPGRAM_KEY&&!GROQ_KEY) return;
    try{
      if(DEEPGRAM_KEY){
        const r=await fetch("https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
          {method:"POST",headers:{Authorization:`Token ${DEEPGRAM_KEY}`,"Content-Type":blob.type||"audio/webm"},body:blob});
        if(r.ok){const tx=(await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";if(tx){liveRef.current=(liveRef.current+" "+tx).trim();setLiveTranscript(liveRef.current);}}
      }else if(GROQ_KEY){
        const ext=blob.type.includes("mp4")?"mp4":blob.type.includes("ogg")?"ogg":"webm";
        const fd=new FormData();fd.append("file",new File([blob],`c.${ext}`,{type:blob.type}));fd.append("model","whisper-large-v3");fd.append("language","ar");fd.append("response_format","json");fd.append("temperature","0");fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${GROQ_KEY}`},body:fd});
        if(r.ok){const tx=(await r.json())?.text||"";if(tx){liveRef.current=(liveRef.current+" "+tx).trim();setLiveTranscript(liveRef.current);}}
      }
    }catch(_){}
  },[]);

  const revStartRec=async()=>{
    try{
      liveRef.current=""; initRef.current=null; chunksRef.current=[];
      setLiveTranscript(""); setRevErr("");
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=getMime();
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:{});
      mr.ondataavailable=e=>{
        if(!e.data?.size)return;
        chunksRef.current.push(e.data);
        if(!initRef.current){initRef.current=e.data;revSendChunk(e.data);return;}
        revSendChunk(new Blob([initRef.current,e.data],{type:mime||"audio/webm"}));
      };
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(timerRef.current!); setRevRecTime(0);
        const blob=new Blob(chunksRef.current,{type:mime||"audio/webm"});
        setRevAudioBlob(blob);
        setRevRecState("done");
      };
      mr.start(1500); mrRef.current=mr; setRevRecState("recording");
      timerRef.current=setInterval(()=>setRevRecTime(t=>t+1),1000);
    }catch{alert("Microphone access denied.");}
  };

  const revStopRec=()=>{mrRef.current?.stop();};

  /* ── Evaluate revision with Claude ── */
  const evaluateRevision=useCallback(async()=>{
    const tx=liveRef.current.trim()||revTranscript.trim();
    if(!tx){setRevErr("No transcript available. Try recording again.");return;}
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
                  {COUNT_SHOWN}× shown + {COUNT_HIDDEN}× hidden
                  {i>0&&<span>+ review verses {selAyahs[0].numberInSurah}–{a.numberInSurah} ({CUMULATIVE_REPS}×)</span>}
                </div>
              ))}
            </div>
          )}

          <button disabled={!canStart} onClick={()=>{
            if(isMem){
              setMemVerseIdx(0); setMemPhase("shown"); setMemRep(1); setMemTotalReps(COUNT_SHOWN);
              setMemRecState("idle"); setMemScore(null);
              setAppMode("mem-session");
            } else {
              setRevRecState("idle"); setRevAudioBlob(null); setRevResult(null);
              setRevTranscript(""); setLiveTranscript(""); setRevErr(""); setRevEvaluating(false);
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
                Verse {memVerseIdx+1}/{selAyahs.length} · Rep {memRep}/{memTotalReps}
              </div>
            </div>
          </div>
          {/* Phase + progress pills */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {([["shown","📖 Shown",COUNT_SHOWN],["hidden","🧠 Hidden",COUNT_HIDDEN],["cumulative","🔁 Cumulative",CUMULATIVE_REPS]] as const).map(([ph,lb,tot])=>(
              <div key={ph} style={{fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:700,
                background:memPhase===ph?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)",
                color:memPhase===ph?"#fff":"rgba(255,255,255,.45)",
                border:`1px solid ${memPhase===ph?"rgba(255,255,255,.4)":"transparent"}`,
              }}>
                {lb} {memPhase===ph?`${memRep}/${tot}`:""}
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{height:3,background:"rgba(0,0,0,.08)",flexShrink:0}}>
          <div style={{width:`${((memVerseIdx*3+(memPhase==="shown"?0:memPhase==="hidden"?1:2))/selAyahs.length/3)*100}%`,height:"100%",background:"#4ade80",transition:"width .4s"}}/>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 14px 120px"}}>
          {/* Phase badge */}
          <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:20}}>{isShown?"📖":isHidden?"🙈":"🔁"}</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{phaseLabel}</div>
              <div style={{fontSize:11,color:MUTED}}>{phaseDesc}</div>
            </div>
          </div>

          {/* Ayah card */}
          <div style={{background:"#fff",borderRadius:16,border:`1px solid ${BORDER}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)",marginBottom:12}}>
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
                    // Hidden: full blur
                    <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:24,lineHeight:3,textAlign:"right",filter:"blur(7px)",userSelect:"none",color:G,opacity:.7}}>
                      {a.text.replace(/﴿[^﴾]*﴾/g,"")}
                      <span style={{color:GOLD,fontSize:16,margin:"0 4px"}}>﴿{a.numberInSurah}﴾</span>
                    </div>
                  ):(
                    // Shown / cumulative: full text visible
                    <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:24,lineHeight:3,textAlign:"right",color:G}}>
                      {a.text.replace(/﴿[^﴾]*﴾/g,"")}
                      <span style={{color:GOLD,fontSize:16,margin:"0 4px"}}>﴿{a.numberInSurah}﴾</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Score feedback after recording */}
          {memRecState==="done"&&memScore!==null&&(
            <div style={{background:"#fff",border:`1px solid ${memScore>=70?"#86efac":RED+"44"}`,borderRadius:12,padding:"14px",textAlign:"center",animation:"pop .3s ease",marginBottom:12}}>
              <div style={{fontSize:28,fontWeight:900,color:scoreCol(memScore),marginBottom:4}}>{memScore}%</div>
              <div style={{fontSize:12,color:MUTED,marginBottom:12}}>
                {memScore>=80?"✅ Great!":memScore>=50?"🔄 Keep practising":"❌ Try again"}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                <button onClick={()=>{setMemRecState("idle");setMemScore(null);}} style={{padding:"9px 16px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  <RotateCcw size={13}/> Retry
                </button>
                <button onClick={memAdvance} style={{padding:"9px 20px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Next {memRep<memTotalReps?`(${memRep+1}/${memTotalReps})`:"→"} 
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mic bar */}
        {memRecState!=="done"&&(
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"12px 16px 22px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={memRecState==="idle"?memStartRec:memStopRec} style={{
              width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
              background:memRecState==="recording"?RED:G,
              boxShadow:memRecState==="recording"?`0 0 0 4px ${RED}44,0 0 0 8px ${RED}11`:`0 4px 16px rgba(6,79,58,.3)`,
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
            }}>
              {memRecState==="recording"?<Square size={22} fill="#fff" color="#fff"/>:<Mic size={22} color="#fff"/>}
            </button>
            <div style={{flex:1}}>
              {memRecState==="recording"?(
                <>
                  <div style={{display:"flex",gap:2,height:20,marginBottom:2}}>
                    {[4,9,6,16,8,13,5,11,18,7].map((h,i)=>(
                      <div key={i} style={{width:3,height:h,borderRadius:2,background:RED,opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                    ))}
                    <span style={{fontSize:13,fontWeight:800,color:RED,marginLeft:6}}>{fmtSec(memRecTime)}</span>
                  </div>
                  <div style={{fontSize:11,color:MUTED}}>Recording… tap stop when done</div>
                </>
              ):(
                <>
                  <div style={{fontSize:13,fontWeight:700,color:G,marginBottom:2}}>Tap mic to recite</div>
                  <div style={{fontSize:11,color:MUTED}}>
                    Rep {memRep} of {memTotalReps} · {phaseLabel}
                  </div>
                </>
              )}
            </div>
            <button onClick={memAdvance} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:MUTED,fontSize:11,fontWeight:600,cursor:"pointer"}}>
              Skip
            </button>
          </div>
        )}
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

          {revRecState==="done"&&!revEvaluating&&(
            <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
              <Check size={36} color="#16a34a" style={{display:"block",margin:"0 auto 10px"}}/>
              <div style={{fontSize:15,fontWeight:800,color:G,marginBottom:4}}>Recording Complete!</div>
              <div style={{fontSize:12,color:MUTED,marginBottom:14}}>{fmtSec(revRecTime)} recorded · {liveTranscript?`${liveTranscript.split(" ").length} words heard`:"tap evaluate"}</div>
              {revErr&&<div style={{fontSize:12,color:RED,marginBottom:10,background:REDLT,padding:"8px 12px",borderRadius:8}}>{revErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setRevRecState("idle");setLiveTranscript("");liveRef.current="";}} style={{flex:1,padding:"11px",borderRadius:11,border:`1px solid ${BORDER}`,background:"#fff",color:TEXT,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <RotateCcw size={13}/> Re-record
                </button>
                <button onClick={evaluateRevision} style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${GOLD},#b45309)`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
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
        {(revRecState==="idle"||revRecState==="recording")&&(
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
