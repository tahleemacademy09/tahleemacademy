import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Download, Calendar, Users, Clock, Edit, Video, Eye,
  BookOpen, FileText, ClipboardList, Megaphone, Play, Search,
  Radio, ChevronRight, Mic, CheckCircle, XCircle, AlertCircle,
  ArrowLeft, Filter, MoreVertical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import LiveClassFilePanel   from "@/components/classroom/LiveClassFilePanel";
import { useLiveClass }     from "@/contexts/LiveClassContext";

/* ── helpers ── */
const G    = "hsl(155,55%,15%)";
const GOLD = "hsl(42,52%,55%)";

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  live:      { label: "Live",      color: "#ef4444", bg: "rgba(239,68,68,.12)",   dot: "#ef4444" },
  scheduled: { label: "Scheduled", color: "#3b82f6", bg: "rgba(59,130,246,.12)",  dot: "#3b82f6" },
  completed: { label: "Completed", color: "#22c55e", bg: "rgba(34,197,94,.12)",   dot: "#22c55e" },
  ended:     { label: "Ended",     color: "#6b7280", bg: "rgba(107,114,128,.12)", dot: "#6b7280" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "rgba(239,68,68,.08)",   dot: "#ef4444" },
};
const StatusBadge = ({ status }: { status: string }) => {
  const cfg = statusConfig[status] || statusConfig.scheduled;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, background:cfg.bg, fontSize:11, fontWeight:700, color:cfg.color, letterSpacing:.3 }}>
      {status === "live" && <span style={{ width:6, height:6, borderRadius:"50%", background:cfg.dot, display:"inline-block", animation:"lc-pulse 1s infinite" }}/>}
      {cfg.label}
    </span>
  );
};

const fmtDate = (d: string | null) => d ? format(new Date(d), "MMM d, h:mm a") : "—";
const fmtDur  = (s: number | null) => s ? `${Math.round(s / 60)}m` : "—";

