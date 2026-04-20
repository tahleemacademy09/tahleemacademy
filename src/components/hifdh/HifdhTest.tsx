// src/components/hifdh/HifdhTest.tsx
// Full-surah test: all question types (MCQ + audio recitation), all ayahs covered, all questions mandatory
// Voice recording for each answer, AI evaluation, previous ayah audio prompt
import { useState, useCallback, useEffect, useRef } from "react";
import { SURAHS, audioUrl, DEFAULT_RECITER } from "./surahData";
import { supabase } from "@/integrations/supabase/client";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

interface Ayah { numberInSurah: number; text: string; }
interface Props { reciter?: string; }

const DEEPGRAM_KEY = (import.meta as any).env?.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = (import.meta as any).env?.VITE_GROQ_API_KEY || "";

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function getMime() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

function norm(t: string) {
  return t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"").replace(/[\u0622\u0623\u0625\u0627]/g,"\u0627")
    .replace(/\u0629/g,"\u0647").replace(/\u0649/g,"\u064A").replace(/\u0640/g,"")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"").replace(/\s+/g," ").trim();
}

function scoreAudio(tx: string, ref: string): number {
  const rw = norm(ref).split(" ").filter(Boolean);
  const tw = norm(tx).split(" ").filter(Boolean);
  if (!rw.length || !tw.length) return 0;
  let m = 0;
  for (const r of rw) {
    if (tw.some(t => t === r || (r.length >= 3 && t.length >= 3 && r.slice(0,3) === t.slice(0,3)))) m++;
  }
  return Math.round((m / rw.length) * 100);
}

type Difficulty = "easy" | "medium" | "hard";
type QType = "next_verse" | "missing_word" | "identify_verse" | "recite_next" | "recite_from_audio";

interface Question {
  id: number;
  type: QType;
  prompt: string;
  promptLabel: string;
  promptAyahNum: number;
  prevAyahNum: number | null; // for audio-cue questions
  options: string[];
  correct: number;
  correctText: string;
  ayahNum: number;
}

