// src/pages/teacher/TeacherStudents.tsx
// "My Students" — restyled to match the app's modern design system
// (same tokens as GradingPage/TeacherGrading: deep green header accents,
// pill filter buttons, rounded white cards, avatar circles, gradient CTAs)
// instead of generic shadcn default Button/Card/Badge styling.

import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, BarChart, FileText, Calendar,
  StickyNote, CheckCircle, XCircle, UserPlus, UserMinus,
  ChevronLeft, Loader2, GraduationCap,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

const inp: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
  fontSize: 13, color: G, outline: "none", width: "100%", background: "#fff",
};

const pill = (active: boolean): React.CSSProperties => ({
  padding: "7px 15px", borderRadius: 20, fontSize: 12.5, fontWeight: 700,
  border: `1.5px solid ${active ? G : "#E5E7EB"}`,
  background: active ? G : "#fff",
  color: active ? "#fff" : "#6B7280",
  cursor: "pointer", whiteSpace: "nowrap" as const,
});

const levelColors: Record<string, { bg: string; fg: string; border: string }> = {
  beginner:     { bg: "#EFF6FF", fg: "#2563EB", border: "#BFDBFE" },
  intermediate: { bg: "#FFFBEB", fg: "#B45309", border: "#FDE68A" },
  advanced:     { bg: "#F0FDF4", fg: "#16A34A", border: "#86EFAC" },
};

