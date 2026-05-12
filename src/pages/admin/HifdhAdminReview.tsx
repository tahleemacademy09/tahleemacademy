// src/pages/admin/HifdhAdminReview.tsx
// Admin review — sessions grouped per student; each session has audio player + full detail

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Search, ChevronDown, ChevronUp, BookOpen,
  CheckCircle, Clock, Star, Mic, FileText, Users, Download, Volume2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── palette ── */
const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
const PASS = "#16A34A";
const FAIL = "#DC2626";
const AMBER= "#D97706";
const W    = "#ffffff";

/* ── types ── */
type FilterStatus = "all" | "pending" | "reviewed";

interface AyahSnap { text:string; numberInSurah:number; surahName?:string; }
interface PageResult {
  pageNum:number; score:number; errorWords:string[];
  ayahCorrectness?:boolean[]; transcript?:string; ayahs?:AyahSnap[];
}
interface SessionData {
  recitation_score?:number; test_score?:number; pages_done?:number[];
  audio_url?:string|null; page_results?:PageResult[]; errors?:{word:string;page:number}[];
  review?:{ teacher_score:number; teacher_feedback:string; reviewed_by:string; reviewed_at:string; };
}
interface DailyLog {
  id:string; student_id:string; assignment_id?:string; log_date:string;
  pages_revised:number|null; avg_score:number|null; duration_secs?:number|null;
  completed?:boolean; session_data?:SessionData; updated_at?:string;
  student_name?:string; student_email?:string;
}
interface StudentGroup {
  student_id:string; student_name:string; student_email:string; sessions:DailyLog[];
}

/* ── helpers ── */
const scoreColor=(s:number)=>s>=70?PASS:s>=50?AMBER:FAIL;
const scoreLabel=(s:number)=>s>=70?"Excellent":s>=50?"Good":"Needs Work";
const fmtDate=(d:string)=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
const fmtDur=(s?:number|null)=>!s?"—":`${Math.floor(s/60)}m ${s%60}s`;

function normalizeAr(t:string):string{
  return t.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
    .replace(/[\u0622\u0623\u0625\u0627]/g,"\u0627")
    .replace(/\u0629/g,"\u0647").replace(/\u0649/g,"\u064A")
    .replace(/\u0640/g,"").replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"")
    .replace(/\s+/g," ").trim();
}

