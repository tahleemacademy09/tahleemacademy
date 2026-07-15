// src/pages/teacher/TeacherHifdhReview.tsx
// Teacher review of student daily Hifdh revision logs

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Search, ChevronDown, ChevronUp, BookOpen,
  CheckCircle, Clock, Star, RotateCcw, Mic, FileText,
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
const INK  = "#1a1a2e";

/* ── types ── */
type FilterStatus = "all" | "pending" | "reviewed";

interface AyahSnap { text:string; numberInSurah:number; surahName?:string; surahNum?:number; }
interface PageResult {
  pageNum:number; score:number; errorWords:string[];
  ayahCorrectness?:boolean[]; transcript?:string; ayahs?:AyahSnap[];
}
interface SessionData {
  recitation_score?:number; test_score?:number; pages_done?:number[];
  audio_url?:string|null; page_results?:PageResult[]; errors?:{word:string;page:number}[];
  review?:{ teacher_score:number; teacher_feedback:string; reviewed_by:string; reviewed_at:string; };
  teacher_override?:{ score:number; teacher_feedback:string; reviewed_by:string; reviewed_at:string; };
}
interface DailyLog {
  id:string; student_id:string; assignment_id?:string; log_date:string;
  pages_revised:number|null; avg_score:number|null; duration_secs?:number|null;
  completed?:boolean; session_data?:SessionData; updated_at?:string;
  student_name?:string; student_email?:string;
}

/* ── helpers ── */
const scoreColor=(s:number)=>s>=70?PASS:s>=50?AMBER:FAIL;
const scoreLabel=(s:number)=>s>=70?"Excellent":s>=50?"Good":s<50?"Needs Work":"";
const fmtDate=(d:string)=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
const fmtDur=(s?:number|null)=>!s?"—":`${Math.floor(s/60)}m ${s%60}s`;

/** Strip diacritics + normalise alef variants for Arabic word comparison */
function normalizeAr(t: string): string {
  return t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
    .replace(/[\u0622\u0623\u0625\u0627]/g,"\u0627")
    .replace(/\u0629/g,"\u0647").replace(/\u0649/g,"\u064A")
    .replace(/\u0640/g,"")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"")
    .replace(/\s+/g," ").trim();
}

