/* src/pages/admin/ViewAsStudent.tsx
   Admin can VIEW a student's full profile AND navigate as if they ARE that student.
   Route: /admin/students/:userId/view
*/
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Send, Loader2, Eye, CheckCircle, XCircle,
  BookOpen, ClipboardList, Calendar, Users
} from "lucide-react";

const G = "#064E3B";

export default function ViewAsStudent() {
  const { userId } = useParams<{ userId: string }>();
  const { user: adminUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading]     = useState(true);
  const [profile, setProfile]     = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [attempts, setAttempts]   = useState<any[]>([]);
  const [assigned, setAssigned]   = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [notifs, setNotifs]       = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [msgDialog, setMsgDialog] = useState(false);
  const [msgTitle, setMsgTitle]   = useState("");
  const [msgBody, setMsgBody]     = useState("");
  const [sending, setSending]     = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [pRes, eRes, aRes, asRes, atRes, nRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("enrollments").select("*, courses(title, level)").eq("user_id", userId),
        supabase.from("exam_attempts").select("*, exams(title, type, passing_score)").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("exam_assignments").select("*, exams(title, is_published, start_date, end_date)").eq("user_id", userId),
        supabase.from("manual_attendance").select("*, subjects(title)").eq("student_id", userId).order("date", { ascending: false }).limit(30),
        supabase.from("notifications" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);
      setProfile(pRes.data);
      setEnrollments(eRes.data || []);
      setAttempts(aRes.data || []);
      setAssigned(asRes.data || []);
      setAttendance(atRes.data || []);
      setNotifs(nRes.data || []);
      setLoading(false);
    })();
  }, [userId]);

  const sendMsg = async () => {
    if (!msgTitle || !msgBody) return;
    setSending(true);
    const { error } = await supabase.from("notifications" as any).insert({
      user_id: userId, title: msgTitle, message: msgBody,
      type: "admin_message", sent_by: adminUser?.id,
    } as any);
    setSending(false);
    if (error) toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ Message sent to student!" }); setMsgDialog(false); setMsgTitle(""); setMsgBody(""); }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!profile) return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <p style={{ fontWeight: 700 }}>Student not found</p>
      <button onClick={() => navigate("/admin/students")}
        style={{ marginTop: 12, padding: "9px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700 }}>
        ← Back
      </button>
    </div>
  );

  const graded   = attempts.filter(a => ["graded","released"].includes(a.status));
  const avg      = graded.length ? Math.round(graded.reduce((s,a) => s + (Number(a.percentage)||0), 0) / graded.length) : 0;
  const pending  = attempts.filter(a => a.status === "submitted").length;
  const present  = attendance.filter(a => a.status === "present").length;
  const attRate  = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

  const TABS = [
    { id: "overview",    label: "Overview",     icon: "📊" },
    { id: "exams",       label: "Exams",        icon: "📝" },
    { id: "courses",     label: "Courses",      icon: "📚" },
    { id: "attendance",  label: "Attendance",   icon: "📅" },
    { id: "assignments", label: "Assignments",  icon: "📋" },
    { id: "notifs",      label: "Notifications",icon: "🔔" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Cairo',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Admin Preview Banner */}
      <div style={{ background: "#7c3aed", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={14} /> Admin Preview — viewing as: <strong style={{ color: "#e9d5ff" }}>{profile.full_name}</strong>
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMsgDialog(true)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
            <Send size={11} /> Message Student
          </button>
          <button onClick={() => navigate("/admin/students")}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            ← Exit Preview
          </button>
        </div>
      </div>

      {/* Student Header — styled exactly like student dashboard */}
      <div style={{ background: G, padding: "18px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid rgba(255,255,255,.3)", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
              : <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{(profile.full_name || "?")[0]}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 900, fontSize: 18, color: "#fff", margin: 0 }}>{profile.full_name}</p>
            {profile.full_name_ar && <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)", margin: "2px 0 0", direction: "rtl" }}>{profile.full_name_ar}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {profile.level && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "rgba(255,255,255,.18)", color: "#fff", fontWeight: 700 }}>{profile.level}</span>}
              {profile.gender && <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>{profile.gender}</span>}
              {profile.country && <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>🌍 {profile.country}</span>}
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {[
            { v: enrollments.length, l: "Courses" },
            { v: `${avg}%`, l: "Avg Score" },
            { v: assigned.length, l: "Assigned" },
            { v: pending, l: "Pending" },
            { v: `${attRate}%`, l: "Attendance" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "7px 14px", borderRadius: 10, background: "rgba(255,255,255,.12)", flexShrink: 0, textAlign: "center" }}>
              <p style={{ fontWeight: 900, fontSize: 16, color: "#fff", margin: 0 }}>{s.v}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.65)", margin: 0 }}>{s.l}</p>
            </div>
          ))}
        </div>

        {/* Tab strip */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap", borderRadius: "10px 10px 0 0", background: activeTab === t.id ? "#F3F4F6" : "transparent", color: activeTab === t.id ? G : "rgba(255,255,255,.75)" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { icon: "📚", v: enrollments.length, l: "Enrolled Courses", bg: "#EFF6FF", c: "#1D4ED8" },
                { icon: "✅", v: graded.length, l: "Graded Exams", bg: "#F0FDF4", c: "#166534" },
                { icon: "⏳", v: pending, l: "Awaiting Grading", bg: "#FFF7ED", c: "#C2410C" },
                { icon: "📊", v: `${avg}%`, l: "Average Score", bg: "#F5F3FF", c: "#6D28D9" },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 14, padding: "16px", display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 28 }}>{s.icon}</span>
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 900, color: s.c, margin: 0 }}>{s.v}</p>
                    <p style={{ fontSize: 11, color: s.c, opacity: .7, margin: 0, fontWeight: 600 }}>{s.l}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Profile details */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 16, marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: G, margin: "0 0 12px" }}>📋 Profile Details</p>
              {[
                ["Email", profile.email], ["Phone", profile.phone], ["Country", profile.country],
                ["City", profile.city], ["Nationality", profile.nationality],
                ["Date of Birth", profile.date_of_birth], ["Parent", profile.parent_name],
                ["Parent Phone", profile.parent_phone], ["Level", profile.level],
              ].filter(([, v]) => v).map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F9FAFB", fontSize: 13 }}>
                  <span style={{ color: "#9CA3AF", fontWeight: 600 }}>{l}</span>
                  <span style={{ color: "#374151", fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 16 }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: G, margin: "0 0 12px" }}>⚡ Quick Actions</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => navigate(`/admin/grading`)}
                  style={{ padding: "11px 14px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, color: G }}>
                  📝 Grade this student's pending exams →
                </button>
                <button onClick={() => navigate(`/admin/exams`)}
                  style={{ padding: "11px 14px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, color: G }}>
                  📋 Assign an exam to this student →
                </button>
                <button onClick={() => setMsgDialog(true)}
                  style={{ padding: "11px 14px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, color: G }}>
                  ✉️ Send notification to this student →
                </button>
              </div>
            </div>
          </>
        )}

        {/* EXAMS */}
        {activeTab === "exams" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {attempts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📝</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>No exam attempts yet</p>
              </div>
            ) : attempts.map((a, i) => {
              const pct = Number(a.percentage) || 0;
              const pass = pct >= (a.exams?.passing_score || 60);
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{a.exams?.title || "Exam"}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>
                        {new Date(a.created_at).toLocaleDateString()} · {a.exams?.type || "exam"}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: pass ? "#166534" : "#DC2626" }}>
                        {a.status === "submitted" ? "⏳" : `${pct}%`}
                      </div>
                      <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700, marginTop: 3,
                        background: a.status === "submitted" ? "#FFF7ED" : pass ? "#DCFCE7" : "#FEF2F2",
                        color: a.status === "submitted" ? "#C2410C" : pass ? "#166534" : "#DC2626" }}>
                        {a.status === "submitted" ? "Awaiting grading" : a.status === "in_progress" ? "In progress" : pass ? "✓ Passed" : "✗ Failed"}
                      </div>
                    </div>
                  </div>
                  {(a.status === "graded" || a.status === "released") && (
                    <div style={{ height: 5, borderRadius: 3, background: "#F3F4F6", overflow: "hidden", marginTop: 10 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pass ? "#16A34A" : "#DC2626", transition: "width .4s" }} />
                    </div>
                  )}
                  {a.score !== null && a.total_points !== null && (
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0" }}>{a.score} / {a.total_points} points</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* COURSES */}
        {activeTab === "courses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {enrollments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📚</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>Not enrolled in any courses</p>
              </div>
            ) : enrollments.map((e, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={16} color="#1D4ED8" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>{e.courses?.title || "Course"}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{e.courses?.level || ""}</p>
                </div>
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, fontWeight: 700,
                  background: e.status === "active" ? "#DCFCE7" : "#F3F4F6",
                  color: e.status === "active" ? "#166534" : "#6B7280" }}>
                  {e.status || "active"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ATTENDANCE */}
        {activeTab === "attendance" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { v: attendance.length, l: "Total Classes", bg: "#EFF6FF", c: "#1D4ED8" },
                { v: present, l: "Present", bg: "#F0FDF4", c: "#166534" },
                { v: `${attRate}%`, l: "Rate", bg: "#F5F3FF", c: "#6D28D9" },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 12, padding: 14, textAlign: "center" }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: s.c, margin: 0 }}>{s.v}</p>
                  <p style={{ fontSize: 11, color: s.c, opacity: .7, margin: 0 }}>{s.l}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {attendance.map((a, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: a.status === "present" ? "#DCFCE7" : "#FEF2F2" }}>
                    {a.status === "present" ? <CheckCircle size={16} color="#166534" /> : <XCircle size={16} color="#DC2626" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{a.subjects?.title || "Class"}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{new Date(a.date).toLocaleDateString()}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.status === "present" ? "#166534" : "#DC2626" }}>{a.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ASSIGNMENTS */}
        {activeTab === "assignments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assigned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📋</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>No exams assigned</p>
              </div>
            ) : assigned.map((a, i) => {
              const attempted = attempts.some(at => at.exam_id === a.exam_id);
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>{a.exams?.title || "Exam"}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>
                        Assigned {new Date(a.created_at).toLocaleDateString()}
                        {a.exams?.end_date && ` · Due ${new Date(a.exams.end_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
                      background: attempted ? "#DCFCE7" : "#EFF6FF",
                      color: attempted ? "#166534" : "#1D4ED8" }}>
                      {attempted ? "✓ Attempted" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === "notifs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>🔔</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>No notifications</p>
              </div>
            ) : notifs.map((n: any, i) => (
              <div key={i} style={{ background: n.is_read ? "#fff" : "#FFFBEB", borderRadius: 12, border: `1px solid ${n.is_read ? "#E5E7EB" : "#FDE68A"}`, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <p style={{ fontWeight: n.is_read ? 600 : 800, fontSize: 13, color: "#374151", margin: 0 }}>{n.title}</p>
                  {!n.is_read && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FDE68A", color: "#92400E", fontWeight: 700 }}>Unread</span>}
                </div>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 4px" }}>{n.message}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send Message Dialog */}
      <Dialog open={msgDialog} onOpenChange={v => !v && setMsgDialog(false)}>
        <DialogContent style={{ maxWidth: 420, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>✉️ Message {profile.full_name}</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: "3px 0 0" }}>This will appear in their notification panel instantly</p>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Title</label>
              <input value={msgTitle} onChange={e => setMsgTitle(e.target.value)} placeholder="e.g. Your exam result is ready"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Message</label>
              <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={4} placeholder="Type your message…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" as const }} />
            </div>
            <button onClick={sendMsg} disabled={sending || !msgTitle || !msgBody}
              style={{ padding: "12px 0", borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 800, color: "#fff", background: sending || !msgTitle || !msgBody ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {sending ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Sending…</> : <><Send size={14} /> Send</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