function ScoreRing({pct,size=48}:{pct:number;size?:number}){
  const r=size*0.38,c=2*Math.PI*r,dash=(pct/100)*c,col=scoreColor(pct);
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={size*0.1}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={size*0.1}
        strokeDasharray={`${dash} ${c-dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={col} fontSize={size*0.22} fontWeight={900}>{pct}%</text>
    </svg>
  );
}

/* ── Per-session Audio Player ─────────────────────────────────────── */
function SessionAudioPlayer({url,logDate}:{url:string;logDate:string}){
  const audioRef=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState(0);
  const [duration,setDuration]=useState(0);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{
    const el=audioRef.current; if(!el) return;
    const onMeta=()=>{setDuration(el.duration);setLoaded(true);};
    const onTime=()=>setProgress(el.currentTime/(el.duration||1));
    const onEnded=()=>{setPlaying(false);setProgress(0);el.currentTime=0;};
    el.addEventListener("loadedmetadata",onMeta);
    el.addEventListener("timeupdate",onTime);
    el.addEventListener("ended",onEnded);
    return()=>{el.removeEventListener("loadedmetadata",onMeta);
               el.removeEventListener("timeupdate",onTime);
               el.removeEventListener("ended",onEnded);};
  },[url]);

  const toggle=()=>{
    const el=audioRef.current; if(!el) return;
    if(playing){el.pause();setPlaying(false);}
    else{el.play().catch(()=>{});setPlaying(true);}
  };
  const seek=(e:React.MouseEvent<HTMLDivElement>)=>{
    const el=audioRef.current; if(!el) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    el.currentTime=ratio*el.duration; setProgress(ratio);
  };
  const fmt=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  return(
    <div style={{background:`linear-gradient(135deg,${G}10,${GM}18)`,
      border:`2px solid ${GOLD}66`,borderRadius:14,padding:"12px 14px"}}>
      <audio ref={audioRef} src={url} preload="metadata"/>
      {/* Label row */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",
          background:`linear-gradient(135deg,${G},${GM})`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Volume2 size={14} color={GOLD}/>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:0,fontWeight:800,fontSize:12,color:G}}>🎙 Recitation Audio</p>
          <p style={{margin:0,fontSize:10,color:"#9CA3AF"}}>{fmtDate(logDate)}{loaded&&` · ${fmt(duration)}`}</p>
        </div>
        {/* Play/Pause */}
        <button onClick={toggle} style={{width:44,height:44,borderRadius:"50%",border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${GOLD},#e6c97a)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`0 3px 12px ${GOLD}55`,flexShrink:0}}>
          {playing
            ?<span style={{display:"flex",gap:3}}>
               <span style={{width:3,height:14,background:"#061409",borderRadius:2}}/>
               <span style={{width:3,height:14,background:"#061409",borderRadius:2}}/>
             </span>
            :<span style={{marginLeft:3}}>
               <svg width="14" height="14" viewBox="0 0 24 24" fill="#061409"><polygon points="5,3 19,12 5,21"/></svg>
             </span>}
        </button>
      </div>
      {/* Seekbar */}
      <div onClick={seek} style={{height:6,borderRadius:4,background:"#E5E7EB",cursor:"pointer",overflow:"hidden",marginBottom:4}}>
        <div style={{height:"100%",borderRadius:4,background:`linear-gradient(to right,${GOLD},#e6c97a)`,
          width:`${progress*100}%`,transition:"width .1s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#9CA3AF",fontWeight:600,marginBottom:8}}>
        <span>{fmt(audioRef.current?.currentTime||0)}</span>
        <span>{loaded?fmt(duration):"--:--"}</span>
      </div>
      {/* Download */}
      <a href={url} download style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,
        padding:"7px",borderRadius:8,background:W,border:"1.5px solid #E5E7EB",
        fontSize:10,fontWeight:700,color:G,textDecoration:"none"}}>
        <Download size={11}/>Download Recording
      </a>
    </div>
  );
}