function buildQuestions(ayahs: Ayah[], surahName: string): Question[] {
  if (ayahs.length < 3) return [];
  const qs: Question[] = [];
  let id = 0;

  // ── MCQ: next verse (covers spread of ayahs) ─────────────────────────────
  const usedNV = new Set<number>();
  const nvTarget = Math.min(5, ayahs.length - 1);
  // evenly spaced picks across the surah
  const nvStep = Math.max(1, Math.floor(ayahs.length / nvTarget));
  for (let i = 0; i < ayahs.length - 1 && qs.filter(q=>q.type==="next_verse").length < nvTarget; i += nvStep) {
    if (usedNV.has(i)) continue; usedNV.add(i);
    const correct = ayahs[i + 1];
    const wrongs  = shuffle(ayahs.filter((_,j)=>j!==i+1)).slice(0,3);
    const opts    = shuffle([correct, ...wrongs]);
    qs.push({ id:id++, type:"next_verse", ayahNum:ayahs[i].numberInSurah, prevAyahNum:null,
      prompt:ayahs[i].text, promptLabel:`${surahName} · Verse ${ayahs[i].numberInSurah}`,
      promptAyahNum:ayahs[i].numberInSurah,
      options:opts.map(o=>o.text), correct:opts.indexOf(correct), correctText:correct.text });
  }

  // ── MCQ: missing word ─────────────────────────────────────────────────────
  const mwTarget = Math.min(4, ayahs.length);
  const mwStep   = Math.max(1, Math.floor(ayahs.length / mwTarget));
  for (let i = 0; i < ayahs.length && qs.filter(q=>q.type==="missing_word").length < mwTarget; i += mwStep) {
    const ayah = ayahs[i];
    const words = ayah.text.split(" ");
    if (words.length < 4) continue;
    const bi = 1 + Math.floor(Math.random()*(words.length-2));
    const cw = words[bi];
    const blanked = words.map((w,j)=>j===bi?"____":w).join(" ");
    const allW = ayahs.flatMap(a=>a.text.split(" ")).filter(w=>w!==cw&&w.length>2);
    const wrongs = shuffle([...new Set(allW)]).slice(0,3);
    if (wrongs.length < 3) continue;
    const opts = shuffle([cw,...wrongs]);
    qs.push({ id:id++, type:"missing_word", ayahNum:ayah.numberInSurah, prevAyahNum:null,
      prompt:blanked, promptLabel:`Complete Verse ${ayah.numberInSurah}`,
      promptAyahNum:ayah.numberInSurah,
      options:opts, correct:opts.indexOf(cw), correctText:cw });
  }

  // ── MCQ: identify verse number ────────────────────────────────────────────
  const ivTarget = Math.min(3, ayahs.length);
  const ivStep   = Math.max(1, Math.floor(ayahs.length / ivTarget));
  for (let i = 0; i < ayahs.length && qs.filter(q=>q.type==="identify_verse").length < ivTarget; i += ivStep) {
    const ayah = ayahs[i];
    const cl  = `Verse ${ayah.numberInSurah}`;
    const wn  = shuffle(ayahs.map(a=>a.numberInSurah).filter(n=>n!==ayah.numberInSurah)).slice(0,3);
    const wl  = wn.map(n=>`Verse ${n}`);
    const opts = shuffle([cl,...wl]);
    qs.push({ id:id++, type:"identify_verse", ayahNum:ayah.numberInSurah, prevAyahNum:null,
      prompt:ayah.text, promptLabel:`Which verse number in ${surahName}?`,
      promptAyahNum:ayah.numberInSurah,
      options:opts, correct:opts.indexOf(cl), correctText:cl });
  }

  // ── Audio: recite next verse (spread across surah) ────────────────────────
  const rnTarget = Math.min(4, ayahs.length - 1);
  const rnStep   = Math.max(1, Math.floor(ayahs.length / rnTarget));
  for (let i = 0; i < ayahs.length - 1 && qs.filter(q=>q.type==="recite_next").length < rnTarget; i += rnStep) {
    qs.push({
      id:id++, type:"recite_next", ayahNum:ayahs[i+1].numberInSurah,
      prevAyahNum: ayahs[i].numberInSurah,
      prompt: ayahs[i].text,
      promptLabel: `${surahName} · After Verse ${ayahs[i].numberInSurah}`,
      promptAyahNum: ayahs[i].numberInSurah,
      options:[], correct:-1, correctText:ayahs[i+1].text
    });
  }

  // ── Audio: listen & recite from audio cue ─────────────────────────────────
  const raTarget = Math.min(3, ayahs.length - 1);
  const raStep   = Math.max(1, Math.floor(ayahs.length / raTarget));
  const raStart  = Math.floor(ayahs.length / 2); // start from second half for variety
  for (let i = raStart; i < ayahs.length - 1 && qs.filter(q=>q.type==="recite_from_audio").length < raTarget; i += raStep) {
    qs.push({
      id:id++, type:"recite_from_audio", ayahNum:ayahs[i+1].numberInSurah,
      prevAyahNum: ayahs[i].numberInSurah,
      prompt: "🔊 Listen to the previous verse, then recite the next one",
      promptLabel: `${surahName} · After Verse ${ayahs[i].numberInSurah}`,
      promptAyahNum: ayahs[i].numberInSurah,
      options:[], correct:-1, correctText:ayahs[i+1].text
    });
  }

  return shuffle(qs);
}

const QTYPE_META: Record<QType, { icon: string; label: string; isAudio: boolean }> = {
  next_verse:       { icon:"➡️", label:"What comes next?",      isAudio:false },
  missing_word:     { icon:"🔍", label:"Missing word",           isAudio:false },
  identify_verse:   { icon:"🔢", label:"Verse number",           isAudio:false },
  recite_next:      { icon:"🎙", label:"Recite the next verse",  isAudio:true  },
  recite_from_audio:{ icon:"🔊", label:"Listen & Recite",        isAudio:true  },
};

const DIFF_META: Record<Difficulty,{label:string;labelAr:string;icon:string;color:string;bg:string;desc:string}> = {
  easy:   { label:"Easy",   labelAr:"سهل",   icon:"🌱",color:"#16a34a",bg:"#f0fff4",desc:"MCQ only — select the correct answer"                    },
  medium: { label:"Medium", labelAr:"متوسط",icon:"⭐",color:GOLD,      bg:"#fffbeb",desc:"MCQ + voice recitation of next verse"                    },
  hard:   { label:"Hard",   labelAr:"صعب",   icon:"🔥",color:"#dc2626",bg:"#fff5f5",desc:"Audio-only — listen to cue, recite from memory"          },
};

