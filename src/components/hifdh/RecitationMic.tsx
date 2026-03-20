/*
  RecitationMic.tsx — Hifdh Revision System v4
  
  Per-ayah flashcard + SM-2 spaced repetition.
  Record one ayah → transcribe → fuzzy score → auto-grade → schedule next.
  
  Scope: Surah / Juz / Page
  Low confidence → auto-fail (repeat tomorrow)
  Progress saved to hifdh_progress table in Supabase.
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, Square, ChevronLeft, BookOpen, Volume2,
  Star, Check, X, Minus, Brain, Zap, Trophy,
  RotateCcw, ChevronDown, Search, Eye
} from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ─── Types ───────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface AyahData  { number: number; numberInSurah: number; text: string; surahNum: number; surahName: string; surahEn: string; }
type Mode    = "hidden" | "prompted" | "listen";
type RecState = "idle" | "recording" | "transcribing" | "scored" | "autofail";
interface WordResult { word: string; ok: boolean; }
interface Card {
  ayah:       AyahData;
  dueDate:    string;   // YYYY-MM-DD
  interval:   number;   // days
  ef:         number;   // SM-2 ease factor (start 2.5)
  reps:       number;
  lastScore:  number;
}

/* ─── SM-2 Spaced Repetition ─────────────────────────────────
   quality: 3=easy(100%) 2=good(80%) 1=hard(50%) 0=miss/autofail(0%)
────────────────────────────────────────────────────────────── */
const sm2Next = (card: Card, q: 0|1|2|3): Partial<Card> => {
  const ef = Math.max(1.3, card.ef + 0.1 - (3-q)*(0.08 + (3-q)*0.02));
  const interval = q < 2 ? 1
    : card.reps === 0 ? 1
    : card.reps === 1 ? 3
    : Math.round(card.interval * ef);
  const due = new Date();
  due.setDate(due.getDate() + interval);
  return { ef, interval, reps: q>=2 ? card.reps+1 : 0, dueDate: due.toISOString().split("T")[0], lastScore: [0,50,80,100][q] };
};

/* ─── Arabic normalisation ────────────────────────────────── */
const nrm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
   .replace(/[\u0622\u0623\u0625\u0627\u0671-\u0677]/g,"ا")
   .replace(/\u0629/g,"ه").replace(/\u0649/g,"ي")
   .replace(/\u0640/g,"")
   .replace(/[\uFEF5-\uFEFC]/g,"لا")
   .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"")
   .replace(/\s+/g," ").trim();

/* ─── Fuzzy word match ────────────────────────────────────── */
const levDist = (a: string, b: string) => {
  if (Math.abs(a.length-b.length)>4) return 99;
  const dp = Array.from({length:a.length+1},(_,i)=>
    Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[a.length][b.length];
};
const wordOk = (spoken: string, ref: string) => {
  const s=nrm(spoken), r=nrm(ref);
  if (!s||!r) return false;
  if (s===r) return true;
  if (s.length>=3&&r.length>=3&&s.slice(0,3)===r.slice(0,3)) return true;
  if (s.length>=3&&(s.includes(r)||r.includes(s))) return true;
  return levDist(s,r)<=Math.max(1,Math.floor(Math.max(s.length,r.length)*0.30));
};

/* ─── Score full transcript vs ayah reference ─────────────── */
const scoreAyah = (transcript: string, reference: string): { score: number; words: WordResult[]; noSpeech: boolean } => {
  const refWords = reference.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).filter(Boolean);
  const tokRaw   = transcript.replace(/[^\u0600-\u06FF\s]/g," ").trim().split(/\s+/).filter(Boolean);

  // No Arabic detected → no speech
  if (tokRaw.length === 0) return { score: 0, words: refWords.map(w=>({word:w,ok:false})), noSpeech: true };

  const words: WordResult[] = [];
  let ti = 0;
  for (let ri = 0; ri < refWords.length; ri++) {
    let matched = false;
    for (let la=0; la<3 && ti+la<tokRaw.length; la++) {
      if (wordOk(tokRaw[ti+la], refWords[ri])) { words.push({word:refWords[ri],ok:true}); ti+=la+1; matched=true; break; }
    }
    if (!matched) words.push({word:refWords[ri],ok:false});
  }
  const score = Math.round(words.filter(w=>w.ok).length / Math.max(refWords.length,1) * 100);
  return { score, words, noSpeech: false };
};

