/*
  src/pages/admin/LiveClassManagement.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Enhanced admin live-class dashboard:
    • TODAY tab  — timetable for the day (all levels, times) + live alert
    • LIVE tab   — active sessions with participant list + quick end-class
    • SUBJECTS   — subject grid → per-subject detail (sessions / timetable / attendance / recordings)
    • SESSIONS   — full session list with search + filter
    • ATTENDANCE — general attendance overview by subject and by level
*/

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label }    from "@/components/ui/label";
import { Switch }   from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth }     from "@/contexts/AuthContext";
import { supabase }    from "@/integrations/supabase/client";
import {
  Plus, Download, Calendar, Users, Clock, Edit, Video, Play,
  BookOpen, ChevronRight, CheckCircle, XCircle, AlertCircle,
  ArrowLeft, Filter, MoreVertical,
} from "lucide-react";
import { useToast }  from "@/hooks/use-toast";
import { format }    from "date-fns";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import LiveClassFilePanel   from "@/components/classroom/LiveClassFilePanel";
import { useLiveClass }     from "@/contexts/LiveClassContext";
import { useAcademicLevels, getLevelConfig } from "@/hooks/useAcademicLevels";

/* ── brand tokens ── */
const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const fmtDate = (d: string | null) => d ? format(new Date(d), "MMM d, h:mm a") : "—";
const fmtTime = (d: string | null) => d ? format(new Date(d), "h:mm a") : "—";
const fmtDur  = (s: number | null)  => s ? `${Math.round(s / 60)}m` : "—";
const timeUntil = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const m = Math.floor(diff / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
};

/* ── global styles ── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');
  @keyframes lc-pulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes lc-spin   { to{transform:rotate(360deg)} }
  @keyframes lc-up     { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lc-ring   { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.45)} 60%{box-shadow:0 0 0 10px rgba(239,68,68,0)} }
  @keyframes lc-shimmer{ 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  .lc-root  { background:#f0ede8; min-height:100vh; font-family:'DM Sans',sans-serif; }
  .lc-card  { background:#fff; border-radius:16px; box-shadow:0 1px 8px rgba(0,0,0,.07); overflow:hidden; transition:box-shadow .2s; animation:lc-up .25s ease; }
  .lc-card:hover{ box-shadow:0 4px 20px rgba(0,0,0,.11); }
  .lc-btn   { display:inline-flex; align-items:center; gap:6px; border:none; border-radius:10px; padding:8px 16px; font-size:13px; font-weight:800; cursor:pointer; transition:all .15s; font-family:'DM Sans',sans-serif; }
  .lc-btn:active{ transform:scale(.97); }
  .lc-tab   { display:flex; align-items:center; gap:5px; padding:10px 15px; border:none; background:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:700; color:rgba(255,255,255,.5); white-space:nowrap; border-bottom:2.5px solid transparent; transition:all .18s; flex-shrink:0; }
  .lc-tab.on{ color:#fff; border-bottom-color:#c9a84c; }
  .lc-section{ font-size:10px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:#9ca3af; margin-bottom:10px; }
  .lc-att-bar{ height:6px; border-radius:99px; background:#e5e7eb; overflow:hidden; }
  .lc-att-fill{ height:100%; border-radius:99px; transition:width .5s ease; }
  .lc-slot  { border-radius:12px; padding:11px 14px; border-left:3px solid; margin-bottom:8px; transition:transform .15s,box-shadow .15s; cursor:pointer; }
  .lc-slot:hover{ transform:translateX(3px); box-shadow:0 2px 12px rgba(0,0,0,.1); }
  ::-webkit-scrollbar{ width:3px; height:3px; }
  ::-webkit-scrollbar-thumb{ background:#d1d5db; border-radius:99px; }
`;

/* ── status badge ── */
const StatusPill = ({ status }: { status: string }) => {
  const cfg: Record<string,{bg:string;color:string;label:string}> = {
    live:      { bg:"rgba(239,68,68,.12)",  color:"#ef4444", label:"● Live" },
    scheduled: { bg:"rgba(59,130,246,.12)", color:"#3b82f6", label:"⏰ Scheduled" },
    completed: { bg:"rgba(34,197,94,.12)",  color:"#16a34a", label:"✓ Done" },
    ended:     { bg:"rgba(107,114,128,.12)",color:"#6b7280", label:"Ended" },
    cancelled: { bg:"rgba(239,68,68,.08)",  color:"#ef4444", label:"Cancelled" },
  };
  const c = cfg[status] || cfg.scheduled;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:c.bg,fontSize:11,fontWeight:800,color:c.color}}>
      {status==="live" && <span style={{width:6,height:6,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"lc-pulse 1s infinite"}}/>}
      {c.label}
    </span>
  );
};

/* ── avatar ── */
const Av = ({ name, size=32, bg=G }: { name:string; size?:number; bg?:string }) => {
  const ini = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:`${bg}22`,color:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.36,fontWeight:800,flexShrink:0}}>
      {ini}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════ */