const TeacherStudents = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Detail / note dialogs
  const [detailStudent, setDetailStudent] = useState<any>(null);
  const [studentAttempts, setStudentAttempts] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<"exams" | "tests">("exams");
  const [noteDialog, setNoteDialog] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [requestDialog, setRequestDialog] = useState<{ student: any; type: "enrol" | "remove" } | null>(null);
  const [requestMsg, setRequestMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
      // Teacher's subjects (owned + timetable assigned)
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar, level, levels").eq("teacher_id", user.id);
      const { data: ttSlots } = await supabase
        .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
      const ttIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];
      let extraSubs: any[] = [];
      if (ttIds.length > 0) {
        const ownedIds = (subs || []).map((s: any) => s.id);
        const missing = ttIds.filter((id: string) => !ownedIds.includes(id));
        if (missing.length > 0) {
          const { data: es } = await supabase.from("subjects").select("id, title, title_ar, level, levels").in("id", missing);
          extraSubs = es || [];
        }
      }
      const allSubs = [...(subs || []), ...extraSubs];
      setSubjects(allSubs);
      const subjectIds = allSubs.map((s: any) => s.id);
      if (subjectIds.length === 0) { return; }

      // Path A: courses → enrollments (structured enrollments) — the only
      // source of GROUP students. This is intentionally subject-scoped: a
      // student must actually be enrolled in one of THIS teacher's subjects
      // to show up here. (Previously there was also a level-based fallback
      // that pulled in every student sharing a level with one of the
      // teacher's subjects, even if they were enrolled in a different
      // subject entirely — removed so the list only ever shows students
      // actually taking this teacher's subjects.)
      const { data: courses } = await supabase.from("courses").select("id, subject_id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      let enrollments: any[] = [];
      let enrolledUserIds: string[] = [];
      if (courseIds.length > 0) {
        const { data: enrData } = await supabase.from("enrollments").select("user_id, course_id").in("course_id", courseIds);
        enrollments = enrData || [];
        enrolledUserIds = [...new Set(enrollments.map(e => e.user_id))];
      }

      // Path C: private students ONLY if admin explicitly assigned this teacher
      const { data: privateStudents } = await supabase
        .from("profiles").select("user_id")
        .eq("assigned_teacher_id", user.id)
        .eq("student_type", "private");
      const privateIds = (privateStudents || []).map(p => p.user_id);

      // Fetch private_student_subjects so private students show their subjects
      let privateSubjectMap: Record<string, any[]> = {};
      if (privateIds.length > 0) {
        const { data: pss } = await supabase
          .from("private_student_subjects")
          .select("student_id, subject_id")
          .in("student_id", privateIds);
        (pss || []).forEach((row: any) => {
          if (!privateSubjectMap[row.student_id]) privateSubjectMap[row.student_id] = [];
          const sub = allSubs.find((s: any) => s.id === row.subject_id);
          if (sub) privateSubjectMap[row.student_id].push(sub);
        });
      }

      const allUserIds = [...new Set([...enrolledUserIds, ...privateIds])];
      if (allUserIds.length === 0) { return; }

      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", allUserIds).eq("role", "student");

      // Get attendance stats
      const { data: attendance } = await supabase.from("manual_attendance").select("student_id, status")
        .eq("teacher_id", user.id);

      // Get latest exam scores
      const examIds = (await supabase.from("exams").select("id").in("course_id", courseIds)).data?.map(e => e.id) || [];
      let attemptsMap: Record<string, any> = {};
      if (examIds.length > 0) {
        const { data: attempts } = await supabase.from("exam_attempts").select("user_id, percentage, passed, submitted_at")
          .in("exam_id", examIds).eq("status", "graded").order("submitted_at", { ascending: false });
        (attempts || []).forEach(a => { if (!attemptsMap[a.user_id]) attemptsMap[a.user_id] = a; });
      }

      const enriched = (profiles || []).map(p => {
        // Private students: use admin-assigned private_student_subjects
        // Group students: use courses → enrollments path
        let pSubjects: any[];
        if (p.student_type === "private") {
          pSubjects = privateSubjectMap[p.user_id] || [];
        } else {
          const pEnrollments = (enrollments || []).filter((e: any) => e.user_id === p.user_id);
          pSubjects = pEnrollments.map((e: any) => {
            const course = (courses || []).find((c: any) => c.id === e.course_id);
            return allSubs.find((s: any) => s.id === course?.subject_id);
          }).filter(Boolean);
        }

        // Attendance %
        const studentAtt = (attendance || []).filter(a => a.student_id === p.user_id);
        const presentCount = studentAtt.filter(a => a.status === "present" || a.status === "late").length;
        const attendancePct = studentAtt.length > 0 ? Math.round((presentCount / studentAtt.length) * 100) : null;

        // Last exam
        const lastAttempt = attemptsMap[p.user_id] || null;

        return {
          ...p,
          enrolledSubjects: pSubjects,
          subjectCount: pSubjects.length,
          attendancePct,
          lastExamScore: lastAttempt ? Math.round(lastAttempt.percentage) : null,
          lastExamPassed: lastAttempt?.passed,
        };
      });

      setStudents(enriched);
      } catch (err: any) {
        console.error("[TeacherStudents] fetch error:", err.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const filtered = useMemo(() => students.filter(s => {
    if (filter === "group" && s.student_type === "private") return false;
    if (filter === "private" && s.student_type !== "private") return false;
    if (levelFilter !== "all" && s.level !== levelFilter) return false;
    if (subjectFilter !== "all" && !s.enrolledSubjects?.some((sub: any) => sub?.id === subjectFilter)) return false;
    if (search && !s.full_name?.toLowerCase().includes(search.toLowerCase()) && !s.full_name_ar?.includes(search)) return false;
    return true;
  }), [students, filter, levelFilter, subjectFilter, search]);

  const viewStudentResults = async (student: any) => {
    setDetailStudent(student);
    setDetailTab("exams");
    const { data } = await supabase.from("exam_attempts").select("*, exams(title, title_ar, type)")
      .eq("user_id", student.user_id).order("created_at", { ascending: false });
    setStudentAttempts(data || []);
  };

  const saveNote = async () => {
    if (!noteDialog || !noteText.trim()) return;
    const existing = noteDialog.private_notes || "";
    const timestamp = new Date().toLocaleDateString();
    const newNote = `[${timestamp}] ${noteText.trim()}`;
    const updated = existing ? `${existing}\n${newNote}` : newNote;
    await supabase.from("profiles").update({ private_notes: updated }).eq("user_id", noteDialog.user_id);
    toast({ title: t("Note saved", "تم حفظ الملاحظة") });
    setNoteDialog(null); setNoteText("");
  };

  // Request admin to enrol/remove student
  const sendEnrolRequest = async () => {
    if (!requestDialog || !user) return;
    // Find admins
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (!admins?.length) { toast({ title: t("No admin found", "لم يتم العثور على مدير"), variant: "destructive" }); return; }
    const msg = requestDialog.type === "enrol"
      ? `Teacher requests to ENROL student "${requestDialog.student.full_name}" in a subject. ${requestMsg}`
      : `Teacher requests to REMOVE student "${requestDialog.student.full_name}" from a subject. ${requestMsg}`;
    const inserts = admins.map(a => ({
      user_id: a.user_id, title: requestDialog.type === "enrol" ? "Enrol Request" : "Remove Request",
      message: msg, type: "admin",
    }));
    await supabase.from("notifications").insert(inserts);
    toast({ title: t("Request sent to admin", "تم إرسال الطلب للمدير") });
    setRequestDialog(null); setRequestMsg("");
  };

  const LevelBadge = ({ level }: { level: string }) => {
    const c = levelColors[level] || levelColors.beginner;
    const label = level === "intermediate" ? t("Intermediate", "متوسط") : level === "advanced" ? t("Advanced", "متقدم") : t("Beginner", "مبتدئ");
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
        {label}
      </span>
    );
  };

  const TypeBadge = ({ type }: { type: string }) => (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, flexShrink: 0,
      background: type === "private" ? "#FDF6E9" : "#EFF6FF",
      color: type === "private" ? "#B45309" : "#2563EB",
    }}>
      {type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
    </span>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} color={G} style={{ animation: "spin .8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ─── STUDENT DETAIL VIEW ───
  if (detailStudent) {
    const items = studentAttempts.filter(a => (a.exams?.type || "exam") === (detailTab === "tests" ? "test" : "exam"));
    return (
      <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ background: G, padding: "18px 20px 22px" }}>
          <button onClick={() => setDetailStudent(null)} style={{
            display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.12)", border: "none",
            color: "#fff", fontSize: 13, fontWeight: 700, padding: "7px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 14,
          }}>
            <ChevronLeft size={15} /> {t("Back", "رجوع")}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.15)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, flexShrink: 0,
            }}>
              {(detailStudent.full_name || "?")[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 19, fontWeight: 800, color: "#fff", margin: 0 }}>{detailStudent.full_name || "—"}</h1>
                <LevelBadge level={detailStudent.level} />
                <TypeBadge type={detailStudent.student_type} />
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: "3px 0 0" }}>
                {detailStudent.email} • {detailStudent.subjectCount} {t("subjects", "مواد")}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
          <button onClick={() => { setNoteDialog(detailStudent); setNoteText(""); }} style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
            padding: "8px 14px", borderRadius: 10, border: `1.5px solid #E5E7EB`, background: "#fff",
            fontSize: 12.5, fontWeight: 700, color: G, cursor: "pointer",
          }}>
            <StickyNote size={13} /> {t("Add Note", "أضف ملاحظة")}
          </button>

          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: t("Attendance", "الحضور"), value: detailStudent.attendancePct !== null ? `${detailStudent.attendancePct}%` : "—" },
              { label: t("Last Exam", "آخر امتحان"), value: detailStudent.lastExamScore !== null ? `${detailStudent.lastExamScore}%` : "—" },
              { label: t("Subjects", "المواد"), value: detailStudent.subjectCount },
            ].map((stat, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "16px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Exams / Tests tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["exams", "tests"] as const).map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)} style={pill(detailTab === tab)}>
                {tab === "exams" ? t("Exams", "الامتحانات") : t("Tests", "التمرينات")}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.length === 0 && (
              <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: "32px 0" }}>{t("No attempts", "لا توجد محاولات")}</p>
            )}
            {items.map(a => (
              <div key={a.id} style={{
                background: "#fff", borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                boxShadow: "0 1px 4px rgba(0,0,0,.04)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: G, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}
                  </p>
                  <p style={{ fontSize: 11.5, color: "#9CA3AF", margin: "2px 0 0" }}>
                    {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {a.status === "graded" && (
                    <>
                      {a.passed ? <CheckCircle size={15} color="#16A34A" /> : <XCircle size={15} color="#DC2626" />}
                      <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{Math.round(a.percentage || 0)}%</span>
                    </>
                  )}
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20,
                    background: a.status === "graded" ? (a.passed ? "#F0FDF4" : "#FEF2F2") : "#F3F4F6",
                    color: a.status === "graded" ? (a.passed ? "#16A34A" : "#DC2626") : "#6B7280",
                  }}>
                    {a.status === "graded" ? (a.passed ? t("Pass", "ناجح") : t("Fail", "راسب")) : t(a.status, a.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Private notes (read-only view) */}
          {detailStudent.private_notes && (
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginTop: 16, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <h3 style={{ fontSize: 12.5, fontWeight: 800, color: G, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                <StickyNote size={13} /> {t("Notes", "ملاحظات")}
              </h3>
              <pre style={{ fontSize: 11.5, color: "#6B7280", whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{detailStudent.private_notes}</pre>
            </div>
          )}
        </div>

        <NoteDialog />
        <RequestDialog />
      </div>
    );
  }

  function NoteDialog() {
    return (
      <Dialog open={!!noteDialog} onOpenChange={o => !o && setNoteDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle style={{ color: G }}>{t("Add Note for", "أضف ملاحظة لـ")} {noteDialog?.full_name}</DialogTitle></DialogHeader>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={t("Your note...", "ملاحظتك...")} rows={3} style={{ ...inp, resize: "vertical" as const }} />
          {noteDialog?.private_notes && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", margin: "0 0 4px" }}>{t("Previous Notes", "ملاحظات سابقة")}:</p>
              <pre style={{ fontSize: 11, color: "#6B7280", whiteSpace: "pre-wrap", background: "#F9FAFB", padding: 8, borderRadius: 8, maxHeight: 128, overflowY: "auto", margin: 0, fontFamily: "inherit" }}>{noteDialog.private_notes}</pre>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setNoteDialog(null)} style={{ ...pill(false), padding: "9px 16px" }}>{t("Cancel", "إلغاء")}</button>
            <button onClick={saveNote} disabled={!noteText.trim()} style={{
              padding: "9px 18px", borderRadius: 20, border: "none", fontSize: 12.5, fontWeight: 800,
              background: noteText.trim() ? `linear-gradient(135deg, ${G}, ${GM})` : "#E5E7EB",
              color: noteText.trim() ? "#fff" : "#9CA3AF", cursor: noteText.trim() ? "pointer" : "not-allowed",
            }}>
              {t("Save Note", "حفظ الملاحظة")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function RequestDialog() {
    return (
      <Dialog open={!!requestDialog} onOpenChange={o => !o && setRequestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ color: G }}>
              {requestDialog?.type === "enrol" ? t("Request Enrolment", "طلب تسجيل") : t("Request Removal", "طلب إزالة")} — {requestDialog?.student?.full_name}
            </DialogTitle>
          </DialogHeader>
          <textarea value={requestMsg} onChange={e => setRequestMsg(e.target.value)}
            placeholder={t("Add details (subject name, reason)...", "أضف تفاصيل (اسم المادة، السبب)...")} rows={3} style={{ ...inp, resize: "vertical" as const }} />
          <DialogFooter>
            <button onClick={() => setRequestDialog(null)} style={{ ...pill(false), padding: "9px 16px" }}>{t("Cancel", "إلغاء")}</button>
            <button onClick={sendEnrolRequest} style={{
              padding: "9px 18px", borderRadius: 20, border: "none", fontSize: 12.5, fontWeight: 800,
              background: `linear-gradient(135deg, ${G}, ${GM})`, color: "#fff", cursor: "pointer",
            }}>
              {t("Send Request", "إرسال الطلب")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── MAIN LIST ───
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("My Students", "طلابي")}</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: "2px 0 0" }}>
          {filtered.length} {t("students", "طالب")}
        </p>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {(["all", "group", "private"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={pill(filter === f)}>
              {f === "all" ? t("All", "الكل") : f === "group" ? t("Group", "مجموعة") : t("Private", "خاص")}
            </button>
          ))}
          <div style={{ width: 1, background: "#E5E7EB", margin: "2px 2px" }} />
          {(["all", "beginner", "intermediate", "advanced"] as const).map(f => (
            <button key={f} onClick={() => setLevelFilter(f)} style={pill(levelFilter === f)}>
              {f === "all" ? t("All Levels", "كل المستويات") : f === "beginner" ? t("Beginner", "مبتدئ") : f === "intermediate" ? t("Intermediate", "متوسط") : t("Advanced", "متقدم")}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} style={{ ...inp, width: 170, cursor: "pointer" }}>
            <option value="all">{t("All Subjects", "كل المواد")}</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("Search by name...", "ابحث بالاسم...")}
              style={{ ...inp, paddingLeft: 34 }}
            />
          </div>
        </div>
      </div>

      {/* Student list */}
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "#EFF6EF", margin: "0 auto 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Users size={24} color={G} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: G, margin: 0 }}>{t("No students found", "لم يتم العثور على طلاب")}</p>
            <p style={{ fontSize: 12.5, color: "#9CA3AF", marginTop: 4 }}>
              {t("Try adjusting your filters, or check back once students are enrolled.", "حاول تعديل الفلاتر، أو تحقق لاحقاً بعد تسجيل الطلاب.")}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filtered.map(s => (
              <div key={s.id} style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", background: "#EFF6EF", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", color: G, fontSize: 15, fontWeight: 800,
                  }}>
                    {(s.full_name || "?")[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: G, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.full_name || "---"}
                      </p>
                      <LevelBadge level={s.level} />
                    </div>
                    <p style={{ fontSize: 11.5, color: "#9CA3AF", margin: "2px 0 0" }}>{s.subjectCount} {t("subjects", "مواد")}</p>
                  </div>
                  <TypeBadge type={s.student_type} />
                </div>

                {/* Stats row */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#6B7280", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F3F4F6" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }} title={t("Attendance", "الحضور")}>
                    <BarChart size={12} />
                    {s.attendancePct !== null ? `${s.attendancePct}%` : "—"}
                    {s.attendancePct !== null && s.attendancePct < 60 && <XCircle size={11} color="#DC2626" />}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }} title={t("Last Exam", "آخر امتحان")}>
                    <GraduationCap size={12} />
                    {s.lastExamScore !== null ? (
                      <span style={{ fontWeight: 700, color: s.lastExamPassed ? "#16A34A" : "#DC2626" }}>{s.lastExamScore}%</span>
                    ) : "—"}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => viewStudentResults(s)} style={{
                    flex: 1, minWidth: 90, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff",
                    fontSize: 11.5, fontWeight: 700, color: G, cursor: "pointer",
                  }}>
                    <BarChart size={12} /> {t("Results", "النتائج")}
                  </button>
                  <button onClick={() => navigate("/teacher/transcript")} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10,
                    border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 11.5, fontWeight: 700, color: G, cursor: "pointer",
                  }}>
                    <FileText size={12} /> {t("Transcript", "كشف")}
                  </button>
                  {s.student_type === "private" && (
                    <button onClick={() => navigate("/teacher/private-sessions")} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10,
                      border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 11.5, fontWeight: 700, color: G, cursor: "pointer",
                    }}>
                      <Calendar size={12} /> {t("Session", "جلسة")}
                    </button>
                  )}
                  <button title={t("Request Enrol", "طلب تسجيل")} onClick={() => setRequestDialog({ student: s, type: "enrol" })} style={{
                    width: 30, height: 30, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280",
                  }}>
                    <UserPlus size={13} />
                  </button>
                  <button title={t("Request Remove", "طلب إزالة")} onClick={() => setRequestDialog({ student: s, type: "remove" })} style={{
                    width: 30, height: 30, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280",
                  }}>
                    <UserMinus size={13} />
                  </button>
                  <button title={t("Add Note", "أضف ملاحظة")} onClick={() => { setNoteDialog(s); setNoteText(""); }} style={{
                    width: 30, height: 30, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280",
                  }}>
                    <StickyNote size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NoteDialog />
      <RequestDialog />
    </div>
  );
};

export default TeacherStudents;
