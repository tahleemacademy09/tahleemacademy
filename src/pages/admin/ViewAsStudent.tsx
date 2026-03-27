/* src/pages/admin/ViewAsStudent.tsx — Full student view with admin banner + send message */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, BookOpen, ClipboardList, TrendingUp, Calendar,
  Video, CheckCircle, XCircle, Eye, Mail, Phone, Bell, Edit,
  GraduationCap, Send, Loader2, ChevronRight, Users, Lock
} from "lucide-react";

const G = "#064E3B";

const ViewAsStudent = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t, language } = useLanguage();
  const { user: adminUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading]           = useState(true);
  const [profile, setProfile]           = useState<any>(null);
  const [enrollments, setEnrollments]   = useState<any[]>([]);
  const [attempts, setAttempts]         = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [attendance, setAttendance]     = useState<any[]>([]);
  const [stats, setStats]               = useState({ enrollments:0, graded:0, avg:0, pending:0, released:0 });
  const [activeTab, setActiveTab]       = useState("overview");

  // Send message dialog
  const [msgDialog, setMsgDialog]       = useState(false);
  const [msgTitle, setMsgTitle]         = useState("");
  const [msgBody, setMsgBody]           = useState("");
  const [sending, setSending]           = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const [profileRes, enrollRes, attemptsRes, notifsRes, attendanceRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("enrollments").select("*, courses(title, title_ar, subjects(title, title_ar))").eq("user_id", userId),
        supabase.from("exam_attempts").select("*, exams(title, title_ar, type, term, passing_score)").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("notifications" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
        supabase.from("manual_attendance").select("*, subjects(title, title_ar)").eq("student_id", userId).order("date", { ascending: false }).limit(50),
      ]);
      setProfile(profileRes.data);
      setEnrollments(enrollRes.data || []);
      setAttempts(attemptsRes.data || []);
      setNotifications((notifsRes.data as any[]) || []);
      setAttendance(attendanceRes.data || []);
      const graded   = (attemptsRes.data||[]).filter(a => a.status === "graded");
      const released = (attemptsRes.data||[]).filter(a => a.status === "released");
      const allGraded = [...graded, ...released];
      const avg = allGraded.length ? allGraded.reduce((s,a)=>s+(Number(a.percentage)||0),0)/allGraded.length : 0;
      const pending = (attemptsRes.data||[]).filter(a=>a.status==="submitted").length;
      setStats({ enrollments: enrollRes.data?.length||0, graded: allGraded.length, avg:Math.round(avg), pending, released:released.length });
      setLoading(false);
    };
    load();
  }, [userId]);

  const sendMessage = async () => {
    if (!msgTitle || !msgBody || !userId) return;
    setSending(true);
    await supabase.from("notifications" as any).insert({
      user_id: userId, title: msgTitle, message: msgBody,
      type: "admin_message", sent_by: adminUser?.id,
    } as any);
    toast({ title: "✅ Message sent to student" });
    setSending(false); setMsgDialog(false); setMsgTitle(""); setMsgBody("");
    setNotifications(n => [{ id: Date.now(), title:msgTitle, message:msgBody, created_at:new Date().toISOString(), is_read:false, type:"admin_message" }, ...n]);
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh" }}>
      <Loader2 size={32} style={{ animation:"spin .8s linear infinite", color:G }}/>
    </div>
  );
  if (!profile) return <div style={{ padding:40, textAlign:"center", color:"#6B7280" }}>Student not found</div>;

  const presentCount = attendance.filter(a=>a.status==="present"||a.status==="late").length;
  const attendancePct = attendance.length ? Math.round((presentCount/attendance.length)*100) : null;

  const TABS = [
    { id:"overview",  label:"Overview",  icon:"📊" },
    { id:"exams",     label:"Exams",     icon:"📝" },
    { id:"courses",   label:"Courses",   icon:"📚" },
    { id:"attendance",label:"Attendance",icon:"📅" },
    { id:"messages",  label:"Messages",  icon:"🔔" },
  ];

  const StatusBadge = ({ status }: { status:string }) => {
    const cfg: Record<string,{bg:string;text:string}> = {
      released: { bg:"#DCFCE7", text:"#166534" },
      graded:   { bg:"#FEF9C3", text:"#854D0E" },
      submitted:{ bg:"#DBEAFE", text:"#1D4ED8" },
      in_progress:{ bg:"#F3F4F6", text:"#374151" },
    };
    const c = cfg[status]||{ bg:"#F3F4F6", text:"#6B7280" };
    return <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:c.bg, color:c.text, fontWeight:700 }}>{status.replace("_"," ")}</span>;
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Admin banner */}
      <div style={{ background:"#7C3AED", padding:"10px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <Eye size={16} color="#fff"/>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12, fontWeight:800, color:"#fff", margin:0 }}>👁️ Admin: Viewing as Student</p>
          <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:0 }}>You are seeing exactly what this student sees. Changes here are real.</p>
        </div>
        <button onClick={()=>navigate("/admin/students")}
          style={{ padding:"5px 12px", borderRadius:8, background:"rgba(255,255,255,.2)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
          <ArrowLeft size={13}/> Back to Admin
        </button>
      </div>

      {/* Student header */}
      <div style={{ background:G, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(255,255,255,.2)", border:"2px solid rgba(255,255,255,.3)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>
              : <span style={{ fontSize:22, fontWeight:800, color:"#fff" }}>{(profile.full_name||"?")[0]}</span>}
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontWeight:900, fontSize:18, color:"#fff", margin:0 }}>{profile.full_name||"—"}</p>
            <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
              {profile.email&&<span style={{ fontSize:11, color:"rgba(255,255,255,.7)", display:"flex", alignItems:"center", gap:3 }}><Mail size={11}/>{profile.email}</span>}
              {profile.phone&&<span style={{ fontSize:11, color:"rgba(255,255,255,.7)", display:"flex", alignItems:"center", gap:3 }}><Phone size={11}/>{profile.phone}</span>}
              {profile.level&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"rgba(255,255,255,.2)", color:"#fff", fontWeight:700 }}>{profile.level}</span>}
              {profile.status&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:profile.status==="active"?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)", color:"#fff", fontWeight:700 }}>{profile.status}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setMsgDialog(true)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              <Send size={13}/> Message
            </button>
            <button onClick={()=>navigate(`/admin/students`)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              <Edit size={13}/> Edit Profile
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginTop:14, overflowX:"auto", paddingBottom:2 }}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ padding:"7px 14px", borderRadius:10, border:"none", cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap",
                background:activeTab===tab.id?"#fff":"rgba(255,255,255,.12)",
                color:activeTab===tab.id?G:"rgba(255,255,255,.85)" }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:860, margin:"0 auto" }}>

        {/* OVERVIEW */}
        {activeTab==="overview"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Stats grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10 }}>
              {[
                { v:stats.enrollments, l:"Courses", icon:"📚", bg:"#EFF6FF", c:"#1D4ED8" },
                { v:stats.graded,      l:"Graded",  icon:"✅", bg:"#F0FDF4", c:"#166534" },
                { v:stats.released,    l:"Released", icon:"🔓", bg:"#ECFDF5", c:"#065F46" },
                { v:stats.avg+"%",     l:"Avg Score",icon:"📊", bg:"#F5F3FF", c:"#6D28D9" },
                { v:stats.pending,     l:"Pending",  icon:"⏳", bg:"#FFF7ED", c:"#C2410C" },
                { v:attendancePct!=null?attendancePct+"%":"—", l:"Attendance", icon:"📅", bg:attendancePct!=null&&attendancePct<60?"#FEF2F2":"#F0FDF4", c:attendancePct!=null&&attendancePct<60?"#991B1B":"#166534" },
              ].map((s,i)=>(
                <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22 }}>{s.icon}</div>
                  <div style={{ fontSize:20, fontWeight:900, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", padding:16 }}>
              <h3 style={{ fontWeight:800, fontSize:14, color:"#111", marginBottom:12 }}>Recent Exam Activity</h3>
              {attempts.slice(0,5).map(a=>{
                const pct = Math.round(a.percentage||0);
                return (
                  <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #F9FAFB" }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:a.status==="released"?"#F0FDF4":a.status==="graded"?"#FEF9C3":"#DBEAFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <ClipboardList size={16} color={a.status==="released"?"#16A34A":a.status==="graded"?"#854D0E":"#1D4ED8"}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:600, color:"#111", margin:0 }}>{language==="ar"?a.exams?.title_ar||a.exams?.title:a.exams?.title}</p>
                      <div style={{ display:"flex", gap:8, marginTop:2 }}>
                        <StatusBadge status={a.status}/>
                        {(a.status==="graded"||a.status==="released")&&<span style={{ fontSize:11, fontWeight:700, color:pct>=(a.exams?.passing_score||60)?"#16A34A":"#DC2626" }}>{pct}%</span>}
                      </div>
                    </div>
                    {a.status==="graded"&&(
                      <span style={{ fontSize:11, padding:"3px 8px", borderRadius:20, background:"#FEF9C3", color:"#854D0E", fontWeight:700, display:"flex", alignItems:"center", gap:3 }}>
                        <Lock size={10}/> Awaiting release
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EXAMS */}
        {activeTab==="exams"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {attempts.length===0?(
              <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
                <p style={{ color:"#9CA3AF" }}>No exam attempts yet</p>
              </div>
            ):attempts.map(a=>{
              const pct = Math.round(a.percentage||0);
              const passing = a.exams?.passing_score||60;
              return (
                <div key={a.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:160 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>{language==="ar"?a.exams?.title_ar||a.exams?.title:a.exams?.title}</p>
                    <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                      <StatusBadge status={a.status}/>
                      {a.exams?.term&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#F5F3FF", color:"#6D28D9", fontWeight:600 }}>{a.exams.term}</span>}
                    </div>
                  </div>
                  {(a.status==="graded"||a.status==="released")&&(
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:900, color:pct>=passing?"#16A34A":"#DC2626" }}>{pct}%</div>
                      <div style={{ fontSize:10, color:"#9CA3AF" }}>{a.score}/{a.total_points}</div>
                    </div>
                  )}
                  {a.status==="released"&&<CheckCircle size={18} color="#16A34A"/>}
                  {a.status==="graded"&&<Lock size={16} color="#D97706"/>}
                </div>
              );
            })}
          </div>
        )}

        {/* COURSES */}
        {activeTab==="courses"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {enrollments.length===0?(
              <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
                <p style={{ color:"#9CA3AF" }}>Not enrolled in any courses yet</p>
              </div>
            ):enrollments.map(e=>{
              const course = e.courses as any;
              return (
                <div key={e.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <BookOpen size={18} color={G}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>{language==="ar"?course?.title_ar||course?.title:course?.title}</p>
                    <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>Enrolled {new Date(e.enrolled_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:G }}>{e.progress||0}%</div>
                    <div style={{ fontSize:10, color:"#9CA3AF" }}>progress</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ATTENDANCE */}
        {activeTab==="attendance"&&(
          <>
            <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E5E7EB", padding:16, marginBottom:12, display:"flex", gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:900, color:attendancePct!=null&&attendancePct<60?"#DC2626":G }}>{attendancePct!=null?attendancePct+"%":"—"}</div>
                <div style={{ fontSize:11, color:"#9CA3AF" }}>Attendance rate</div>
              </div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                {[["Present","#166534","#F0FDF4",attendance.filter(a=>a.status==="present").length],
                  ["Late","#D97706","#FFF7ED",attendance.filter(a=>a.status==="late").length],
                  ["Absent","#DC2626","#FEF2F2",attendance.filter(a=>a.status==="absent").length]].map(([l,c,bg,v])=>(
                  <div key={l as string} style={{ background:bg as string, borderRadius:10, padding:"8px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:900, color:c as string }}>{v as number}</div>
                    <div style={{ fontSize:10, color:c as string, opacity:.8, fontWeight:600 }}>{l as string}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {attendance.map(a=>(
                <div key={a.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, fontWeight:600, color:"#111", margin:0 }}>{language==="ar"?a.subjects?.title_ar||a.subjects?.title:a.subjects?.title||"—"}</p>
                    <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{new Date(a.date).toLocaleDateString()}</p>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20,
                    background:a.status==="present"?"#DCFCE7":a.status==="late"?"#FEF9C3":"#FEE2E2",
                    color:a.status==="present"?"#166534":a.status==="late"?"#854D0E":"#991B1B" }}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* MESSAGES */}
        {activeTab==="messages"&&(
          <>
            <div style={{ marginBottom:12 }}>
              <button onClick={()=>setMsgDialog(true)}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:12, border:"none", background:G, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13 }}>
                <Send size={14}/> Send Message to Student
              </button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {notifications.length===0?(
                <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
                  <p style={{ color:"#9CA3AF" }}>No messages</p>
                </div>
              ):notifications.map((n:any)=>(
                <div key={n.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:"#111", margin:0 }}>{n.title}</p>
                      <p style={{ fontSize:12, color:"#6B7280", margin:"3px 0 0", lineHeight:1.5 }}>{n.message}</p>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{new Date(n.created_at).toLocaleDateString()}</p>
                      {!n.is_read&&<span style={{ fontSize:9, padding:"1px 6px", borderRadius:20, background:"#DBEAFE", color:"#1D4ED8", fontWeight:700 }}>Unread</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Send Message Dialog */}
      <Dialog open={msgDialog} onOpenChange={v=>!v&&setMsgDialog(false)}>
        <DialogContent style={{ maxWidth:420, borderRadius:20, padding:0 }}>
          <div style={{ background:"#7C3AED", padding:"18px 20px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", gap:10 }}>
            <Send size={20} color="#fff"/>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Message {profile.full_name?.split(" ")[0]}</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Title *</label>
              <input value={msgTitle} onChange={e=>setMsgTitle(e.target.value)} placeholder="e.g. Homework reminder"
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", boxSizing:"border-box" as const }}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Message *</label>
              <textarea value={msgBody} onChange={e=>setMsgBody(e.target.value)} rows={4}
                placeholder="Write your message to the student…"
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", resize:"none", boxSizing:"border-box" as const }}/>
            </div>
            <button onClick={sendMessage} disabled={sending||!msgTitle||!msgBody}
              style={{ padding:"13px", borderRadius:12, border:"none", background:"#7C3AED", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity:(sending||!msgTitle||!msgBody)?.5:1 }}>
              {sending?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Sending…</>:<><Send size={16}/> Send Message</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default ViewAsStudent;