/* ── Session detail (expanded) ────────────────────────────────────── */
function SessionDetail({log,ov,saving,onOvChange,onSave,onClose}:{
  log:DailyLog; ov:{score:string;feedback:string}; saving:boolean;
  onOvChange:(v:{score:string;feedback:string})=>void; onSave:()=>void; onClose:()=>void;
}){
  const [pageTab,setPageTab]=useState(0);
  const sd=log.session_data;
  const pages=sd?.page_results||[];
  const pr=pages[pageTab];
  const reviewed=!!sd?.review;
  const displayScore=log.avg_score??0;

  return(
    <div style={{borderTop:`1px solid ${G}22`,background:"#FAFAFA",padding:"14px",
      display:"flex",flexDirection:"column",gap:12}}>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[
          {icon:<Star size={13} color={GOLD}/>,label:"Recitation",value:`${sd?.recitation_score??displayScore}%`},
          {icon:<FileText size={13} color={G}/>,label:"Test",value:`${sd?.test_score??0}%`},
          {icon:<Mic size={13} color={FAIL}/>,label:"Duration",value:fmtDur(log.duration_secs)},
        ].map((item,i)=>(
          <div key={i} style={{background:W,borderRadius:10,padding:"8px 10px",
            border:"1px solid #E5E7EB",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{item.icon}</div>
            <div style={{fontWeight:900,fontSize:14,color:G}}>{item.value}</div>
            <div style={{fontSize:9,color:"#9CA3AF",fontWeight:700,textTransform:"uppercase",letterSpacing:.4}}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Audio player */}
      {sd?.audio_url
        ?<SessionAudioPlayer url={sd.audio_url} logDate={log.log_date}/>
        :<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:12,
            background:"#F3F4F6",border:"1.5px dashed #D1D5DB"}}>
           <Mic size={14} color="#9CA3AF"/>
           <span style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>No audio recording for this session</span>
         </div>}

      {/* Page tabs */}
      {pages.length>0&&(
        <>
          {pages.length>1&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {pages.map((p,i)=>(
                <button key={i} onClick={()=>setPageTab(i)} style={{
                  padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${pageTab===i?G:"#E5E7EB"}`,
                  background:pageTab===i?G:W,color:pageTab===i?W:"#6B7280"}}>
                  Page {p.pageNum}
                  <span style={{marginLeft:4,fontSize:10,color:pageTab===i?GOLD:scoreColor(p.score)}}>{p.score}%</span>
                </button>
              ))}
            </div>
          )}
          {pr&&(
            <div style={{background:W,borderRadius:12,border:"1px solid #E5E7EB",overflow:"hidden"}}>
              <div style={{padding:"8px 14px",background:`${G}08`,borderBottom:"1px solid #E5E7EB",
                display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:800,fontSize:12,color:G}}>
                  📖 Page {pr.pageNum}{pr.ayahs?.[0]?.surahName&&` · ${pr.ayahs[0].surahName}`}
                </span>
                <span style={{fontWeight:900,fontSize:13,color:scoreColor(pr.score)}}>
                  {pr.score}% — {scoreLabel(pr.score)}
                </span>
              </div>
              {pr.ayahs&&pr.ayahs.length>0&&(
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:.4}}>
                      Word-by-Word Analysis
                    </span>
                    {pr.errorWords&&(
                      <span style={{fontSize:10,fontWeight:700}}>
                        <span style={{color:PASS}}>✓{pr.ayahs.reduce((acc,a)=>acc+a.text.split(/\s+/).filter(Boolean).length,0)-pr.errorWords.length}</span>
                        {" · "}
                        <span style={{color:FAIL}}>✗{pr.errorWords.length}</span>
                      </span>
                    )}
                  </div>
                  {(()=>{
                    const errSet=new Set((pr.errorWords||[]).map(w=>normalizeAr(w)));
                    return(
                      <div style={{background:"#fffdf6",borderRadius:8,border:`1.5px solid ${GOLD}55`,
                        padding:"12px 14px",direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",
                        fontSize:20,lineHeight:3.8,textAlign:"justify",
                        wordBreak:"keep-all",overflowWrap:"break-word"}}>
                        {pr.ayahs.map((a,ai)=>(
                          <span key={ai}>
                            {a.text.split(/\s+/).filter(Boolean).map((wd,wi)=>{
                              const ok=!errSet.has(normalizeAr(wd));
                              return(
                                <span key={wi} style={{
                                  background:ok?`${PASS}28`:`${FAIL}20`,
                                  color:ok?"#14532d":"#991b1b",borderRadius:5,
                                  boxShadow:`inset 0 0 0 1.5px ${ok?PASS+"55":FAIL+"55"}`,
                                  padding:"2px 4px",margin:"0 2px",fontWeight:ok?400:600}}>
                                  {wd}
                                </span>
                              );
                            })}
                            <span style={{fontSize:13,color:GOLD,margin:"0 6px",fontFamily:"'Amiri',serif"}}>
                              ۝{a.numberInSurah}
                            </span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              {pr.transcript&&(
                <div style={{padding:"0 14px 12px"}}>
                  <p style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:.4,margin:"0 0 4px"}}>
                    Transcript (AI Heard)
                  </p>
                  <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.7,
                    direction:"rtl",fontFamily:"'Amiri',serif",
                    background:"#F9FAFB",borderRadius:8,padding:"8px 10px"}}>
                    {pr.transcript}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Existing review badge */}
      {reviewed&&log.session_data?.review&&(
        <div style={{padding:"10px 14px",borderRadius:10,background:"#F0FDF4",border:"1px solid #86EFAC"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <CheckCircle size={13} color={PASS}/>
            <span style={{fontSize:11,fontWeight:700,color:PASS}}>
              Reviewed {fmtDate(log.session_data.review.reviewed_at)} · Score: {log.session_data.review.teacher_score}%
            </span>
          </div>
          {log.session_data.review.teacher_feedback&&(
            <p style={{margin:0,fontSize:12,color:"#166534",fontStyle:"italic"}}>
              "{log.session_data.review.teacher_feedback}"
            </p>
          )}
        </div>
      )}

      {/* Override / review form */}
      <div style={{background:W,borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 14px"}}>
        <p style={{margin:"0 0 10px",fontSize:12,fontWeight:800,color:G}}>
          {reviewed?"✏️ Update Review":"✅ Submit Review"}
        </p>
        <div style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,marginBottom:10}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>Override Score</label>
            <input type="number" min={0} max={100} value={ov.score}
              onChange={e=>onOvChange({...ov,score:e.target.value})}
              style={{width:"100%",padding:"7px 10px",borderRadius:8,
                border:`1.5px solid ${G}44`,fontSize:13,outline:"none",
                background:"#FAFAFA",boxSizing:"border-box" as const}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>Feedback for Student</label>
            <input value={ov.feedback} onChange={e=>onOvChange({...ov,feedback:e.target.value})}
              placeholder="e.g. Good effort, focus on page 300 words…"
              style={{width:"100%",padding:"7px 10px",borderRadius:8,
                border:"1.5px solid #E5E7EB",fontSize:13,outline:"none",
                background:"#FAFAFA",boxSizing:"border-box" as const}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSave} disabled={saving} style={{
            flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",
            background:saving?"#E5E7EB":`linear-gradient(135deg,${G},${GM})`,
            color:saving?"#9CA3AF":W,fontSize:12,fontWeight:800,fontFamily:"inherit",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {saving
              ?<><Loader2 size={13} style={{animation:"spin .8s linear infinite"}}/>Saving…</>
              :<><CheckCircle size={13}/>{reviewed?"Update Review":"Save & Notify Student"}</>}
          </button>
          <button onClick={onClose} style={{padding:"9px 14px",borderRadius:10,
            border:"1.5px solid #E5E7EB",background:W,color:"#6B7280",
            fontSize:12,fontWeight:700,cursor:"pointer"}}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function HifdhAdminReview(){
  const {toast}=useToast();
  const [logs,setLogs]=useState<DailyLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<FilterStatus>("pending");
  const [search,setSearch]=useState("");
  const [openStudents,setOpenStudents]=useState<Set<string>>(new Set());
  const [expandedSession,setExpandedSession]=useState<string|null>(null);
  const [overrides,setOverrides]=useState<Record<string,{score:string;feedback:string}>>({});
  const [saving,setSaving]=useState<string|null>(null);

  useEffect(()=>{loadLogs();},[]);

  const loadLogs=async()=>{
    setLoading(true);
    try{
      const {data:rawLogs}=await (supabase as any)
        .from("hifdh_daily_logs").select("*")
        .order("log_date",{ascending:false}).limit(300);
      if(!rawLogs){setLoading(false);return;}

      const ids=[...new Set(rawLogs.map((l:any)=>l.student_id))];
      const {data:profiles}=await supabase.from("profiles")
        .select("user_id,full_name,email").in("user_id" as any,ids);
      const pmap:Record<string,{name:string;email:string}>={};
      (profiles||[]).forEach((p:any)=>{pmap[p.user_id]={name:p.full_name??"Student",email:p.email??""};});

      const enriched:DailyLog[]=rawLogs.map((l:any)=>({
        ...l,
        session_data:typeof l.session_data==="string"?JSON.parse(l.session_data):l.session_data,
        student_name:pmap[l.student_id]?.name??"Student",
        student_email:pmap[l.student_id]?.email??"",
      }));
      setLogs(enriched);

      const init:Record<string,{score:string;feedback:string}>={};
      enriched.forEach(l=>{
        const rev=l.session_data?.review;
        init[l.id]={score:String(rev?.teacher_score??l.avg_score??0),feedback:rev?.teacher_feedback??""};
      });
      setOverrides(init);
    }catch(e){console.error(e);}
    setLoading(false);
  };

  const saveReview=async(log:DailyLog)=>{
    const ov=overrides[log.id]; if(!ov) return;
    const {data:me}=await supabase.auth.getUser();
    if(!me?.user) return;
    setSaving(log.id);
    try{
      const newScore=Math.min(100,Math.max(0,parseInt(ov.score)||0));
      const updatedSession:SessionData={
        ...log.session_data,
        review:{teacher_score:newScore,teacher_feedback:ov.feedback,
          reviewed_by:me.user.id,reviewed_at:new Date().toISOString()},
      };
      const {error}=await (supabase as any).from("hifdh_daily_logs")
        .update({session_data:updatedSession,avg_score:newScore,updated_at:new Date().toISOString()})
        .eq("id",log.id);
      if(!error){
        setLogs(prev=>prev.map(l=>l.id===log.id?{...l,avg_score:newScore,session_data:updatedSession}:l));
        await (supabase as any).from("notifications").insert({
          user_id:log.student_id,title:"📖 Hifdh Revision Reviewed",
          message:`Your revision on ${fmtDate(log.log_date)} was reviewed. Score: ${newScore}%.${ov.feedback?` "${ov.feedback}"`:""}`,
          type:"hifdh_review",read:false,created_at:new Date().toISOString(),
        });
        toast({title:"✅ Review saved & student notified"});
        setExpandedSession(null);
      }else{toast({title:"Error saving",variant:"destructive"});}
    }catch{toast({title:"Error",variant:"destructive"});}
    setSaving(null);
  };

  const isReviewed=(log:DailyLog)=>!!log.session_data?.review;
  const pendingCount=logs.filter(l=>!isReviewed(l)).length;

  /* Filter then group by student */
  const filteredLogs=logs.filter(l=>{
    if(filter==="pending"  &&  isReviewed(l)) return false;
    if(filter==="reviewed" && !isReviewed(l)) return false;
    if(search&&!l.student_name?.toLowerCase().includes(search.toLowerCase())&&
               !l.student_email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const studentGroups:StudentGroup[]=[];
  const seen=new Map<string,StudentGroup>();
  for(const log of filteredLogs){
    if(!seen.has(log.student_id)){
      const g:StudentGroup={student_id:log.student_id,
        student_name:log.student_name??"Student",
        student_email:log.student_email??"",sessions:[]};
      studentGroups.push(g); seen.set(log.student_id,g);
    }
    seen.get(log.student_id)!.sessions.push(log);
  }

  const toggleStudent=(id:string)=>{
    setOpenStudents(prev=>{
      const next=new Set(prev);
      if(next.has(id)){next.delete(id);setExpandedSession(null);}
      else{next.add(id);}
      return next;
    });
  };

  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:400,gap:12}}>
      <Loader2 size={28} color={GOLD} style={{animation:"spin .8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{color:"#6B7280",fontWeight:600}}>Loading sessions…</span>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#F3F4F6",fontFamily:"system-ui,sans-serif"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${G},${GM})`,padding:"22px 20px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <Users size={22} color={GOLD}/>
          <h1 style={{margin:0,fontSize:20,fontWeight:900,color:W}}>Hifdh Daily Review — Admin</h1>
        </div>
        <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.65)"}}>
          All students · Review sessions, listen to recitations, and override scores
        </p>
        {pendingCount>0&&(
          <div style={{marginTop:10,display:"inline-flex",alignItems:"center",gap:6,
            padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,.12)"}}>
            <Clock size={12} color={GOLD}/>
            <span style={{fontSize:11,fontWeight:700,color:GOLD}}>
              {pendingCount} pending review{pendingCount!==1?"s":""}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{background:W,borderBottom:"1px solid #E5E7EB",padding:"10px 16px",
        display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {(["pending","reviewed","all"] as FilterStatus[]).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:"5px 14px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
            border:`1.5px solid ${filter===f?G:"#E5E7EB"}`,
            background:filter===f?G:W,color:filter===f?W:"#6B7280"}}>
            {f==="pending"?`Pending (${pendingCount})`:f==="reviewed"?"Reviewed":"All"}
          </button>
        ))}
        <div style={{position:"relative",flex:1,minWidth:160}}>
          <Search size={12} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search student name or email…"
            style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,width:"100%",
              borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:12,outline:"none",
              background:"#FAFAFA",boxSizing:"border-box" as const}}/>
        </div>
      </div>

      {/* Student groups */}
      <div style={{maxWidth:920,margin:"16px auto",padding:"0 16px 48px",display:"flex",flexDirection:"column",gap:12}}>
        {studentGroups.length===0?(
          <div style={{textAlign:"center",padding:"60px 24px",borderRadius:20,
            border:"2px dashed #E5E7EB",background:"#FAFAFA",marginTop:8}}>
            <BookOpen size={44} color="#D1D5DB" style={{marginBottom:12}}/>
            <p style={{fontWeight:700,fontSize:15,color:"#374151",margin:"0 0 4px"}}>
              {filter==="pending"?"No pending reviews 🎉":"No sessions found"}
            </p>
          </div>
        ):studentGroups.map(group=>{
          const isOpen=openStudents.has(group.student_id);
          const pendingInGroup=group.sessions.filter(s=>!isReviewed(s)).length;
          const avgScore=Math.round(
            group.sessions.reduce((a,s)=>a+(s.avg_score??0),0)/group.sessions.length
          );

          return(
            <div key={group.student_id} style={{background:W,borderRadius:16,
              border:`1.5px solid ${isOpen?G+"44":"#E5E7EB"}`,overflow:"hidden",
              boxShadow:"0 1px 6px rgba(0,0,0,.05)",animation:"fadeIn .2s ease"}}>

              {/* Student header */}
              <div onClick={()=>toggleStudent(group.student_id)} style={{
                padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",
                background:isOpen?`${G}06`:W}}>
                <div style={{width:42,height:42,borderRadius:"50%",
                  background:`linear-gradient(135deg,${G},${GM})`,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:900,fontSize:16,color:W}}>
                  {(group.student_name||"S")[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:14,color:G,marginBottom:2}}>{group.student_name}</div>
                  <div style={{fontSize:11,color:"#9CA3AF"}}>
                    {group.student_email}
                    <span style={{margin:"0 6px",color:"#D1D5DB"}}>·</span>
                    {group.sessions.length} session{group.sessions.length!==1?"s":""}
                    {pendingInGroup>0&&(
                      <span style={{marginLeft:8,padding:"1px 8px",borderRadius:10,
                        background:"#FEF9C3",color:"#854D0E",fontSize:10,fontWeight:700}}>
                        {pendingInGroup} pending
                      </span>
                    )}
                  </div>
                </div>
                <ScoreRing pct={avgScore} size={44}/>
                {isOpen?<ChevronUp size={16} color="#9CA3AF"/>:<ChevronDown size={16} color="#9CA3AF"/>}
              </div>

              {/* Sessions list */}
              {isOpen&&(
                <div style={{borderTop:`1px solid ${G}18`,background:"#F8FAF9"}}>
                  {group.sessions.map((log,idx)=>{
                    const isSessionOpen=expandedSession===log.id;
                    const reviewed=isReviewed(log);
                    const ov=overrides[log.id]||{score:String(log.avg_score??0),feedback:""};
                    const displayScore=log.avg_score??0;

                    return(
                      <div key={log.id} style={{
                        borderBottom:idx<group.sessions.length-1?`1px solid ${G}12`:"none",
                        background:isSessionOpen?W:"transparent"}}>

                        {/* Session row */}
                        <div onClick={()=>setExpandedSession(isSessionOpen?null:log.id)}
                          style={{padding:"12px 16px 12px 20px",display:"flex",
                            alignItems:"center",gap:10,cursor:"pointer"}}>
                          {/* Date stripe */}
                          <div style={{width:4,height:36,borderRadius:3,flexShrink:0,
                            background:reviewed
                              ?`linear-gradient(${PASS},#4ade80)`
                              :`linear-gradient(${AMBER},#fbbf24)`}}/>
                          {/* Meta */}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:13,color:"#1F2937"}}>
                              {fmtDate(log.log_date)}
                            </div>
                            <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                              {log.pages_revised??0} page{(log.pages_revised||0)!==1?"s":""}
                              {" · "}{fmtDur(log.duration_secs)}
                              {log.session_data?.audio_url&&<span style={{marginLeft:6,color:GOLD}}>🎙</span>}
                            </div>
                          </div>
                          <ScoreRing pct={displayScore} size={40}/>
                          <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,flexShrink:0,
                            background:reviewed?"#F0FDF4":"#FEF9C3",
                            color:reviewed?PASS:"#854D0E"}}>
                            {reviewed?"✓ Reviewed":"⏳ Pending"}
                          </span>
                          {isSessionOpen?<ChevronUp size={14} color="#9CA3AF"/>:<ChevronDown size={14} color="#9CA3AF"/>}
                        </div>

                        {/* Session detail */}
                        {isSessionOpen&&(
                          <SessionDetail
                            log={log} ov={ov} saving={saving===log.id}
                            onOvChange={v=>setOverrides(o=>({...o,[log.id]:v}))}
                            onSave={()=>saveReview(log)}
                            onClose={()=>setExpandedSession(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