/* ─── Audio helpers ───────────────────────────────────────── */
const getMime = () => {
  for(const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if(!t||MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const fmtSec = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ─── Colours ─────────────────────────────────────────────── */
const G   = "#064E3B";
const GM  = "#065f46";
const GLT = "#ecfdf5";
const GOLD = "#d97706";
const RED  = "#dc2626";
const BORDER = "#e5e7eb";
const MUTED  = "#6b7280";

/* ════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  type Screen = "home"|"scope"|"session"|"done";
  const [screen,     setScreen]     = useState<Screen>("home");
  const [mode,       setMode]       = useState<Mode>("hidden");
  const [surahs,     setSurahs]     = useState<SurahMeta[]>([]);
  const [search,     setSearch]     = useState("");
  const [scopeTab,   setScopeTab]   = useState<"surah"|"juz"|"page">("surah");
  const [pageInput,  setPageInput]  = useState("1");
  const [loading,    setLoading]    = useState(false);

  /* session */
  const [queue,      setQueue]      = useState<Card[]>([]);
  const [idx,        setIdx]        = useState(0);
  const [done,       setDone]       = useState<Card[]>([]);
  const [showRef,    setShowRef]    = useState(false);

  /* recording */
  const [recState,   setRecState]   = useState<RecState>("idle");
  const [recTime,    setRecTime]    = useState(0);
  const [audioBlob,  setAudioBlob]  = useState<Blob|null>(null);
  const [transcript, setTranscript] = useState("");
  const [wordRes,    setWordRes]    = useState<WordResult[]>([]);
  const [score,      setScore]      = useState(0);
  const [evalErr,    setEvalErr]    = useState("");
  const [playing,    setPlaying]    = useState(false);

  const mrRef    = useRef<MediaRecorder|null>(null);
  const chunks   = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const audioEl  = useRef<HTMLAudioElement|null>(null);

  /* load surah list */
  useEffect(()=>{
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json()).then(d=>{
      if(d.code===200) setSurahs(d.data);
    });
  },[]);

  /* ── Build deck ────────────────────────────────────────────── */
  const buildDeck = useCallback(async (rawAyahs: AyahData[]) => {
    setLoading(false);
    if (!rawAyahs.length) return;

    let existingMap: Record<string,any> = {};
    if (userId) {
      const nums = [...new Set(rawAyahs.map(a=>a.surahNum))];
      const {data} = await supabase.from("hifdh_progress")
        .select("surah_num,ayah_num,due_date,interval,ease_factor,reps,last_score")
        .eq("user_id",userId).in("surah_num",nums);
      (data||[]).forEach((r:any)=>{ existingMap[`${r.surah_num}_${r.ayah_num}`]=r; });
    }

    const today = new Date().toISOString().split("T")[0];
    const cards: Card[] = rawAyahs.map(a=>{
      const ex = existingMap[`${a.surahNum}_${a.numberInSurah}`];
      return {
        ayah:      a,
        dueDate:   ex?.due_date    ?? today,
        interval:  ex?.interval    ?? 0,
        ef:        ex?.ease_factor ?? 2.5,
        reps:      ex?.reps        ?? 0,
        lastScore: ex?.last_score  ?? 0,
      };
    });

    // Sort: due today first (overdue → fresh), then upcoming
    const due    = cards.filter(c=>c.dueDate<=today).slice(0,20);
    const notDue = cards.filter(c=>c.dueDate>today).slice(0,Math.max(0,20-due.length));
    const deck   = [...due, ...notDue];

    setQueue(deck); setIdx(0); setDone([]);
    setRecState("idle"); setAudioBlob(null); setTranscript(""); setWordRes([]); setScore(0);
    setShowRef(mode==="listen");
    setScreen("session");
  },[userId,mode]);

  /* ── Fetch helpers ─────────────────────────────────────────── */
  const fetchSurah = useCallback(async (surah: SurahMeta)=>{
    setLoading(true);
    const r=await fetch(`https://api.alquran.cloud/v1/surah/${surah.number}/ar.uthmani`);
    const d=await r.json();
    if(d.code!==200){setLoading(false);return;}
    await buildDeck(d.data.ayahs.map((a:any)=>({
      number:a.number, numberInSurah:a.numberInSurah, text:a.text,
      surahNum:surah.number, surahName:surah.name, surahEn:surah.englishName,
    })));
  },[buildDeck]);

  const fetchJuz = useCallback(async (juz: number)=>{
    setLoading(true);
    const r=await fetch(`https://api.alquran.cloud/v1/juz/${juz}/ar.uthmani`);
    const d=await r.json();
    if(d.code!==200){setLoading(false);return;}
    await buildDeck(d.data.ayahs.map((a:any)=>({
      number:a.number, numberInSurah:a.numberInSurah, text:a.text,
      surahNum:a.surah.number, surahName:a.surah.name, surahEn:a.surah.englishName,
    })));
  },[buildDeck]);

  const fetchPage = useCallback(async (pg: number)=>{
    if(pg<1||pg>604) return;
    setLoading(true);
    const r=await fetch(`https://api.alquran.cloud/v1/page/${pg}/ar.uthmani`);
    const d=await r.json();
    if(d.code!==200){setLoading(false);return;}
    await buildDeck(d.data.ayahs.map((a:any)=>({
      number:a.number, numberInSurah:a.numberInSurah, text:a.text,
      surahNum:a.surah.number, surahName:a.surah.name, surahEn:a.surah.englishName,
    })));
  },[buildDeck]);

  /* ── Play reference audio ─────────────────────────────────── */
  const toggleAudio = useCallback((ayahNumber: number)=>{
    if(!audioEl.current) audioEl.current=new Audio();
    if(playing){ audioEl.current.pause(); setPlaying(false); return; }
    audioEl.current.src=`https://cdn.islamic.network/quran/audio/64/ar.alafasy/${ayahNumber}.mp3`;
    audioEl.current.onended=()=>setPlaying(false);
    audioEl.current.onerror=()=>setPlaying(false);
    setPlaying(true);
    audioEl.current.play().catch(()=>setPlaying(false));
  },[playing]);

  /* ── Recording ─────────────────────────────────────────────── */
  const startRec = async ()=>{
    try{
      setEvalErr("");
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=getMime();
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      chunks.current=[];
      mr.ondataavailable=e=>{if(e.data?.size>0)chunks.current.push(e.data);};
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(timerRef.current!); setRecTime(0);
        const blob=new Blob(chunks.current,{type:mime||"audio/webm"});
        if(blob.size>0){setAudioBlob(blob);}
        else setRecState("idle");
      };
      mr.start(200); mrRef.current=mr; setRecState("recording");
      timerRef.current=setInterval(()=>setRecTime(t=>t+1),1000);
    }catch{ alert("Microphone access denied."); }
  };

  const stopRec=()=>{ mrRef.current?.stop(); };

  /* ── Auto-transcribe when blob ready ─────────────────────── */
  useEffect(()=>{
    if(!audioBlob) return;
    const card=queue[idx]; if(!card) return;
    setRecState("transcribing");

    (async()=>{
      try{
        let tx="";
        let noSpeechProb=0;

        /* PRIMARY: Deepgram */
        if(DEEPGRAM_KEY){
          try{
            const res=await fetch(
              "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&filler_words=false",
              {method:"POST",headers:{Authorization:`Token ${DEEPGRAM_KEY}`,"Content-Type":audioBlob.type||"audio/webm"},body:audioBlob}
            );
            if(res.ok){
              const dg=await res.json();
              tx=dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";
              // Deepgram speech_final confidence heuristic
              const words=dg?.results?.channels?.[0]?.alternatives?.[0]?.words||[];
              if(words.length===0&&tx.length===0) noSpeechProb=1;
            }
          }catch(e:any){console.warn("DG:",e.message);}
        }

        /* FALLBACK: Groq whisper-large-v3 */
        if(!tx&&GROQ_KEY){
          const ext=audioBlob.type.includes("mp4")?"mp4":audioBlob.type.includes("ogg")?"ogg":"webm";
          const fd=new FormData();
          fd.append("file",new File([audioBlob],`a.${ext}`,{type:audioBlob.type}));
          fd.append("model","whisper-large-v3");
          fd.append("language","ar");
          fd.append("response_format","verbose_json");
          fd.append("temperature","0");
          fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين");
          const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
            {method:"POST",headers:{Authorization:`Bearer ${GROQ_KEY}`},body:fd});
          if(r.ok){
            const data=await r.json();
            const segs=data.segments||[];
            const goodSegs=segs.filter((s:any)=>(s.no_speech_prob??0)<0.6);
            if(segs.length>0&&goodSegs.length===0) noSpeechProb=1; // all silence
            tx=goodSegs.length>0?goodSegs.map((s:any)=>s.text).join(" ").trim():data.text||"";
          }
        }

        // Auto-fail: silence / no speech detected
        if(noSpeechProb>=0.8||(!tx&&!DEEPGRAM_KEY&&!GROQ_KEY)){
          setRecState("autofail");
          return;
        }

        setTranscript(tx);
        const result=scoreAyah(tx,card.ayah.text);

        // Auto-fail: score below 30% or no Arabic in transcript
        if(result.noSpeech||result.score<30){
          setScore(result.score);
          setWordRes(result.words);
          setRecState("autofail");
          return;
        }

        setScore(result.score);
        setWordRes(result.words);
        setRecState("scored");

      }catch(e:any){
        setEvalErr(e.message||"Transcription error");
        setRecState("idle");
      }
    })();
  },[audioBlob,idx,queue]);

  /* ── Grade & save ─────────────────────────────────────────── */
  const gradeAndAdvance = useCallback(async (q: 0|1|2|3)=>{
    const card=queue[idx]; if(!card) return;
    const updates=sm2Next(card,q);
    const updated:Card={...card,...updates};

    if(userId){
      await supabase.from("hifdh_progress").upsert({
        user_id:      userId,
        surah_num:    card.ayah.surahNum,
        surah_name:   card.ayah.surahEn,
        ayah_num:     card.ayah.numberInSurah,
        due_date:     updates.dueDate,
        interval:     updates.interval,
        ease_factor:  updates.ef,
        reps:         updates.reps,
        last_score:   updates.lastScore,
        last_reviewed:new Date().toISOString(),
        best_accuracy:Math.max(card.lastScore,updates.lastScore??0),
        times_reviewed:(card.reps??0)+1,
      },{onConflict:"user_id,surah_num,ayah_num"});
    }

    setDone(prev=>[...prev,updated]);
    const next=idx+1;
    if(next>=queue.length){ setScreen("done"); return; }
    setIdx(next);
    setAudioBlob(null); setTranscript(""); setWordRes([]); setScore(0);
    setRecState("idle"); setEvalErr(""); setPlaying(false);
    audioEl.current?.pause();
    setShowRef(mode==="listen");
  },[idx,queue,userId,mode]);

  /* ── Retry current ayah ─────────────────────────────────── */
  const retry=()=>{
    setAudioBlob(null); setTranscript(""); setWordRes([]); setScore(0);
    setRecState("idle"); setEvalErr("");
  };

  /* ── Derived ─────────────────────────────────────────────── */
  const card        = queue[idx];
  const pct         = queue.length>0?Math.round((idx/queue.length)*100):0;
  const avgScore    = done.length>0?Math.round(done.reduce((s,c)=>s+(c.lastScore??0),0)/done.length):0;
  const filteredS   = surahs.filter(s=>s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  /* ─── Helper: score colour ──── */
  const scoreCol=(s:number)=>s>=80?"#16a34a":s>=50?"#d97706":"#dc2626";

  /* ─── Helper: grade button ──── */
  const GradeBtn=({label,color,icon:Icon,q,hint}:{label:string;color:string;icon:any;q:0|1|2|3;hint:string})=>(
    <button onClick={()=>gradeAndAdvance(q)} title={hint} style={{
      flex:1,padding:"11px 6px",borderRadius:12,border:`2px solid ${color}22`,
      background:`${color}10`,cursor:"pointer",display:"flex",flexDirection:"column",
      alignItems:"center",gap:4,transition:"all .15s",
    }}>
      <Icon size={18} color={color}/>
      <span style={{fontSize:11,fontWeight:700,color}}>{label}</span>
    </button>
  );

  /* ════════════════════════════════════════════════════════════
     SCREENS
  ════════════════════════════════════════════════════════════ */

  /* ── HOME ─────────────────────────────────────────────────── */
  if(screen==="home") return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
      <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"36px 20px 28px",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:10}}>📖</div>
        <h1 style={{fontSize:24,fontWeight:900,color:"#fff",margin:"0 0 6px"}}>Hifdh Revision</h1>
        <p style={{fontSize:13,color:"rgba(255,255,255,.65)",margin:0,fontFamily:"'Amiri',serif",direction:"rtl"}}>
          مراجعة وتثبيت الحفظ — آية بآية
        </p>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
        {/* Mode */}
        <div>
          <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px"}}>Mode</p>
          <div style={{display:"flex",gap:8}}>
            {([
              {m:"hidden"  as Mode,label:"Memorise",sub:"Full hide",icon:"🧠"},
              {m:"prompted"as Mode,label:"Prompted", sub:"1st word", icon:"💡"},
              {m:"listen"  as Mode,label:"Listen",   sub:"Hear first",icon:"🔊"},
            ]).map(x=>(
              <button key={x.m} onClick={()=>setMode(x.m)} style={{
                flex:1,padding:"12px 6px",borderRadius:12,cursor:"pointer",textAlign:"center",
                border:`2px solid ${mode===x.m?G:BORDER}`,
                background:mode===x.m?"#ecfdf5":"#fff",transition:"all .15s",
              }}>
                <div style={{fontSize:22,marginBottom:4}}>{x.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:mode===x.m?G:"#374151"}}>{x.label}</div>
                <div style={{fontSize:10,color:MUTED}}>{x.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div style={{background:"#fff",border:`1px solid ${BORDER}`,borderRadius:14,padding:14}}>
          <p style={{fontSize:12,fontWeight:700,color:G,margin:"0 0 10px"}}>How it works</p>
          {[
            ["🎴","Flashcard per ayah","See the ayah (or hide it based on mode)"],
            ["🎙️","Record one ayah","Recite it — AI transcribes instantly"],
            ["🎯","Auto-scored","See exactly which words matched"],
            ["🔁","Spaced repetition","Weak ayahs come back sooner"],
          ].map(([icon,title,desc],i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:i<3?8:0}}>
              <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#374151"}}>{title}</div>
                <div style={{fontSize:11,color:MUTED}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={()=>setScreen("scope")} style={{
          width:"100%",padding:"15px",borderRadius:14,border:"none",
          background:`linear-gradient(135deg,${G},${GM})`,
          color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",
        }}>
          Start Session →
        </button>
      </div>
    </div>
  );

  /* ── SCOPE PICKER ─────────────────────────────────────────── */
  if(screen==="scope") return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${G},${GM})`,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <button onClick={()=>setScreen("home")} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}>
          <ChevronLeft size={18}/>
        </button>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>Choose What to Revise</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>Mode: {mode.charAt(0).toUpperCase()+mode.slice(1)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${BORDER}`,background:"#fff",flexShrink:0}}>
        {(["surah","juz","page"] as const).map(t=>(
          <button key={t} onClick={()=>setScopeTab(t)} style={{
            flex:1,padding:"12px 4px",border:"none",background:"none",
            fontSize:13,fontWeight:600,cursor:"pointer",
            color:scopeTab===t?G:MUTED,
            borderBottom:`2px solid ${scopeTab===t?G:"transparent"}`,
            transition:"all .15s",
          }}>
            {{surah:"📚 Surah",juz:"🗂️ Juz",page:"📄 Page"}[t]}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 32px"}}>

        {/* SURAH TAB */}
        {scopeTab==="surah"&&(
          <>
            <div style={{position:"sticky",top:0,background:"#fdfaf4",paddingBottom:8,zIndex:2}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 12px"}}>
                <Search size={14} color={MUTED}/>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search surah…"
                  style={{border:"none",outline:"none",flex:1,fontSize:13,color:"#111",background:"transparent"}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {filteredS.map(s=>(
                <button key={s.number} onClick={()=>fetchSurah(s)} disabled={loading} style={{
                  background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,
                  padding:"12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,
                  textAlign:"left",transition:"all .15s",opacity:loading?.6:1,
                }}>
                  <div style={{width:30,height:30,borderRadius:8,background:"#fffbeb",border:"1px solid #fcd34d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:GOLD,flexShrink:0}}>
                    {s.number}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.englishName}</div>
                    <div style={{fontSize:12,fontFamily:"'Amiri',serif",color:MUTED}}>{s.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* JUZ TAB */}
        {scopeTab==="juz"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {Array.from({length:30},(_,i)=>i+1).map(j=>(
              <button key={j} onClick={()=>fetchJuz(j)} disabled={loading} style={{
                background:"#fff",border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px 8px",
                cursor:"pointer",textAlign:"center",opacity:loading?.6:1,transition:"all .15s",
              }}>
                <div style={{fontSize:22,fontWeight:900,color:G}}>Juz</div>
                <div style={{fontSize:28,fontWeight:900,color:GOLD}}>{j}</div>
              </button>
            ))}
          </div>
        )}

        {/* PAGE TAB */}
        {scopeTab==="page"&&(
          <div>
            <p style={{fontSize:13,color:MUTED,marginBottom:14}}>Standard Madinah Mushaf — 604 pages</p>
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              <input type="number" min={1} max={604} value={pageInput}
                onChange={e=>setPageInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&fetchPage(parseInt(pageInput))}
                style={{flex:1,padding:"11px 14px",borderRadius:10,border:`2px solid ${BORDER}`,fontSize:15,fontWeight:700,color:"#111",outline:"none"}}
                placeholder="Page number 1–604"
              />
              <button onClick={()=>fetchPage(parseInt(pageInput))} disabled={loading} style={{
                padding:"11px 20px",borderRadius:10,border:"none",
                background:`linear-gradient(135deg,${G},${GM})`,
                color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
              }}>
                Go
              </button>
            </div>
            <div>
              <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Quick jump</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {[{l:"Juz Amma (p.582)",p:582},{l:"Al-Mulk (p.562)",p:562},{l:"Yasin (p.440)",p:440},{l:"Al-Kahf (p.293)",p:293},{l:"Al-Fatiha (p.1)",p:1},{l:"Baqarah (p.2)",p:2}].map(q=>(
                  <button key={q.p} onClick={()=>{setPageInput(String(q.p));fetchPage(q.p);}} disabled={loading} style={{padding:"7px 12px",borderRadius:20,border:`1px solid ${BORDER}`,background:"#fff",color:G,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    {q.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading&&(
          <div style={{textAlign:"center",padding:"32px 0",color:MUTED,fontSize:13}}>
            <div style={{width:28,height:28,border:`3px solid ${BORDER}`,borderTopColor:G,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>
            Loading ayahs…
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── SESSION ─────────────────────────────────────────────── */
  if(screen==="session"&&card) return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes wave{from{transform:scaleY(.3)}to{transform:scaleY(1.5)}}
        @keyframes pop{0%{transform:scale(.95);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
      `}</style>

      {/* Header */}
      <div style={{flexShrink:0,background:`linear-gradient(135deg,${G},${GM})`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>{audioEl.current?.pause();setScreen("scope");}} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,padding:8,color:"#fff",cursor:"pointer",display:"flex"}}>
          <ChevronLeft size={18}/>
        </button>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>
            {card.ayah.surahEn} · Ayah {card.ayah.numberInSurah}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>
            {idx+1} / {queue.length} · {pct}% done
            {card.reps>0&&<span style={{marginLeft:8}}>🔁 {card.reps} reviews</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {avgScore>0&&<span style={{fontSize:11,color:GOLD,fontWeight:700}}>{avgScore}%</span>}
          {card.dueDate<new Date().toISOString().split("T")[0]&&(
            <span style={{fontSize:10,background:"rgba(220,38,38,.2)",color:"#fca5a5",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
              Overdue
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{height:3,background:"rgba(0,0,0,.08)",flexShrink:0}}>
        <div style={{width:`${pct}%`,height:"100%",background:"#4ade80",transition:"width .4s"}}/>
      </div>

      {/* Scroll area */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px 24px",display:"flex",flexDirection:"column",gap:12}}>

        {/* AYAH CARD ─────────────────────────────────────────── */}
        <div style={{background:"#fff",borderRadius:16,border:`1px solid ${BORDER}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>

          {/* Card header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#fffbeb",borderBottom:`1px solid #fde68a`}}>
            <div style={{fontSize:12,fontWeight:700,color:G}}>
              <span style={{fontFamily:"'Amiri',serif"}}>{card.ayah.surahName}</span>
              <span style={{color:MUTED,marginLeft:6}}>{card.ayah.surahEn}</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              {/* Audio button */}
              <button onClick={()=>toggleAudio(card.ayah.number)} style={{
                display:"flex",alignItems:"center",gap:5,padding:"5px 10px",
                borderRadius:20,border:`1px solid ${playing?"#059669":BORDER}`,
                background:playing?"#ecfdf5":"#fff",cursor:"pointer",fontSize:11,fontWeight:600,
                color:playing?"#059669":MUTED,
              }}>
                <Volume2 size={13}/> {playing?"Stop":"Listen"}
              </button>
              {/* Show/hide text */}
              <button onClick={()=>setShowRef(v=>!v)} style={{
                display:"flex",alignItems:"center",gap:5,padding:"5px 10px",
                borderRadius:20,border:`1px solid ${BORDER}`,
                background:"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:MUTED,
              }}>
                <Eye size={13}/> {showRef?"Hide":"Show"}
              </button>
            </div>
          </div>

          {/* Ayah text */}
          <div style={{padding:"20px 16px 18px",minHeight:100}}>
            {/* HIDDEN mode: show blurred unless revealed */}
            {mode==="hidden"&&!showRef&&recState==="idle"&&(
              <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:26,lineHeight:3,textAlign:"right",filter:"blur(6px)",userSelect:"none",color:G,opacity:.7}}>
                {card.ayah.text.replace(/﴿[^﴾]*﴾/g,"")}
                <span style={{color:GOLD,fontSize:18,margin:"0 5px"}}>﴿{card.ayah.numberInSurah}﴾</span>
              </div>
            )}

            {/* PROMPTED mode: show only first word */}
            {mode==="prompted"&&!showRef&&recState==="idle"&&(
              <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:26,lineHeight:3,textAlign:"right"}}>
                <span style={{color:G}}>
                  {card.ayah.text.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/)[0]}
                </span>
                <span style={{color:"#d1d5db",filter:"blur(4px)",userSelect:"none"}}>
                  {" "}{card.ayah.text.replace(/﴿[^﴾]*﴾/g,"").trim().split(/\s+/).slice(1).join(" ")}
                </span>
                <span style={{color:GOLD,fontSize:18,margin:"0 5px"}}>﴿{card.ayah.numberInSurah}﴾</span>
              </div>
            )}

            {/* LISTEN mode or revealed: show full text */}
            {(mode==="listen"||showRef||recState!=="idle")&&(
              <>
                {/* If scored: show word-by-word result */}
                {(recState==="scored"||recState==="autofail")&&wordRes.length>0?(
                  <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:26,lineHeight:3,textAlign:"right"}}>
                    {wordRes.map((w,i)=>(
                      <span key={i} style={{
                        display:"inline-block",margin:"0 2px",
                        color:w.ok?"#16a34a":RED,
                        background:w.ok?"transparent":`${RED}12`,
                        borderRadius:w.ok?0:4,
                        padding:w.ok?0:"0 3px",
                        borderBottom:w.ok?"none":`2px solid ${RED}`,
                        transition:"all .2s",
                      }}>
                        {w.word}
                      </span>
                    ))}
                    <span style={{color:GOLD,fontSize:18,margin:"0 5px"}}>﴿{card.ayah.numberInSurah}﴾</span>
                  </div>
                ):(
                  <div style={{direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",fontSize:26,lineHeight:3,textAlign:"right",color:G}}>
                    {card.ayah.text.replace(/﴿[^﴾]*﴾/g,"")}
                    <span style={{color:GOLD,fontSize:18,margin:"0 5px"}}>﴿{card.ayah.numberInSurah}﴾</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Score bar (after scoring) */}
          {(recState==="scored"||recState==="autofail")&&(
            <div style={{padding:"0 14px 14px",animation:"pop .3s ease"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:12,fontWeight:700,color:MUTED}}>Match score</span>
                <span style={{fontSize:14,fontWeight:800,color:scoreCol(score)}}>{score}%</span>
              </div>
              <div style={{height:6,background:"#f3f4f6",borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${score}%`,height:"100%",background:scoreCol(score),borderRadius:3,transition:"width .5s"}}/>
              </div>
              {transcript&&(
                <div style={{marginTop:8,padding:"8px 10px",background:"#f9fafb",borderRadius:8,border:`1px solid ${BORDER}`}}>
                  <div style={{fontSize:10,color:MUTED,marginBottom:3}}>Heard:</div>
                  <div style={{fontSize:13,direction:"rtl",textAlign:"right",fontFamily:"'Amiri',serif",color:"#374151",lineHeight:1.8}}>
                    {transcript}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── AUTOFAIL STATE ──────────────────────────────────── */}
        {recState==="autofail"&&(
          <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:14,padding:"16px",textAlign:"center",animation:"shake .4s ease"}}>
            <div style={{fontSize:28,marginBottom:8}}>❌</div>
            <div style={{fontSize:14,fontWeight:800,color:RED,marginBottom:4}}>
              {score<30&&transcript?"Score too low — keep practising":"No speech detected"}
            </div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:14}}>
              This ayah will come back tomorrow for revision.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={retry} style={{padding:"9px 18px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:"#374151",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                <RotateCcw size={13}/> Try Again
              </button>
              <button onClick={()=>gradeAndAdvance(0)} style={{padding:"9px 18px",borderRadius:10,border:"none",background:RED,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Next Ayah →
              </button>
            </div>
          </div>
        )}

        {/* ── SCORED STATE: grade buttons ────────────────────── */}
        {recState==="scored"&&(
          <div style={{animation:"pop .3s ease"}}>
            <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px"}}>How did it feel?</p>
            <div style={{display:"flex",gap:8}}>
              <GradeBtn label="Missed"  color={RED}      icon={X}     q={0} hint="Did not recall"/>
              <GradeBtn label="Hard"    color="#d97706"  icon={Minus} q={1} hint="Had errors"/>
              <GradeBtn label="Good"    color="#2563eb"  icon={Check} q={2} hint="Mostly correct"/>
              <GradeBtn label="Easy"    color="#16a34a"  icon={Star}  q={3} hint="Perfect recall"/>
            </div>
            <p style={{fontSize:10,color:MUTED,textAlign:"center",marginTop:6}}>
              Your grade schedules when this ayah returns
            </p>
          </div>
        )}

        {/* ── TRANSCRIBING ───────────────────────────────────── */}
        {recState==="transcribing"&&(
          <div style={{textAlign:"center",padding:"20px",background:"#fff",borderRadius:14,border:`1px solid ${BORDER}`}}>
            <div style={{width:32,height:32,border:`3px solid ${BORDER}`,borderTopColor:G,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>
            <div style={{fontSize:13,fontWeight:700,color:G}}>Transcribing your recitation…</div>
            <div style={{fontSize:11,color:MUTED,marginTop:4}}>Usually 2–4 seconds</div>
          </div>
        )}

        {evalErr&&(
          <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",fontSize:12,color:RED}}>
            ⚠️ {evalErr} — <button onClick={retry} style={{background:"none",border:"none",color:RED,cursor:"pointer",fontWeight:700,fontSize:12}}>Retry</button>
          </div>
        )}
      </div>

      {/* ── MIC BAR (fixed bottom) ───────────────────────────── */}
      {(recState==="idle"||recState==="recording")&&(
        <div style={{flexShrink:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${BORDER}`,padding:"14px 16px 22px",display:"flex",alignItems:"center",gap:14}}>
          {/* Big mic button */}
          <button onClick={recState==="idle"?startRec:stopRec} style={{
            width:60,height:60,borderRadius:"50%",border:"none",cursor:"pointer",
            background:recState==="recording"?RED:G,
            boxShadow:recState==="recording"?`0 0 0 4px ${RED}44,0 0 0 8px ${RED}14`:`0 4px 16px rgba(6,79,58,.3)`,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            transition:"all .2s",
          }}>
            {recState==="recording"?<Square size={22} fill="#fff" color="#fff"/>:<Mic size={22} color="#fff"/>}
          </button>

          <div style={{flex:1}}>
            {recState==="recording"?(
              <>
                <div style={{display:"flex",alignItems:"center",gap:3,height:22,marginBottom:4}}>
                  {[4,9,6,16,8,13,5,11,18,7,14,5,10].map((h,i)=>(
                    <div key={i} style={{width:3,height:h,borderRadius:2,background:"#dc2626",opacity:.8,animation:`wave .8s ease-in-out ${i*.07}s infinite alternate`}}/>
                  ))}
                  <span style={{fontSize:14,fontWeight:800,color:RED,marginLeft:8}}>{fmtSec(recTime)}</span>
                </div>
                <div style={{fontSize:11,color:MUTED}}>Recording… tap stop when done</div>
              </>
            ):(
              <>
                <div style={{fontSize:13,fontWeight:700,color:G,marginBottom:2}}>
                  {mode==="listen"?"Listen first, then tap to recite":"Tap mic and recite the ayah"}
                </div>
                <div style={{fontSize:11,color:MUTED}}>
                  Recite ayah {card.ayah.numberInSurah} of {card.ayah.surahEn}
                </div>
              </>
            )}
          </div>

          {/* Skip */}
          <button onClick={()=>gradeAndAdvance(0)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:MUTED,fontSize:12,fontWeight:600,cursor:"pointer"}}>
            Skip
          </button>
        </div>
      )}
    </div>
  );

  /* ── DONE SCREEN ─────────────────────────────────────────── */
  if(screen==="done") return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:"#fdfaf4",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{`@keyframes pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{background:"#fff",borderRadius:20,border:`1px solid ${BORDER}`,padding:28,width:"100%",maxWidth:380,textAlign:"center",animation:"pop .4s ease",boxShadow:"0 8px 40px rgba(0,0,0,.08)"}}>
        <div style={{fontSize:52,marginBottom:12}}>🏆</div>
        <h2 style={{fontSize:22,fontWeight:900,color:G,margin:"0 0 4px"}}>Session Complete!</h2>
        <p style={{fontSize:13,color:MUTED,marginBottom:20}}>أحسنت — Well done!</p>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
          {[
            {l:"Easy",   v:done.filter(c=>c.lastScore===100).length, c:"#16a34a"},
            {l:"Good",   v:done.filter(c=>c.lastScore===80).length,  c:"#2563eb"},
            {l:"Hard",   v:done.filter(c=>c.lastScore===50).length,  c:"#d97706"},
            {l:"Missed", v:done.filter(c=>c.lastScore===0).length,   c:RED},
          ].map((x,i)=>(
            <div key={i} style={{background:"#f9fafb",borderRadius:10,padding:"10px 6px",border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:20,fontWeight:900,color:x.c}}>{x.v}</div>
              <div style={{fontSize:10,color:MUTED}}>{x.l}</div>
            </div>
          ))}
        </div>

        <div style={{background:"#ecfdf5",borderRadius:12,padding:"12px 14px",border:"1px solid #86efac",marginBottom:20,textAlign:"left"}}>
          <div style={{fontSize:12,fontWeight:700,color:G,marginBottom:6}}>Spaced Repetition Schedule</div>
          {done.slice(0,5).map((c,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#374151",marginBottom:i<Math.min(done.length-1,4)?5:0}}>
              <span style={{fontFamily:"'Amiri',serif"}}>{c.ayah.surahEn} {c.ayah.numberInSurah}</span>
              <span style={{color:MUTED}}>Next: {c.dueDate}</span>
            </div>
          ))}
          {done.length>5&&<div style={{fontSize:10,color:MUTED,marginTop:4}}>+{done.length-5} more scheduled</div>}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>{setScreen("scope");setDone([]);setQueue([]);}} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>
            📖 New Session
          </button>
          <button onClick={()=>setScreen("home")} style={{width:"100%",padding:13,borderRadius:12,border:`1px solid ${BORDER}`,background:"#fff",color:"#374151",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            Home
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}
