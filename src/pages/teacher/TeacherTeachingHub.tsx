// src/pages/teacher/TeacherTeachingHub.tsx
// FIXED:
//  1. Timetable "View" button now calls joinClass() / creates a live_session — not navigate()
//  2. Live Classes tab shows today's timetable slots with Start/Join per subject
//  3. Subjects fetched from BOTH teacher_id owner AND subject_timetable assigned rows

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import {
  Video, BookOpen, Clock, Mic, Star, Radio,
  Plus, X, Play, Users, Calendar,
  FolderOpen, ClipboardList, Megaphone, Search,
} from "lucide-react";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import TeacherRecitation    from "./TeacherRecitation";
import TeacherHifdhReview   from "./TeacherHifdhReview";
import TeacherPublicClasses from "./TeacherPublicClasses";

const G    = "#064E3B";
const GM   = "#0a5c3e";
const GOLD = "#C9A84C";
const BG   = "#F0F2F5";
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, border: "1px solid rgba(15,45,31,.07)",
  boxShadow: "0 1px 6px rgba(0,0,0,.04)",
};
const bs = (active = false): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
  fontWeight: 700, fontSize: 13,
  background: active ? G : "#F0F4F2",
  color: active ? "#fff" : G,
});
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
  background: "#FAFBFC", boxSizing: "border-box",
};
const bdg = (color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 20,
  fontSize: 11, fontWeight: 700, background: `${color}18`, color,
});

type HubTab = "classes" | "subjects" | "timetable" | "recordings" | "recitation" | "hifdh" | "public";
const TABS: { id: HubTab; icon: any; en: string; ar: string }[] = [
  { id: "classes",    icon: Video,    en: "Live Classes",   ar: "الفصول" },
  { id: "subjects",   icon: BookOpen, en: "My Subjects",    ar: "موادي" },
  { id: "timetable",  icon: Clock,    en: "Timetable",      ar: "الجدول" },
  { id: "recordings", icon: Mic,      en: "Recordings",     ar: "التسجيلات" },
  { id: "recitation", icon: Star,     en: "Recitation",     ar: "التلاوة" },
  { id: "hifdh",      icon: BookOpen, en: "Hifdh",          ar: "الحفظ" },
  { id: "public",     icon: Radio,    en: "Public",         ar: "العام" },
];

