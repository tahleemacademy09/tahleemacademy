import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Edit, Trash2, Copy, Search, Send, Eye, EyeOff,
  BarChart2, Loader2, CheckCircle2, ClipboardList, CalendarClock, RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { publishExam, splitLevels } from "@/lib/examPublish";

const G    = "#064E3B";
const GOLD = "#c9a84c";

const inp: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
  fontSize: 13, outline: "none", background: "#fff",
};

const toLocalDatetimeInput = (iso: string): string => {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

interface TeacherExamsPageProps {
  // Optional now — the page shows a type filter tab of its own so it can
  // display exams and tests together (or a caller can still force one type
  // via this prop if a dedicated route ever needs it).
  type?: "exam" | "test";
}

const TeacherExamsPage = ({ type: fixedType }: TeacherExamsPageProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: academicLevels = [] } = useAcademicLevels();

  const [exams, setExams] = useState<any[]>([]);
  const [termFilter, setTermFilter] = useState("all");

  // Follow the academy's Current Term setting (Admin Settings > Academy).
  const { settings: academySettings } = useAcademySettings();
  useEffect(() => {
    if (academySettings.current_term) setTermFilter(academySettings.current_term);
  }, [academySettings.current_term]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");
  // "all" | "exam" | "test" — ignored if a caller pins `type` via props.
  const [typeFilter, setTypeFilter] = useState<"all" | "exam" | "test">(fixedType || "all");
  const [loading, setLoading] = useState(true);

  // Assigned/attempt counts per exam — same shape as the admin Exam Manager.
  const [counts, setCounts] = useState<Record<string, { assigned: number; attempts: number }>>({});
  const [mySubjects, setMySubjects] = useState<any[]>([]);

  // Assign dialog — scoped to only the students this teacher actually teaches.
  const [assignExam, setAssignExam] = useState<any | null>(null);
  const [assignMode, setAssignMode] = useState<"level" | "individual">("level");
  const [assignLevel, setAssignLevel] = useState("");
  const [myStudents, setMyStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Manage-students dialog — per-assigned-student view for a single exam:
  // see who has/hasn't attempted, extend an individual student's deadline
  // past the exam's own end_date, or reset an attempt so they can retake.
  // Mirrors the admin ExamManager's dialog, scoped naturally to this
  // teacher's own exams since `exams` here is already filtered to them.
  const [manageExam, setManageExam] = useState<any | null>(null);
  const [manageStudents, setManageStudents] = useState<any[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [extendInputs, setExtendInputs] = useState<Record<string, string>>({});
  const [savingExtend, setSavingExtend] = useState<string | null>(null);
  const [resettingAttempt, setResettingAttempt] = useState<string | null>(null);

  const effectiveType = fixedType || typeFilter;
  const isTest = effectiveType === "test";
  const label = effectiveType === "all" ? t("Exams & Tests", "الامتحانات والتمارين") : isTest ? t("Tests", "التمرينات") : t("Exams", "الامتحانات");
  const singularLabel = isTest ? t("Test", "تمرين") : t("Exam", "امتحان");

  const fetchExams = async () => {
    if (!user) return;
    setLoading(true);
    // A teacher can be tied to a subject two ways: they own it directly
    // (subjects.teacher_id), or the admin assigned them to teach it via
    // the timetable (subject_timetable.teacher_id). Either one means the
    // subject — and any exam on it, including ones the admin built the
    // questions for — is theirs to see and grade, so both are merged here.
    const { data: subs } = await supabase.from("subjects").select("id, level, levels").eq("teacher_id", user.id);
    const { data: ttSlots } = await supabase.from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
    const ttIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];
    let extraSubs: any[] = [];
    if (ttIds.length > 0) {
      const ownedIds = (subs || []).map((s: any) => s.id);
      const missing = ttIds.filter((id: string) => !ownedIds.includes(id));
      if (missing.length > 0) {
        const { data: es } = await supabase.from("subjects").select("id, level, levels").in("id", missing);
        extraSubs = es || [];
      }
    }
    const allSubs = [...(subs || []), ...extraSubs];
    setMySubjects(allSubs);
    const subjectIds = allSubs.map((s: any) => s.id);
    if (subjectIds.length === 0) { setExams([]); setLoading(false); return; }

    // NOTE: exams are linked to the teacher via exams.subject_id (set by
    // ExamEditor on save), not via the legacy courses→course_id path —
    // exams.course_id is never populated by the editor, so filtering on
    // it here silently hid every exam a teacher just created.
    // Type filtering (exam vs test) happens client-side below in
    // `filtered`, not here, so a single fetch covers both types.
    const { data } = await supabase
      .from("exams").select("*, subjects(title, title_ar), exam_questions(id)")
      .in("subject_id", subjectIds).order("created_at", { ascending: false });
    setExams(data || []);
    setLoading(false);

    if (data?.length) {
      const ids = data.map((e: any) => e.id);
      const [ar, at] = await Promise.all([
        supabase.from("exam_assignments").select("exam_id").in("exam_id", ids),
        supabase.from("exam_attempts").select("exam_id").in("exam_id", ids),
      ]);
      const c: Record<string, { assigned: number; attempts: number }> = {};
      (ar.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].assigned++; });
      (at.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].attempts++; });
      setCounts(c);
    }
  };

  useEffect(() => { fetchExams(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  // Load the teacher's own students (level-matched to their subjects, plus
  // any private students the admin has assigned directly to them) when the
  // assign dialog opens — never the whole school's roster.
  const openAssign = async (exam: any) => {
    setAssignExam(exam);
    setAssignMode("level");
    setAssignLevel(exam.level || "");
    setSelectedStudents(new Set());
    setStudentSearch("");
    setStudentsLoading(true);

    const myLevels = Array.from(new Set(
      mySubjects.flatMap((s: any) => (s.levels?.length ? s.levels : (s.level ? [s.level] : [])))
    ));

    let students: any[] = [];
    if (myLevels.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, level")
        .eq("role", "student").neq("student_type", "private")
        .eq("onboarding_completed", true)
        .in("level", myLevels);
      students = (profiles || []).map((p: any) => ({
        user_id: p.user_id, full_name: p.full_name || "Unknown",
        full_name_ar: p.full_name_ar || "", level: p.level || "—",
      }));
    }
    // Private students the admin has assigned directly to this teacher.
    const { data: privateProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, full_name_ar, level")
      .eq("assigned_teacher_id", user!.id).eq("student_type", "private");
    (privateProfiles || []).forEach((p: any) => {
      if (!students.some(s => s.user_id === p.user_id)) {
        students.push({ user_id: p.user_id, full_name: p.full_name || "Unknown", full_name_ar: p.full_name_ar || "", level: p.level || "—" });
      }
    });

    setMyStudents(students);
    setStudentsLoading(false);
  };

  const doAssign = async () => {
    if (!assignExam) return;
    setAssigning(true);
    try {
      let userIds: string[] = [];
      if (assignMode === "level") {
        if (!assignLevel) { toast({ title: t("Select a level", "اختر مستوى"), variant: "destructive" }); setAssigning(false); return; }
        userIds = myStudents.filter(s => s.level === assignLevel).map(s => s.user_id);
      } else {
        userIds = Array.from(selectedStudents);
      }
      if (userIds.length === 0) {
        toast({ title: t("No students found for this selection", "لا يوجد طلاب لهذا الاختيار"), variant: "destructive" });
        setAssigning(false); return;
      }

      await supabase.from("exam_attempts")
        .delete().eq("exam_id", assignExam.id).in("user_id", userIds).eq("status", "in_progress");

      const { error: assignErr } = await supabase.from("exam_assignments")
        .upsert(
          userIds.map(uid => ({ exam_id: assignExam.id, user_id: uid, assigned_by: user?.id })),
          { onConflict: "exam_id,user_id" }
        );
      if (assignErr) console.warn("Assign upsert:", assignErr.message);

      const kindLabel = (assignExam.type || "exam") === "test" ? "Test" : "Exam";
      const notifRows = userIds.map(uid => ({
        user_id: uid,
        title: `📝 ${kindLabel} assigned: ${assignExam.title}`,
        message: `You have been assigned "${assignExam.title}". ${assignExam.start_date ? `Opens: ${new Date(assignExam.start_date).toLocaleDateString()}` : "You can take it now."}`,
        type: "exam_assigned", link: "/student/exams", is_read: false,
      }));
      const { error: bulkNotifErr } = await supabase.from("notifications" as any).insert(notifRows);
      if (bulkNotifErr) {
        for (const row of notifRows) { await supabase.from("notifications" as any).insert(row); }
      }

      toast({ title: t(`✅ Assigned to ${userIds.length} student${userIds.length !== 1 ? "s" : ""}`, "✅ تم التعيين") });
      setAssignExam(null);
      fetchExams();
    } catch (e: any) {
      toast({ title: t("Assignment failed", "فشل التعيين"), description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const duplicateExam = async (exam: any) => {
    try {
      const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", exam.id);
      const cleanExam: any = { ...exam };
      delete cleanExam.id; delete cleanExam.created_at; delete cleanExam.updated_at;
      delete cleanExam.exam_questions; delete cleanExam.subjects;
      const { data: ne, error: neErr } = await supabase.from("exams").insert({
        ...cleanExam,
        title: exam.title + " (Copy)",
        title_ar: exam.title_ar ? exam.title_ar + " (نسخة)" : null,
        is_published: false,
      }).select("id").single();
      if (neErr) throw neErr;
      if (ne && qs?.length) {
        const qRows = qs.map((q: any) => {
          const clean: any = { ...q }; delete clean.id; delete clean.created_at; delete clean.updated_at;
          return { ...clean, exam_id: ne.id };
        });
        const { error: qErr } = await supabase.from("exam_questions").insert(qRows);
        if (qErr) console.warn("Questions copy warning:", qErr.message);
      }
      toast({ title: t("✅ Exam duplicated with all questions!", "✅ تم نسخ الامتحان") });
      fetchExams();
    } catch (e: any) {
      toast({ title: t("Duplicate failed", "فشل النسخ"), description: e.message, variant: "destructive" });
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm(t("Delete this exam and all its questions?", "حذف هذا الامتحان وجميع أسئلته؟"))) return;
    await supabase.from("exam_assignments").delete().eq("exam_id", id);
    await supabase.from("exam_questions").delete().eq("exam_id", id);
    await supabase.from("exams").delete().eq("id", id);
    setExams(exams.filter(e => e.id !== id));
    toast({ title: t("Deleted", "تم الحذف") });
  };

  // Manage-students dialog: every assigned student for this exam, with
  // their attempt status and any per-student deadline extension.
  const openManage = async (exam: any) => {
    setManageExam(exam);
    setManageStudents([]);
    setExtendInputs({});
    setManageLoading(true);
    try {
      const asnRes = await supabase.from("exam_assignments" as any).select("user_id, extended_until").eq("exam_id", exam.id);
      if (asnRes.error) throw new Error(`Loading assigned students failed: ${asnRes.error.message}`);
      const assignments = asnRes.data || [];
      const userIds = assignments.map((a: any) => a.user_id);

      const [attRes, profRes] = await Promise.all([
        supabase.from("exam_attempts").select("id, user_id, status, score, percentage, passed, created_at")
          .eq("exam_id", exam.id).order("created_at", { ascending: false }),
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (attRes.error)  console.warn("Loading attempts failed:", attRes.error.message);
      if (profRes.error) console.warn("Loading student names failed:", profRes.error.message);

      const attempts = attRes.data || [];
      const profiles = (profRes as any).data || [];

      const rows = assignments.map((a: any) => {
        const myAttempts = attempts.filter((at: any) => at.user_id === a.user_id);
        const profile = profiles.find((p: any) => p.user_id === a.user_id);
        return {
          user_id: a.user_id,
          full_name: profile?.full_name || `Unknown (${String(a.user_id).slice(0, 8)})`,
          extended_until: a.extended_until,
          attempts: myAttempts,
        };
      });
      rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setManageStudents(rows);
      if ((profRes as any).error) {
        toast({ title: t("Some student names failed to load", "فشل تحميل بعض أسماء الطلاب"), description: (profRes as any).error.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: t("Failed to load students", "فشل تحميل الطلاب"), description: e.message, variant: "destructive" });
    } finally {
      setManageLoading(false);
    }
  };

  const saveExtend = async (userId: string) => {
    if (!manageExam) return;
    setSavingExtend(userId);
    try {
      const raw = extendInputs[userId];
      const value = raw ? new Date(raw).toISOString() : null;
      const { error } = await supabase.from("exam_assignments" as any)
        .update({ extended_until: value } as any)
        .eq("exam_id", manageExam.id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      setManageStudents(rows => rows.map(r => r.user_id === userId ? { ...r, extended_until: value } : r));
      toast({ title: value ? t("✅ Deadline extended for this student", "✅ تم تمديد الموعد لهذا الطالب") : t("✅ Extension cleared", "✅ تم إلغاء التمديد") });
    } catch (e: any) {
      toast({ title: t("Failed to save extension", "فشل حفظ التمديد"), description: e.message, variant: "destructive" });
    } finally {
      setSavingExtend(null);
    }
  };

  // Same effect as the reset icon in Grading: deletes the attempt (and its
  // answers, via cascade) so it no longer counts against max_attempts.
  const resetStudentAttempt = async (attemptId: string, studentName: string) => {
    if (!confirm(t(`Reset ${studentName}'s attempt? Their score and answers will be permanently deleted and they'll be able to retake it.`, `إعادة تعيين محاولة ${studentName}؟ سيتم حذف درجتهم وإجاباتهم نهائيًا وسيتمكنون من إعادة المحاولة.`))) return;
    setResettingAttempt(attemptId);
    try {
      const { error } = await supabase.from("exam_attempts").delete().eq("id", attemptId);
      if (error) throw new Error(error.message);
      setManageStudents(rows => rows.map(r => ({ ...r, attempts: r.attempts.filter((a: any) => a.id !== attemptId) })));
      toast({ title: t(`✅ Attempt reset — ${studentName} can retake the exam`, `✅ تمت إعادة التعيين — يمكن لـ ${studentName} إعادة المحاولة`) });
    } catch (e: any) {
      toast({ title: t("Reset failed", "فشلت إعادة التعيين"), description: e.message, variant: "destructive" });
    } finally {
      setResettingAttempt(null);
    }
  };

  const togglePublish = async (id: string, current: boolean) => {
    const exam = exams.find(e => e.id === id);
    const { newlyAssignedCount } = await publishExam(
      { id, title: exam?.title || "", type: exam?.type, level: exam?.level },
      !current,
      user?.id
    );
    setExams(exams.map(e => e.id === id ? { ...e, is_published: !current } : e));
    if (!current && newlyAssignedCount > 0) {
      toast({
        title: t("✅ Published", "✅ تم النشر"),
        description: t(
          `Assigned to ${newlyAssignedCount} student${newlyAssignedCount !== 1 ? "s" : ""} and notified them + admins.`,
          `تم التعيين لـ ${newlyAssignedCount} طالب وإشعارهم مع الإدارة.`
        ),
      });
    }
  };

  // Self-registration and the live monitor are admin-only controls now —
  // teachers no longer get the toggle/button for either (openAssign/doAssign
  // above remains their way to reach students; publishing now also
  // auto-assigns by level, see publishExam).

  const qCount = (e: any) => e.exam_questions?.length ?? 0;

  const filtered = exams.filter(e => {
    const name = e.title || "";
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (effectiveType !== "all" && (e.type || "exam") !== effectiveType) return false;
    if (termFilter !== "all" && (e.term || "first") !== termFilter) return false;
    if (statusFilter === "published" && !e.is_published) return false;
    if (statusFilter === "draft" && e.is_published) return false;
    if (levelFilter !== "all" && !splitLevels(e.level).includes(levelFilter)) return false;
    return true;
  });

  const filteredStudents = myStudents.filter(s =>
    s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.full_name_ar.includes(studentSearch)
  );

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{label}</h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Create, publish, and assign to your students", "إنشاء ونشر وتعيين لطلابك")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => navigate("/teacher/oral-exams")}
                className="flex items-center gap-1.5 rounded-xl border border-white/30 px-3 py-2.5 text-xs font-black text-white transition-all hover:-translate-y-0.5 sm:gap-2 sm:px-4 sm:text-sm"
              >
                {t("Oral Exams", "الامتحانات الشفوية")}
              </button>
              <button
                onClick={() => navigate("/teacher/exams/create")}
                className="flex items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 sm:gap-2 sm:px-6 sm:text-sm"
                style={{ background: GOLD, color: "#064E3B" }}
              >
                <Plus className="h-4 w-4" /> {t("Create", "إنشاء")} {singularLabel}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { v: exams.length, l: t("Total", "الإجمالي"), icon: "📋", bg: "#EFF6FF", c: "#1D4ED8" },
            { v: exams.filter(e => e.is_published).length, l: t("Published", "منشور"), icon: "🌐", bg: "#F0FDF4", c: "#166534" },
            { v: exams.filter(e => !e.is_published).length, l: t("Draft", "مسودة"), icon: "✏️", bg: "#FFF7ED", c: "#C2410C" },
            { v: exams.reduce((s, e) => s + (counts[e.id]?.attempts || 0), 0), l: t("Attempts", "المحاولات"), icon: "📊", bg: "#F5F3FF", c: "#6D28D9" },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg }} className="rounded-xl px-2 py-3 text-center sm:px-3">
              <div className="mb-1 text-lg">{s.icon}</div>
              <div style={{ color: s.c }} className="text-lg font-black sm:text-xl">{s.v}</div>
              <div style={{ color: s.c }} className="text-[10px] font-semibold opacity-70 sm:text-[11px]">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative min-w-[160px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Search exams…", "بحث عن امتحان…")}
              style={{ ...inp, width: "100%", paddingLeft: 30, boxSizing: "border-box" }} />
          </div>
          {!fixedType && (
            <div className="flex items-center gap-1.5 border-e border-slate-200 pe-3">
              {(["all", "exam", "test"] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTypeFilter(tf)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                    typeFilter === tf ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                  style={typeFilter === tf ? { background: "#064E3B" } : undefined}
                >
                  {tf === "all" ? t("All", "الكل") : tf === "exam" ? t("Exams", "الامتحانات") : t("Tests", "التمرينات")}
                </button>
              ))}
            </div>
          )}
          {["all", "first", "second", "third"].map(term => (
            <button
              key={term}
              onClick={() => setTermFilter(term)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                termFilter === term ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              style={termFilter === term ? { background: "#064E3B" } : undefined}
            >
              {term === "all" ? t("All Terms", "كل الفترات") : term === "first" ? t("First", "الأولى") : term === "second" ? t("Second", "الثانية") : t("Third", "الثالثة")}
            </button>
          ))}
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={{ ...inp }}>
            <option value="all">{t("All Levels", "كل المستويات")}</option>
            {academicLevels.map((l: any) => <option key={l.slug} value={l.slug}>{l.name_en}</option>)}
          </select>
          <div className="ms-auto flex items-center gap-1.5 border-s border-slate-200 ps-3">
            {["all", "published", "draft"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  statusFilter === s ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
                style={statusFilter === s ? { background: GOLD, color: "#064E3B" } : undefined}
              >
                {s === "all" ? t("All", "الكل") : s === "published" ? t("Published", "منشور") : t("Draft", "مسودة")}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-10 text-center text-slate-400">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{t(`No ${effectiveType === "all" ? "exams or tests" : effectiveType + "s"} found`, `لم يتم العثور على ${effectiveType === "all" ? "امتحانات أو تمرينات" : isTest ? "تمرينات" : "امتحانات"}`)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map(exam => {
              const qc = qCount(exam);
              const stat = counts[exam.id] || { assigned: 0, attempts: 0 };
              return (
                <div key={exam.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>{exam.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: exam.is_published ? "#DCFCE7" : "#F3F4F6", color: exam.is_published ? "#166534" : "#6B7280" }}>
                          {exam.is_published ? "✓ " + t("Published", "منشور") : t("Draft", "مسودة")}
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600 }}>{(exam.type || "exam") === "test" ? t("Test", "تمرين") : t("Exam", "امتحان")}</span>
                        {exam.session && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#ECFEFF", color: "#0E7490", fontWeight: 700 }}>📅 {exam.session}</span>}
                        {exam.term && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600, textTransform: "capitalize" }}>{exam.term}</span>}
                        {exam.level && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FFF7ED", color: "#C2410C", fontWeight: 600, textTransform: "capitalize" }}>📚 {splitLevels(exam.level).join(" + ")}</span>}
                      </div>
                      {exam.title_ar && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 6px", fontFamily: "'Amiri',serif", direction: "rtl" }}>{exam.title_ar}</p>}
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 6px" }}>{(exam as any).subjects?.title || ""}</p>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {[
                          { icon: "❓", v: qc, l: "q" + (qc !== 1 ? "s" : ""), c: qc === 0 ? "#DC2626" : "#374151" },
                          { icon: "⏱️", v: exam.time_limit_minutes || "—", l: "min" },
                          { icon: "🎯", v: (exam.passing_score || 60) + "%", l: "pass" },
                          { icon: "👥", v: stat.assigned, l: "registered" },
                          { icon: "📊", v: stat.attempts, l: "attempts" },
                        ].map((s, i) => (
                          <span key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                            {s.icon} <strong style={{ color: (s as any).c || "#374151" }}>{s.v}</strong> <span style={{ color: "#9CA3AF" }}>{s.l}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                      <button onClick={() => openAssign(exam)} title={t("Assign to students", "تعيين للطلاب")}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <Send size={12} /> {t("Assign", "تعيين")}
                      </button>
                      <button onClick={() => navigate("/teacher/exams/" + exam.id + "/edit")} title={t("Edit exam", "تعديل")}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 11px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                        <Edit size={13} color="#6B7280" /> {t("Edit", "تعديل")}
                      </button>
                      <button onClick={() => togglePublish(exam.id, exam.is_published)} title={exam.is_published ? t("Unpublish", "إلغاء النشر") : t("Publish", "نشر")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: exam.is_published ? "#FFF7ED" : "#F0FDF4", cursor: "pointer" }}>
                        {exam.is_published ? <EyeOff size={13} color="#C2410C" /> : <Eye size={13} color="#16A34A" />}
                      </button>
                      <button onClick={() => duplicateExam(exam)} title={t("Duplicate", "نسخ")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        <Copy size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => navigate("/teacher/grading")} title={t("View grading", "عرض التصحيح")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#EFF6FF", cursor: "pointer" }}>
                        <BarChart2 size={13} color="#1D4ED8" />
                      </button>
                      <button onClick={() => openManage(exam)} title={t("Extend deadline / manage students — extend a missed deadline or reset an attempt", "تمديد الموعد / إدارة الطلاب — تمديد موعد فائت أو إعادة تعيين محاولة")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#F5F3FF", cursor: "pointer" }}>
                        <CalendarClock size={13} color="#6D28D9" />
                      </button>
                      <button onClick={() => deleteExam(exam.id)} title={t("Delete exam", "حذف")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer" }}>
                        <Trash2 size={13} color="#DC2626" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Assign Dialog ── */}
      <Dialog open={!!assignExam} onOpenChange={v => !v && setAssignExam(null)}>
        <DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0", flexShrink: 0 }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>
              📋 {t("Assign", "تعيين")}: {assignExam?.title}
            </h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: "4px 0 0" }}>
              {t("Students will receive an in-app notification and see this exam immediately.", "سيتلقى الطلاب إشعارًا وسيرون الامتحان فورًا.")}
            </p>
          </div>

          <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
            <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>
              {t("Only students in your own subjects/levels are shown here.", "يظهر هنا فقط طلابك في موادك ومستوياتك.")}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { id: "level" as const, icon: "🎓", label: t("By Level", "حسب المستوى"), sub: t("Assign to all your students at a level", "تعيين لجميع طلابك في مستوى") },
                { id: "individual" as const, icon: "👤", label: t("Individual", "فردي"), sub: t("Select specific students", "اختيار طلاب محددين") },
              ].map(m => (
                <button key={m.id} onClick={() => setAssignMode(m.id)}
                  style={{ padding: "12px", borderRadius: 12, border: "1.5px solid " + (assignMode === m.id ? G : "#E5E7EB"), background: assignMode === m.id ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <p style={{ fontSize: 18, margin: "0 0 4px" }}>{m.icon}</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: assignMode === m.id ? G : "#374151", margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{m.sub}</p>
                </button>
              ))}
            </div>

            {assignMode === "level" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 8 }}>{t("Select Level", "اختر المستوى")}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Array.from(new Set(myStudents.map(s => s.level))).map(lv => {
                    const count = myStudents.filter(s => s.level === lv).length;
                    return (
                      <button key={lv} onClick={() => setAssignLevel(lv)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: "1.5px solid " + (assignLevel === lv ? G : "#E5E7EB"), background: assignLevel === lv ? "#F0FDF4" : "#fff", cursor: "pointer" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: assignLevel === lv ? G : "#374151", textTransform: "capitalize" }}>{lv}</span>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{studentsLoading ? "…" : count + " student" + (count !== 1 ? "s" : "")}</span>
                      </button>
                    );
                  })}
                  {!studentsLoading && myStudents.length === 0 && (
                    <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 12 }}>{t("No students found for your subjects yet.", "لا يوجد طلاب في موادك بعد.")}</p>
                  )}
                </div>
              </div>
            )}

            {assignMode === "individual" && (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                  <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder={t("Search students…", "بحث عن طالب…")}
                    style={{ ...inp, width: "100%", paddingLeft: 32, boxSizing: "border-box" as const }} />
                </div>
                {studentsLoading ? (
                  <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{selectedStudents.size} {t("selected of", "من أصل")} {filteredStudents.length}</div>
                    <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredStudents.map(s => {
                        const sel = selectedStudents.has(s.user_id);
                        return (
                          <button key={s.user_id}
                            onClick={() => {
                              const next = new Set(selectedStudents);
                              if (sel) next.delete(s.user_id); else next.add(s.user_id);
                              setSelectedStudents(next);
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, border: "1.5px solid " + (sel ? G : "#E5E7EB"), background: sel ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: sel ? G : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: sel ? "#fff" : "#1D4ED8" }}>{s.full_name[0]}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700, fontSize: 13, color: sel ? G : "#374151", margin: 0 }}>{s.full_name}</p>
                              {s.full_name_ar && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, fontFamily: "'Amiri',serif", direction: "rtl" }}>{s.full_name_ar}</p>}
                            </div>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600, flexShrink: 0 }}>{s.level}</span>
                            {sel && <CheckCircle2 size={16} color={G} />}
                          </button>
                        );
                      })}
                      {filteredStudents.length === 0 && (
                        <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 12 }}>{t("No students found.", "لا يوجد طلاب.")}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: "14px 16px", borderTop: "1px solid #E5E7EB", flexShrink: 0, display: "flex", gap: 10 }}>
            <button onClick={() => setAssignExam(null)}
              style={{ flex: 1, padding: 12, borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              {t("Cancel", "إلغاء")}
            </button>
            <button onClick={doAssign}
              disabled={assigning || (assignMode === "level" && !assignLevel) || (assignMode === "individual" && selectedStudents.size === 0)}
              style={{ flex: 2, padding: 12, borderRadius: 11, border: "none", cursor: assigning ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 13, color: "#fff",
                background: assigning ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {assigning
                ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> {t("Assigning…", "جارٍ التعيين…")}</>
                : <><Send size={14} /> {t("Assign & Notify Students", "تعيين وإشعار الطلاب")}</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manage Students Dialog (extend deadline / reset attempt) ── */}
      <Dialog open={!!manageExam} onOpenChange={v => !v && setManageExam(null)}>
        <DialogContent style={{ maxWidth: 560, borderRadius: 20, padding: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#6D28D9", padding: "16px 20px", borderRadius: "20px 20px 0 0", flexShrink: 0 }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>
              🗓️ {t("Students", "الطلاب")}: {manageExam?.title}
            </h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: "4px 0 0" }}>
              {t("Extend a missed deadline for one student, or reset an attempt so they can retake.", "تمديد موعد فائت لطالب واحد، أو إعادة تعيين محاولة ليتمكن من إعادة المحاولة.")}
            </p>
          </div>

          <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
            {manageLoading ? (
              <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            ) : manageStudents.length === 0 ? (
              <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 24 }}>{t("No students assigned to this exam yet.", "لا يوجد طلاب معينون لهذا الامتحان بعد.")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {manageStudents.map(s => {
                  const latest = s.attempts[0];
                  const max = manageExam?.max_attempts || 1;
                  const done = s.attempts.filter((a: any) => a.status !== "in_progress").length;
                  let statusLabel = t("Not started", "لم يبدأ");
                  let statusColor = "#6B7280";
                  if (latest) {
                    if (latest.status === "in_progress")      { statusLabel = t("In progress", "جارٍ"); statusColor = "#D97706"; }
                    else if (latest.status === "submitted")   { statusLabel = t("Pending grading", "بانتظار التصحيح"); statusColor = "#1D4ED8"; }
                    else if (latest.status === "graded")      { statusLabel = `${t("Graded", "تم التصحيح")} — ${Math.round(latest.percentage || 0)}%`; statusColor = latest.passed ? "#16A34A" : "#DC2626"; }
                    else if (latest.status === "released")    { statusLabel = `${t("Released", "تم الإرسال")} — ${Math.round(latest.percentage || 0)}%`; statusColor = latest.passed ? "#16A34A" : "#DC2626"; }
                  }
                  const missedDeadline = done === 0 && manageExam?.end_date && new Date(manageExam.end_date).getTime() < Date.now() && !s.extended_until;
                  return (
                    <div key={s.user_id} style={{ padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>{s.full_name}</p>
                          <p style={{ fontSize: 11, margin: "2px 0 0" }}>
                            <span style={{ color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
                            <span style={{ color: "#9CA3AF" }}> · {done}/{max} {t("attempts", "محاولات")}</span>
                            {missedDeadline && <span style={{ color: "#DC2626", fontWeight: 700 }}> · {t("missed deadline", "فات الموعد")}</span>}
                          </p>
                        </div>
                        {latest && latest.status !== "in_progress" && (
                          <button onClick={() => resetStudentAttempt(latest.id, s.full_name)} disabled={resettingAttempt === latest.id}
                            title={t("Reset this attempt so they can retake", "إعادة تعيين هذه المحاولة ليتمكن من إعادة المحاولة")}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: resettingAttempt === latest.id ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: "#DC2626", opacity: resettingAttempt === latest.id ? .6 : 1 }}>
                            {resettingAttempt === latest.id ? <Loader2 size={11} style={{ animation: "spin .8s linear infinite" }} /> : <RotateCcw size={11} />} {t("Reset", "إعادة تعيين")}
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="datetime-local"
                          value={extendInputs[s.user_id] ?? (s.extended_until ? toLocalDatetimeInput(s.extended_until) : "")}
                          onChange={e => setExtendInputs(inpVal => ({ ...inpVal, [s.user_id]: e.target.value }))}
                          style={{ ...inp, flex: 1, fontSize: 12, padding: "6px 8px" }} />
                        <button onClick={() => saveExtend(s.user_id)} disabled={savingExtend === s.user_id}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none", background: G, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: savingExtend === s.user_id ? .6 : 1 }}>
                          {savingExtend === s.user_id
                            ? <Loader2 size={11} style={{ animation: "spin .8s linear infinite" }} />
                            : <CalendarClock size={11} />}
                          {savingExtend === s.user_id ? "…" : s.extended_until ? t("Update", "تحديث") : t("Extend", "تمديد")}
                        </button>
                      </div>
                      {s.extended_until && (
                        <p style={{ fontSize: 10, color: "#16A34A", margin: "6px 0 0" }}>
                          ✓ {t("Extended until", "تم التمديد حتى")} {new Date(s.extended_until).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} — {t("clear the field and press Update to remove.", "امسح الحقل واضغط تحديث للإزالة.")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: "14px 16px", borderTop: "1px solid #E5E7EB", flexShrink: 0 }}>
            <button onClick={() => setManageExam(null)}
              style={{ width: "100%", padding: 12, borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              {t("Close", "إغلاق")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherExamsPage;