const CSS = `
  @keyframes lc-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes lc-spin   { to { transform:rotate(360deg); } }
  .lc-card { background:#fff; border-radius:16px; box-shadow:0 1px 6px rgba(0,0,0,.07); overflow:hidden; }
  .lc-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.1); }
  .lc-btn { display:inline-flex; align-items:center; gap:6px; border:none; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
  .lc-btn:active { transform:scale(.97); }
  .lc-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; }
`;

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
const LiveClassManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Live class state lives in GlobalClassroomOverlay context ──
  // joinClass() → overlay mounts full-screen classroom (persists on refresh via sessionStorage)
  // leaveClass() → overlay unmounts classroom
  const { joinClass, leaveClass } = useLiveClass();

  const [sessions,       setSessions]       = useState<any[]>([]);
  const [subjects,       setSubjects]       = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [subjectFilter,  setSubjectFilter]  = useState("all");
  const [showFilters,    setShowFilters]    = useState(false);
  const [showCreate,     setShowCreate]     = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [attendanceView, setAttendanceView] = useState<any>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [manualAttendance, setManualAttendance] = useState<any[]>([]);
  const [students,    setStudents]    = useState<any[]>([]);
  const [editAtt,     setEditAtt]     = useState<Record<string, string>>({});
  const [sessionMenu, setSessionMenu] = useState<string | null>(null);

  const [form, setForm] = useState({
    subject_id:"", topic:"", topic_ar:"", scheduled_at:"",
    duration_minutes:60, recording_enabled:true, chat_enabled:true,
    hand_raise_enabled:true, waiting_room_enabled:true, whiteboard_enabled:false,
    homework:"", homework_ar:"",
  });

  const fetchData = useCallback(async () => {
    const [{ data: subs }, { data: sess }] = await Promise.all([
      supabase.from("subjects").select("id,title,title_ar,teacher_id,is_active,livekit_room_name"),
      supabase.from("live_sessions").select("*,subjects(title,title_ar)").order("scheduled_at",{ascending:false}),
    ]);
    setSubjects(subs || []);
    setSessions(sess || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live poll every 15s
  useEffect(() => {
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const filtered = sessions.filter(s => {
    if (subjectFilter !== "all" && s.subject_id !== subjectFilter) return false;
    if (statusFilter  !== "all" && s.status !== statusFilter)      return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(s.subjects?.title||"").toLowerCase().includes(q) &&
          !(s.topic||"").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const resetForm = () => setForm({
    subject_id:"", topic:"", topic_ar:"", scheduled_at:"",
    duration_minutes:60, recording_enabled:true, chat_enabled:true,
    hand_raise_enabled:true, waiting_room_enabled:true, whiteboard_enabled:false,
    homework:"", homework_ar:"",
  });

  const openCreate = () => { resetForm(); setEditingSession(null); setShowCreate(true); };
  const openEdit   = (s: any) => {
    setForm({
      subject_id: s.subject_id || "", topic: s.topic || "", topic_ar: s.topic_ar || "",
      scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0,16) : "",
      duration_minutes: s.duration_minutes || 60,
      recording_enabled:    s.recording_enabled    ?? true,
      chat_enabled:         s.chat_enabled         ?? true,
      hand_raise_enabled:   s.hand_raise_enabled   ?? true,
      waiting_room_enabled: s.waiting_room_enabled ?? true,
      whiteboard_enabled:   s.whiteboard_enabled   ?? false,
      homework: s.homework || "", homework_ar: s.homework_ar || "",
    });
    setEditingSession(s); setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.subject_id) { toast({ title:"Please select a subject", variant:"destructive" }); return; }
    const payload = {
      subject_id: form.subject_id,
      topic: form.topic || null, topic_ar: form.topic_ar || null,
      scheduled_at: form.scheduled_at || null,
      duration_minutes: form.duration_minutes,
      recording_enabled:    form.recording_enabled,
      chat_enabled:         form.chat_enabled,
      hand_raise_enabled:   form.hand_raise_enabled,
      waiting_room_enabled: form.waiting_room_enabled,
      whiteboard_enabled:   form.whiteboard_enabled,
      homework: form.homework || null, homework_ar: form.homework_ar || null,
    };
    if (editingSession) {
      await supabase.from("live_sessions").update(payload).eq("id", editingSession.id);
      toast({ title:t("Class updated","تم تحديث الحصة") });
    } else {
      await supabase.from("live_sessions").insert({ ...payload, status:"scheduled" } as any);
      toast({ title:t("Class scheduled","تم جدولة الحصة") });
    }
    setShowCreate(false); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this class?","حذف هذه الحصة؟"))) return;
    await supabase.from("live_sessions").delete().eq("id", id);
    setSessions(p => p.filter(s => s.id !== id));
    toast({ title:t("Deleted","تم الحذف") });
  };

  const updateStatus = async (id: string, status: string) => {
    const u: any = { status };
    if (status === "live")      u.actual_start_time = new Date().toISOString();
    if (["completed","ended"].includes(status)) u.actual_end_time = new Date().toISOString();
    await supabase.from("live_sessions").update(u).eq("id", id);
    fetchData();
  };

  const goLive = async (session: any) => {
    const subject = subjects.find(s => s.id === session.subject_id);
    if (!subject) { toast({ title:"Subject not found", variant:"destructive" }); return; }
    if (session.id) {
      await supabase.from("live_sessions").update({ status:"live", actual_start_time:new Date().toISOString(), started_at:new Date().toISOString() }).eq("id", session.id);
    } else {
      // No session yet — create one on the fly
      const { data: newSess } = await supabase.from("live_sessions").insert({
        subject_id: session.subject_id,
        status: "live",
        started_at: new Date().toISOString(),
        actual_start_time: new Date().toISOString(),
        title: subject.title,
        session_number: 1,
        recording_enabled: true,
        chat_enabled: true,
        hand_raise_enabled: true,
      }).select("id").single();
      if (newSess) fetchData();
    }
    // GlobalClassroomOverlay takes over — persists across navigation + refresh
    joinClass({
      id: subject.id,
      title: subject.title,
      title_ar: subject.title_ar || "",
      livekit_room_name: subject.livekit_room_name,
    });
  };

  const viewAttendance = async (session: any) => {
    setAttendanceView(session);
    const [{ data: logs }, { data: manual }] = await Promise.all([
      supabase.from("attendance_logs").select("*,profiles:user_id(full_name)").eq("session_id", session.id),
      supabase.from("manual_attendance").select("*,profiles:student_id(full_name)").eq("session_id", session.id),
    ]);
    setAttendanceLogs(logs || []);
    setManualAttendance(manual || []);
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", session.subject_id);
    const cids = (courses||[]).map((c:any)=>c.id);
    if (cids.length > 0) {
      const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", cids);
      const uids = [...new Set((enr||[]).map((e:any)=>e.user_id))];
      if (uids.length > 0) {
        const { data } = await supabase.from("profiles").select("user_id,full_name").in("user_id", uids);
        setStudents(data||[]);
        const map: Record<string,string> = {};
        (manual||[]).forEach((m:any) => { map[m.student_id] = m.status; });
        (data||[]).forEach((s:any) => { if (!map[s.user_id]) map[s.user_id] = "absent"; });
        setEditAtt(map);
      }
    }
  };

  const saveAttendance = async () => {
    if (!attendanceView || !user) return;
    await supabase.from("manual_attendance").delete().eq("session_id", attendanceView.id);
    const records = Object.entries(editAtt).map(([student_id, status]) => ({
      session_id: attendanceView.id, student_id,
      subject_id: attendanceView.subject_id, teacher_id: user.id,
      status, date: (attendanceView.created_at||new Date().toISOString()).split("T")[0],
    }));
    await supabase.from("manual_attendance").insert(records);
    toast({ title:t("Attendance saved","تم حفظ الحضور") });
  };

  const exportCSV = () => {
    const rows = [["Student","Status","Joined","Left","Duration"].join(",")];
    attendanceLogs.forEach((l:any) => rows.push([
      (l.profiles?.full_name||l.user_id), "auto",
      l.joined_at ? new Date(l.joined_at).toLocaleString() : "",
      l.left_at   ? new Date(l.left_at).toLocaleString()   : "",
      fmtDur(l.duration_seconds),
    ].join(",")));
    manualAttendance.forEach((m:any) => rows.push([(m.profiles?.full_name||m.student_id), m.status,"","",""].join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type:"text/csv" }));
    a.download = "attendance.csv"; a.click();
  };

  // NOTE: No classroomEl or early return needed here.
  // GlobalClassroomOverlay at App root handles the full-screen classroom + PiP pill
  // for ALL roles (student, teacher, admin) through LiveClassContext.

  /* ── Loading ── */
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:300 }}>
      <style>{CSS}</style>
      <div style={{ width:32, height:32, borderRadius:"50%", border:`3px solid ${G}`, borderTopColor:"transparent", animation:"lc-spin .8s linear infinite" }}/>
    </div>
  );

  /* ── Attendance View ── */
  if (attendanceView) return (
    <div style={{ minHeight:"100vh", background:"hsl(var(--muted)/0.4)", padding:"16px 16px 40px" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, gap:12 }}>
        <button onClick={() => setAttendanceView(null)} className="lc-btn" style={{ background:"hsl(var(--muted))", color:"hsl(var(--foreground))" }}>
          <ArrowLeft style={{ width:15, height:15 }}/> Back
        </button>
        <button onClick={exportCSV} className="lc-btn" style={{ background:"hsl(var(--muted))", color:"hsl(var(--foreground))" }}>
          <Download style={{ width:14, height:14 }}/> CSV
        </button>
      </div>

      <h2 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>{t("Attendance","الحضور")}</h2>
      <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))", marginBottom:20 }}>
        {attendanceView.subjects?.title || attendanceView.topic || "Session"}
      </p>

      {/* Auto-logged */}
      {attendanceLogs.length > 0 && (
        <div className="lc-card" style={{ marginBottom:16 }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid hsl(var(--border))", fontWeight:700, fontSize:13 }}>
            🤖 {t("Auto-Logged","التلقائي")} · {attendanceLogs.length}
          </div>
          <div>
            {attendanceLogs.map((l:any) => (
              <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:"1px solid hsl(var(--border)/0.5)" }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:`${G}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, flexShrink:0 }}>
                  {(l.profiles?.full_name||"S")[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {l.profiles?.full_name || "Student"}
                  </p>
                  <p style={{ fontSize:11, color:"hsl(var(--muted-foreground))", margin:0 }}>
                    {l.joined_at ? new Date(l.joined_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : ""} 
                    {l.left_at ? ` → ${new Date(l.left_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}` : ""}
                  </p>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:"#22c55e" }}>{fmtDur(l.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual attendance */}
      {students.length > 0 && (
        <div className="lc-card" style={{ marginBottom:16 }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid hsl(var(--border))", fontWeight:700, fontSize:13 }}>
            ✏️ {t("Manual Attendance","الحضور اليدوي")} · {students.length}
          </div>
          <div>
            {students.map((s:any) => (
              <div key={s.user_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:"1px solid hsl(var(--border)/0.5)" }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:`${G}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, flexShrink:0 }}>
                  {(s.full_name||"S")[0].toUpperCase()}
                </div>
                <span style={{ flex:1, fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.full_name}</span>
                <div style={{ display:"flex", gap:4 }}>
                  {(["present","late","absent"] as const).map(st => (
                    <button key={st} onClick={() => setEditAtt(p => ({...p, [s.user_id]:st}))}
                      style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all .1s",
                        background: editAtt[s.user_id]===st ? (st==="present"?"#22c55e":st==="late"?"#f59e0b":"#ef4444") : "hsl(var(--muted))",
                        color: editAtt[s.user_id]===st ? "#fff" : "hsl(var(--muted-foreground))" }}>
                      {st==="present"?"✓":st==="late"?"~":"✗"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={saveAttendance} className="lc-btn" style={{ width:"100%", justifyContent:"center", background:G, color:"#fff", padding:"14px" }}>
        <CheckCircle style={{ width:16, height:16 }}/> {t("Save Attendance","حفظ الحضور")}
      </button>
    </div>
  );

  /* ── Subject Detail View ── */
  if (selectedSubjectId) {
    const sub      = subjects.find(s => s.id === selectedSubjectId);
    const subSess  = sessions.filter(s => s.subject_id === selectedSubjectId);
    const liveSess = subSess.find(s => s.status === "live");
    const schedSess = subSess.filter(s => s.status === "scheduled");

    return (
      <div style={{ minHeight:"100vh", background:"hsl(var(--muted)/0.4)", paddingBottom:40, fontFamily:"'Cairo',sans-serif" }}>
        <style>{CSS + `@keyframes pipPulse2{0%,100%{opacity:1}50%{opacity:.4}} @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');`}</style>

        {/* ── Header — matches student subject view ── */}
        <div style={{ background:`linear-gradient(135deg,${G},#1a4731)`, padding:"48px 16px 0" }}>

          {/* Back button */}
          <button onClick={() => setSelectedSubjectId(null)}
            style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.12)", border:"none", borderRadius:20, padding:"6px 14px", color:"rgba(255,255,255,.8)", fontWeight:700, fontSize:12, cursor:"pointer", marginBottom:18, fontFamily:"'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width:13, height:13 }}/> {t("All Subjects","كل المواد")}
          </button>

          {/* Subject title — centered like student view */}
          <div style={{ textAlign:"center", padding:"0 8px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap", marginBottom:6 }}>
              <h1 style={{ fontSize:22, fontWeight:900, color:"#fff", margin:0 }}>{sub?.title}</h1>
              {liveSess && (
                <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:20, background:"#ef4444", color:"#fff", animation:"pipPulse2 1.5s infinite" }}>● LIVE</span>
              )}
            </div>
            {sub?.title_ar && (
              <p dir="rtl" style={{ fontSize:14, color:"#c9a84c", margin:"0 0 4px", fontFamily:"'Amiri','Cairo',serif" }}>
                {sub.title_ar}
              </p>
            )}

            {/* Stats row */}
            <div style={{ display:"flex", justifyContent:"center", gap:20, marginBottom:16, marginTop:8 }}>
              {[
                { label:"Total",     v:subSess.length,    c:"rgba(255,255,255,.9)" },
                { label:"Live now",  v:liveSess ? 1 : 0,  c:"#ef4444" },
                { label:"Scheduled", v:schedSess.length,  c:"#60a5fa" },
              ].map((x,i) => (
                <div key={i} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:x.c }}>{x.v}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,.5)", fontWeight:600 }}>{x.label}</div>
                </div>
              ))}
            </div>

            {/* ── BIG ACTION BUTTONS — exactly like student ── */}
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              {/* Go Live / Join — gold prominent button */}
              {liveSess ? (
                <button
                  onClick={() => goLive(liveSess)}
                  style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 28px", borderRadius:14, background:"#c9a84c", border:"none", color:"#0f2d1f", fontSize:14, fontWeight:900, cursor:"pointer", fontFamily:"'Cairo',sans-serif", boxShadow:"0 4px 16px rgba(201,168,76,.5)", animation:"pipPulse2 2s infinite" }}>
                  <Video style={{ width:16, height:16 }}/> {t("Join Live Class","انضم للحصة المباشرة")}
                </button>
              ) : (
                <button
                  onClick={() => goLive(subSess.find(s => s.status === "scheduled") || { subject_id: selectedSubjectId, id: null })}
                  style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 28px", borderRadius:14, background:"#c9a84c", border:"none", color:"#0f2d1f", fontSize:14, fontWeight:900, cursor:"pointer", fontFamily:"'Cairo',sans-serif", boxShadow:"0 4px 16px rgba(201,168,76,.4)" }}>
                  <Video style={{ width:16, height:16 }}/> {t("Start Class","ابدأ الحصة")}
                </button>
              )}
              {/* Schedule button */}
              <button
                onClick={() => { setForm(f => ({...f, subject_id:selectedSubjectId})); setEditingSession(null); setShowCreate(true); }}
                style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 20px", borderRadius:14, background:"rgba(255,255,255,.15)", border:"1.5px solid rgba(255,255,255,.25)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                <Plus style={{ width:14, height:14 }}/> {t("Schedule","جدولة")}
              </button>
            </div>
          </div>

          {/* Tabs — scrollable, same style as student */}
          <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", borderTop:"1px solid rgba(255,255,255,.1)", marginTop:4 }}>
            {[
              { val:"sessions",     label:t("Sessions","الحصص"),          icon:"📅" },
              { val:"recordings",   label:t("Recordings","التسجيلات"),    icon:"🎬" },
              { val:"materials",    label:t("Materials","المواد"),         icon:"📄" },
              { val:"syllabus",     label:t("Syllabus","المنهج"),          icon:"📖" },
              { val:"assignments",  label:t("Tasks","المهام"),             icon:"📋" },
              { val:"announce",     label:t("News","الإعلانات"),           icon:"📢" },
              { val:"files",        label:t("Files","الملفات"),            icon:"📂" },
            ].map(tab => (
              <button key={tab.val}
                onClick={() => (document.getElementById(`admin-tab-${tab.val}`) as HTMLElement)?.scrollIntoView({ behavior:"smooth" })}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"10px 14px", border:"none", background:"none", cursor:"pointer", fontFamily:"'Cairo',sans-serif", fontSize:12, fontWeight:600, color:"rgba(255,255,255,.7)", whiteSpace:"nowrap", flexShrink:0, borderBottom:"2.5px solid transparent" }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>

          {/* Sessions section */}
          <div id="admin-tab-sessions" style={{ marginBottom:24 }}>
            <p style={{ fontSize:12, fontWeight:700, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>
              {t("Sessions","الحصص")} · {subSess.length}
            </p>
            {subSess.length === 0 ? (
              <div className="lc-card" style={{ padding:36, textAlign:"center", color:"hsl(var(--muted-foreground))" }}>
                <Video style={{ width:28, height:28, margin:"0 auto 8px", opacity:.4 }}/>
                <p style={{ fontSize:13 }}>No sessions yet</p>
              </div>
            ) : (
              subSess.map(s => (
                <SessionCard key={s.id} s={s} onGoLive={goLive} onEdit={openEdit} onDelete={handleDelete} onAttendance={viewAttendance} onUpdateStatus={updateStatus} subjects={subjects} menu={sessionMenu} setMenu={setSessionMenu}/>
              ))
            )}
          </div>

          <div id="admin-tab-recordings"><SubjectRecordings    subjectId={selectedSubjectId}/></div>
          <div id="admin-tab-materials"  style={{ marginTop:24 }}><SubjectMaterials   subjectId={selectedSubjectId}/></div>
          <div id="admin-tab-syllabus"   style={{ marginTop:24 }}><SubjectSyllabus    subjectId={selectedSubjectId}/></div>
          <div id="admin-tab-assignments" style={{ marginTop:24 }}><SubjectAssignments subjectId={selectedSubjectId}/></div>
          <div id="admin-tab-announce"   style={{ marginTop:24 }}><SubjectAnnouncements subjectId={selectedSubjectId}/></div>
          <div id="admin-tab-files"      style={{ marginTop:24 }}><LiveClassFilePanel  subjectId={selectedSubjectId}/></div>
        </div>

        <CreateEditDialog open={showCreate} onClose={() => setShowCreate(false)} form={form} setForm={setForm} subjects={subjects} editing={editingSession} onSave={handleSave}/>
      </div>
    );
  }

  /* ── Main Dashboard ── */
  const liveNow     = sessions.filter(s => s.status === "live");
  const scheduled   = sessions.filter(s => s.status === "scheduled");
  const completed   = sessions.filter(s => ["completed","ended"].includes(s.status));

  return (
    <div style={{ minHeight:"100vh", background:"hsl(var(--muted)/0.4)", paddingBottom:40 }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background:G, padding:"48px 16px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:20 }}>
          <div>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.5)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, margin:0 }}>Admin</p>
            <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:0 }}>{t("Live Classes","الفصول المباشرة")}</h1>
          </div>
          <button onClick={openCreate} className="lc-btn" style={{ background:GOLD, color:"#fff", flexShrink:0 }}>
            <Plus style={{ width:14, height:14 }}/> {t("Schedule","جدولة")}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {[
            { label:t("Live","مباشر"),      v:liveNow.length,   c:"#ef4444",  pulse:liveNow.length>0 },
            { label:t("Scheduled","مجدولة"),v:scheduled.length, c:"#60a5fa",  pulse:false },
            { label:t("Done","مكتمل"),      v:completed.length, c:"rgba(255,255,255,.5)", pulse:false },
            { label:t("Subjects","مواد"),   v:subjects.length,  c:"rgba(255,255,255,.85)", pulse:false },
          ].map((s,i) => (
            <div key={i} style={{ background:"rgba(255,255,255,.1)", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, color:s.c, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                {s.pulse && <span style={{ width:7, height:7, borderRadius:"50%", background:"#ef4444", display:"inline-block", animation:"lc-pulse 1s infinite" }}/>}
                {s.v}
              </div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.5)", fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 16px", marginTop:20 }}>

        {/* Live now alert */}
        {liveNow.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"#ef4444", textTransform:"uppercase", letterSpacing:.6, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", display:"inline-block", animation:"lc-pulse 1s infinite" }}/>
              {t("Live Now","مباشر الآن")} · {liveNow.length}
            </p>
            {liveNow.map(s => (
              <SessionCard key={s.id} s={s} onGoLive={goLive} onEdit={openEdit} onDelete={handleDelete} onAttendance={viewAttendance} onUpdateStatus={updateStatus} subjects={subjects} menu={sessionMenu} setMenu={setSessionMenu}/>
            ))}
          </div>
        )}

        {/* Subject cards */}
        <div style={{ marginBottom:20 }}>
          <p style={{ fontSize:11, fontWeight:700, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>
            {t("Subjects","المواد")} · {subjects.length}
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
            {subjects.map(sub => {
              const cnt     = sessions.filter(s => s.subject_id === sub.id).length;
              const liveSess = sessions.find(s => s.subject_id === sub.id && s.status === "live");
              return (
                <div key={sub.id} className="lc-card" onClick={() => setSelectedSubjectId(sub.id)}
                  style={{ padding:"14px", cursor:"pointer", position:"relative" }}>
                  {liveSess && (
                    <span style={{ position:"absolute", top:10, right:10, width:8, height:8, borderRadius:"50%", background:"#ef4444", animation:"lc-pulse 1s infinite" }}/>
                  )}
                  <div style={{ width:36, height:36, borderRadius:10, background:`${G}15`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
                    <BookOpen style={{ width:18, height:18, color:G }}/>
                  </div>
                  <p style={{ fontSize:13, fontWeight:700, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.title}</p>
                  {sub.title_ar && <p style={{ fontSize:11, color:"hsl(var(--muted-foreground))", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.title_ar}</p>}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
                    <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>{cnt} sessions</span>
                    {liveSess ? (
                      <button
                        onClick={e => { e.stopPropagation(); goLive(liveSess); }}
                        style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:8, background:"#ef4444", border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        <Play style={{ width:10, height:10 }}/> Join
                      </button>
                    ) : (
                      <ChevronRight style={{ width:14, height:14, color:"hsl(var(--muted-foreground))" }}/>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* All sessions with search/filter */}
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:.6, margin:0 }}>
              {t("Sessions","الحصص")} · {filtered.length}
            </p>
            <button onClick={() => setShowFilters(v=>!v)} style={{ display:"flex", alignItems:"center", gap:4, background:"none", border:"1px solid hsl(var(--border))", borderRadius:8, padding:"5px 10px", fontSize:12, cursor:"pointer", color:"hsl(var(--foreground))" }}>
              <Filter style={{ width:12, height:12 }}/> Filter
            </button>
          </div>

          {/* Search + filters */}
          <div style={{ marginBottom:12 }}>
            <div style={{ position:"relative", marginBottom:showFilters?8:0 }}>
              <Search style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", width:14, height:14, color:"hsl(var(--muted-foreground))" }}/>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                placeholder={t("Search topic or subject…","بحث…")}
                style={{ width:"100%", padding:"10px 12px 10px 36px", borderRadius:10, border:"1px solid hsl(var(--border))", background:"hsl(var(--background))", fontSize:13, boxSizing:"border-box", outline:"none" }}/>
            </div>
            {showFilters && (
              <div style={{ display:"flex", gap:8 }}>
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                  style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid hsl(var(--border))", background:"hsl(var(--background))", fontSize:12, outline:"none" }}>
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}
                  style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid hsl(var(--border))", background:"hsl(var(--background))", fontSize:12, outline:"none" }}>
                  <option value="all">All Subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {filtered.map(s => (
            <SessionCard key={s.id} s={s} onGoLive={goLive} onEdit={openEdit} onDelete={handleDelete} onAttendance={viewAttendance} onUpdateStatus={updateStatus} subjects={subjects} menu={sessionMenu} setMenu={setSessionMenu}/>
          ))}
          {filtered.length === 0 && (
            <div className="lc-card" style={{ padding:36, textAlign:"center", color:"hsl(var(--muted-foreground))" }}>
              <Video style={{ width:28, height:28, margin:"0 auto 8px", opacity:.4 }}/>
              <p style={{ fontSize:14, fontWeight:500 }}>No sessions found</p>
            </div>
          )}
        </div>
      </div>

      <CreateEditDialog open={showCreate} onClose={() => setShowCreate(false)} form={form} setForm={setForm} subjects={subjects} editing={editingSession} onSave={handleSave}/>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SESSION CARD — mobile-first, all actions accessible
═══════════════════════════════════════════════════════ */
const SessionCard = ({ s, onGoLive, onEdit, onDelete, onAttendance, onUpdateStatus, subjects, menu, setMenu }: any) => {
  const isLive = s.status === "live";
  const menuOpen = menu === s.id;
  const G = "hsl(155,55%,15%)";

  return (
    <div className="lc-card" style={{ marginBottom:8, border: isLive ? "1.5px solid rgba(239,68,68,.4)" : "1.5px solid transparent", position:"relative" }}>
      {/* Live indicator bar */}
      {isLive && <div style={{ height:3, background:"#ef4444", animation:"lc-pulse 1s infinite" }}/>}

      <div style={{ padding:"14px 14px 12px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {/* Subject */}
            <p style={{ fontSize:11, fontWeight:700, color:"hsl(var(--muted-foreground))", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {s.subjects?.title || "No subject"}
            </p>
            {/* Topic */}
            <p style={{ fontSize:14, fontWeight:700, margin:"0 0 8px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {s.topic || <span style={{ fontStyle:"italic", opacity:.5 }}>No topic</span>}
            </p>
            {/* Meta row */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
              <StatusBadge status={s.status}/>
              {s.scheduled_at && (
                <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"hsl(var(--muted-foreground))" }}>
                  <Calendar style={{ width:11, height:11 }}/>{fmtDate(s.scheduled_at)}
                  {s.status === "scheduled" && (() => {
                    const diff = new Date(s.scheduled_at).getTime() - Date.now();
                    if (diff <= 0) return null;
                    const mins = Math.floor(diff / 60000);
                    const label = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`;
                    return <span style={{ marginLeft:6, color:"#D97706", fontWeight:800 }}>⏱ {label}</span>;
                  })()}
                </span>
              )}
              {s.duration_minutes && (
                <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"hsl(var(--muted-foreground))" }}>
                  <Clock style={{ width:11, height:11 }}/>{s.duration_minutes}m
                </span>
              )}
              {(s.total_participants || s.participant_count || 0) > 0 && (
                <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"hsl(var(--muted-foreground))" }}>
                  <Users style={{ width:11, height:11 }}/>{s.total_participants || s.participant_count}
                </span>
              )}
            </div>
          </div>

          {/* ⋮ menu */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <button onClick={() => setMenu(menuOpen ? null : s.id)}
              style={{ width:32, height:32, borderRadius:8, border:"1px solid hsl(var(--border))", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <MoreVertical style={{ width:15, height:15 }}/>
            </button>
            {menuOpen && (
              <div onClick={() => setMenu(null)}
                style={{ position:"fixed", inset:0, zIndex:40 }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ position:"absolute", right:0, top:36, background:"hsl(var(--card))", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", minWidth:180, zIndex:50, overflow:"hidden", border:"1px solid hsl(var(--border))" }}>
                  <button onClick={() => { onEdit(s); setMenu(null); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left" }}>
                    <Edit style={{ width:14, height:14 }}/> Edit
                  </button>
                  <button onClick={() => { onAttendance(s); setMenu(null); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left" }}>
                    <Users style={{ width:14, height:14 }}/> Attendance
                  </button>
                  {s.status === "scheduled" && (
                    <button onClick={() => { onUpdateStatus(s.id,"cancelled"); setMenu(null); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left", color:"#f59e0b" }}>
                      <XCircle style={{ width:14, height:14 }}/> Cancel
                    </button>
                  )}
                  {s.status === "live" && (
                    <button onClick={() => { onUpdateStatus(s.id,"completed"); setMenu(null); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left", color:"#f59e0b" }}>
                      <XCircle style={{ width:14, height:14 }}/> End Class
                    </button>
                  )}
                  <button onClick={() => { onDelete(s.id); setMenu(null); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left", color:"#ef4444", borderTop:"1px solid hsl(var(--border))" }}>
                    <AlertCircle style={{ width:14, height:14 }}/> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Primary CTA */}
        {s.status === "scheduled" && (
          <button onClick={() => onGoLive(s)} className="lc-btn"
            style={{ marginTop:10, width:"100%", justifyContent:"center", background:"#16a34a", color:"#fff", padding:"10px" }}>
            <Video style={{ width:15, height:15 }}/> Go Live
          </button>
        )}
        {s.status === "live" && (
          <button onClick={() => onGoLive(s)} className="lc-btn"
            style={{ marginTop:10, width:"100%", justifyContent:"center", background:"#ef4444", color:"#fff", padding:"10px" }}>
            <Play style={{ width:15, height:15 }}/> Join Class
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   CREATE / EDIT DIALOG
═══════════════════════════════════════════════════════ */
const CreateEditDialog = ({ open, onClose, form, setForm, subjects, editing, onSave }: any) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto mx-4 rounded-2xl p-0">
      <DialogHeader className="px-5 pt-5 pb-3 border-b">
        <DialogTitle className="text-base font-bold">
          {editing ? "Edit Class" : "Schedule New Class"}
        </DialogTitle>
      </DialogHeader>
      <div className="px-5 py-4 space-y-4">
        {/* Subject */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Subject *</Label>
          <Select value={form.subject_id} onValueChange={v => setForm((f:any) => ({...f, subject_id:v}))}>
            <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select a subject"/></SelectTrigger>
            <SelectContent>{subjects.map((s:any) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Topic */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Topic (EN)</Label>
            <Input value={form.topic} onChange={e => setForm((f:any)=>({...f,topic:e.target.value}))} className="h-10 text-sm" placeholder="e.g. Noon Sakin Rules"/>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Topic (AR)</Label>
            <Input value={form.topic_ar} onChange={e => setForm((f:any)=>({...f,topic_ar:e.target.value}))} className="h-10 text-sm" dir="rtl" placeholder="الموضوع"/>
          </div>
        </div>

        {/* Date + Duration */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Date & Time</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm((f:any)=>({...f,scheduled_at:e.target.value}))} className="h-10 text-sm"/>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Duration (min)</Label>
            <Input type="number" value={form.duration_minutes} onChange={e => setForm((f:any)=>({...f,duration_minutes:parseInt(e.target.value)||60}))} className="h-10 text-sm"/>
          </div>
        </div>

        {/* Homework */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Homework (EN)</Label>
          <Textarea value={form.homework} onChange={e => setForm((f:any)=>({...f,homework:e.target.value}))} rows={2} className="text-sm resize-none"/>
        </div>

        {/* Settings toggles */}
        <div className="rounded-xl border divide-y">
          {([
            { key:"recording_enabled",    label:"Record Class",    icon:"⏺" },
            { key:"chat_enabled",         label:"Enable Chat",     icon:"💬" },
            { key:"hand_raise_enabled",   label:"Hand Raising",    icon:"✋" },
            { key:"waiting_room_enabled", label:"Waiting Room",    icon:"🚪" },
          ] as const).map(row => (
            <div key={row.key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{row.icon} {row.label}</span>
              <Switch checked={form[row.key]} onCheckedChange={v => setForm((f:any)=>({...f,[row.key]:v}))}/>
            </div>
          ))}
        </div>

        <Button onClick={onSave} className="w-full h-11 text-sm font-bold">
          {editing ? "Save Changes" : "Create Session"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default LiveClassManagement;