const LiveClassManagement = () => {
  const { t }       = useLanguage();
  const { user }    = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const { joinClass } = useLiveClass();
  const { data: academicLevels = [] } = useAcademicLevels();

  const [sessions,     setSessions]     = useState<any[]>([]);
  const [subjects,     setSubjects]     = useState<any[]>([]);
  const [timetable,    setTimetable]    = useState<any[]>([]);
  const [participants, setParticipants] = useState<Record<string,any[]>>({});
  const [generalAtt,   setGeneralAtt]   = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("today");
  const [selectedSub,  setSelectedSub]  = useState<any>(null);
  const [subjectTab,   setSubjectTab]   = useState("sessions");
  const [attSession,   setAttSession]   = useState<any>(null);
  const [attLogs,      setAttLogs]      = useState<any[]>([]);
  const [manualAtt,    setManualAtt]    = useState<any[]>([]);
  const [students,     setStudents]     = useState<any[]>([]);
  const [editAtt,      setEditAtt]      = useState<Record<string,string>>({});
  const [genAttSub,    setGenAttSub]    = useState<any>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [sessionMenu,  setSessionMenu]  = useState<string|null>(null);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters,  setShowFilters]  = useState(false);
  const [now,          setNow]          = useState(new Date());
  const [form, setForm] = useState({
    subject_id:"", topic:"", topic_ar:"", scheduled_at:"",
    duration_minutes:60, recording_enabled:true, chat_enabled:true,
    hand_raise_enabled:true, waiting_room_enabled:true,
    homework:"", homework_ar:"",
  });

  useEffect(() => { const iv = setInterval(()=>setNow(new Date()),10000); return ()=>clearInterval(iv); },[]);

  const [recCounts, setRecCounts] = useState<Record<string,number>>({});

  const fetchData = useCallback(async () => {
    const [{ data: subs },{ data: sess },{ data: tt },{ data: recs }] = await Promise.all([
      supabase.from("subjects").select("id,title,title_ar,teacher_id,is_active,livekit_room_name"),
      supabase.from("live_sessions").select("*,subjects(title,title_ar)").order("scheduled_at",{ascending:false}),
      supabase.from("subject_timetable").select("*,subjects(id,title,title_ar)").order("day_of_week").order("start_time"),
      supabase.from("session_recordings").select("id,subject_id"),
    ]);
    setSubjects(subs||[]);
    setSessions(sess||[]);
    setTimetable(tt||[]);
    // Build per-subject recording count map
    const counts: Record<string,number> = {};
    (recs||[]).forEach((r: any) => { counts[r.subject_id] = (counts[r.subject_id]||0)+1; });
    setRecCounts(counts);
    setLoading(false);
  },[]);

  useEffect(()=>{ fetchData(); },[fetchData]);
  useEffect(()=>{ const iv=setInterval(fetchData,15000); return ()=>clearInterval(iv); },[fetchData]);

  const fetchParticipants = useCallback(async (liveSessions: any[]) => {
    if (!liveSessions.length) { setParticipants({}); return; }
    const map: Record<string,any[]> = {};
    await Promise.all(liveSessions.map(async s => {
      const { data } = await supabase.from("class_participants")
        .select("*,profiles:student_id(full_name,level)")
        .eq("session_id", s.id).is("left_at", null);
      map[s.id] = data || [];
    }));
    setParticipants(map);
  }, []);

  useEffect(() => {
    const liveSess = sessions.filter(s => ["live","active"].includes(s.status));
    fetchParticipants(liveSess);
    // Independent 10-second poll so participant count stays live
    // even when the sessions array reference hasn't changed.
    const iv = setInterval(() => fetchParticipants(liveSess), 10_000);
    return () => clearInterval(iv);
  }, [sessions, fetchParticipants]);

  useEffect(()=>{
    (async()=>{
      const {data} = await supabase.from("manual_attendance")
        .select("subject_id,session_id,status,student_id,profiles:student_id(level)").limit(3000);
      setGeneralAtt(data||[]);
    })();
  },[]);

  const todayIdx  = now.getDay();
  const liveNow   = sessions.filter(s=>["live","active"].includes(s.status));
  const scheduled = sessions.filter(s=>s.status==="scheduled");
  const todaySlots= timetable.filter(t=>t.day_of_week===todayIdx)
                              .sort((a,b)=>a.start_time.localeCompare(b.start_time));

  const levelColor = (slug:string) => {
    const cfg = getLevelConfig(slug, academicLevels);
    return (cfg as any)?.color || "#6b7280";
  };

  const resetForm = () => setForm({subject_id:"",topic:"",topic_ar:"",scheduled_at:"",duration_minutes:60,recording_enabled:true,chat_enabled:true,hand_raise_enabled:true,waiting_room_enabled:true,homework:"",homework_ar:"",quiz_code:""});
  const openCreate = () => { resetForm(); setEditingSession(null); setShowCreate(true); };
  const openEdit   = (s:any) => {
    setForm({subject_id:s.subject_id||"",topic:s.topic||"",topic_ar:s.topic_ar||"",scheduled_at:s.scheduled_at?s.scheduled_at.slice(0,16):"",duration_minutes:s.duration_minutes||60,recording_enabled:s.recording_enabled??true,chat_enabled:s.chat_enabled??true,hand_raise_enabled:s.hand_raise_enabled??true,waiting_room_enabled:s.waiting_room_enabled??true,homework:s.homework||"",homework_ar:s.homework_ar||"",quiz_code:s.quiz_code||""});
    setEditingSession(s); setShowCreate(true);
  };
  const handleSave = async () => {
    if (!form.subject_id) { toast({title:"Please select a subject",variant:"destructive"}); return; }
    const payload = {subject_id:form.subject_id,topic:form.topic||null,topic_ar:form.topic_ar||null,scheduled_at:form.scheduled_at||null,duration_minutes:form.duration_minutes,recording_enabled:form.recording_enabled,chat_enabled:form.chat_enabled,hand_raise_enabled:form.hand_raise_enabled,waiting_room_enabled:form.waiting_room_enabled,homework:form.homework||null,homework_ar:form.homework_ar||null,quiz_code:form.quiz_code||null};
    if (editingSession) {
      await supabase.from("live_sessions").update(payload).eq("id",editingSession.id);
      toast({title:"Class updated"});
    } else {
      await supabase.from("live_sessions").insert({...payload,status:"scheduled"} as any);
      toast({title:"Class scheduled"});
    }
    setShowCreate(false); fetchData();
  };
  const handleDelete = async (id:string) => {
    if (!confirm("Delete this class?")) return;
    await supabase.from("live_sessions").delete().eq("id",id);
    setSessions(p=>p.filter(s=>s.id!==id));
    toast({title:"Deleted"});
  };
  const updateStatus = async (id:string,status:string) => {
    const u:any={status};
    if (status==="live") u.actual_start_time=new Date().toISOString();
    if (["completed","ended"].includes(status)) u.actual_end_time=new Date().toISOString();
    await supabase.from("live_sessions").update(u).eq("id",id);
    fetchData();
  };
  const goLive = async (session:any) => {
    const subject = subjects.find(s=>s.id===session.subject_id);
    if (!subject) { toast({title:"Subject not found",variant:"destructive"}); return; }
    await supabase.from("live_sessions").update({status:"live",actual_start_time:new Date().toISOString(),started_at:new Date().toISOString()}).eq("id",session.id);
    joinClass({id:subject.id,title:subject.title,title_ar:subject.title_ar||"",livekit_room_name:subject.livekit_room_name},{autoJoin:true});
    fetchData();
  };

  /* Start an instant (unscheduled) live session for a subject that has no sessions yet */
  const startInstantClass = async (sub: any) => {
    try {
      const now = new Date().toISOString();
      // Check for an existing live session first to avoid duplicate inserts
      // (the livekit-token edge function also inserts a session on start_session,
      // so we upsert here only if none exists yet — prevents the race condition
      // that was producing "Quote command returned error" from duplicate state).
      const { data: existing } = await supabase
        .from("live_sessions")
        .select("id")
        .eq("subject_id", sub.id)
        .eq("status", "live")
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from("live_sessions")
          .insert({
            subject_id: sub.id,
            host_id: user?.id,
            status: "live",
            scheduled_at: now,
            actual_start_time: now,
            started_at: now,
            duration_minutes: 60,
            recording_enabled: true,
            chat_enabled: true,
            hand_raise_enabled: true,
            waiting_room_enabled: false,
          } as any);
        if (error) throw error;
      }

      joinClass({ id: sub.id, title: sub.title, title_ar: sub.title_ar || "", livekit_room_name: sub.livekit_room_name }, { autoJoin: true });
      fetchData();
    } catch (e: any) {
      toast({ title: "Could not start class", description: e?.message, variant: "destructive" });
    }
  };

  const openAttendance = async (sess:any) => {
    // Reset all attendance state before loading new session
    setAttSession(sess);
    setStudents([]);
    setEditAtt({});
    setAttLogs([]);
    setManualAtt([]);

    const [{data:logs},{data:manual}] = await Promise.all([
      supabase.from("attendance_logs").select("*,profiles:user_id(full_name)").eq("session_id",sess.id),
      supabase.from("manual_attendance").select("*,profiles:student_id(full_name)").eq("session_id",sess.id),
    ]);
    const logsData = logs||[];
    const manualData = manual||[];
    setAttLogs(logsData);
    setManualAtt(manualData);

    // Build the initial attendance map from saved manual records
    const map:Record<string,string>={};
    manualData.forEach((m:any)=>{ map[m.student_id]=m.status; });

    // Also include auto-logged students who joined the session
    logsData.forEach((l:any)=>{
      if (!map[l.user_id]) map[l.user_id]="present";
    });

    // Fetch enrolled students for this subject
    const {data:courses} = await supabase.from("courses").select("id").eq("subject_id",sess.subject_id);
    const cids = (courses||[]).map((c:any)=>c.id);

    let enrolledStudents: any[] = [];
    if (cids.length>0) {
      const {data:enr} = await supabase.from("enrollments").select("user_id").in("course_id",cids);
      const uids = [...new Set((enr||[]).map((e:any)=>e.user_id))] as string[];
      if (uids.length>0) {
        const {data} = await supabase.from("profiles").select("user_id,full_name").in("user_id",uids);
        enrolledStudents = data||[];
      }
    }

    // If no enrolled students found via courses, fall back to auto-logged + manual students
    if (enrolledStudents.length===0) {
      const seenIds = new Set<string>();
      const fallback: any[] = [];
      logsData.forEach((l:any)=>{ if (!seenIds.has(l.user_id)) { seenIds.add(l.user_id); fallback.push({user_id:l.user_id,full_name:l.profiles?.full_name||"Student"}); }});
      manualData.forEach((m:any)=>{ if (!seenIds.has(m.student_id)) { seenIds.add(m.student_id); fallback.push({user_id:m.student_id,full_name:m.profiles?.full_name||"Student"}); }});
      enrolledStudents = fallback;
    }

    // Default every enrolled student to "absent" if not already in map
    enrolledStudents.forEach((s:any)=>{ if(!map[s.user_id]) map[s.user_id]="absent"; });

    setStudents(enrolledStudents);
    setEditAtt(map);
  };

  const [savingAtt, setSavingAtt] = useState(false);

  const saveAttendance = async () => {
    if (!attSession||!user) return;
    setSavingAtt(true);
    try {
      // Delete existing manual records for this session
      const {error:delErr} = await supabase.from("manual_attendance").delete().eq("session_id",attSession.id);
      if (delErr) throw delErr;

      const records = Object.entries(editAtt).map(([student_id,status])=>({
        session_id:attSession.id,
        student_id,
        subject_id:attSession.subject_id,
        teacher_id:attSession.teacher_id||user.id,
        status,
        date:(attSession.scheduled_at||attSession.created_at||new Date().toISOString()).split("T")[0],
      }));

      if (records.length>0) {
        const {error:insErr} = await supabase.from("manual_attendance").insert(records);
        if (insErr) throw insErr;
      }

      // Re-fetch to confirm persisted data
      const {data:saved} = await supabase.from("manual_attendance").select("*,profiles:student_id(full_name)").eq("session_id",attSession.id);
      setManualAtt(saved||[]);

      toast({title:"✅ Attendance saved!", description:`${records.length} student records saved.`});
    } catch(err:any) {
      console.error("saveAttendance error:", err);
      toast({title:"❌ Error saving attendance", description: err?.message||"Please try again.", variant:"destructive"});
    } finally {
      setSavingAtt(false);
    }
  };
  const exportCSV = (logs:any[],manual:any[]) => {
    const rows=[["Student","Status","Joined","Left","Duration"].join(",")];
    logs.forEach((l:any)=>rows.push([(l.profiles?.full_name||l.user_id),"auto",l.joined_at?new Date(l.joined_at).toLocaleString():"",l.left_at?new Date(l.left_at).toLocaleString():"",fmtDur(l.duration_seconds)].join(",")));
    manual.forEach((m:any)=>rows.push([(m.profiles?.full_name||m.student_id),m.status,"","",""].join(",")));
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));
    a.download="attendance.csv"; a.click();
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300}}>
      <style>{CSS}</style>
      <div style={{width:32,height:32,borderRadius:"50%",border:`3px solid ${G}`,borderTopColor:"transparent",animation:"lc-spin .8s linear infinite"}}/>
    </div>
  );

  /* ── ATTENDANCE VIEW ── */
  if (attSession) {
    const presentCount=Object.values(editAtt).filter(v=>v==="present").length;
    const lateCount   =Object.values(editAtt).filter(v=>v==="late").length;
    const absentCount =Object.values(editAtt).filter(v=>v==="absent").length;
    const totalCount  =students.length||attLogs.length;
    const pct         =totalCount>0?Math.round((presentCount+lateCount)/totalCount*100):0;
    return (
      <div className="lc-root">
        <style>{CSS}</style>
        <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"52px 20px 24px"}}>
          <button onClick={()=>setAttSession(null)} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.12)",border:"none",borderRadius:20,padding:"6px 14px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:12,cursor:"pointer",marginBottom:14,fontFamily:"'DM Sans',sans-serif"}}>
            <ArrowLeft style={{width:13,height:13}}/> Back
          </button>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:"#fff",marginBottom:4}}>Attendance</h1>
          <p style={{fontSize:13,color:GOLD,fontWeight:600}}>{attSession.subjects?.title} · {fmtDate(attSession.scheduled_at)}</p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14}}>
            <StatusPill status={attSession.status}/>
            <button onClick={()=>exportCSV(attLogs,manualAtt)} className="lc-btn" style={{background:GOLD,color:G,fontSize:11,padding:"6px 14px"}}>
              <Download style={{width:13,height:13}}/> CSV
            </button>
          </div>
        </div>
        <div style={{padding:"20px 16px 48px",maxWidth:720,margin:"0 auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
            {[{label:"Present",val:presentCount,color:"#16a34a"},{label:"Late",val:lateCount,color:GOLD},{label:"Absent",val:absentCount,color:"#ef4444"},{label:"Rate",val:`${pct}%`,color:"#0284c7"}].map((x,i)=>(
              <div key={i} className="lc-card" style={{padding:"12px 8px",textAlign:"center"}}>
                <p style={{fontSize:20,fontWeight:900,color:x.color}}>{x.val}</p>
                <p style={{fontSize:9,color:"#9ca3af",fontWeight:700}}>{x.label}</p>
              </div>
            ))}
          </div>
          <div className="lc-card" style={{padding:"14px 16px",marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700}}>Attendance Rate</span>
              <span style={{fontSize:14,fontWeight:900,color:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}>{pct}%</span>
            </div>
            <div className="lc-att-bar" style={{height:10}}>
              <div className="lc-att-fill" style={{width:`${pct}%`,background:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}/>
            </div>
          </div>
          {attLogs.length>0 && (
            <div className="lc-card" style={{marginBottom:14,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #f3f4f6",fontSize:12,fontWeight:800}}>🤖 Auto-Logged · {attLogs.length}</div>
              {attLogs.map((l:any,i:number)=>(
                <div key={l.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<attLogs.length-1?"1px solid #f9fafb":"none"}}>
                  <Av name={l.profiles?.full_name||"?"} size={34} bg={G}/>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.profiles?.full_name||"Student"}</p>
                    <p style={{fontSize:11,color:"#9ca3af"}}>
                      {l.joined_at?new Date(l.joined_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}
                      {l.left_at?` → ${new Date(l.left_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}` :""}
                    </p>
                  </div>
                  <span style={{fontSize:11,fontWeight:800,color:"#16a34a"}}>{fmtDur(l.duration_seconds)}</span>
                </div>
              ))}
            </div>
          )}
          {students.length>0 && (
            <div className="lc-card" style={{marginBottom:16,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #f3f4f6",fontSize:12,fontWeight:800}}>✏️ Manual Attendance · {students.length}</div>
              {students.map((s:any,i:number)=>(
                <div key={s.user_id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:i<students.length-1?"1px solid #f9fafb":"none"}}>
                  <Av name={s.full_name||"?"} size={32} bg={G}/>
                  <span style={{flex:1,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.full_name}</span>
                  <div style={{display:"flex",gap:4}}>
                    {(["present","late","absent"] as const).map(st=>(
                      <button key={st} onClick={()=>setEditAtt(p=>({...p,[s.user_id]:st}))}
                        style={{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,transition:"all .1s",
                          background:editAtt[s.user_id]===st?(st==="present"?"#16a34a":st==="late"?GOLD:"#ef4444"):"#f3f4f6",
                          color:editAtt[s.user_id]===st?"#fff":"#9ca3af"}}>
                        {st==="present"?"✓":st==="late"?"~":"✗"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={saveAttendance} disabled={savingAtt} className="lc-btn" style={{width:"100%",justifyContent:"center",background:G,color:"#fff",padding:"14px",borderRadius:14,fontSize:14,opacity:savingAtt?0.7:1}}>
            <CheckCircle style={{width:16,height:16}}/> {savingAtt?"Saving…":"Save Attendance"}
          </button>
          {students.length===0 && attLogs.length===0 && (
            <p style={{textAlign:"center",fontSize:12,color:"#ef4444",marginTop:10}}>⚠️ No students found. Ensure students are enrolled in a course linked to this subject.</p>
          )}
        </div>
      </div>
    );
  }

  /* ── GENERAL ATTENDANCE DETAIL ── */
  if (genAttSub) {
    const subRows=generalAtt.filter(r=>r.subject_id===genAttSub.id);
    const byLevel:Record<string,{present:number;total:number}>={};
    subRows.forEach((r:any)=>{
      const lv=r.profiles?.level||"unknown";
      if (!byLevel[lv]) byLevel[lv]={present:0,total:0};
      byLevel[lv].total++;
      if (["present","late"].includes(r.status)) byLevel[lv].present++;
    });
    const overall=subRows.length?Math.round(subRows.filter((r:any)=>["present","late"].includes(r.status)).length/subRows.length*100):0;
    return (
      <div className="lc-root">
        <style>{CSS}</style>
        <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"52px 20px 24px"}}>
          <button onClick={()=>setGenAttSub(null)} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.12)",border:"none",borderRadius:20,padding:"6px 14px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:12,cursor:"pointer",marginBottom:14,fontFamily:"'DM Sans',sans-serif"}}>
            <ArrowLeft style={{width:13,height:13}}/> Back
          </button>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:"#fff",marginBottom:4}}>{genAttSub.title}</h1>
          <p style={{fontSize:13,color:GOLD}}>Attendance Overview</p>
        </div>
        <div style={{padding:"20px 16px 48px",maxWidth:720,margin:"0 auto"}}>
          <div className="lc-card" style={{padding:"16px 18px",marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:14,fontWeight:800}}>Overall</span>
              <span style={{fontSize:22,fontWeight:900,color:overall>=75?"#16a34a":overall>=60?GOLD:"#ef4444"}}>{overall}%</span>
            </div>
            <div className="lc-att-bar" style={{height:10}}><div className="lc-att-fill" style={{width:`${overall}%`,background:overall>=75?"#16a34a":overall>=60?GOLD:"#ef4444"}}/></div>
            <p style={{fontSize:11,color:"#9ca3af",marginTop:8}}>{subRows.length} records total</p>
          </div>
          <p className="lc-section">By Level</p>
          <div className="lc-card" style={{overflow:"hidden"}}>
            {Object.entries(byLevel).length===0 && <div style={{padding:32,textAlign:"center",color:"#9ca3af",fontSize:13}}>No data yet</div>}
            {Object.entries(byLevel).map(([slug,ld],i,arr)=>{
              const pct=ld.total>0?Math.round(ld.present/ld.total*100):0;
              const lvLabel=academicLevels.find(l=>l.slug===slug)?.name_en||slug;
              const clr=levelColor(slug);
              return (
                <div key={slug} style={{padding:"14px 16px",borderBottom:i<arr.length-1?"1px solid #f3f4f6":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:9,height:9,borderRadius:99,background:clr}}/>
                      <span style={{fontSize:13,fontWeight:700}}>{lvLabel}</span>
                    </div>
                    <div>
                      <span style={{fontSize:14,fontWeight:900,color:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}>{pct}%</span>
                      <span style={{fontSize:10,color:"#9ca3af",marginLeft:6}}>{ld.present}/{ld.total}</span>
                    </div>
                  </div>
                  <div className="lc-att-bar"><div className="lc-att-fill" style={{width:`${pct}%`,background:clr}}/></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ── SUBJECT DETAIL ── */
  if (selectedSub) {
    const subSess =sessions.filter(s=>s.subject_id===selectedSub.id);
    const liveSess=subSess.find(s=>s.status==="live");
    const subSlots=timetable.filter(t=>t.subject_id===selectedSub.id);
    const TABS2=[
      {val:"sessions",    icon:"📅",label:"Sessions"},
      {val:"timetable",  icon:"🗓", label:"Timetable"},
      {val:"attendance", icon:"📊", label:"Attendance"},
      {val:"recordings", icon:"🎬", label:"Recordings"},
      {val:"materials",  icon:"📄", label:"Materials"},
      {val:"syllabus",   icon:"📖", label:"Syllabus"},
      {val:"assignments",icon:"📋", label:"Tasks"},
      {val:"announce",   icon:"📢", label:"News"},
      {val:"files",      icon:"📂", label:"Files"},
    ];
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f0ede8",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{CSS}</style>
        <div style={{background:`linear-gradient(160deg,${G},${GM})`,flexShrink:0}}>
          <div style={{padding:"52px 16px 0"}}>
            <button onClick={()=>{setSelectedSub(null);setSubjectTab("sessions");}} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.12)",border:"none",borderRadius:20,padding:"6px 14px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:12,cursor:"pointer",marginBottom:14,fontFamily:"'DM Sans',sans-serif"}}>
              <ArrowLeft style={{width:13,height:13}}/> All Subjects
            </button>
            <div style={{textAlign:"center",paddingBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:"#fff"}}>{selectedSub.title}</h1>
                {liveSess && <span style={{fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:99,background:"#ef4444",color:"#fff",animation:"lc-pulse 1s infinite"}}>● LIVE</span>}
              </div>
              {selectedSub.title_ar && <p dir="rtl" style={{fontSize:13,color:GOLD,marginBottom:10}}>{selectedSub.title_ar}</p>}
              <div style={{display:"flex",justifyContent:"center",gap:24,marginBottom:14}}>
                {[
                  {label:"Total",    v:subSess.length,                                 c:"rgba(255,255,255,.9)", tab: null},
                  {label:"Live now", v:liveSess?1:0,                                   c:"#ef4444",             tab: null},
                  {label:"Scheduled",v:subSess.filter(s=>s.status==="scheduled").length,c:"#60a5fa",            tab: null},
                  {label:"📹 Recordings", v:"View",                                    c:GOLD,                  tab:"recordings"},
                ].map((x,i)=>(
                  <div key={i} style={{textAlign:"center",cursor:x.tab?"pointer":"default"}}
                    onClick={()=>x.tab&&setSubjectTab(x.tab)}>
                    <div style={{fontSize:18,fontWeight:900,color:x.c}}>{x.v}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:700}}>{x.label}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                {liveSess ? (
                  <button onClick={()=>goLive(liveSess)} className="lc-btn" style={{background:GOLD,color:G,animation:"lc-pulse 2s infinite"}}>
                    <Video style={{width:14,height:14}}/> Join Live
                  </button>
                ) : (
                  <button onClick={()=>{ const s=subSess.find(x=>x.status==="scheduled"); s ? goLive(s) : startInstantClass(selectedSub); }} className="lc-btn" style={{background:GOLD,color:G}}>
                    <Video style={{width:14,height:14}}/> Start Class
                  </button>
                )}
                <button onClick={()=>{setForm(f=>({...f,subject_id:selectedSub.id}));setEditingSession(null);setShowCreate(true);}} className="lc-btn" style={{background:"rgba(255,255,255,.15)",color:"#fff",border:"1.5px solid rgba(255,255,255,.25)"}}>
                  <Plus style={{width:13,height:13}}/> Schedule
                </button>
              </div>
            </div>
          </div>
          <div style={{display:"flex",overflowX:"auto",scrollbarWidth:"none",borderTop:"1px solid rgba(255,255,255,.1)"}}>
            {TABS2.map(tab=>(
              <button key={tab.val} className={`lc-tab${subjectTab===tab.val?" on":""}`} onClick={()=>setSubjectTab(tab.val)}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px",maxWidth:720,margin:"0 auto",width:"100%"}}>
          {subjectTab==="sessions" && (
            <div>
              <p className="lc-section">Sessions · {subSess.length}</p>
              {subSess.length===0 ? (
                <div className="lc-card" style={{padding:36,textAlign:"center",color:"#9ca3af"}}>
                  <Video style={{width:28,height:28,margin:"0 auto 8px",opacity:.4}}/>
                  <p style={{fontSize:13}}>No sessions yet. Click Schedule to add one.</p>
                </div>
              ) : (
                subSess.map(s=>(
                  <SessionCard key={s.id} s={s} onGoLive={goLive} onEdit={openEdit} onDelete={handleDelete} onAttendance={openAttendance} onUpdateStatus={updateStatus} subjects={subjects} menu={sessionMenu} setMenu={setSessionMenu} participants={participants}/>
                ))
              )}
            </div>
          )}
          {subjectTab==="timetable" && (
            <div>
              <p className="lc-section">Regular Schedule · {subSlots.length} slot{subSlots.length!==1?"s":""}</p>
              {subSlots.length===0 ? (
                <div className="lc-card" style={{padding:36,textAlign:"center",color:"#9ca3af"}}>
                  <p style={{fontSize:13}}>No timetable slots for this subject</p>
                </div>
              ) : (
                subSlots.map((slot:any)=>(
                  <div key={slot.id} className="lc-slot" style={{background:"#fff",borderLeftColor:G,boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:14,fontWeight:800,color:"#111"}}>{DAYS_FULL[slot.day_of_week]}</span>
                      <span style={{fontSize:12,fontWeight:700,color:G}}>{slot.start_time} – {slot.end_time}</span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {(slot.levels||[]).map((lv:string)=>(
                        <span key={lv} style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:99,background:`${levelColor(lv)}18`,color:levelColor(lv)}}>
                          {academicLevels.find(l=>l.slug===lv)?.name_en||lv}
                        </span>
                      ))}
                      {(!slot.levels||slot.levels.length===0) && <span style={{fontSize:10,color:"#9ca3af"}}>All levels</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {subjectTab==="attendance" && (
            <div>
              <p className="lc-section">Attendance per Session</p>
              {/* FIX: this list used to show every session with a bar hardcoded to
                  width:"70%" — completely fake, the same for every session regardless
                  of who actually attended. It's now computed from real manual_attendance
                  rows saved for that specific session (present+late ÷ total marked).
                  A session that was never opened/marked yet has no rows to compute from —
                  we show "Not recorded yet" for those instead of inventing a number. */}
              {subSess.filter(s=>s.status!=="scheduled").length===0 ? (
                <div className="lc-card" style={{padding:36,textAlign:"center",color:"#9ca3af"}}><p style={{fontSize:13}}>No completed sessions yet</p></div>
              ) : (
                subSess.filter(s=>s.status!=="scheduled").map(sess=>{
                  const rows = generalAtt.filter((r:any)=>r.session_id===sess.id);
                  const total = rows.length;
                  const present = rows.filter((r:any)=>["present","late"].includes(r.status)).length;
                  const rate = total>0 ? Math.round(present/total*100) : null;
                  const barColor = rate===null ? "#d1d5db" : rate>=75 ? "#16a34a" : rate>=60 ? GOLD : "#ef4444";
                  return (
                    <div key={sess.id} className="lc-card" style={{marginBottom:10,padding:"14px 16px",cursor:"pointer"}} onClick={()=>openAttendance(sess)}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <div>
                          <p style={{fontSize:13,fontWeight:700,marginBottom:2}}>{sess.topic||"Session"}</p>
                          <p style={{fontSize:11,color:"#9ca3af"}}>{fmtDate(sess.scheduled_at)}</p>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:12,fontWeight:800,color:barColor}}>{rate===null?"Not recorded yet":`${rate}%`}</span>
                          <ChevronRight style={{width:16,height:16,color:"#9ca3af"}}/>
                        </div>
                      </div>
                      <div className="lc-att-bar"><div className="lc-att-fill" style={{width:`${rate??0}%`,background:barColor}}/></div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {subjectTab==="recordings"  && <SubjectRecordings  subjectId={selectedSub.id}/>}
          {subjectTab==="materials"   && <SubjectMaterials   subjectId={selectedSub.id}/>}
          {subjectTab==="syllabus"    && <SubjectSyllabus    subjectId={selectedSub.id}/>}
          {subjectTab==="assignments" && <SubjectAssignments subjectId={selectedSub.id}/>}
          {subjectTab==="announce"    && <SubjectAnnouncements subjectId={selectedSub.id}/>}
          {subjectTab==="files"       && <LiveClassFilePanel subjectId={selectedSub.id}/>}
        </div>
        <CreateEditDialog open={showCreate} onClose={()=>setShowCreate(false)} form={form} setForm={setForm} subjects={subjects} editing={editingSession} onSave={handleSave}/>
      </div>
    );
  }

  /* ── MAIN DASHBOARD ── */
  const MAIN_TABS=[
    {id:"today",     icon:"📆",label:"Today"},
    {id:"live",      icon:"📡",label:"Live",    badge:liveNow.length},
    {id:"subjects",  icon:"📚",label:"Subjects"},
    {id:"sessions",  icon:"🎬",label:"Sessions"},
    {id:"attendance",icon:"📊",label:"Attendance"},
  ];
  const filteredSess=sessions.filter(s=>{
    if (statusFilter!=="all"&&s.status!==statusFilter) return false;
    if (searchQuery){const q=searchQuery.toLowerCase();if(!(s.subjects?.title||"").toLowerCase().includes(q)&&!(s.topic||"").toLowerCase().includes(q))return false;}
    return true;
  });

  return (
    <div className="lc-root">
      <style>{CSS}</style>

      {/* header */}
      <div style={{background:`linear-gradient(160deg,${G},${GM})`,padding:"52px 20px 24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c9a84c' fill-opacity='0.05'%3E%3Cpath d='M0 0h26v26H0V0zm26 26h26v26H26V26z'/%3E%3C/g%3E%3C/svg%3E\")"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:18}}>
            <div>
              <p style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Admin</p>
              <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"#fff",lineHeight:1.1}}>Live Classes</h1>
              <p style={{fontSize:12,color:GOLD,marginTop:4,fontWeight:600}}>
                {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · {now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
              </p>
            </div>
            <button onClick={openCreate} className="lc-btn" style={{background:GOLD,color:G,flexShrink:0}}>
              <Plus style={{width:14,height:14}}/> Schedule
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[
              {label:"Live",      v:liveNow.length,                                              c:"#ef4444",             pulse:liveNow.length>0,icon:"📡"},
              {label:"Scheduled", v:scheduled.length,                                            c:"#60a5fa",             pulse:false,            icon:"📅"},
              {label:"Done",      v:sessions.filter(s=>["completed","ended"].includes(s.status)).length,c:"rgba(255,255,255,.6)",pulse:false,icon:"✓"},
              {label:"Subjects",  v:subjects.length,                                             c:GOLD,                  pulse:false,            icon:"📚"},
            ].map((s,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:14,padding:"11px 8px",textAlign:"center"}}>
                <div style={{fontSize:10,marginBottom:2}}>{s.icon}</div>
                <div style={{fontSize:20,fontWeight:900,color:s.c,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  {s.pulse && <span style={{width:6,height:6,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"lc-pulse 1s infinite"}}/>}
                  {s.v}
                </div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:700}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* tab bar */}
      <div style={{background:GM,display:"flex",overflowX:"auto",scrollbarWidth:"none" as any,paddingLeft:4}}>
        {MAIN_TABS.map(tab=>(
          <button key={tab.id} className={`lc-tab${activeTab===tab.id?" on":""}`} onClick={()=>setActiveTab(tab.id)}>
            {tab.icon} {tab.label}
            {tab.badge ? <span style={{background:"#ef4444",color:"#fff",fontSize:9,fontWeight:900,padding:"1px 5px",borderRadius:99,marginLeft:2}}>{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={{padding:"20px 16px 52px",maxWidth:720,margin:"0 auto"}}>

        {/* ════ TODAY ════ */}
        {activeTab==="today" && (
          <div style={{animation:"lc-up .25s ease"}}>
            {liveNow.length>0 && (
              <div style={{marginBottom:18,background:"rgba(239,68,68,.06)",border:"1.5px solid rgba(239,68,68,.25)",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:38,height:38,borderRadius:10,background:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,animation:"lc-ring 2s infinite"}}>📡</div>
                <div style={{flex:1}}>
                  <p style={{fontSize:12,fontWeight:800,color:"#ef4444",marginBottom:2}}>{liveNow.length} Class{liveNow.length>1?"es":""} Live Now</p>
                  <p style={{fontSize:11,color:"#6b7280"}}>{liveNow.map(s=>s.subjects?.title).filter(Boolean).join(", ")}</p>
                </div>
                <button className="lc-btn" style={{background:"#ef4444",color:"#fff",fontSize:11,padding:"6px 12px",flexShrink:0}} onClick={()=>setActiveTab("live")}>
                  View →
                </button>
              </div>
            )}
            <p className="lc-section">Today's Timetable — {DAYS_FULL[todayIdx]}</p>
            {todaySlots.length===0 ? (
              <div className="lc-card" style={{padding:36,textAlign:"center",color:"#9ca3af"}}>
                <div style={{fontSize:32,marginBottom:8}}>📭</div>
                <p style={{fontSize:13,fontWeight:600}}>No classes scheduled today</p>
              </div>
            ) : (
              todaySlots.map((slot:any)=>{
                const sub=subjects.find(s=>s.id===slot.subject_id)||slot.subjects;
                const [sh,sm]=(slot.start_time||"00:00").split(":").map(Number);
                const [eh,em]=(slot.end_time  ||"00:00").split(":").map(Number);
                const cur=now.getHours()*60+now.getMinutes();
                const isNow=cur>=sh*60+sm&&cur<eh*60+em;
                const isPast=cur>=eh*60+em;
                const relatedSess=sessions.find(s=>s.subject_id===slot.subject_id&&["live","active"].includes(s.status));
                return (
                  <div key={slot.id} className="lc-slot"
                    style={{background:isNow?"rgba(239,68,68,.04)":isPast?"#fafafa":"#fff",borderLeftColor:isNow?"#ef4444":isPast?"#e5e7eb":G,boxShadow:isNow?"0 2px 16px rgba(239,68,68,.1)":"0 1px 6px rgba(0,0,0,.05)"}}
                    onClick={()=>sub&&setSelectedSub(sub)}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                          {isNow && <span style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"lc-pulse 1s infinite"}}/>}
                          <span style={{fontSize:14,fontWeight:800,color:isPast?"#9ca3af":"#111"}}>{sub?.title||"—"}</span>
                          {isNow&&relatedSess && <span style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:99,background:"rgba(239,68,68,.12)",color:"#ef4444"}}>● Live</span>}
                          {isPast && <span style={{fontSize:10,color:"#9ca3af",fontWeight:700}}>Done</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
                          <span style={{fontSize:11,color:"#6b7280"}}>🕐 {slot.start_time} – {slot.end_time}</span>
                          {slot.notes && <span style={{fontSize:11,color:"#9ca3af"}}>{slot.notes}</span>}
                        </div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {(slot.levels||[]).map((lv:string)=>(
                            <span key={lv} style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:99,background:`${levelColor(lv)}18`,color:levelColor(lv)}}>
                              {academicLevels.find(l=>l.slug===lv)?.name_en||lv}
                            </span>
                          ))}
                          {(!slot.levels||slot.levels.length===0) && <span style={{fontSize:10,color:"#9ca3af"}}>All levels</span>}
                        </div>
                      </div>
                      {isNow&&!relatedSess && (
                        <button className="lc-btn" style={{background:G,color:"#fff",fontSize:11,padding:"6px 12px",flexShrink:0}} onClick={e=>{
                          e.stopPropagation();
                          // FIX: this button used to only stopPropagation() and do nothing —
                          // it never called goLive/startInstantClass, so tapping "Go Live" on
                          // the Today timetable silently did nothing. Reuse a scheduled
                          // session for this subject if one exists, else start instantly.
                          const scheduledSess=sessions.find(x=>x.subject_id===slot.subject_id&&x.status==="scheduled");
                          if(scheduledSess)goLive(scheduledSess);
                          else if(sub)startInstantClass(sub);
                        }}>
                          Go Live
                        </button>
                      )}
                      {isNow&&relatedSess && (
                        <button className="lc-btn" style={{background:"#ef4444",color:"#fff",fontSize:11,padding:"6px 12px",flexShrink:0}} onClick={e=>{e.stopPropagation();openAttendance(relatedSess);}}>
                          <Users style={{width:12,height:12}}/> {(participants[relatedSess.id]||[]).length}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div style={{marginTop:22}}>
              <p className="lc-section">Week Overview</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
                {DAYS_SHORT.map((d,i)=>{
                  const cnt=timetable.filter(t=>t.day_of_week===i).length;
                  return (
                    <div key={i} style={{textAlign:"center",padding:"8px 4px",borderRadius:12,background:i===todayIdx?G:cnt>0?"#fff":"transparent",border:i!==todayIdx&&cnt>0?"1px solid #e5e7eb":i!==todayIdx?"1px dashed #e5e7eb":"none"}}>
                      <p style={{fontSize:9,fontWeight:700,color:i===todayIdx?GOLD:"#9ca3af",marginBottom:3}}>{d}</p>
                      <p style={{fontSize:14,fontWeight:900,color:i===todayIdx?"#fff":cnt>0?G:"#d1d5db"}}>{cnt||"·"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ LIVE ════ */}
        {activeTab==="live" && (
          <div style={{animation:"lc-up .25s ease"}}>
            {liveNow.length===0 ? (
              <div className="lc-card" style={{padding:52,textAlign:"center"}}>
                <div style={{fontSize:48,marginBottom:12}}>📡</div>
                <p style={{fontSize:16,fontWeight:700,marginBottom:6}}>No Live Classes</p>
                <p style={{fontSize:13,color:"#9ca3af"}}>All classes are currently offline</p>
              </div>
            ) : (
              liveNow.map(sess=>{
                const online=participants[sess.id]||[];
                return (
                  <div key={sess.id} className="lc-card" style={{marginBottom:16,border:"1.5px solid rgba(239,68,68,.3)"}}>
                    <div style={{height:4,background:`linear-gradient(90deg,#ef4444,#f97316)`,backgroundSize:"200% auto",animation:"lc-shimmer 2s linear infinite"}}/>
                    <div style={{padding:"16px 16px 0"}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:14}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"lc-pulse 1s infinite"}}/>
                            <span style={{fontSize:11,fontWeight:800,color:"#ef4444",letterSpacing:.5}}>LIVE NOW</span>
                          </div>
                          <h3 style={{fontSize:17,fontWeight:800,color:"#111",marginBottom:2}}>{sess.subjects?.title}</h3>
                          <p style={{fontSize:12,color:"#6b7280"}}>{sess.topic}</p>
                          <p style={{fontSize:11,color:"#9ca3af",marginTop:3}}>Started {fmtTime(sess.actual_start_time||sess.scheduled_at)}</p>
                        </div>
                        <button className="lc-btn" style={{background:"rgba(239,68,68,.1)",color:"#ef4444",fontSize:11,padding:"6px 12px",flexShrink:0}} onClick={()=>updateStatus(sess.id,"completed")}>
                          ⏹ End
                        </button>
                      </div>
                      <div style={{background:"#f8f9fa",borderRadius:12,padding:"12px 14px",marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                          <p style={{fontSize:11,fontWeight:800,color:"#374151"}}>👥 On Call · {online.length}</p>
                          <button className="lc-btn" style={{background:"rgba(15,45,31,.08)",color:G,fontSize:10,padding:"4px 10px"}} onClick={()=>openAttendance(sess)}>
                            Full List →
                          </button>
                        </div>
                        {online.length===0 && <p style={{fontSize:12,color:"#9ca3af",fontStyle:"italic"}}>No participants connected yet</p>}
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {online.map((p:any)=>(
                            <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:99,padding:"4px 10px 4px 4px",boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
                              <Av name={p.profiles?.full_name||"?"} size={22} bg={G}/>
                              <span style={{fontSize:11,fontWeight:600}}>{(p.profiles?.full_name||"?").split(" ")[0]}</span>
                              {p.is_muted && <span style={{fontSize:9,color:"#9ca3af"}}>🔇</span>}
                              {p.hand_raised && <span style={{fontSize:9}}>✋</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
                        {[
                          {label:"Online", val:online.length,                              color:"#16a34a"},
                          {label:"Muted",  val:online.filter((p:any)=>p.is_muted).length,  color:GOLD},
                          {label:"Raised", val:online.filter((p:any)=>p.hand_raised).length,color:"#3b82f6"},
                        ].map((x,i)=>(
                          <div key={i} style={{textAlign:"center",padding:"8px 4px",borderRadius:10,background:`${x.color}0f`}}>
                            <p style={{fontSize:18,fontWeight:900,color:x.color}}>{x.val}</p>
                            <p style={{fontSize:9,fontWeight:700,color:"#9ca3af"}}>{x.label}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8,paddingBottom:16}}>
                        <button onClick={()=>goLive(sess)} className="lc-btn" style={{flex:1,justifyContent:"center",background:GOLD,color:G}}>
                          <Video style={{width:14,height:14}}/> Join
                        </button>
                        <button onClick={()=>openAttendance(sess)} className="lc-btn" style={{flex:1,justifyContent:"center",background:"rgba(15,45,31,.08)",color:G}}>
                          <Users style={{width:14,height:14}}/> Attendance
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ════ SUBJECTS ════ */}
        {activeTab==="subjects" && (
          <div style={{animation:"lc-up .25s ease"}}>
            <p className="lc-section">All Subjects · {subjects.length}</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {subjects.map(sub=>{
                const liveSess=sessions.find(s=>s.subject_id===sub.id&&s.status==="live");
                const cnt=sessions.filter(s=>s.subject_id===sub.id).length;
                const recCnt=recCounts[sub.id]||0;
                const attRows=generalAtt.filter(r=>r.subject_id===sub.id);
                const pct=attRows.length?Math.round(attRows.filter((r:any)=>["present","late"].includes(r.status)).length/attRows.length*100):null;
                return (
                  <div key={sub.id} className="lc-card" style={{cursor:"pointer",border:liveSess?"1.5px solid rgba(239,68,68,.3)":"1.5px solid transparent"}} onClick={()=>setSelectedSub(sub)}>
                    {liveSess && <div style={{height:3,background:"#ef4444",animation:"lc-pulse 1s infinite"}}/>}
                    <div style={{padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                        <div style={{width:38,height:38,borderRadius:10,background:`${G}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📖</div>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          {recCnt>0 && (
                            <button
                              onClick={e=>{ e.stopPropagation(); setSelectedSub(sub); setSubjectTab("recordings"); }}
                              style={{fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:99,background:`${GOLD}18`,color:GOLD,border:`1px solid ${GOLD}44`,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3}}>
                              🎬 {recCnt}
                            </button>
                          )}
                          {liveSess && <span style={{fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:99,background:"rgba(239,68,68,.12)",color:"#ef4444",display:"inline-flex",alignItems:"center",gap:3}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"lc-pulse 1s infinite"}}/>Live
                          </span>}
                        </div>
                      </div>
                      <p style={{fontSize:13,fontWeight:800,color:"#111",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.title}</p>
                      {sub.title_ar && <p dir="rtl" style={{fontSize:11,color:"#9ca3af",marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.title_ar}</p>}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:10,color:"#9ca3af",fontWeight:600}}>{cnt} sessions · {recCnt} rec{recCnt!==1?"s":""}</span>
                        {pct!==null && <span style={{fontSize:10,fontWeight:800,color:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}>{pct}%</span>}
                      </div>
                      {pct!==null && <div style={{marginTop:8}}><div className="lc-att-bar"><div className="lc-att-fill" style={{width:`${pct}%`,background:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}/></div></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════ SESSIONS ════ */}
        {activeTab==="sessions" && (
          <div style={{animation:"lc-up .25s ease"}}>
            <div style={{marginBottom:14}}>
              <div style={{position:"relative",marginBottom:8}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9ca3af"}}>🔍</span>
                <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search topic or subject…"
                  style={{width:"100%",padding:"10px 12px 10px 34px",borderRadius:10,border:"1px solid #e5e7eb",background:"#fff",fontSize:13,boxSizing:"border-box" as any,outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p className="lc-section" style={{margin:0}}>Sessions · {filteredSess.length}</p>
                <button onClick={()=>setShowFilters(v=>!v)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"1px solid #e5e7eb",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer",color:"#374151",fontFamily:"'DM Sans',sans-serif"}}>
                  <Filter style={{width:12,height:12}}/> Filter
                </button>
              </div>
              {showFilters && (
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:"100%",marginTop:8,padding:"9px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:12,outline:"none",fontFamily:"'DM Sans',sans-serif"}}>
                  <option value="all">All Statuses</option>
                  <option value="live">Live</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}
            </div>
            {filteredSess.map(s=>(
              <SessionCard key={s.id} s={s} onGoLive={goLive} onEdit={openEdit} onDelete={handleDelete} onAttendance={openAttendance} onUpdateStatus={updateStatus} subjects={subjects} menu={sessionMenu} setMenu={setSessionMenu} participants={participants}/>
            ))}
            {filteredSess.length===0 && (
              <div className="lc-card" style={{padding:36,textAlign:"center",color:"#9ca3af"}}>
                <Video style={{width:28,height:28,margin:"0 auto 8px",opacity:.4}}/>
                <p style={{fontSize:13}}>No sessions found</p>
              </div>
            )}
          </div>
        )}

        {/* ════ ATTENDANCE ════ */}
        {activeTab==="attendance" && (
          <div style={{animation:"lc-up .25s ease"}}>
            {(()=>{
              const total  =generalAtt.length;
              const present=generalAtt.filter((r:any)=>["present","late"].includes(r.status)).length;
              const overall=total?Math.round(present/total*100):0;
              const poor   =subjects.filter(sub=>{
                const rows=generalAtt.filter(r=>r.subject_id===sub.id);
                if (!rows.length) return false;
                return Math.round(rows.filter((r:any)=>["present","late"].includes(r.status)).length/rows.length*100)<60;
              }).length;
              return (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                  {[
                    {label:"Overall Avg",   val:`${overall}%`, icon:"📊",color:"#0284c7"},
                    {label:"Poor (<60%)",   val:poor,          icon:"⚠️",color:"#ef4444"},
                    {label:"Done",          val:sessions.filter(s=>["completed","ended"].includes(s.status)).length,icon:"✓",color:"#16a34a"},
                    {label:"Total Records", val:total,         icon:"🗃",color:GOLD},
                  ].map((x,i)=>(
                    <div key={i} className="lc-card" style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:38,height:38,borderRadius:10,background:`${x.color}14`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{x.icon}</div>
                        <div>
                          <p style={{fontSize:18,fontWeight:900,color:x.color}}>{x.val}</p>
                          <p style={{fontSize:10,color:"#9ca3af",fontWeight:700}}>{x.label}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <p className="lc-section">By Level</p>
            <div className="lc-card" style={{overflow:"hidden",marginBottom:20}}>
              {academicLevels.length===0 && <div style={{padding:24,textAlign:"center",color:"#9ca3af",fontSize:12}}>No levels configured</div>}
              {academicLevels.map((lv,i)=>{
                const rows=generalAtt.filter((r:any)=>r.profiles?.level===lv.slug);
                const pct=rows.length?Math.round(rows.filter((r:any)=>["present","late"].includes(r.status)).length/rows.length*100):0;
                const clr=levelColor(lv.slug);
                return (
                  <div key={lv.id} style={{padding:"13px 16px",borderBottom:i<academicLevels.length-1?"1px solid #f3f4f6":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:99,background:clr}}/>
                        <span style={{fontSize:13,fontWeight:700}}>{lv.name_en}</span>
                        <span style={{fontSize:11,color:"#9ca3af"}} dir="rtl">{lv.name_ar}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:900,color:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}>{pct}%</span>
                    </div>
                    <div className="lc-att-bar"><div className="lc-att-fill" style={{width:`${pct}%`,background:clr}}/></div>
                    <p style={{fontSize:10,color:"#9ca3af",marginTop:4}}>{rows.length} records</p>
                  </div>
                );
              })}
            </div>

            <p className="lc-section">By Subject</p>
            {subjects.map(sub=>{
              const rows=generalAtt.filter(r=>r.subject_id===sub.id);
              const pct=rows.length?Math.round(rows.filter((r:any)=>["present","late"].includes(r.status)).length/rows.length*100):0;
              return (
                <div key={sub.id} className="lc-card" style={{marginBottom:10,padding:"14px 16px",cursor:"pointer"}} onClick={()=>setGenAttSub(sub)}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{flex:1}}>
                      <p style={{fontSize:13,fontWeight:800,marginBottom:2}}>{sub.title}</p>
                      <p style={{fontSize:10,color:"#9ca3af"}}>{rows.length} records · {sessions.filter(s=>s.subject_id===sub.id&&["completed","ended"].includes(s.status)).length} done</p>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <p style={{fontSize:18,fontWeight:900,color:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}>{rows.length?`${pct}%`:"—"}</p>
                      <ChevronRight style={{width:14,height:14,color:"#9ca3af"}}/>
                    </div>
                  </div>
                  {rows.length>0 && <div className="lc-att-bar"><div className="lc-att-fill" style={{width:`${pct}%`,background:pct>=75?"#16a34a":pct>=60?GOLD:"#ef4444"}}/></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateEditDialog open={showCreate} onClose={()=>setShowCreate(false)} form={form} setForm={setForm} subjects={subjects} editing={editingSession} onSave={handleSave}/>
    </div>
  );
};

/* ════ SESSION CARD ════ */
const SessionCard = ({s,onGoLive,onEdit,onDelete,onAttendance,onUpdateStatus,subjects,menu,setMenu,participants}:any) => {
  const isLive=s.status==="live";
  const online=isLive?(participants[s.id]||[]).length:0;
  const menuOpen=menu===s.id;
  return (
    <div className="lc-card" style={{marginBottom:8,border:isLive?"1.5px solid rgba(239,68,68,.35)":"1.5px solid transparent",position:"relative"}}>
      {isLive && <div style={{height:3,background:"#ef4444",animation:"lc-pulse 1s infinite"}}/>}
      <div style={{padding:"14px 14px 12px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:11,fontWeight:700,color:"#9ca3af",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.subjects?.title||"No subject"}</p>
            <p style={{fontSize:14,fontWeight:700,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.topic||<span style={{fontStyle:"italic",opacity:.5}}>No topic</span>}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              <StatusPill status={s.status}/>
              {s.scheduled_at && (
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#6b7280"}}>
                  <Calendar style={{width:11,height:11}}/>{fmtDate(s.scheduled_at)}
                  {s.status==="scheduled"&&timeUntil(s.scheduled_at) && <span style={{color:GOLD,fontWeight:800}}>⏱ {timeUntil(s.scheduled_at)}</span>}
                </span>
              )}
              {s.duration_minutes && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#6b7280"}}><Clock style={{width:11,height:11}}/>{s.duration_minutes}m</span>}
              {isLive&&online>0 && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#ef4444",fontWeight:700}}><Users style={{width:11,height:11}}/>{online} online</span>}
            </div>
          </div>
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setMenu(menuOpen?null:s.id)} style={{width:32,height:32,borderRadius:8,border:"1px solid #e5e7eb",background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <MoreVertical style={{width:15,height:15}}/>
            </button>
            {menuOpen && (
              <div onClick={()=>setMenu(null)} style={{position:"fixed",inset:0,zIndex:40}}>
                <div onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:36,background:"#fff",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,.15)",minWidth:180,zIndex:50,overflow:"hidden",border:"1px solid #f3f4f6"}}>
                  {[
                    {label:"Edit",       icon:<Edit style={{width:13,height:13}}/>,         onClick:()=>onEdit(s),                         color:"#111"},
                    {label:"Attendance", icon:<Users style={{width:13,height:13}}/>,        onClick:()=>onAttendance(s),                   color:"#111"},
                    s.status==="scheduled"&&{label:"Cancel",   icon:<XCircle style={{width:13,height:13}}/>,  onClick:()=>onUpdateStatus(s.id,"cancelled"),color:GOLD},
                    s.status==="live"    &&{label:"End Class", icon:<XCircle style={{width:13,height:13}}/>,  onClick:()=>onUpdateStatus(s.id,"completed"),color:GOLD},
                    {label:"Delete",     icon:<AlertCircle style={{width:13,height:13}}/>,  onClick:()=>onDelete(s.id),                    color:"#ef4444",sep:true},
                  ].filter(Boolean).map((item:any,i:number)=>(
                    <button key={i} onClick={()=>{item.onClick();setMenu(null);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"none",border:"none",cursor:"pointer",fontSize:13,color:item.color,textAlign:"left" as any,fontFamily:"'DM Sans',sans-serif",borderTop:item.sep?"1px solid #f3f4f6":"none"}}>
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {s.status==="scheduled" && (
          <button onClick={()=>onGoLive(s)} className="lc-btn" style={{marginTop:10,width:"100%",justifyContent:"center",background:"#16a34a",color:"#fff",padding:"10px"}}>
            <Video style={{width:14,height:14}}/> Go Live
          </button>
        )}
        {s.status==="live" && (
          <button onClick={()=>onGoLive(s)} className="lc-btn" style={{marginTop:10,width:"100%",justifyContent:"center",background:"#ef4444",color:"#fff",padding:"10px"}}>
            <Play style={{width:14,height:14}}/> Join Class
          </button>
        )}
      </div>
    </div>
  );
};

/* ════ CREATE / EDIT DIALOG ════ */
const CreateEditDialog = ({open,onClose,form,setForm,subjects,editing,onSave}:any) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto mx-4 rounded-2xl p-0">
      <DialogHeader className="px-5 pt-5 pb-3 border-b">
        <DialogTitle className="text-base font-bold">{editing?"Edit Class":"Schedule New Class"}</DialogTitle>
      </DialogHeader>
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Subject *</Label>
          <Select value={form.subject_id} onValueChange={(v:string)=>setForm((f:any)=>({...f,subject_id:v}))}>
            <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select a subject"/></SelectTrigger>
            <SelectContent>{subjects.map((s:any)=><SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Topic (EN)</Label>
            <Input value={form.topic} onChange={(e:any)=>setForm((f:any)=>({...f,topic:e.target.value}))} className="h-10 text-sm" placeholder="e.g. Noon Sakin Rules"/>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Topic (AR)</Label>
            <Input value={form.topic_ar} onChange={(e:any)=>setForm((f:any)=>({...f,topic_ar:e.target.value}))} className="h-10 text-sm" dir="rtl" placeholder="الموضوع"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Date & Time</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e:any)=>setForm((f:any)=>({...f,scheduled_at:e.target.value}))} className="h-10 text-sm"/>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Duration (min)</Label>
            <Input type="number" value={form.duration_minutes} onChange={(e:any)=>setForm((f:any)=>({...f,duration_minutes:parseInt(e.target.value)||60}))} className="h-10 text-sm"/>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Homework (EN)</Label>
          <Textarea value={form.homework} onChange={(e:any)=>setForm((f:any)=>({...f,homework:e.target.value}))} rows={2} className="text-sm resize-none"/>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">🎯 Post-Class Quiz Code</Label>
          <Input
            value={form.quiz_code||""}
            onChange={(e:any)=>setForm((f:any)=>({...f,quiz_code:e.target.value.toUpperCase()}))}
            className="h-10 text-sm font-mono tracking-widest"
            placeholder="e.g. ABC123 — create quiz first, then paste code here"
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground">Create the quiz room in Al-Musabaqah, copy the 6-letter code, and paste it here. Students will be auto-redirected with this code after class.</p>
        </div>
        <div className="rounded-xl border divide-y">
          {([
            {key:"recording_enabled",    label:"Record Class", icon:"⏺"},
            {key:"chat_enabled",         label:"Enable Chat",  icon:"💬"},
            {key:"hand_raise_enabled",   label:"Hand Raising", icon:"✋"},
            {key:"waiting_room_enabled", label:"Waiting Room", icon:"🚪"},
          ] as const).map(row=>(
            <div key={row.key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{row.icon} {row.label}</span>
              <Switch checked={form[row.key]} onCheckedChange={(v:boolean)=>setForm((f:any)=>({...f,[row.key]:v}))}/>
            </div>
          ))}
        </div>
        <Button onClick={onSave} className="w-full h-11 text-sm font-bold">
          {editing?"Save Changes":"Create Session"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default LiveClassManagement;