function ScoreRing({pct,size=72}:{pct:number;size?:number}) {
  const r=size*0.38; const c=2*Math.PI*r;
  const dash=(pct/100)*c;
  const col=scoreColor(pct);
  return (
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

export default function TeacherHifdhReview() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [logs,     setLogs]     = useState<DailyLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterStatus>("pending");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState<string|null>(null);
  const [pageTab,  setPageTab]  = useState<Record<string,number>>({});
  const [overrides,setOverrides]= useState<Record<string,{score:string;feedback:string}>>({});
  const [saving,   setSaving]   = useState<string|null>(null);

  useEffect(()=>{ loadLogs(); },[]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user) { setLoading(false); return; }
      const teacherId = me.user.id;

      /* Get student IDs from subjects this teacher owns */
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", teacherId);
      const subIds = (subs||[]).map((s:any)=>s.id);
      let studentIds: string[] = [];

      if (subIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subIds);
        const cIds = (courses||[]).map((c:any)=>c.id);
        if (cIds.length > 0) {
          const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", cIds);
          studentIds = [...new Set((enr||[]).map((e:any)=>e.user_id))];
        }
      }

      /* Also directly assigned students */
      const { data: pvt } = await supabase.from("profiles").select("user_id").eq("assigned_teacher_id" as any, teacherId);
      const pvtIds = (pvt||[]).map((p:any)=>p.user_id);
      studentIds = [...new Set([...studentIds, ...pvtIds])];

      if (!studentIds.length) { setLoading(false); return; }

      /* Load daily logs */
      const { data: rawLogs } = await (supabase as any)
        .from("hifdh_daily_logs")
        .select("*")
        .in("student_id", studentIds)
        .order("log_date", { ascending: false })
        .limit(200);

      if (!rawLogs) { setLoading(false); return; }

      /* Profiles map */
      const { data: profiles } = await supabase.from("profiles").select("user_id,full_name,email").in("user_id" as any, studentIds);
      const pmap: Record<string,{name:string;email:string}> = {};
      (profiles||[]).forEach((p:any)=>{ pmap[p.user_id]={name:p.full_name??"Student",email:p.email??""}; });

      const enriched: DailyLog[] = rawLogs.map((l:any)=>({
        ...l,
        session_data: typeof l.session_data==="string" ? JSON.parse(l.session_data) : l.session_data,
        student_name: pmap[l.student_id]?.name??"Student",
        student_email: pmap[l.student_id]?.email??"",
      }));

      setLogs(enriched);

      /* Init overrides from existing reviews */
      const init: Record<string,{score:string;feedback:string}> = {};
      enriched.forEach(l=>{
        const rev = l.session_data?.teacher_override ?? l.session_data?.review;
        const revScore = rev ? ((rev as any).score ?? (rev as any).teacher_score ?? l.avg_score ?? 0) : (l.avg_score ?? 0);
        init[l.id] = {
          score: String(revScore),
          feedback: rev?.teacher_feedback ?? "",
        };
      });
      setOverrides(init);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const saveReview = async (log: DailyLog) => {
    const ov = overrides[log.id];
    if (!ov) return;
    const { data: me } = await supabase.auth.getUser();
    if (!me?.user) return;
    setSaving(log.id);
    try {
      const newScore = Math.min(100, Math.max(0, parseInt(ov.score)||0));
      const updatedSession: SessionData = {
        ...log.session_data,
        teacher_override: {
          score: newScore,
          teacher_feedback: ov.feedback,
          reviewed_by: me.user.id,
          reviewed_at: new Date().toISOString(),
        },
      };
      // Use SECURITY DEFINER RPC — direct .update() is silently blocked by RLS
      // (Supabase returns {error:null, count:0} when RLS denies, no exception thrown)
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        "review_hifdh_daily_log",
        { p_log_id: log.id, p_avg_score: newScore, p_session_data: updatedSession }
      );
      const rpcFailed = rpcError || (rpcResult && rpcResult.error);
      if (!rpcFailed) {
        setLogs(prev=>prev.map(l=>l.id===log.id
          ? { ...l, avg_score:newScore, session_data:updatedSession }
          : l
        ));
        // Notify student
        await (supabase as any).from("notifications").insert({
          user_id: log.student_id,
          title: "📖 Hifdh Revision Reviewed",
          message: `Your revision on ${fmtDate(log.log_date)} was reviewed. Score: ${newScore}%. ${ov.feedback?`"${ov.feedback}"`:""}`  ,
          type: "hifdh_review", is_read: false, created_at: new Date().toISOString(),
        });
        toast({ title: "✅ Review saved & student notified" });
        setExpanded(null);
      } else {
        console.error("[TeacherHifdhReview] RPC error:", rpcError, rpcResult);
        toast({ title: "Error saving review", description: rpcResult?.error || rpcError?.message || "Unknown", variant: "destructive" });
      }
    } catch(e: any) {
      console.error("[TeacherHifdhReview] exception:", e);
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
    setSaving(null);
  };

  const isReviewed = (log: DailyLog) => !!(log.session_data?.teacher_override ?? log.session_data?.review);

  const filtered = logs.filter(l=>{
    if (filter==="pending"  && isReviewed(l))  return false;
    if (filter==="reviewed" && !isReviewed(l)) return false;
    if (search && !l.student_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = logs.filter(l=>!isReviewed(l)).length;

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:400,gap:12}}>
      <Loader2 size={28} color={GOLD} style={{animation:"spin .8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{color:"#6B7280",fontWeight:600}}>Loading sessions…</span>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#F3F4F6",fontFamily:"system-ui,sans-serif"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${G},${GM})`,padding:"22px 20px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <BookOpen size={22} color={GOLD}/>
          <h1 style={{margin:0,fontSize:20,fontWeight:900,color:W}}>Hifdh Daily Review</h1>
        </div>
        <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.65)"}}>
          Review your students' daily revision sessions — listen, check verses, and give feedback
        </p>
        {pendingCount > 0 && (
          <div style={{marginTop:10,display:"inline-flex",alignItems:"center",gap:6,
            padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,.12)"}}>
            <Clock size={12} color={GOLD}/>
            <span style={{fontSize:11,fontWeight:700,color:GOLD}}>{pendingCount} pending review{pendingCount!==1?"s":""}</span>
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
            background:filter===f?G:W, color:filter===f?W:"#6B7280",
          }}>
            {f==="pending"?`Pending (${pendingCount})`:f==="reviewed"?"Reviewed":"All"}
          </button>
        ))}
        <div style={{position:"relative",flex:1,minWidth:160}}>
          <Search size={12} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search student…"
            style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,width:"100%",
              borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:12,outline:"none",
              background:"#FAFAFA",boxSizing:"border-box"}}/>
        </div>
      </div>

      {/* List */}
      <div style={{maxWidth:860,margin:"16px auto",padding:"0 16px 48px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"60px 24px",borderRadius:20,
            border:"2px dashed #E5E7EB",background:"#FAFAFA",marginTop:8}}>
            <BookOpen size={44} color="#D1D5DB" style={{marginBottom:12}}/>
            <p style={{fontWeight:700,fontSize:15,color:"#374151",margin:"0 0 4px"}}>
              {filter==="pending"?"No pending reviews 🎉":"No sessions found"}
            </p>
            <p style={{fontSize:12,color:"#9CA3AF",margin:0}}>
              {filter==="pending"?"All caught up — great work!":"Try changing the filter above"}
            </p>
          </div>
        ):filtered.map(log=>{
          const isExp = expanded===log.id;
          const reviewed = isReviewed(log);
          const ov = overrides[log.id]||{score:String(log.avg_score??0),feedback:""};
          const sd = log.session_data;
          const pages = sd?.page_results||[];
          const curPage = pageTab[log.id]??0;
          const pr = pages[curPage];
          const displayScore = log.avg_score??0;

          return (
            <div key={log.id} style={{background:W,borderRadius:16,border:"1px solid #E5E7EB",
              overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.04)",animation:"fadeIn .2s ease"}}>

              {/* Row header */}
              <div onClick={()=>setExpanded(isExp?null:log.id)}
                style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                {/* Avatar */}
                <div style={{width:38,height:38,borderRadius:"50%",background:G,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:900,fontSize:15,color:W}}>
                  {(log.student_name||"S")[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:G,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {log.student_name}
                  </div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                    {fmtDate(log.log_date)} · {log.pages_revised??0} page{(log.pages_revised||0)!==1?"s":""} · {fmtDur(log.duration_secs)}
                  </div>
                </div>

                {/* Score */}
                <ScoreRing pct={displayScore} size={52}/>

                {/* Status badge */}
                <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,flexShrink:0,
                  background:reviewed?"#F0FDF4":"#FEF9C3",color:reviewed?PASS:"#854D0E"}}>
                  {reviewed?"✓ Reviewed":"⏳ Pending"}
                </span>

                {isExp?<ChevronUp size={15} color="#9CA3AF"/>:<ChevronDown size={15} color="#9CA3AF"/>}
              </div>

              {/* Expanded detail panel */}
              {isExp&&(
                <div style={{borderTop:"1px solid #F3F4F6",background:"#FAFAFA",
                  padding:"16px",display:"flex",flexDirection:"column",gap:14}}>

                  {/* Summary row */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[
                      {icon:<Star size={13} color={GOLD}/>,label:"Recitation",value:`${sd?.recitation_score??displayScore}%`},
                      {icon:<FileText size={13} color={G}/>,  label:"Test Score", value:`${sd?.test_score??0}%`},
                      {icon:<Mic size={13} color={FAIL}/>,    label:"Duration",  value:fmtDur(log.duration_secs)},
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
                  {sd?.audio_url&&(
                    <div style={{background:W,borderRadius:12,border:"1px solid #E5E7EB",padding:"10px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                        <Mic size={12} color={G}/>
                        <span style={{fontSize:11,fontWeight:800,color:G,textTransform:"uppercase",letterSpacing:.4}}>
                          Recitation Audio
                        </span>
                      </div>
                      <audio controls src={sd.audio_url} style={{width:"100%",height:34,borderRadius:8}}/>
                    </div>
                  )}

                  {/* Per-page tabs */}
                  {pages.length>0&&(
                    <>
                      {pages.length>1&&(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {pages.map((p,i)=>(
                            <button key={i} onClick={()=>setPageTab(t=>({...t,[log.id]:i}))}
                              style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                                border:`1.5px solid ${curPage===i?G:"#E5E7EB"}`,
                                background:curPage===i?G:W,color:curPage===i?W:"#6B7280"}}>
                              Page {p.pageNum}
                              <span style={{marginLeft:4,fontSize:10,
                                color:curPage===i?GOLD:scoreColor(p.score)}}>
                                {p.score}%
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {pr&&(
                        <div style={{background:W,borderRadius:12,border:"1px solid #E5E7EB",overflow:"hidden"}}>
                          {/* Page header */}
                          <div style={{padding:"8px 14px",background:`${G}08`,
                            borderBottom:"1px solid #E5E7EB",
                            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontWeight:800,fontSize:12,color:G}}>
                              📖 Page {pr.pageNum}
                              {pr.ayahs?.[0]?.surahName&&` · ${pr.ayahs[0].surahName}`}
                            </span>
                            <span style={{fontWeight:900,fontSize:13,color:scoreColor(pr.score)}}>
                              {pr.score}% — {scoreLabel(pr.score)}
                            </span>
                          </div>

                          {/* Word-by-word coloring — same approach as student مراجعة */}
                          {pr.ayahs&&pr.ayahs.length>0&&(
                            <div style={{padding:"12px 14px"}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                <span style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:.4}}>
                                  Word-by-Word Analysis
                                </span>
                                {pr.errorWords&&(
                                  <span style={{fontSize:10,fontWeight:700}}>
                                    <span style={{color:PASS}}>
                                      ✓{pr.ayahs.reduce((acc,a)=>acc+a.text.split(/\s+/).filter(Boolean).length,0)-pr.errorWords.length} correct
                                    </span>
                                    {" · "}
                                    <span style={{color:FAIL}}>✗{pr.errorWords.length} missed</span>
                                  </span>
                                )}
                              </div>
                              {(()=>{
                                const errSet=new Set((pr.errorWords||[]).map(w=>normalizeAr(w)));
                                return (
                                  <div style={{
                                    background:"#fffdf6",borderRadius:8,
                                    border:`1.5px solid ${GOLD}55`,
                                    padding:"12px 14px",
                                    direction:"rtl",
                                    fontFamily:"'Amiri Quran','Amiri',serif",
                                    fontSize:20,lineHeight:3.8,
                                    textAlign:"justify",
                                    wordBreak:"keep-all",overflowWrap:"break-word",
                                  }}>
                                    {pr.ayahs.map((a,ai)=>(
                                      <span key={ai}>
                                        {a.text.split(/\s+/).filter(Boolean).map((wd,wi)=>{
                                          const ok=!errSet.has(normalizeAr(wd));
                                          return (
                                            <span key={wi} style={{
                                              background:ok?`${PASS}28`:`${FAIL}20`,
                                              color:ok?"#14532d":"#991b1b",
                                              borderRadius:5,
                                              boxShadow:`inset 0 0 0 1.5px ${ok?PASS+"55":FAIL+"55"}`,
                                              padding:"2px 4px",margin:"0 2px",
                                              fontWeight:ok?400:600,
                                            }}>{wd}</span>
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

                          {/* Transcript */}
                          {pr.transcript&&(
                            <div style={{padding:"0 14px 12px"}}>
                              <p style={{fontSize:10,fontWeight:800,color:"#6B7280",
                                textTransform:"uppercase",letterSpacing:.4,margin:"0 0 4px"}}>
                                Transcript (AI heard)
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
                  {reviewed&&(()=>{const rov=log.session_data?.teacher_override??log.session_data?.review;if(!rov)return null;const rovScore=(rov as any).score??(rov as any).teacher_score??log.avg_score??0;return(
                    <div style={{padding:"10px 14px",borderRadius:10,
                      background:"#F0FDF4",border:"1px solid #86EFAC"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <CheckCircle size={13} color={PASS}/>
                        <span style={{fontSize:11,fontWeight:700,color:PASS}}>
                          Reviewed on {fmtDate(rov.reviewed_at)} · Score overridden to {rovScore}%
                        </span>
                      </div>
                      {rov.teacher_feedback&&(
                        <p style={{margin:0,fontSize:12,color:"#166534",fontStyle:"italic"}}>
                          "{rov.teacher_feedback}"
                        </p>
                      )}
                    </div>
                  );})()}

                  {/* Override form */}
                  <div style={{background:W,borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 14px"}}>
                    <p style={{margin:"0 0 10px",fontSize:12,fontWeight:800,color:G}}>
                      {reviewed?"✏️ Update Review":"✅ Submit Review"}
                    </p>
                    <div style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>
                          Override Score
                        </label>
                        <input type="number" min={0} max={100}
                          value={ov.score}
                          onChange={e=>setOverrides(o=>({...o,[log.id]:{...ov,score:e.target.value}}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:8,
                            border:`1.5px solid ${G}44`,fontSize:13,outline:"none",
                            background:"#FAFAFA",boxSizing:"border-box" as const}}/>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>
                          Feedback for Student
                        </label>
                        <input value={ov.feedback}
                          onChange={e=>setOverrides(o=>({...o,[log.id]:{...ov,feedback:e.target.value}}))}
                          placeholder="e.g. Excellent tajweed, work on makhaarij…"
                          style={{width:"100%",padding:"7px 10px",borderRadius:8,
                            border:"1.5px solid #E5E7EB",fontSize:13,outline:"none",
                            background:"#FAFAFA",boxSizing:"border-box" as const}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>saveReview(log)} disabled={saving===log.id}
                        style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",
                          background:saving===log.id?"#E5E7EB":`linear-gradient(135deg,${G},${GM})`,
                          color:saving===log.id?"#9CA3AF":W,
                          fontSize:12,fontWeight:800,fontFamily:"inherit",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        {saving===log.id
                          ?<><Loader2 size={13} style={{animation:"spin .8s linear infinite"}}/>Saving…</>
                          :<><CheckCircle size={13}/>{reviewed?"Update Review":"Save & Notify Student"}</>}
                      </button>
                      <button onClick={()=>{ setExpanded(null); }}
                        style={{padding:"9px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",
                          background:W,color:"#6B7280",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        Close
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
