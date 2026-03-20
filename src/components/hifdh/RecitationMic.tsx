/*
  RecitationMic.tsx — Hifdh practice, Tarteel-style
  - Mic always visible in top bar
  - All ayahs shown per page, hidden words
  - Words reveal line-by-line as you recite
  - Page auto-advances when page is done
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, ChevronRight, ChevronLeft } from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ── Types ────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WS = "hidden" | "revealed" | "current";
interface Word { raw: string; norm: string; state: WS; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ── Arabic helpers ───────────────────────────────────── */
const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"")
   .replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
   .replace(/\u0640/g,"").replace(/\s+/g," ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g,"").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw:w, norm:norm(w), state:"hidden" as WS }));

const arabicOnly = (t: string) =>
  t.replace(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+/g," ").replace(/\s+/g," ").trim();

/* ── Fuzzy word match ─────────────────────────────────── */
const lev = (a: string, b: string): number => {
  const dp = Array.from({length:a.length+1},(_,i)=>
    Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[a.length][b.length];
};
const match = (spoken: string, target: string) => {
  const s=norm(spoken), t=norm(target);
  if(!s||!t) return false;
  if(s===t) return true;
  const ml=Math.min(4,s.length,t.length);
  if(ml>=3&&s.slice(0,ml)===t.slice(0,ml)) return true;
  if(t.length>=4&&s.includes(t)) return true;
  if(s.length>=4&&t.includes(s)) return true;
  return lev(s,t)<=Math.floor(Math.max(s.length,t.length)*0.3);
};

/* ── Audio helpers ────────────────────────────────────── */
const getMime = () => {
  for(const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""])
    if(!t||MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
const dgCT = (m:string) => m.includes("mp4")?"audio/mp4":m.includes("ogg")?"audio/ogg":"audio/webm";
const fmt  = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ── Page grouping ────────────────────────────────────── */
const buildPages = (ayahs: Ayah[]): Ayah[][] => {
  if(ayahs.length<=10) return [ayahs];
  const pages:Ayah[][]=[];
  let page:Ayah[]=[], wc=0;
  for(const a of ayahs){
    if(page.length>0&&(page.length>=5||wc+a.words.length>50)){pages.push(page);page=[];wc=0;}
    page.push(a); wc+=a.words.length;
  }
  if(page.length) pages.push(page);
  return pages;
};

/* ── Colors ───────────────────────────────────────────── */
const G700="#1a3d24",G500="#276749";
const GOLD="#b7791f",GOLD_LT="#fffbeb";
const RED="#c0392b",MUTED="#7a9e88",BORDER="#e2e8f0",CREAM="#fdfaf4";

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  const [surahs,       setSurahs]      = useState<SurahMeta[]>([]);
  const [search,       setSearch]      = useState("");
  const [showPicker,   setShowPicker]  = useState(false);
  const [selected,     setSelected]    = useState<SurahMeta|null>(null);
  const [ayahs,        setAyahs]       = useState<Ayah[]>([]);
  const [pages,        setPages]       = useState<Ayah[][]>([]);
  const [pageIdx,      setPageIdx]     = useState(0);
  const [ayahIdx,      setAyahIdx]     = useState(0);
  const [loading,      setLoading]     = useState(false);
  const [recording,    setRecording]   = useState(false);
  const [finished,     setFinished]    = useState(false);
  const [processing,   setProcessing]  = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [error,        setError]       = useState("");
  const [transcript,   setTranscript]  = useState("");
  const [timer,        setTimer]       = useState(0);
  const [stats,        setStats]       = useState({correct:0,ayahs:0});

  const mrRef       = useRef<MediaRecorder|null>(null);
  const streamRef   = useRef<MediaStream|null>(null);
  const initRef     = useRef<Blob|null>(null);
  const audioRef    = useRef<Blob[]>([]);
  const timerRef    = useRef<ReturnType<typeof setInterval>|null>(null);
  const idxRef      = useRef(0);
  const ayahsRef    = useRef<Ayah[]>([]);
  const ptrRef      = useRef(0);      // word pointer within current ayah
  const recRef      = useRef(false);
  const mimeRef     = useRef("");
  const lastRef     = useRef("");     // last chunk text for dedup
  const scrollRef   = useRef<HTMLDivElement|null>(null);
  const activeRef   = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{ idxRef.current  = ayahIdx; },   [ayahIdx]);
  useEffect(()=>{ ayahsRef.current = ayahs;  },   [ayahs]);
  useEffect(()=>{ recRef.current   = recording; },[recording]);

  /* scroll active ayah into view */
  useEffect(()=>{
    activeRef.current?.scrollIntoView({behavior:"smooth",block:"center"});
  },[ayahIdx]);

  /* load surahs */
  useEffect(()=>{
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r=>r.json()).then(d=>{ if(d.code===200) setSurahs(d.data); });
    return killMic;
  },[]);

  /* load ayahs */
  useEffect(()=>{
    if(!selected) return;
    setLoading(true); setAyahIdx(0); setPageIdx(0);
    setAyahs([]); setPages([]); setFinished(false);
    ptrRef.current=0; lastRef.current="";
    killMic();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if(d.code===200){
          const loaded:Ayah[]=d.data.ayahs.map((a:any)=>({
            number:a.number, numberInSurah:a.numberInSurah,
            text:a.text, words:toWords(a.text),
          }));
          setAyahs(loaded);
          setPages(buildPages(loaded));
        }
      }).finally(()=>setLoading(false));
  },[selected]);

  /* timer */
  useEffect(()=>{
    if(recording){ timerRef.current=setInterval(()=>setTimer(t=>t+1),1000); }
    else{ if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;} }
    return ()=>{ if(timerRef.current) clearInterval(timerRef.current); };
  },[recording]);

  /* ── Kill mic ─────────────────────────────────────────── */
  const killMic = () => {
    recRef.current=false;
    if(mrRef.current){try{mrRef.current.stop();}catch(_){} mrRef.current=null;}
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  };

  /* ── Save ayah to Supabase ────────────────────────────── */
  const saveAyah = async (idx:number) => {
    if(!userId||!selected) return;
    const ayah=ayahsRef.current[idx]; if(!ayah) return;
    setSaving(true);
    try{
      const correct=ayah.words.filter(w=>w.state==="revealed").length;
      const pct=ayah.words.length>0?Math.round((correct/ayah.words.length)*100):0;
      let audioUrl="";
      if(audioRef.current.length>0){
        const blob=new Blob(audioRef.current,{type:mimeRef.current||"audio/webm"});
        const ext=mimeRef.current.includes("mp4")?"mp4":mimeRef.current.includes("ogg")?"ogg":"webm";
        const path=`${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.${ext}`;
        const {data:up}=await supabase.storage.from("hifdh-recordings").upload(path,blob);
        if(up){const {data:u}=supabase.storage.from("hifdh-recordings").getPublicUrl(path);audioUrl=u?.publicUrl??"";}
        audioRef.current=[];
      }
      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id:userId,surah_num:selected.number,surah_name:selected.englishName,
          ayah_start:ayah.numberInSurah,ayah_end:ayah.numberInSurah,
          audio_url:audioUrl,ai_score:pct,status:"pending",
          transcript:lastRef.current,
          word_results:ayah.words.map(x=>({word:x.raw,result:x.state})),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id:userId,surah_number:selected.number,surah_name:selected.englishName,
          ayah_start:ayah.numberInSurah,accuracy_score:pct,correct,wrong:0,duration:timer,
        }),
      ]);
      const {data:ex}=await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed").eq("user_id",userId).eq("surah_num",selected.number).single();
      if(ex){ await supabase.from("hifdh_progress").update({
        last_reviewed:new Date().toISOString(),
        best_accuracy:Math.max(ex.best_accuracy??0,pct),
        times_reviewed:(ex.times_reviewed??0)+1,
      }).eq("id",ex.id); }
      else{ await supabase.from("hifdh_progress").insert({
        user_id:userId,surah_num:selected.number,surah_name:selected.englishName,
        last_reviewed:new Date().toISOString(),best_accuracy:pct,times_reviewed:1,
      }); }
    }catch(_){}
    setSaving(false);
  };

  /* ── Advance ayah ─────────────────────────────────────── */
  const advanceAyah = useCallback((idx:number)=>{
    saveAyah(idx);
    setStats(s=>({...s,ayahs:s.ayahs+1}));
    ptrRef.current=0; lastRef.current="";
    setTranscript("");
    const next=idx+1;
    idxRef.current=next;
    if(next>=ayahsRef.current.length){
      setFinished(true);setRecording(false);killMic();return;
    }
    setAyahIdx(next);
    setTimer(0);
    // auto page advance
    setPages(pp=>{
      const ni=pp.findIndex(p=>p.some(a=>a.numberInSurah===ayahsRef.current[next]?.numberInSurah));
      if(ni>=0) setPageIdx(ni);
      return pp;
    });
    setAyahs(prev=>{
      const u=[...prev];
      if(u[next]) u[next]={...u[next],words:u[next].words.map(w=>({...w,state:"hidden" as WS}))};
      return u;
    });
  },[]);

  /* ── Process transcript ───────────────────────────────── */
  const processTranscript = useCallback((chunk:string)=>{
    if(!chunk.trim()||!recRef.current) return;
    const arabic=arabicOnly(chunk);
    if(!arabic) return;

    // Skip exact-duplicate chunks (Whisper hallucination)
    const n=norm(arabic);
    if(n&&n===norm(lastRef.current)) return;
    lastRef.current=arabic;
    setTranscript(arabic);

    const idx  = idxRef.current;
    const words= ayahsRef.current[idx]?.words;
    if(!words) return;

    // Match ONLY new chunk tokens against words starting from current pointer.
    // This avoids accumulated-buffer issues — each chunk is matched fresh
    // from wherever we left off.
    const tokens=arabic.split(/\s+/).filter(Boolean).map(norm);
    let ptr=ptrRef.current;
    let ti=0;

    while(ptr<words.length && ti<tokens.length){
      if(match(tokens[ti],words[ptr].norm)){ ptr++; ti++; }
      else{ ti++; }
    }

    if(ptr===ptrRef.current) return;
    ptrRef.current=ptr;

    setAyahs(prev=>{
      const u=[...prev];
      const ayah={...u[idx],words:u[idx].words.map((w,wi)=>({
        ...w, state:wi<ptr?"revealed":wi===ptr?"current":"hidden" as WS,
      }))};
      u[idx]=ayah;
      if(ptr>=ayah.words.length){
        setStats(s=>({...s,correct:s.correct+ayah.words.length}));
        setTimeout(()=>advanceAyah(idx),0);
      }
      return u;
    });
  },[advanceAyah]);

  /* ── Voice activity detection ─────────────────────────── */
  const hasSpeech = useCallback(async(blob:Blob):Promise<boolean>=>{
    try{
      const buf=await blob.arrayBuffer();
      const ctx=new((window as any).AudioContext||(window as any).webkitAudioContext)({sampleRate:16000});
      const audio=await ctx.decodeAudioData(buf); ctx.close();
      const d=audio.getChannelData(0);
      let s=0; for(let i=0;i<d.length;i++) s+=d[i]*d[i];
      return Math.sqrt(s/d.length)>0.01;
    }catch{return true;}
  },[]);

  /* ── Transcribe ───────────────────────────────────────── */
  const transcribe = useCallback(async(blob:Blob)=>{
    if(blob.size<200) return;
    setProcessing(true);
    try{
      let text="";
      if(DEEPGRAM_KEY){
        try{
          const r=await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false",
            {method:"POST",headers:{Authorization:`Token ${DEEPGRAM_KEY}`,"Content-Type":dgCT(mimeRef.current||blob.type)},body:blob}
          );
          if(!r.ok) throw new Error(`${r.status}`);
          text=(await r.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";
        }catch(e:any){console.warn("DG:",e?.message);}
      }
      if(!text&&GROQ_KEY){
        const ext=(mimeRef.current||"").includes("mp4")?"mp4":(mimeRef.current||"").includes("ogg")?"ogg":"webm";
        const fd=new FormData();
        fd.append("file",new File([blob],`a.${ext}`,{type:mimeRef.current||"audio/webm"}));
        fd.append("model","whisper-large-v3-turbo");
        fd.append("language","ar");
        fd.append("response_format","json");
        fd.append("prompt","بسم الله الرحمن الرحيم الحمد لله");
        fd.append("temperature","0");
        const r=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
          {method:"POST",headers:{Authorization:`Bearer ${GROQ_KEY}`},body:fd});
        if(r.status===429){console.warn("Rate limited");return;}
        if(!r.ok) throw new Error(`Groq ${r.status}`);
        text=(await r.json())?.text||"";
      }
      if(text) processTranscript(text);
      setError("");
    }catch(e:any){
      setError(`Error: ${e?.message||"Unknown"}`);
    }finally{setProcessing(false);}
  },[processTranscript,hasSpeech]);

  /* ── MediaRecorder (single instance, timeslice) ────────── */
  const startRec = useCallback((stream:MediaStream)=>{
    if(!recRef.current) return;
    initRef.current=null;
    const mr=new MediaRecorder(stream,mimeRef.current?{mimeType:mimeRef.current}:{});
    mr.ondataavailable=e=>{
      if(!e.data?.size||e.data.size===0) return;
      audioRef.current.push(e.data);
      if(!initRef.current){
        initRef.current=e.data;
        if(e.data.size>=200) transcribe(e.data);
        return;
      }
      const b=new Blob([initRef.current,e.data],{type:mimeRef.current||"audio/webm"});
      if(b.size>=200) transcribe(b);
    };
    mr.start(1500);
    mrRef.current=mr;
  },[transcribe]);

  const toggleMic = async()=>{
    if(recording){setRecording(false);killMic();return;}
    setError(""); setFinished(false);
    ptrRef.current=0; lastRef.current="";
    setTranscript(""); setTimer(0);
    setStats({correct:0,ayahs:0});
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=s; audioRef.current=[];
      mimeRef.current=getMime();
      recRef.current=true; setRecording(true);
      startRec(s);
    }catch{setError("Microphone access denied.");}
  };

  /* ── Derived ──────────────────────────────────────────── */
  const currentPage = pages[pageIdx]??[];
  const totalW = ayahs.reduce((s,a)=>s+a.words.length,0);
  const doneW  = ayahs.reduce((s,a)=>s+a.words.filter(w=>w.state==="revealed").length,0);
  const pct    = totalW>0?Math.round((doneW/totalW)*100):0;
  const filtered= surahs.filter(s=>
    s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  /* ════════════════════ RENDER ═══════════════════════════ */
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100svh",background:CREAM,maxWidth:640,margin:"0 auto",overflow:"hidden"}}>

      {/* ═══ TOP BAR ══════════════════════════════════════ */}
      <div style={{flexShrink:0,background:G700,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,zIndex:20}}>

        {/* Mic button — ALWAYS HERE */}
        <button onClick={toggleMic} style={{
          width:48,height:48,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
          background:recording?RED:"rgba(255,255,255,.15)",
          boxShadow:recording?`0 0 0 4px ${RED}44`:"none",
          display:"flex",alignItems:"center",justifyContent:"center",
          animation:recording?"micRing 1.4s ease-in-out infinite":"none",
          transition:"all .2s",
        }}>
          {recording?<Square size={20} fill="#fff" color="#fff"/>:<Mic size={20} color="#fff"/>}
        </button>

        {/* Surah info + status */}
        <div style={{flex:1,minWidth:0}}>
          {selected?(
            <>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,fontWeight:900,color:"#fff"}}>{selected.englishName}</span>
                <span style={{fontFamily:"'Amiri',serif",fontSize:13,color:"rgba(255,255,255,.75)"}}>{selected.name}</span>
                {saving&&<span style={{fontSize:10,color:GOLD}}>Saving…</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                {recording?(
                  <div style={{display:"flex",alignItems:"center",gap:2,height:14}}>
                    {[8,13,6,18,10,15,7,12].map((h,i)=>(
                      <div key={i} style={{width:2,height:h,borderRadius:1,background:processing?GOLD:"#86efac",opacity:.8,animation:`waveBar .9s ease-in-out ${i*.09}s infinite alternate`}}/>
                    ))}
                    <span style={{fontSize:10,color:"rgba(255,255,255,.6)",marginLeft:4}}>{fmt(timer)}</span>
                    {processing&&<span style={{fontSize:10,color:GOLD}}>⏳</span>}
                  </div>
                ):(
                  <span style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>
                    {recording?"":"Tap mic to start · اضغط للبدء"}
                  </span>
                )}
              </div>
            </>
          ):(
            <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.8)"}}>Select a Surah</span>
          )}
        </div>

        {/* Right side: progress + change button */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {selected&&(
            <div style={{fontSize:11,color:pct>0?GOLD:"rgba(255,255,255,.5)",fontWeight:700}}>{pct}%</div>
          )}
          <button onClick={()=>setShowPicker(true)}
            style={{fontSize:11,padding:"3px 9px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"transparent",color:"rgba(255,255,255,.8)",cursor:"pointer"}}>
            {selected?"Change":"Pick Surah"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {selected&&(
        <div style={{flexShrink:0,height:3,background:"rgba(0,0,0,.08)"}}>
          <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${G500},${GOLD})`,transition:"width .5s"}}/>
        </div>
      )}

      {/* Live transcript strip */}
      {recording&&transcript&&(
        <div style={{flexShrink:0,background:"#f0fff4",borderBottom:`1px solid #86efac`,padding:"6px 14px"}}>
          <div style={{fontSize:14,fontWeight:700,color:G700,direction:"rtl",textAlign:"right",fontFamily:"'Amiri Quran',serif",lineHeight:1.8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {transcript}
          </div>
        </div>
      )}

      {/* Error strip */}
      {error&&(
        <div style={{flexShrink:0,background:"#fff5f5",borderBottom:"1px solid #fca5a5",padding:"6px 14px"}}>
          <div style={{fontSize:12,color:RED,fontWeight:600}}>⚠️ {error}</div>
        </div>
      )}

      {/* ═══ MAIN SCROLL AREA ══════════════════════════════ */}
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"0 0 24px"}}>

        {/* No surah selected */}
        {!selected&&!showPicker&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",padding:32,textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:16}}>📖</div>
            <div style={{fontSize:20,fontWeight:900,color:G700,fontFamily:"'Amiri',serif",marginBottom:8}}>مرحباً بك</div>
            <div style={{fontSize:14,color:MUTED,marginBottom:24}}>Select a surah to begin your Hifdh practice</div>
            <button onClick={()=>setShowPicker(true)}
              style={{padding:"12px 28px",borderRadius:12,border:"none",background:G700,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Choose Surah
            </button>
          </div>
        )}

        {/* Loading */}
        {loading&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60%"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>⏳</div>
              <div style={{fontSize:13,color:GOLD}}>Loading…</div>
            </div>
          </div>
        )}

        {/* Finished */}
        {finished&&selected&&(
          <div style={{padding:24}}>
            <div style={{background:"#fff",borderRadius:20,border:`1px solid ${BORDER}`,padding:28,textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:10}}>🎉</div>
              <div style={{fontSize:20,fontWeight:900,color:G700,fontFamily:"'Amiri',serif"}}>أحسنت!</div>
              <div style={{fontSize:13,color:MUTED,marginTop:4,marginBottom:20}}>Surah Complete — Well done!</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
                {[{l:"Words",v:stats.correct,c:G500},{l:"Ayahs",v:stats.ayahs,c:GOLD},{l:"Time",v:fmt(timer),c:G700}].map((x,i)=>(
                  <div key={i} style={{background:"#f8fafb",borderRadius:10,padding:"12px 6px"}}>
                    <div style={{fontSize:20,fontWeight:900,color:x.c}}>{x.v}</div>
                    <div style={{fontSize:11,color:MUTED}}>{x.l}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{setSelected(null);setFinished(false);setAyahIdx(0);setPageIdx(0);setAyahs([]);setPages([]);setTimer(0);setStats({correct:0,ayahs:0});}}
                style={{width:"100%",padding:13,borderRadius:11,border:"none",background:G700,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:8}}>
                📖 New Surah
              </button>
              <button onClick={()=>{
                setFinished(false);setAyahIdx(0);setPageIdx(0);setTimer(0);setStats({correct:0,ayahs:0});
                setAyahs(p=>p.map(a=>({...a,words:a.words.map(w=>({...w,state:"hidden" as WS}))})));
                setPages(buildPages(ayahsRef.current));
              }}
                style={{width:"100%",padding:13,borderRadius:11,border:`1px solid ${BORDER}`,background:"#fff",color:G700,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                🔄 Repeat
              </button>
            </div>
          </div>
        )}

        {/* ══ AYAH PAGE ══════════════════════════════════════ */}
        {selected&&!loading&&!finished&&currentPage.length>0&&(
          <div style={{padding:"12px 14px"}}>

            {/* Bismillah */}
            {pageIdx===0&&selected.number!==9&&(
              <div style={{textAlign:"center",padding:"16px 8px 20px",fontFamily:"'Amiri Quran',serif",fontSize:26,color:G700,lineHeight:2.2,direction:"rtl"}}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </div>
            )}

            {/* Page header */}
            {pages.length>1&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{flex:1,height:1,background:BORDER}}/>
                <div style={{fontSize:11,color:MUTED,padding:"2px 10px",border:`1px solid ${BORDER}`,borderRadius:20,background:"#fff"}}>
                  Page {pageIdx+1}/{pages.length} · {currentPage[0].numberInSurah}–{currentPage[currentPage.length-1].numberInSurah}
                </div>
                <div style={{flex:1,height:1,background:BORDER}}/>
              </div>
            )}

            {/* Ayahs */}
            <div style={{background:"#fff",borderRadius:16,border:`1px solid ${BORDER}`,overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,.05)"}}>
              {currentPage.map((ayah,ai)=>{
                const isActive=ayah.numberInSurah===ayahsRef.current[ayahIdx]?.numberInSurah;
                const isDone  =ayah.words.every(w=>w.state==="revealed");
                return (
                  <div key={ayah.numberInSurah}
                    ref={isActive?(el:any)=>{activeRef.current=el;}:undefined}
                    style={{
                      padding:"16px 18px",
                      borderBottom:ai<currentPage.length-1?`1px solid ${BORDER}`:"none",
                      background:isDone?"rgba(39,103,73,.04)":isActive?"rgba(183,121,31,.05)":"#fff",
                      borderLeft:isActive?`3px solid ${GOLD}`:isDone?`3px solid ${G500}`:"3px solid transparent",
                      transition:"all .3s",
                    }}>
                    {/* Ayah text — each on its own RTL block */}
                    <div style={{
                      direction:"rtl",
                      fontFamily:"'Amiri Quran',serif",
                      fontSize:24,
                      lineHeight:3.2,
                      textAlign:"right",
                    }}>
                      {ayah.words.map((w,wi)=>{
                        const rev=w.state==="revealed";
                        const cur=w.state==="current";
                        return (
                          <span key={wi} style={{
                            display:"inline-block",
                            margin:"0 2px",
                            transition:"color .2s, background .2s",
                            ...(rev?{
                              color:G500,
                            }:cur?{
                              color:GOLD,
                              background:GOLD_LT,
                              borderRadius:5,
                              padding:"0 3px",
                              border:`1.5px solid ${GOLD}`,
                              animation:"wPulse .7s ease-in-out infinite",
                            }:{
                              // hidden: grey pill sized to word length
                              color:"transparent",
                              background:isActive?"#c0c0c0":"#d8d8d8",
                              borderRadius:4,
                              minWidth:`${Math.max(w.raw.length*9,18)}px`,
                              height:"0.58em",
                              verticalAlign:"middle",
                            })
                          }}>
                            {w.state==="hidden"?"\u00A0".repeat(Math.max(w.raw.length,2)):w.raw}
                          </span>
                        );
                      })}
                      {/* Ayah number at end of RTL line */}
                      <span style={{
                        fontFamily:"'Amiri',serif",fontSize:16,
                        color:isDone?G500:isActive?GOLD:"rgba(183,121,31,.4)",
                        margin:"0 6px",
                      }}>﴿{ayah.numberInSurah}﴾</span>
                    </div>

                    {/* Per-ayah progress bar */}
                    {(isActive||isDone)&&(()=>{
                      const rev=ayah.words.filter(w=>w.state==="revealed").length;
                      const tot=ayah.words.length;
                      const p=tot>0?Math.round((rev/tot)*100):0;
                      return(
                        <div style={{marginTop:6,height:2,background:"#eee",borderRadius:1,overflow:"hidden"}}>
                          <div style={{width:`${p}%`,height:"100%",background:isDone?G500:GOLD,transition:"width .3s"}}/>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {/* Page nav */}
            {pages.length>1&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,padding:"0 4px"}}>
                <button disabled={pageIdx===0||recording}
                  onClick={()=>{if(pageIdx>0){setPageIdx(p=>p-1);}}}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:pageIdx===0?MUTED:G700,fontSize:13,fontWeight:700,cursor:pageIdx===0||recording?"default":"pointer",opacity:pageIdx===0?.4:1}}>
                  <ChevronRight size={14}/>Prev
                </button>
                <div style={{display:"flex",gap:5}}>
                  {pages.map((_,i)=>(
                    <div key={i} style={{width:i===pageIdx?18:6,height:6,borderRadius:3,background:i===pageIdx?G700:i<pageIdx?G500:BORDER,transition:"all .3s"}}/>
                  ))}
                </div>
                <button disabled={recording}
                  onClick={()=>{if(pageIdx<pages.length-1)setPageIdx(p=>p+1);else setFinished(true);}}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",borderRadius:10,border:`1px solid ${BORDER}`,background:"#fff",color:G700,fontSize:13,fontWeight:700,cursor:recording?"default":"pointer",opacity:recording?.4:1}}>
                  Next<ChevronLeft size={14}/>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ SURAH PICKER MODAL ═══════════════════════════════ */}
      {showPicker&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",zIndex:50,display:"flex",flexDirection:"column"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowPicker(false);}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"#fff",borderRadius:"20px 20px 0 0",maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px 10px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:15,fontWeight:900,color:G700}}>اختر سورة · Select Surah</div>
              <button onClick={()=>setShowPicker(false)} style={{background:"none",border:"none",fontSize:20,color:MUTED,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{padding:"10px 14px"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search surah…"
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${BORDER}`,fontSize:14,color:G700,boxSizing:"border-box" as const}}
                autoFocus/>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"0 14px 24px",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {filtered.slice(0,114).map(s=>(
                <div key={s.number}
                  onClick={()=>{setSelected(s);setSearch("");setShowPicker(false);setFinished(false);}}
                  style={{background:selected?.number===s.number?"#f0fff4":"#fafafa",border:`1px solid ${selected?.number===s.number?G500:BORDER}`,borderRadius:12,padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:GOLD_LT,border:`1px solid ${GOLD}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:GOLD,flexShrink:0}}>
                    {s.number}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:G700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.englishName}</div>
                    <div style={{fontSize:12,fontFamily:"'Amiri',serif",color:GOLD}}>{s.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes micRing{0%,100%{box-shadow:0 0 0 4px ${RED}44,0 0 0 8px ${RED}18;}50%{box-shadow:0 0 0 8px ${RED}44,0 0 0 14px ${RED}0a;}}
        @keyframes wPulse{0%,100%{opacity:1;}50%{opacity:.5;}}
        @keyframes waveBar{from{transform:scaleY(.3);}to{transform:scaleY(1.6);}}
      `}</style>
    </div>
  );
}