function Spin() { return <div style={{ width:14,height:14,borderRadius:"50%",border:"2px solid #fff8",borderTopColor:"#fff",animation:"spin .6s linear infinite" }} />; }
function Loader() { return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:200}}><div style={{width:32,height:32,borderRadius:"50%",border:`3px solid ${G}`,borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>; }

// ── Fetch subjects for teacher: both owned and timetable-assigned ──
async function fetchTeacherSubjects(userId: string): Promise<any[]> {
  const { data: owned } = await supabase.from("subjects").select("*").eq("teacher_id", userId).order("title");
  const { data: ttSlots } = await (supabase as any).from("subject_timetable").select("subject_id").eq("teacher_id", userId);
  const ttIds = [...new Set((ttSlots||[]).map((s:any)=>s.subject_id).filter(Boolean))];
  const ownedIds = (owned||[]).map((s:any)=>s.id);
  const missing = ttIds.filter((id:string)=>!ownedIds.includes(id));
  let extra: any[] = [];
  if (missing.length) { const {data}=await supabase.from("subjects").select("*").in("id",missing as string[]); extra=data||[]; }
  return [...(owned||[]),...extra];
}

// ── Fetch all timetable slots for teacher ──
async function fetchTimetableSlots(userId: string, subjectIds: string[]): Promise<any[]> {
  let rows: any[] = [];
  if (subjectIds.length) {
    const {data} = await (supabase as any).from("subject_timetable").select("*, subjects(id,title,title_ar)").in("subject_id",subjectIds).eq("is_active",true);
    rows = data||[];
  }
  const {data:byT} = await (supabase as any).from("subject_timetable").select("*, subjects(id,title,title_ar)").eq("teacher_id",userId).eq("is_active",true);
  const seen = new Set(rows.map((r:any)=>r.id));
  for (const r of (byT||[])) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
  return rows;
}

function to12(t:string){if(!t)return"";const[h,m]=t.split(":").map(Number);return`${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;}
function mins2(ts:string){const[h,m]=ts.split(":").map(Number);const tgt=new Date();tgt.setHours(h,m,0,0);return(tgt.getTime()-Date.now())/60000;}

// ═══════════════════════════════════════════════════════════════════
// LIVE CLASSES TAB
// ═══════════════════════════════════════════════════════════════════
function LiveClassesTab({user,t}:any){
  const {joinClass}=useLiveClass();
  const {toast}=useToast();
  const today=new Date().getDay();
  const [todaySlots,setTodaySlots]=useState<any[]>([]);
  const [sessions,setSessions]=useState<any[]>([]);
  const [subjects,setSubjects]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [starting,setStarting]=useState<string|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({subject_id:"",topic:"",date:"",time:"",duration:60});
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    if(!user)return;
    const subs=await fetchTeacherSubjects(user.id);
    setSubjects(subs);
    const ids=subs.map((s:any)=>s.id);
    const slots=await fetchTimetableSlots(user.id,ids);
    setTodaySlots(slots.filter((s:any)=>s.day_of_week===today).sort((a:any,b:any)=>a.start_time.localeCompare(b.start_time)));
    if(ids.length){
      const {data}=await supabase.from("live_sessions").select("*, subjects(id,title,title_ar)").in("subject_id",ids).in("status",["live","scheduled"]).order("scheduled_at",{ascending:false});
      setSessions(data||[]);
    }
    setLoading(false);
  },[user,today]);

  useEffect(()=>{load();},[load]);

  const startClass=async(subId:string,subTitle:string)=>{
    setStarting(subId);
    try{
      const ex=sessions.find(s=>s.subject_id===subId&&s.status==="live");
      if(!ex){
        const {error}=await supabase.from("live_sessions").insert({subject_id:subId,host_id:user.id,status:"live",actual_start_time:new Date().toISOString()});
        if(error)throw error;
        await load();
      }
      joinClass({id:subId,title:subTitle});
    }catch(e:any){toast({title:t("Failed to start","فشل"),description:e?.message,variant:"destructive"});}
    setStarting(null);
  };

  const schedule=async()=>{
    if(!form.subject_id||!user)return;
    setSaving(true);
    const at=form.date&&form.time?`${form.date}T${form.time}:00`:new Date().toISOString();
    const {error}=await supabase.from("live_sessions").insert({subject_id:form.subject_id,host_id:user.id,status:"scheduled",scheduled_at:at,topic:form.topic||null,duration_minutes:form.duration});
    if(!error){toast({title:t("Scheduled!","تمت الجدولة!")});setShowForm(false);setForm({subject_id:"",topic:"",date:"",time:"",duration:60});load();}
    setSaving(false);
  };

  if(loading)return<Loader/>;

  const liveNow=sessions.filter(s=>s.status==="live");
  const sched=sessions.filter(s=>s.status==="scheduled");

  return(
    <div>
      {/* Today timetable */}
      {todaySlots.length>0&&(
        <div style={{marginBottom:20}}>
          <p style={{fontSize:11,fontWeight:800,color:G,letterSpacing:"0.08em",marginBottom:10}}>
            📅 {t("TODAY'S SCHEDULE","جدول اليوم")} — {DAY_NAMES[today].toUpperCase()}
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {todaySlots.map((slot:any)=>{
              const mn=mins2(slot.start_time);
              const isNow=mn<=0&&mn>-(slot.duration_minutes||60);
              const isSoon=mn>0&&mn<60;
              const lv=sessions.find(s=>s.subject_id===slot.subject_id&&s.status==="live");
              const title=slot.subjects?.title||"Subject";
              return(
                <div key={slot.id} style={{...card,padding:"14px 16px",borderLeft:`4px solid ${isNow?"#DC2626":isSoon?GOLD:G}`,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flexShrink:0,textAlign:"center",minWidth:64}}>
                    <div style={{fontSize:14,fontWeight:900,color:isNow?"#DC2626":G}}>{to12(slot.start_time)}</div>
                    <div style={{fontSize:10,color:"#9ca3af"}}>{to12(slot.end_time)}</div>
                    {isNow&&<div style={{fontSize:9,fontWeight:900,color:"#DC2626",marginTop:2}}>● LIVE</div>}
                    {isSoon&&!isNow&&<div style={{fontSize:9,color:GOLD,fontWeight:700}}>{Math.round(mn)}m</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#1a2e25",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
                    <div style={{fontSize:11,color:"#7a9e88",marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {slot.level&&<span style={bdg(G)}>{slot.level}</span>}
                      {slot.duration_minutes&&<span>🕐 {slot.duration_minutes}m</span>}
                      {lv&&<span style={bdg("#DC2626")}>session active</span>}
                    </div>
                  </div>
                  {lv?(
                    <button style={{...bs(true),background:"#DC2626",display:"flex",alignItems:"center",gap:5,flexShrink:0}}
                      onClick={()=>joinClass({id:slot.subject_id,title})}>
                      <Play size={13}/>{t("Join","انضم")}
                    </button>
                  ):(
                    <button disabled={starting===slot.subject_id}
                      style={{...bs(true),display:"flex",alignItems:"center",gap:5,flexShrink:0,opacity:starting===slot.subject_id?.6:1}}
                      onClick={()=>startClass(slot.subject_id,title)}>
                      {starting===slot.subject_id?<Spin/>:<Video size={13}/>}
                      {t("Start Class","ابدأ الفصل")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live now */}
      {liveNow.length>0&&(
        <div style={{marginBottom:20}}>
          <p style={{fontSize:11,fontWeight:800,color:"#DC2626",letterSpacing:"0.08em",marginBottom:8}}>🔴 {t("LIVE NOW","مباشر الآن")}</p>
          {liveNow.map(s=>(
            <div key={s.id} style={{...card,padding:"12px 16px",marginBottom:6,borderLeft:"4px solid #DC2626",display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#1a2e25"}}>{s.subjects?.title}</div>
                {s.topic&&<div style={{fontSize:12,color:"#6b7280"}}>{s.topic}</div>}
              </div>
              <button style={{...bs(true),background:"#DC2626",display:"flex",alignItems:"center",gap:5}}
                onClick={()=>joinClass({id:s.subject_id,title:s.subjects?.title})}>
                <Play size={13}/>{t("Join","انضم")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Scheduled */}
      {sched.length>0&&(
        <div style={{marginBottom:20}}>
          <p style={{fontSize:11,fontWeight:800,color:GOLD,letterSpacing:"0.08em",marginBottom:8}}>{t("SCHEDULED","مجدولة")}</p>
          {sched.map(s=>(
            <div key={s.id} style={{...card,padding:"12px 16px",marginBottom:6,borderLeft:`4px solid ${GOLD}`,display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#1a2e25"}}>{s.subjects?.title}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{s.scheduled_at?new Date(s.scheduled_at).toLocaleString():""}{s.topic?` · ${s.topic}`:""}</div>
              </div>
              <button style={{...bs(true),display:"flex",alignItems:"center",gap:5}}
                onClick={()=>startClass(s.subject_id,s.subjects?.title)}>
                <Video size={13}/>{t("Start","ابدأ")}
              </button>
            </div>
          ))}
        </div>
      )}

      {todaySlots.length===0&&liveNow.length===0&&sched.length===0&&(
        <div style={{...card,padding:"36px 24px",textAlign:"center",marginBottom:20}}>
          <Video size={36} style={{opacity:.2,marginBottom:10,color:G}}/>
          <p style={{fontSize:14,color:"#6b7280"}}>{t("No classes today.","لا توجد حصص اليوم.")}</p>
        </div>
      )}

      {/* Instant start */}
      {subjects.length>0&&(
        <div style={{marginBottom:20}}>
          <p style={{fontSize:11,fontWeight:800,color:"#6b7280",letterSpacing:"0.08em",marginBottom:8}}>{t("START ANY CLASS NOW","ابدأ أي فصل الآن")}</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>
            {subjects.map((sub:any)=>(
              <button key={sub.id} disabled={starting===sub.id}
                style={{...card,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",border:"none",textAlign:"left",opacity:starting===sub.id?.6:1} as React.CSSProperties}
                onClick={()=>startClass(sub.id,sub.title)}>
                <div style={{width:34,height:34,borderRadius:10,background:`${G}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {starting===sub.id?<div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${G}`,borderTopColor:"transparent",animation:"spin .6s linear infinite"}}/>:<Video size={15} color={G}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1a2e25",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.title}</div>
                  <div style={{fontSize:11,color:"#7a9e88"}}>{t("Start now","ابدأ الآن")}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Schedule future */}
      <div>
        <button style={{...bs(false),display:"flex",alignItems:"center",gap:6,marginBottom:10}}
          onClick={()=>setShowForm(v=>!v)}>
          {showForm?<><X size={13}/>{t("Cancel","إلغاء")}</>:<><Plus size={13}/>{t("Schedule Future Session","جدولة جلسة مستقبلية")}</>}
        </button>
        {showForm&&(
          <div style={{...card,padding:16,background:"#F8FAF9"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{gridColumn:"1 / -1"}}>
                <p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{t("Subject","المادة")} *</p>
                <select style={inp} value={form.subject_id} onChange={e=>setForm(f=>({...f,subject_id:e.target.value}))}>
                  <option value="">{t("— Select —","— اختر —")}</option>
                  {subjects.map((s:any)=><option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div><p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{t("Date","التاريخ")}</p><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
              <div><p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{t("Time","الوقت")}</p><input type="time" style={inp} value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div>
              <div><p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{t("Topic","الموضوع")}</p><input style={inp} value={form.topic} placeholder={t("Optional…","اختياري…")} onChange={e=>setForm(f=>({...f,topic:e.target.value}))}/></div>
              <div><p style={{fontSize:11,color:"#6b7280",marginBottom:3}}>{t("Duration (min)","المدة")}</p><input type="number" style={inp} value={form.duration} min={15} max={300} onChange={e=>setForm(f=>({...f,duration:+e.target.value}))}/></div>
            </div>
            <button style={{...bs(true),opacity:saving?.6:1}} disabled={saving} onClick={schedule}>
              {saving?t("Scheduling…","جاري…"):t("Schedule Session","جدولة الجلسة")}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMETABLE TAB — with working Join/Start (was navigate(), now joinClass)
// ═══════════════════════════════════════════════════════════════════
function TimetableTab({user,t,language}:any){
  const {joinClass}=useLiveClass();
  const {toast}=useToast();
  const today=new Date().getDay();
  const [selDay,setSelDay]=useState(today);
  const [slots,setSlots]=useState<any[]>([]);
  const [sessions,setSessions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [starting,setStarting]=useState<string|null>(null);

  const load=useCallback(async()=>{
    if(!user)return;
    const subs=await fetchTeacherSubjects(user.id);
    const ids=subs.map((s:any)=>s.id);
    const all=await fetchTimetableSlots(user.id,ids);
    setSlots(all);
    if(ids.length){
      const {data}=await supabase.from("live_sessions").select("*, subjects(id,title)").in("subject_id",ids).in("status",["live","scheduled"]);
      setSessions(data||[]);
    }
    setLoading(false);
  },[user]);

  useEffect(()=>{load();},[load]);

  const startSlot=async(slot:any)=>{
    const title=slot.subjects?.title||"Class";
    setStarting(slot.id);
    try{
      const ex=sessions.find(s=>s.subject_id===slot.subject_id&&s.status==="live");
      if(!ex){
        const {error}=await supabase.from("live_sessions").insert({subject_id:slot.subject_id,host_id:user.id,status:"live",actual_start_time:new Date().toISOString()});
        if(error)throw error;
        await load();
      }
      joinClass({id:slot.subject_id,title});
    }catch(e:any){toast({title:t("Failed to start","فشل"),description:e?.message,variant:"destructive"});}
    setStarting(null);
  };

  const withSlots=new Set(slots.map((s:any)=>s.day_of_week));
  const daySlots=slots.filter((s:any)=>s.day_of_week===selDay).sort((a:any,b:any)=>a.start_time.localeCompare(b.start_time));

  if(loading)return<Loader/>;

  return(
    <div>
      {/* Day pills */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:16,paddingBottom:4}}>
        {Array.from({length:7},(_,i)=>{
          const isTod=i===today,isSel=i===selDay,hasCls=withSlots.has(i);
          return(
            <button key={i} onClick={()=>setSelDay(i)} style={{flexShrink:0,width:50,padding:"9px 0",borderRadius:12,border:"none",cursor:"pointer",background:isSel?G:"#fff",boxShadow:isSel?"0 4px 14px rgba(6,78,59,.3)":"0 1px 4px rgba(0,0,0,.08)",display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .15s"}}>
              <span style={{fontSize:9,fontWeight:700,color:isSel?"rgba(255,255,255,.7)":"#9CA3AF",textTransform:"uppercase"}}>{DAY_SHORT[i]}</span>
              <span style={{fontSize:13,fontWeight:900,color:isSel?"#fff":isTod?GOLD:G}}>{isTod?"●":String(i+1)}</span>
              {hasCls&&<div style={{width:5,height:5,borderRadius:"50%",background:isSel?GOLD:G}}/>}
            </button>
          );
        })}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <h3 style={{fontSize:15,fontWeight:800,color:G,margin:0}}>
          {DAY_NAMES[selDay]}
          {selDay===today&&<span style={{marginLeft:8,fontSize:11,padding:"2px 8px",borderRadius:20,background:"#F0FDF4",color:"#16A34A",fontWeight:700}}>{t("Today","اليوم")}</span>}
        </h3>
        <span style={{fontSize:12,color:"#9ca3af"}}>{daySlots.length} {t("class(es)","حصة")}</span>
      </div>

      {daySlots.length===0?(
        <div style={{...card,padding:"40px 24px",textAlign:"center"}}>
          <Calendar size={36} style={{opacity:.2,marginBottom:10,color:G}}/>
          <p style={{color:"#9ca3af",fontSize:13}}>{t("No classes on this day","لا توجد حصص في هذا اليوم")}</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {daySlots.map((slot:any)=>{
            const isToday2=selDay===today;
            const mn=isToday2?mins2(slot.start_time):9999;
            const isLive=isToday2&&mn<=0&&mn>-(slot.duration_minutes||60);
            const isSoon=isToday2&&mn>0&&mn<60;
            const lv=sessions.find(s=>s.subject_id===slot.subject_id&&s.status==="live");
            const title=slot.subjects?.title||"Subject";
            return(
              <div key={slot.id} style={{...card,overflow:"hidden",borderLeft:`4px solid ${isLive?"#DC2626":isSoon?GOLD:G}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px"}}>
                  <div style={{flexShrink:0,textAlign:"center",width:64}}>
                    <div style={{fontSize:14,fontWeight:900,color:isLive?"#DC2626":G}}>{to12(slot.start_time)}</div>
                    <div style={{fontSize:10,color:"#9ca3af"}}>{to12(slot.end_time)}</div>
                    {isLive&&<div style={{fontSize:9,fontWeight:900,color:"#DC2626",marginTop:2}}>● LIVE</div>}
                    {isSoon&&!isLive&&<div style={{fontSize:9,color:GOLD,fontWeight:700}}>{Math.round(mn)}m</div>}
                  </div>
                  <div style={{width:2,height:46,borderRadius:1,background:isLive?"#DC2626":`${G}30`,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#1a2e25",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
                    <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                      {slot.level&&<span style={bdg(G)}>{slot.level}</span>}
                      {slot.session_type&&<span style={bdg("#6b7280")}>{slot.session_type}</span>}
                      {slot.duration_minutes&&<span style={{fontSize:11,color:"#9ca3af"}}>🕐 {slot.duration_minutes}m</span>}
                      {lv&&<span style={bdg("#DC2626")}>active session</span>}
                    </div>
                  </div>
                  {/* KEY FIX: was navigate("/teacher/classes"), now calls joinClass/startSlot */}
                  {lv?(
                    <button style={{...bs(true),background:"#DC2626",padding:"8px 14px",display:"flex",alignItems:"center",gap:5,flexShrink:0}}
                      onClick={()=>joinClass({id:slot.subject_id,title})}>
                      <Play size={13}/>{t("Join","انضم")}
                    </button>
                  ):(
                    <button disabled={starting===slot.id}
                      style={{...bs(true),padding:"8px 14px",display:"flex",alignItems:"center",gap:5,flexShrink:0,opacity:starting===slot.id?.6:1}}
                      onClick={()=>startSlot(slot)}>
                      {starting===slot.id?<Spin/>:<Video size={13}/>}
                      {t("Start Class","ابدأ الفصل")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUBJECTS TAB
// ═══════════════════════════════════════════════════════════════════
type SubjectTab2="students"|"materials"|"syllabus"|"assignments"|"announcements"|"recordings";
const SUB_TABS:{id:SubjectTab2;icon:any;en:string;ar:string}[]=[
  {id:"students",icon:Users,en:"Students",ar:"الطلاب"},
  {id:"materials",icon:FolderOpen,en:"Materials",ar:"المواد"},
  {id:"syllabus",icon:Calendar,en:"Syllabus",ar:"المنهج"},
  {id:"assignments",icon:ClipboardList,en:"Assignments",ar:"الواجبات"},
  {id:"announcements",icon:Megaphone,en:"Announcements",ar:"الإعلانات"},
  {id:"recordings",icon:Mic,en:"Recordings",ar:"التسجيلات"},
];

function SubjectsTab({user,t,language}:any){
  const {joinClass}=useLiveClass();
  const [subjects,setSubjects]=useState<any[]>([]);
  const [counts,setCounts]=useState<Record<string,any>>({});
  const [selected,setSelected]=useState<any>(null);
  const [activeTab,setActiveTab]=useState<SubjectTab2>("students");
  const [students,setStudents]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");

  useEffect(()=>{
    if(!user)return;
    const load=async()=>{
      const subs=await fetchTeacherSubjects(user.id);
      setSubjects(subs);
      const cMap:Record<string,any>={};
      await Promise.all(subs.map(async(sub:any)=>{
        const {count:mc}=await supabase.from("subject_materials").select("id",{count:"exact",head:true}).eq("subject_id",sub.id);
        const {data:courses}=await supabase.from("courses").select("id").eq("subject_id",sub.id);
        const cids=(courses||[]).map((c:any)=>c.id);
        let sc=0;
        if(cids.length){const{count}=await supabase.from("enrollments").select("user_id",{count:"exact",head:true}).in("course_id",cids);sc=count||0;}
        cMap[sub.id]={materials:mc||0,students:sc};
      }));
      setCounts(cMap);
      setLoading(false);
    };
    load();
  },[user]);

  const openSub=async(sub:any)=>{
    setSelected(sub);setActiveTab("students");setStudents([]);
    const {data:courses}=await supabase.from("courses").select("id").eq("subject_id",sub.id);
    const cids=(courses||[]).map((c:any)=>c.id);
    if(!cids.length)return;
    const {data:enr}=await supabase.from("enrollments").select("user_id").in("course_id",cids);
    const uids=[...new Set((enr||[]).map((e:any)=>e.user_id))];
    if(!uids.length)return;
    const {data:profs}=await supabase.from("profiles").select("user_id,full_name,level").in("user_id",uids as string[]);
    setStudents(profs||[]);
  };

  const lvlC:Record<string,string>={beginner:"#16A34A",intermediate:"#2563EB",advanced:"#7C3AED"};
  const filtered=subjects.filter(s=>!search||(s.title||"").toLowerCase().includes(search.toLowerCase()));

  if(loading)return<Loader/>;

  if(selected)return(
    <div>
      <button style={{...bs(false),display:"flex",alignItems:"center",gap:6,marginBottom:14,fontSize:12}} onClick={()=>setSelected(null)}>
        ← {t("Back","رجوع")}
      </button>
      <div style={{...card,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:12,background:`${G}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={20} color={G}/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:16,color:"#1a2e25"}}>{selected.title}</div>
          {selected.title_ar&&<div style={{fontSize:12,color:GOLD,direction:"rtl"}}>{selected.title_ar}</div>}
          <div style={{fontSize:12,color:"#7a9e88",marginTop:2}}>{counts[selected.id]?.students||0} {t("students","طلاب")} · {counts[selected.id]?.materials||0} {t("materials","مواد")}</div>
        </div>
        <button style={{...bs(true),display:"flex",alignItems:"center",gap:5}} onClick={()=>joinClass(selected)}>
          <Play size={13}/>{t("Start Class","ابدأ الفصل")}
        </button>
      </div>
      <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:14,paddingBottom:2}}>
        {SUB_TABS.map(st=>{
          const active=activeTab===st.id;
          return(
            <button key={st.id} onClick={()=>setActiveTab(st.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,cursor:"pointer",fontWeight:active?700:500,fontSize:12,flexShrink:0,background:active?G:"#fff",color:active?"#fff":"#6b7280",border:`1.5px solid ${active?G:"#e5e7eb"}`,transition:"all .13s"} as React.CSSProperties}>
              <st.icon size={12}/>{language==="ar"?st.ar:st.en}
            </button>
          );
        })}
      </div>
      {activeTab==="students"&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {students.length===0&&<p style={{textAlign:"center",color:"#9ca3af",padding:"28px",fontSize:13}}>{t("No enrolled students.","لا يوجد طلاب.")}</p>}
          {students.map(s=>(
            <div key={s.user_id} style={{...card,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`${G}15`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:G,flexShrink:0}}>{(s.full_name||"?")[0].toUpperCase()}</div>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:"#374151"}}>{s.full_name}</span>
              <span style={bdg(lvlC[s.level||"beginner"]||G)}>{s.level||"beginner"}</span>
            </div>
          ))}
        </div>
      )}
      {activeTab==="materials"&&<SubjectMaterials subjectId={selected.id}/>}
      {activeTab==="syllabus"&&<SubjectSyllabus subjectId={selected.id}/>}
      {activeTab==="assignments"&&<SubjectAssignments subjectId={selected.id}/>}
      {activeTab==="announcements"&&<SubjectAnnouncements subjectId={selected.id}/>}
      {activeTab==="recordings"&&<SubjectRecordings subjectId={selected.id}/>}
    </div>
  );

  return(
    <div>
      {subjects.length>0&&(
        <div style={{position:"relative",marginBottom:14}}>
          <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94a3b8"}}/>
          <input style={{...inp,paddingLeft:32,maxWidth:320}} placeholder={t("Search subjects…","ابحث…")} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      )}
      {filtered.length===0&&(
        <div style={{...card,padding:"48px 24px",textAlign:"center"}}>
          <BookOpen size={40} style={{opacity:.2,marginBottom:12,color:G}}/>
          <p style={{fontSize:14,color:"#6b7280"}}>{search?t("No match.","لا توجد مواد."):t("No subjects assigned yet.","لا توجد مواد معينة لك بعد.")}</p>
          {!search&&<p style={{fontSize:12,color:"#9ca3af",marginTop:6}}>{t("Check that your user id is set as teacher_id on a subject, or that you appear in subject_timetable.","تأكد من تعيين معرفك كـ teacher_id على مادة، أو ظهورك في الجدول الزمني.")}</p>}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
        {filtered.map(sub=>(
          <div key={sub.id} style={{...card,padding:16,cursor:"pointer",transition:"transform .15s,box-shadow .15s"}}
            onClick={()=>openSub(sub)}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLElement).style.boxShadow="0 6px 20px rgba(0,0,0,.09)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="";(e.currentTarget as HTMLElement).style.boxShadow="";}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${G}15`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><BookOpen size={18} color={G}/></div>
            <div style={{fontWeight:800,fontSize:14,color:"#1a2e25",marginBottom:2}}>{sub.title}</div>
            {sub.title_ar&&<div style={{fontSize:12,color:GOLD,marginBottom:6,direction:"rtl"}}>{sub.title_ar}</div>}
            <div style={{display:"flex",gap:10,fontSize:11,color:"#7a9e88",marginTop:6}}>
              <span><Users size={11} style={{display:"inline",verticalAlign:"middle",marginRight:3}}/>{counts[sub.id]?.students??"…"}</span>
              <span><FolderOpen size={11} style={{display:"inline",verticalAlign:"middle",marginRight:3}}/>{counts[sub.id]?.materials??"…"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RECORDINGS TAB
// ═══════════════════════════════════════════════════════════════════
function RecordingsTab({user,t}:any){
  const [recs,setRecs]=useState<any[]>([]);
  const [filter,setFilter]=useState("all");
  const [subjects,setSubjects]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!user)return;
    const load=async()=>{
      const subs=await fetchTeacherSubjects(user.id);
      setSubjects(subs);
      const ids=subs.map((s:any)=>s.id);
      if(ids.length){const{data}=await supabase.from("session_recordings").select("*, subjects(title)").in("subject_id",ids).order("created_at",{ascending:false});setRecs(data||[]);}
      setLoading(false);
    };
    load();
  },[user]);

  const filtered=filter==="all"?recs:recs.filter(r=>r.subject_id===filter);
  const fmtSz=(b?:number)=>!b?"":b<1048576?`${(b/1024).toFixed(0)} KB`:`${(b/1048576).toFixed(1)} MB`;
  if(loading)return<Loader/>;

  return(
    <div>
      <div style={{marginBottom:12}}>
        <select style={{...inp,maxWidth:240}} value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">{t("All Subjects","كل المواد")}</option>
          {subjects.map((s:any)=><option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#94a3b8"}}><Mic size={40} style={{opacity:.3,marginBottom:12}}/><p style={{fontSize:14}}>{t("No recordings yet.","لا توجد تسجيلات.")}</p></div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(r=>(
          <div key={r.id} style={{...card,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:10,background:"#7C3AED18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Mic size={17} color="#7C3AED"/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:"#1a2e25",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.teacher_name||r.subjects?.title||t("Recording","تسجيل")}</div>
              <div style={{fontSize:11,color:"#9ca3af"}}>{r.subjects?.title}{r.file_size?` · ${fmtSz(r.file_size)}`:""}{r.created_at?` · ${r.created_at.split("T")[0]}`:""}</div>
            </div>
            {r.file_url&&<a href={r.file_url} target="_blank" rel="noopener noreferrer" style={{...bs(true) as any,textDecoration:"none",padding:"6px 12px",fontSize:12}}>{t("Play","تشغيل")}</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HUB
// ═══════════════════════════════════════════════════════════════════
export default function TeacherTeachingHub(){
  const {t,language}=useLanguage();
  const {user}=useAuth();
  const [tab,setTab]=useState<HubTab>("classes");
  const isFullPage=["recitation","hifdh","public"].includes(tab);

  return(
    <div style={{background:BG,minHeight:"100vh",paddingBottom:40}}>
      <div style={{background:`linear-gradient(135deg,${G} 0%,${GM} 100%)`,padding:"20px 20px 0"}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <div style={{width:42,height:42,borderRadius:12,background:`${GOLD}22`,display:"flex",alignItems:"center",justifyContent:"center"}}><Video size={20} color={GOLD}/></div>
            <div>
              <h1 style={{fontSize:20,fontWeight:900,color:"#fff",margin:0,fontFamily:"serif"}}>{t("My Teaching","تدريسي")}</h1>
              <p style={{fontSize:12,color:"rgba(255,255,255,.55)",margin:0}}>{t("Live classes, subjects, timetable, recordings, recitation & hifdh","الفصول المباشرة والمواد والجدول والتسجيلات والتلاوة والحفظ")}</p>
            </div>
          </div>
          <div style={{display:"flex",gap:2,overflowX:"auto"}}>
            {TABS.map(tb=>{
              const active=tab===tb.id;
              return(
                <button key={tb.id} onClick={()=>setTab(tb.id)}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"9px 14px",border:"none",cursor:"pointer",borderRadius:"10px 10px 0 0",fontWeight:active?700:500,fontSize:12,background:active?"#fff":"transparent",color:active?G:"rgba(255,255,255,.7)",flexShrink:0,transition:"all .15s"}}>
                  <tb.icon size={13}/>{language==="ar"?tb.ar:tb.en}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {isFullPage?(
        <div>
          {tab==="recitation"&&<TeacherRecitation/>}
          {tab==="hifdh"&&<TeacherHifdhReview/>}
          {tab==="public"&&<TeacherPublicClasses/>}
        </div>
      ):(
        <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px 0"}}>
          {tab==="classes"&&<LiveClassesTab user={user} t={t}/>}
          {tab==="subjects"&&<SubjectsTab user={user} t={t} language={language}/>}
          {tab==="timetable"&&<TimetableTab user={user} t={t} language={language}/>}
          {tab==="recordings"&&<RecordingsTab user={user} t={t}/>}
        </div>
      )}
    </div>
  );
}