function getGrade(pct:number){
  if(pct>=90)return{letter:"A+",color:"#22c55e",label:"Excellent · ممتاز"};
  if(pct>=80)return{letter:"A", color:"#16a34a",label:"Very Good · جيد جداً"};
  if(pct>=70)return{letter:"B", color:"#2563eb",label:"Good · جيد"};
  if(pct>=60)return{letter:"C", color:GOLD,     label:"Satisfactory · مقبول"};
  if(pct>=50)return{letter:"D", color:"#ea580c",label:"Pass · ناجح"};
  return           {letter:"F", color:"#ef4444",label:"Fail · راسب"};
}

export default function HifdhTest({ reciter = DEFAULT_RECITER }: Props) {
  const [surahNum, setSurahNum]     = useState(114);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [loading, setLoading]       = useState(false);
  const [fetchErr, setFetchErr]     = useState("");
  const [buildErr, setBuildErr]     = useState("");

  const [started, setStarted]       = useState(false);
  const [finished, setFinished]     = useState(false);
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [qIdx, setQIdx]             = useState(0);
  const [answers, setAnswers]       = useState<(number|null)[]>([]);
  const [audioScores, setAudioScores] = useState<(number|null)[]>([]);
  const [selected, setSelected]     = useState<number|null>(null);
  const [confirmed, setConfirmed]   = useState(false);
  const [timeLeft, setTimeLeft]     = useState(0);
  const [timerOn, setTimerOn]       = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);

  // Audio recording
  const [micState, setMicState]     = useState<"idle"|"recording"|"evaluating"|"done">("idle");
  const [audioResult, setAudioResult] = useState<{score:number;tx:string}|null>(null);

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout>>();
  const questionsRef  = useRef<Question[]>([]);
  const answersRef    = useRef<(number|null)[]>([]);
  const audioScoresRef= useRef<(number|null)[]>([]);
  const mrRef         = useRef<MediaRecorder|null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const surah         = SURAHS[surahNum - 1];

  useEffect(()=>{ questionsRef.current=questions; },[questions]);
  useEffect(()=>{ answersRef.current=answers; },[answers]);
  useEffect(()=>{ audioScoresRef.current=audioScores; },[audioScores]);

  const fetchAyahs = useCallback(async()=>{
    setLoading(true); setFetchErr("");
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`);
      const j = await r.json();
      if(j.code===200) setAyahs(j.data.ayahs);
      else setFetchErr("Failed to load — retry.");
    } catch { setFetchErr("Network error."); }
    setLoading(false);
  },[surahNum]);

  useEffect(()=>{ fetchAyahs(); },[fetchAyahs]);
  useEffect(()=>()=>{ audioRef.current?.pause(); clearTimeout(timerRef.current); mrRef.current?.stop(); },[]);

  useEffect(()=>{
    if(!timerOn||timeLeft<=0){ clearTimeout(timerRef.current); return; }
    timerRef.current=setTimeout(()=>setTimeLeft(t=>t-1),1000);
    return()=>clearTimeout(timerRef.current);
  },[timerOn,timeLeft]);

  useEffect(()=>{
    if(timerOn&&timeLeft===0&&started&&!finished) doFinish();
  });

  const stopAudio=()=>{ audioRef.current?.pause(); audioRef.current=null; setIsPlaying(false); };

  const doFinish=useCallback(()=>{
    clearTimeout(timerRef.current); setTimerOn(false); setFinished(true); stopAudio(); mrRef.current?.stop();
    const qs=questionsRef.current; const ans=answersRef.current; const asc=audioScoresRef.current;
    let correct=0;
    qs.forEach((q,i)=>{
      if(q.type==="recite_next"||q.type==="recite_from_audio"){
        if((asc[i]??0)>=70) correct++;
      } else {
        if(ans[i]===q.correct) correct++;
      }
    });
    const pct=qs.length>0?Math.round((correct/qs.length)*100):0;
    supabase.auth.getUser().then(({data})=>{
      if(!data?.user) return;
      (supabase as any).from("hifdh_sessions").insert({
        student_id:data.user.id, surah_name:SURAHS[surahNum-1].name,
        ayah_start:1, accuracy_score:pct, duration:qs.length*45-timeLeft,
      }).then(() => {}).catch(()=>{});
    });
  },[surahNum,timeLeft]);

  const startTest=()=>{
    const pool = ayahs; // all ayahs of the surah — no range restriction
    const qs=buildQuestions(pool,surah.name);
    if(qs.length===0){ setBuildErr("Not enough verses — need at least 3."); return; }
    setBuildErr("");
    const ans=new Array(qs.length).fill(null) as null[];
    const asc=new Array(qs.length).fill(null) as null[];
    setQuestions(qs); setAnswers(ans); setAudioScores(asc);
    questionsRef.current=qs; answersRef.current=ans; audioScoresRef.current=asc;
    setQIdx(0); setSelected(null); setConfirmed(false); setFinished(false);
    setMicState("idle"); setAudioResult(null);
    setTimeLeft(qs.length*45); setTimerOn(true); setStarted(true);
  };

  const confirmAnswer=()=>{
    if(selected===null) return;
    const na=[...answers]; na[qIdx]=selected; setAnswers(na); answersRef.current=na; setConfirmed(true);
  };

  const nextQuestion=()=>{
    if(qIdx<questions.length-1){
      setQIdx(qIdx+1); setSelected(null); setConfirmed(false); setMicState("idle"); setAudioResult(null);
    } else doFinish();
  };

  const playAyah=(num:number)=>{
    stopAudio(); setIsPlaying(true);
    const url = audioUrl(surahNum, num, reciter);
    const audio=new Audio(url);
    audioRef.current=audio;
    audio.play().catch(()=>setIsPlaying(false));
    audio.onended=()=>setIsPlaying(false);
    audio.onerror=()=>setIsPlaying(false);
  };

  // ── Voice recording ──────────────────────────────────────
  const startRecording=async()=>{
    setMicState("recording"); setAudioResult(null);
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=getMime();
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:{});
      chunksRef.current=[];
      mr.ondataavailable=e=>{ if(e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunksRef.current,{type:mime||"audio/webm"});
        setMicState("evaluating");
        transcribeAnswer(blob);
      };
      mr.start(200); mrRef.current=mr;
    } catch { setMicState("idle"); alert("Mic access denied."); }
  };

  const stopRecording=()=>{ mrRef.current?.stop(); };

  const transcribeAnswer=async(blob:Blob)=>{
    const q=questionsRef.current[qIdx]; if(!q) return;
    let tx="";
    try {
      if(DEEPGRAM_KEY){
        const r=await fetch("https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false",
          {method:"POST",headers:{Authorization:`Token ${DEEPGRAM_KEY}`,"Content-Type":blob.type||"audio/webm"},body:blob});
        if(r.ok) tx=(await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";
      }
      if(!tx&&GROQ_KEY){
        const ext=blob.type.includes("mp4")?"mp4":"webm";
        const fd=new FormData();
        fd.append("file",new File([blob],`r.${ext}`,{type:blob.type}));
        fd.append("model","whisper-large-v3"); fd.append("language","ar"); fd.append("response_format","json");
        const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
          {method:"POST",headers:{Authorization:`Bearer ${GROQ_KEY}`},body:fd});
        if(r.ok) tx=(await r.json())?.text||"";
      }
      const sc=scoreAudio(tx,q.correctText);
      const na=[...audioScoresRef.current]; na[qIdx]=sc; setAudioScores(na); audioScoresRef.current=na;
      setAudioResult({score:sc,tx});
      setMicState("done");
    } catch { setMicState("idle"); }
  };

  const canStart=!loading&&ayahs.length>=3;

  const card=(ex?:React.CSSProperties):React.CSSProperties=>({
    background:"#fff",border:`1px solid ${BORDER}`,borderRadius:18,
    boxShadow:"0 2px 12px rgba(26,61,36,.07)",...ex,
  });

  // ── RESULTS ──────────────────────────────────────────────
  if(finished&&questions.length>0){
    let correct=0;
    questions.forEach((q,i)=>{
      if(q.type==="recite_next"||q.type==="recite_from_audio"){ if((audioScores[i]??0)>=70) correct++; }
      else { if(answers[i]===q.correct) correct++; }
    });
    const pct=Math.round((correct/questions.length)*100);
    const grade=getGrade(pct);
    return (
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={card({padding:"28px 20px",textAlign:"center"})}>
          <div style={{fontSize:52,marginBottom:10}}>{pct>=70?"🎉":pct>=50?"💪":"📖"}</div>
          <div style={{fontFamily:"'Amiri',serif",fontSize:26,color:G,fontWeight:700}}>Test Complete!</div>
          <div style={{fontFamily:"'Amiri',serif",fontSize:15,color:GOLD,marginTop:5}}>اكتمل الاختبار</div>
          <div style={{position:"relative",width:130,height:130,margin:"20px auto"}}>
            <svg width={130} height={130} style={{transform:"rotate(-90deg)"}}>
              <circle cx={65} cy={65} r={52} fill="none" stroke="#f0f4f0" strokeWidth={12}/>
              <circle cx={65} cy={65} r={52} fill="none" stroke={grade.color} strokeWidth={12}
                strokeDasharray={`${(pct/100)*2*Math.PI*52} ${2*Math.PI*52}`} strokeLinecap="round"/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:26,fontWeight:900,color:G}}>{pct}%</div>
              <div style={{fontSize:18,fontWeight:900,color:grade.color}}>{grade.letter}</div>
            </div>
          </div>
          <div style={{fontSize:14,fontWeight:700,color:grade.color}}>{grade.label}</div>
          <div style={{fontSize:12,color:"#7a9e88",marginTop:6}}>{correct} / {questions.length} correct · Score saved ✓</div>
          <div style={{marginTop:6,padding:"4px 12px",borderRadius:8,background:LIGHT,display:"inline-block"}}>
            <span style={{fontSize:11,color:G,fontWeight:700}}>📚 Full Surah · {SURAHS[surahNum-1]?.name}</span>
          </div>
        </div>

        {/* Review */}
        <div style={card({padding:"14px"})}>
          <div style={{fontSize:11,fontWeight:700,color:"#7a9e88",letterSpacing:.5,marginBottom:10}}>REVIEW · مراجعة</div>
          {questions.map((q,i)=>{
            const isAudio=q.type==="recite_next"||q.type==="recite_from_audio";
            const sc=audioScores[i]??0;
            const ok=isAudio?(sc>=70):(answers[i]===q.correct);
            return(
              <div key={q.id} style={{padding:"10px 12px",borderRadius:12,marginBottom:8,
                background:ok?LIGHT:"#fff5f5",border:`1px solid ${ok?BORDER:"#fca5a5"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#7a9e88"}}>Q{i+1} {QTYPE_META[q.type].icon} {QTYPE_META[q.type].label}</div>
                  <div style={{fontSize:16,fontWeight:700,color:ok?GM:"#c0392b"}}>
                    {ok?"✓":`✗`}{isAudio&&` ${sc}%`}
                  </div>
                </div>
                {!ok&&!isAudio&&(
                  <div style={{fontSize:11,color:"#7a9e88",direction:"rtl",fontFamily:"'Amiri',serif",marginTop:4}}>
                    <span style={{color:"#c0392b"}}>Your: {answers[i]!==null?q.options[answers[i]!]:"—"}</span>
                    <span style={{margin:"0 6px"}}>·</span>
                    <span style={{color:GM,fontWeight:700}}>Correct: {q.options[q.correct]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={()=>{setStarted(false);setFinished(false);}}
            style={{padding:"13px 0",borderRadius:12,border:`1px solid ${BORDER}`,background:"#f8fafb",color:G,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            ← New Test
          </button>
          <button onClick={startTest}
            style={{padding:"13px 0",borderRadius:12,border:"none",background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
            🔁 Retry
          </button>
        </div>
      </div>
    );
  }

  // ── SETUP ────────────────────────────────────────────────
  if(!started){
    return(
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{borderRadius:18,overflow:"hidden"}}>
          <div style={{background:`linear-gradient(135deg,${G},#7c3aed)`,padding:"22px 20px",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:10}}>✍️</div>
            <div style={{fontFamily:"'Amiri',serif",fontSize:24,color:"#fff",fontWeight:700}}>Hifdh Test</div>
            <div style={{fontFamily:"'Amiri',serif",fontSize:14,color:"rgba(255,255,255,.75)",marginTop:4}}>اختبار الحفظ</div>
          </div>
        </div>

        {/* Surah selector */}
        <div style={card({padding:"16px"})}>
          <div style={{fontSize:11,fontWeight:700,color:"#7a9e88",letterSpacing:.5,marginBottom:10}}>SELECT SURAH · اختر السورة</div>
          <select value={surahNum} onChange={e=>setSurahNum(Number(e.target.value))}
            style={{width:"100%",padding:"11px 12px",borderRadius:12,border:`1px solid ${BORDER}`,fontSize:14,color:G,background:"#f8fafb",marginBottom:10}}>
            {SURAHS.map(s=><option key={s.num} value={s.num}>{s.num}. {s.name} · {s.nameAr}</option>)}
          </select>
          <div style={{padding:"9px 12px",borderRadius:10,background:LIGHT,border:`1px solid ${BORDER}`,fontSize:12,color:G,fontWeight:600}}>
            {loading ? "Loading verses…" : `${ayahs.length} verses · All will be tested · Mixed question types`}
          </div>
        </div>

        {buildErr&&<div style={{padding:"12px 14px",borderRadius:12,background:"#fff5f5",border:"1px solid #fca5a5",fontSize:13,color:"#c0392b",textAlign:"center"}}>{buildErr}</div>}
        <button onClick={startTest} disabled={!canStart}
          style={{padding:"15px 0",borderRadius:14,border:"none",cursor:canStart?"pointer":"not-allowed",
            background:canStart?`linear-gradient(135deg,${G},#7c3aed)`:"#f0f4f0",
            color:canStart?"#fff":"#7a9e88",fontSize:15,fontWeight:800}}>
          {loading?"Loading…":!canStart?"Need at least 3 verses":"✍️ Start Test · ابدأ الاختبار"}        </button>
        {fetchErr&&<div style={{padding:"12px",borderRadius:12,background:"#fff5f5",border:"1px solid #fca5a5",fontSize:13,color:"#c0392b",textAlign:"center"}}>{fetchErr} <button onClick={fetchAyahs} style={{textDecoration:"underline",background:"none",border:"none",color:"#c0392b",cursor:"pointer"}}>Retry</button></div>}
      </div>
    );
  }

  if(questions.length===0) return(
    <div style={{padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:13,color:"#7a9e88",marginBottom:12}}>Building questions…</div>
      <button onClick={()=>setStarted(false)} style={{padding:"10px 20px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Back</button>
    </div>
  );

  const q=questions[Math.min(qIdx,questions.length-1)];
  const progress=(qIdx/questions.length)*100;
  const timerPct=questions.length>0?(timeLeft/(questions.length*45))*100:0;
  const isAudioQ=q.type==="recite_next"||q.type==="recite_from_audio";
  const meta=QTYPE_META[q.type];

  // ── ACTIVE QUESTION ──────────────────────────────────────
  return(
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
      <style>{`@keyframes waveTest{from{transform:scaleY(.3)}to{transform:scaleY(1.6)}}`}</style>

      {/* Header */}
      <div style={card({padding:"12px 14px"})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:12,color:"#7a9e88"}}>Q <strong style={{color:G}}>{qIdx+1}</strong>/{questions.length}</div>
            <div style={{padding:"2px 8px",borderRadius:6,background:LIGHT,fontSize:10,fontWeight:700,color:G}}>
              {SURAHS[surahNum-1]?.name}
            </div>
          </div>
          <div style={{position:"relative",width:40,height:40}}>
            <svg width={40} height={40} style={{transform:"rotate(-90deg)"}}>
              <circle cx={20} cy={20} r={16} fill="none" stroke="#f0f4f0" strokeWidth={4}/>
              <circle cx={20} cy={20} r={16} fill="none" stroke={timeLeft<30?"#ef4444":G} strokeWidth={4}
                strokeDasharray={`${(timerPct/100)*2*Math.PI*16} ${2*Math.PI*16}`} strokeLinecap="round"/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:9,fontWeight:900,color:timeLeft<30?"#ef4444":G}}>{timeLeft}s</span>
            </div>
          </div>
        </div>
        <div style={{height:5,borderRadius:3,background:"#f0f4f0",overflow:"hidden"}}>
          <div style={{width:`${progress}%`,height:"100%",borderRadius:3,background:`linear-gradient(90deg,${G},#7c3aed)`,transition:"width .3s"}}/>
        </div>
      </div>

      {/* Q type badge */}
      <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:10,background:LIGHT,border:`1px solid ${BORDER}`,alignSelf:"flex-start"}}>
        <span style={{fontSize:14}}>{meta.icon}</span>
        <span style={{fontSize:12,fontWeight:700,color:G}}>{meta.label}</span>
      </div>

      {/* Prompt */}
      <div style={card({padding:"16px"})}>
        <div style={{fontSize:10,fontWeight:700,color:"#7a9e88",letterSpacing:.5,marginBottom:8}}>
          {q.promptLabel.toUpperCase()}
        </div>

        {/* For audio-cue questions show instruction, not text */}
        {q.type==="recite_from_audio" ? (
          <div style={{padding:"16px",borderRadius:12,background:"#fffbeb",border:`1px solid #f6d860`,textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:6}}>🔊</div>
            <div style={{fontSize:13,color:GOLD,fontWeight:700}}>Listen to the verse, then recite the NEXT one</div>
            <div style={{fontSize:11,color:"#7a9e88",marginTop:4}}>استمع للآية ثم اتلُ التي بعدها</div>
          </div>
        ) : (
          <div style={{direction:"rtl",fontFamily:"'Amiri Quran',serif",fontSize:22,
            color:G,lineHeight:2.1,textAlign:"right",
            padding:"10px 12px",borderRadius:12,background:LIGHT,border:`1px solid ${BORDER}`}}>
            {q.prompt}
          </div>
        )}

        {/* Audio controls row */}
        <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap" as const}}>
          {/* Hear previous ayah (for recite questions) */}
          {(isAudioQ||q.type==="recite_from_audio") && q.prevAyahNum && (
            <button onClick={isPlaying?stopAudio:()=>playAyah(q.prevAyahNum!)}
              style={{flex:1,padding:"8px 0",borderRadius:10,
                border:`1px solid ${isPlaying?"#ef4444":GOLD}`,background:isPlaying?"#fee2e2":"#fffbeb",
                color:isPlaying?"#c0392b":GOLD,fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {isPlaying?"⏹ Stop":"🔊 Hear Verse "+q.prevAyahNum}
            </button>
          )}
          {/* MCQ: hear prompt */}
          {!isAudioQ&&(
            <button onClick={isPlaying?stopAudio:()=>playAyah(q.promptAyahNum)}
              style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#f8fafb",
                color:isPlaying?"#c0392b":G,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {isPlaying?"⏹ Stop":"🔊 Hear Ayah"}
            </button>
          )}
        </div>
      </div>

      {/* ── MCQ options ── */}
      {!isAudioQ&&(
        <>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {q.options.map((opt,i)=>{
              const isSel=selected===i;
              const isCorr=confirmed&&i===q.correct;
              const isWrong=confirmed&&isSel&&i!==q.correct;
              return(
                <button key={i} onClick={()=>!confirmed&&setSelected(i)}
                  style={{padding:"12px 14px",borderRadius:12,cursor:confirmed?"default":"pointer",
                    background:isCorr?LIGHT:isWrong?"#fff5f5":isSel?"#eff6ff":"#fafafa",
                    border:`1.5px solid ${isCorr?BORDER:isWrong?"#fca5a5":isSel?"#93c5fd":"#f0f4f0"}`,
                    display:"flex",gap:10,alignItems:"center",direction:"rtl",transition:"all .15s",textAlign:"right"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                    background:isCorr?GM:isWrong?"#ef4444":isSel?"#2563eb":"#e5e7eb",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,color:isCorr||isWrong||isSel?"#fff":"#6b7280",fontFamily:"'Cairo',sans-serif"}}>
                    {isCorr?"✓":isWrong?"✗":String.fromCharCode(65+i)}
                  </div>
                  <div style={{flex:1,fontFamily:"'Amiri Quran',serif",fontSize:17,
                    color:isCorr?GM:isWrong?"#c0392b":isSel?"#1d4ed8":G,lineHeight:1.8}}>
                    {opt}
                  </div>
                </button>
              );
            })}
          </div>
          {!confirmed?(
            <button onClick={confirmAnswer} disabled={selected===null}
              style={{padding:"13px 0",borderRadius:12,border:"none",
                background:selected===null?"#f0f4f0":`linear-gradient(135deg,${G},${GM})`,
                color:selected===null?"#7a9e88":"#fff",fontSize:14,fontWeight:800,cursor:selected===null?"not-allowed":"pointer"}}>
              ✓ Confirm Answer · تأكيد
            </button>
          ):(
            <button onClick={nextQuestion}
              style={{padding:"13px 0",borderRadius:12,border:"none",
                background:answers[qIdx]===q.correct?`linear-gradient(135deg,${GM},${G})`:"linear-gradient(135deg,#b91c1c,#ef4444)",
                color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>
              {qIdx<questions.length-1?"Next Question →":"See Results 🎉"}
            </button>
          )}
        </>
      )}

      {/* ── Audio answer (recite_next / recite_from_audio) ── */}
      {isAudioQ&&(
        <div style={card({padding:"16px"})}>
          <div style={{fontSize:11,fontWeight:700,color:"#7a9e88",letterSpacing:.5,marginBottom:12}}>
            🎙 RECITE VERSE {q.ayahNum} · اتلُ الآية {toAr(q.ayahNum)}
          </div>

          {micState==="idle"&&(
            <button onClick={startRecording}
              style={{width:"100%",padding:"13px 0",borderRadius:12,border:"none",
                background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              🎙 Start Reciting
            </button>
          )}

          {micState==="recording"&&(
            <div style={{textAlign:"center"}}>
              <div style={{display:"flex",gap:3,justifyContent:"center",alignItems:"flex-end",height:28,marginBottom:10}}>
                {[6,12,8,18,10,15,6,12,20,8].map((h,i)=>(
                  <div key={i} style={{width:4,height:h,borderRadius:2,background:"#ef4444",
                    animation:`waveTest .7s ease-in-out ${i*.07}s infinite alternate`}}/>
                ))}
              </div>
              <div style={{fontSize:12,color:"#ef4444",fontWeight:700,marginBottom:10}}>Recording…</div>
              <button onClick={stopRecording}
                style={{padding:"10px 24px",borderRadius:10,border:"none",
                  background:"#fee2e2",color:"#c0392b",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                ⏹ Done
              </button>
            </div>
          )}

          {micState==="evaluating"&&(
            <div style={{textAlign:"center",padding:"14px"}}>
              <div style={{fontSize:13,color:GOLD,fontWeight:700}}>🤖 Evaluating…</div>
            </div>
          )}

          {micState==="done"&&audioResult&&(
            <div style={{padding:"12px",borderRadius:12,
              background:audioResult.score>=70?LIGHT:"#fff5f5",
              border:`1px solid ${audioResult.score>=70?BORDER:"#fca5a5"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:14,fontWeight:800,color:audioResult.score>=70?GM:"#c0392b"}}>
                  {audioResult.score>=70?"✓ Good recitation!":"✗ Needs more practice"}
                </span>
                <span style={{fontSize:20,fontWeight:900,color:audioResult.score>=70?GM:"#c0392b"}}>
                  {audioResult.score}%
                </span>
              </div>
              {audioResult.tx&&(
                <div style={{direction:"rtl",fontFamily:"'Amiri',serif",fontSize:13,color:"#7a9e88",
                  background:"#f9fafb",borderRadius:8,padding:"6px 10px",marginBottom:8,lineHeight:1.8}}>
                  {audioResult.tx}
                </div>
              )}
              {/* Show correct answer */}
              <div style={{marginTop:6}}>
                <div style={{fontSize:10,color:"#7a9e88",fontWeight:700,marginBottom:4}}>CORRECT VERSE</div>
                <div style={{direction:"rtl",fontFamily:"'Amiri Quran',serif",fontSize:18,color:G,lineHeight:2,textAlign:"right"}}>
                  {q.correctText}
                </div>
              </div>
              <button onClick={nextQuestion}
                style={{marginTop:10,width:"100%",padding:"11px 0",borderRadius:10,border:"none",
                  background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {qIdx<questions.length-1?"Next Question →":"See Results 🎉"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
