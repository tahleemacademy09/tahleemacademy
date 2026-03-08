import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, User, ClipboardList, Mail, Calendar, Eye, CheckCircle, XCircle,
  UserCheck, Edit, BarChart, RotateCcw, Settings, Ban, Download, Bell,
  Users, ArrowUpDown, Trash2, ShieldCheck, GraduationCap
} from "lucide-react";

const StudentManagement = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser, hasRole } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Detail view
  const [detailStudent, setDetailStudent] = useState<any>(null);
  const [studentAttempts, setStudentAttempts] = useState<any[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<any[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<any[]>([]);

  // Dialogs
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkExamId, setBulkExamId] = useState("");
  const [bulkLevel, setBulkLevel] = useState("");
  const [bulkNotifMsg, setBulkNotifMsg] = useState("");
  const [bulkSubjectId, setBulkSubjectId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editProfileStudent, setEditProfileStudent] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deactivateStudent, setDeactivateStudent] = useState<any>(null);

  const isAdmin = hasRole("admin");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, examsRes, subjectsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("exams").select("id, title, title_ar, is_published, type"),
      supabase.from("subjects").select("id, title, title_ar"),
    ]);
    const rolesMap = new Map<string, string[]>();
    (rolesRes.data || []).forEach((r: any) => {
      if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
      rolesMap.get(r.user_id)!.push(r.role);
    });
    const merged = (profilesRes.data || []).map((p: any) => ({
      ...p,
      roles: rolesMap.get(p.user_id) || [],
      isStudent: (rolesMap.get(p.user_id) || []).includes("student"),
    }));
    setStudents(merged);
    setExams(examsRes.data || []);
    setSubjects(subjectsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => students.filter((s) => {
    if (!s.isStudent) return false;
    const matchesSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) || s.student_id?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || s.student_type === typeFilter;
    const matchesLevel = levelFilter === "all" || s.level === levelFilter;
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    const visibleToTeacher = isAdmin || s.student_type !== "private" || s.assigned_teacher_id === currentUser?.id;
    return matchesSearch && matchesType && matchesLevel && matchesStatus && visibleToTeacher;
  }), [students, search, typeFilter, levelFilter, statusFilter, isAdmin, currentUser]);

  const toggleSelect = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(s => s.user_id)));
  };

  // Quick actions
  const changeLevel = async (userId: string, newLevel: string) => {
    await supabase.from("profiles").update({ level: newLevel }).eq("user_id", userId);
    toast({ title: t("Level updated", "تم تحديث المستوى") });
    fetchData();
  };

  const toggleStatus = async (student: any) => {
    const newStatus = student.status === "active" ? "inactive" : "active";
    await supabase.from("profiles").update({ status: newStatus }).eq("user_id", student.user_id);
    toast({ title: t(`Student ${newStatus === "active" ? "activated" : "deactivated"}`, `تم ${newStatus === "active" ? "تفعيل" : "تعطيل"} الطالب`) });
    setDeactivateStudent(null);
    fetchData();
  };

  const resetExamAttempt = async (attemptId: string) => {
    await supabase.from("exam_answers").delete().eq("attempt_id", attemptId);
    await supabase.from("exam_attempts").delete().eq("id", attemptId);
    toast({ title: t("Exam attempt reset", "تمت إعادة تعيين المحاولة") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  const overrideScore = async (attemptId: string, newScore: number, totalPoints: number) => {
    const percentage = totalPoints > 0 ? (newScore / totalPoints) * 100 : 0;
    await supabase.from("exam_attempts").update({
      score: newScore, percentage, status: "graded", passed: percentage >= 50,
    }).eq("id", attemptId);
    toast({ title: t("Score overridden", "تم تعديل الدرجة") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  // Bulk actions
  const executeBulkEnrol = async () => {
    if (!bulkSubjectId || selectedIds.size === 0) return;
    // Find courses for that subject
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", bulkSubjectId);
    if (!courses?.length) { toast({ title: t("No courses found for this subject", "لا توجد دورات لهذه المادة"), variant: "destructive" }); return; }
    const inserts = Array.from(selectedIds).map(uid => ({ user_id: uid, course_id: courses[0].id }));
    const { error } = await supabase.from("enrollments").insert(inserts);
    if (error) toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    else toast({ title: t(`Enrolled ${selectedIds.size} students`, `تم تسجيل ${selectedIds.size} طالب`) });
    setBulkAction(null);
  };

  const executeBulkLevel = async () => {
    if (!bulkLevel || selectedIds.size === 0) return;
    for (const uid of selectedIds) {
      await supabase.from("profiles").update({ level: bulkLevel }).eq("user_id", uid);
    }
    toast({ title: t(`Level changed for ${selectedIds.size} students`, `تم تغيير المستوى لـ ${selectedIds.size} طالب`) });
    setBulkAction(null); fetchData();
  };

  const executeBulkNotify = async () => {
    if (!bulkNotifMsg || selectedIds.size === 0) return;
    const inserts = Array.from(selectedIds).map(uid => ({
      user_id: uid, title: t("Admin Notification", "إشعار من الإدارة"),
      message: bulkNotifMsg, type: "admin",
    }));
    const { error } = await supabase.from("notifications").insert(inserts);
    if (error) toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    else toast({ title: t(`Notification sent to ${selectedIds.size} students`, `تم إرسال الإشعار لـ ${selectedIds.size} طالب`) });
    setBulkAction(null); setBulkNotifMsg("");
  };

  const exportCSV = () => {
    const rows = (selectedIds.size > 0 ? filtered.filter(s => selectedIds.has(s.user_id)) : filtered);
    const headers = ["Name", "Email", "Level", "Type", "Status", "Student ID", "Enrolled"];
    const csv = [headers.join(","), ...rows.map(s =>
      [s.full_name, s.email, s.level, s.student_type, s.status, s.student_id, s.created_at?.split("T")[0]].join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students.csv"; a.click();
    toast({ title: t("CSV exported", "تم تصدير CSV") });
  };

  // Student detail view
  const viewStudentDetails = async (student: any) => {
    setDetailStudent(student);
    const [attemptsRes, assignmentsRes, enrollmentsRes] = await Promise.all([
      supabase.from("exam_attempts").select("*, exams(title, title_ar, type, passing_score)")
        .eq("user_id", student.user_id).order("created_at", { ascending: false }),
      supabase.from("exam_assignments").select("*, exams(title, title_ar)")
        .eq("user_id", student.user_id).order("assigned_at", { ascending: false }),
      supabase.from("enrollments").select("*, courses(title, title_ar, subject_id, subjects(title, title_ar))")
        .eq("user_id", student.user_id),
    ]);
    setStudentAttempts(attemptsRes.data || []);
    setStudentAssignments(assignmentsRes.data || []);
    setStudentEnrollments(enrollmentsRes.data || []);
  };

  const assignExam = async () => {
    if (!selectedStudent || !selectedExamId) return;
    const { data: existing } = await supabase.from("exam_assignments").select("id")
      .eq("user_id", selectedStudent.user_id).eq("exam_id", selectedExamId).maybeSingle();
    if (existing) { toast({ title: t("Already assigned", "تم التعيين مسبقًا"), variant: "destructive" }); return; }
    const { error } = await supabase.from("exam_assignments").insert({ user_id: selectedStudent.user_id, exam_id: selectedExamId });
    if (error) toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    else toast({ title: t("Exam assigned!", "تم تعيين الامتحان!") });
    setAssignDialogOpen(false); setSelectedExamId("");
  };

  const removeAssignment = async (id: string) => {
    await supabase.from("exam_assignments").delete().eq("id", id);
    toast({ title: t("Assignment removed", "تم إزالة التعيين") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  const removeEnrollment = async (id: string) => {
    await supabase.from("enrollments").delete().eq("id", id);
    toast({ title: t("Enrollment removed", "تم إلغاء التسجيل") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  const saveEditProfile = async () => {
    if (!editProfileStudent) return;
    const { error } = await supabase.from("profiles").update(editForm).eq("user_id", editProfileStudent.user_id);
    if (error) toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    else { toast({ title: t("Profile updated", "تم تحديث الملف") }); setEditProfileStudent(null); fetchData(); }
  };

  const openEditProfile = (student: any) => {
    setEditProfileStudent(student);
    setEditForm({
      full_name: student.full_name || "", full_name_ar: student.full_name_ar || "",
      level: student.level || "beginner", status: student.status || "active",
      student_type: student.student_type || "group", phone: student.phone || "",
      whatsapp: student.whatsapp || "", country: student.country || "",
      city: student.city || "", allow_entrance_retake: student.allow_entrance_retake || false,
      assigned_teacher_id: student.assigned_teacher_id || "",
      private_notes: student.private_notes || "",
    });
  };

  // Level & type badge helpers
  const levelBadge = (level: string) => {
    const map: any = { beginner: { label: t("Beginner", "مبتدئ"), class: "bg-blue-100 text-blue-700 border-blue-200" },
      intermediate: { label: t("Intermediate", "متوسط"), class: "bg-amber-100 text-amber-700 border-amber-200" },
      advanced: { label: t("Advanced", "متقدم"), class: "bg-emerald-100 text-emerald-700 border-emerald-200" } };
    const b = map[level] || map.beginner;
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${b.class}`}>{b.label}</span>;
  };

  const statusBadge = (status: string) => (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
      {status === "active" ? t("Active", "نشط") : t("Inactive", "غير نشط")}
    </span>
  );

  const typeBadge = (type: string) => (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${type === "private" ? "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}>
      {type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
    </span>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  // Enrol student in subject manually
  const manualEnrol = async (userId: string, subjectId: string) => {
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId);
    if (!courses?.length) { toast({ title: t("No courses found for this subject", "لا توجد دورات لهذه المادة"), variant: "destructive" }); return; }
    const { error } = await supabase.from("enrollments").insert({ user_id: userId, course_id: courses[0].id });
    if (error) { toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("Student enrolled", "تم تسجيل الطالب") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  // Export exam results CSV
  const exportExamResultsCSV = () => {
    if (!detailStudent || studentAttempts.length === 0) return;
    const headers = ["Exam", "Type", "Status", "Score", "Total", "Percentage", "Passed", "Date"];
    const csv = [headers.join(","), ...studentAttempts.map(a =>
      [a.exams?.title, a.exams?.type || "exam", a.status, a.score, a.total_points, Math.round(a.percentage || 0), a.passed ? "Yes" : "No", a.submitted_at?.split("T")[0] || ""].join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `results-${detailStudent.full_name || "student"}.csv`; a.click();
    toast({ title: t("Results exported", "تم تصدير النتائج") });
  };

  // View exam answers side by side
  const [viewingAnswers, setViewingAnswers] = useState<any>(null);
  const [examAnswers, setExamAnswers] = useState<any[]>([]);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);

  const viewAnswersSideBySide = async (attempt: any) => {
    const [answersRes, questionsRes] = await Promise.all([
      supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id),
      supabase.from("exam_questions").select("*").eq("exam_id", attempt.exam_id).order("sort_order"),
    ]);
    setExamAnswers(answersRes.data || []);
    setExamQuestions(questionsRes.data || []);
    setViewingAnswers(attempt);
  };

  // Enrol dialog for detail view
  const [enrolSubjectId, setEnrolSubjectId] = useState("");

  // ─── EXAM ANSWERS SIDE BY SIDE VIEW ───
  if (viewingAnswers) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{t("Answers Review", "مراجعة الإجابات")} — {language === "ar" ? viewingAnswers.exams?.title_ar || viewingAnswers.exams?.title : viewingAnswers.exams?.title}</h1>
          <Button variant="outline" size="sm" onClick={() => setViewingAnswers(null)}>{t("Back", "رجوع")}</Button>
        </div>
        <div className="space-y-4">
          {examQuestions.map((q, i) => {
            const answer = examAnswers.find(a => a.question_id === q.id);
            return (
              <Card key={q.id} className={answer?.is_correct === true ? "border-emerald-300" : answer?.is_correct === false ? "border-destructive/50" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">Q{i + 1}: <span dangerouslySetInnerHTML={{ __html: q.question_text }} /></p>
                    {answer?.is_correct !== null && (
                      answer?.is_correct ? <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" /> : <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("Student Answer", "إجابة الطالب")}</p>
                      <p>{answer?.answer_text || <span className="text-muted-foreground italic">{t("No answer", "بدون إجابة")}</span>}</p>
                    </div>
                    <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/20">
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">{t("Correct Answer", "الإجابة الصحيحة")}</p>
                      <p>{q.correct_answer || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{t("Points", "الدرجات")}: {answer?.points_awarded ?? "—"}/{q.points}</span>
                    {q.explanation && <span>{t("Explanation", "الشرح")}: {q.explanation}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── STUDENT DETAIL VIEW ───
  if (detailStudent) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
              {(detailStudent.full_name || "?")[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {detailStudent.full_name || t("Student", "طالب")}
                {levelBadge(detailStudent.level)} {typeBadge(detailStudent.student_type)} {statusBadge(detailStudent.status)}
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{detailStudent.email || "—"}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{detailStudent.student_id || "—"}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t("Joined", "انضم")}: {new Date(detailStudent.created_at).toLocaleDateString()}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="default" size="sm" onClick={() => navigate(`/admin/students/${detailStudent.user_id}/view`)}>
              <Eye className="h-3 w-3 me-1" />{t("View as Student", "عرض كطالب")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => openEditProfile(detailStudent)}><Edit className="h-3 w-3 me-1" />{t("Edit", "تعديل")}</Button>
            <Button variant="outline" size="sm" onClick={exportExamResultsCSV}><Download className="h-3 w-3 me-1" />{t("Export Results", "تصدير النتائج")}</Button>
            <Button variant="outline" size="sm" onClick={() => setDetailStudent(null)}>{t("Back", "رجوع")}</Button>
          </div>
        </div>

        <Tabs defaultValue="attempts">
          <TabsList className="flex-wrap">
            <TabsTrigger value="attempts">{t("Exam Attempts", "محاولات الامتحان")} ({studentAttempts.filter(a => (a.exams?.type || "exam") === "exam").length})</TabsTrigger>
            <TabsTrigger value="tests">{t("Test Attempts", "محاولات التمرينات")} ({studentAttempts.filter(a => a.exams?.type === "test").length})</TabsTrigger>
            <TabsTrigger value="enrollments">{t("Enrollments", "التسجيلات")} ({studentEnrollments.length})</TabsTrigger>
            <TabsTrigger value="assignments">{t("Assigned", "المعينة")} ({studentAssignments.length})</TabsTrigger>
          </TabsList>

          {/* Exam Attempts */}
          {["attempts", "tests"].map(tab => {
            const typeKey = tab === "tests" ? "test" : "exam";
            const items = studentAttempts.filter(a => (a.exams?.type || "exam") === typeKey);
            return (
              <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
                {items.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{t("No attempts yet", "لا توجد محاولات بعد")}</p>
                ) : items.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                      <div>
                        <div className="font-medium">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.status === "graded" && (
                          <div className="flex items-center gap-1">
                            {a.passed ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                            <span className="font-semibold">{a.score}/{a.total_points} ({Math.round(a.percentage || 0)}%)</span>
                          </div>
                        )}
                        <Badge variant={a.status === "graded" ? (a.passed ? "default" : "destructive") : a.status === "submitted" ? "secondary" : "outline"}>
                          {a.status === "in_progress" ? t("In Progress", "قيد التنفيذ") : a.status === "submitted" ? t("Needs Grading", "يحتاج تصحيح") : a.status === "graded" ? (a.passed ? t("Passed", "ناجح") : t("Failed", "راسب")) : a.status}
                        </Badge>
                        {/* Override score */}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-xs"><Edit className="h-3 w-3 me-1" />{t("Override", "تعديل")}</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>{t("Override Score", "تعديل الدرجة")}</DialogTitle></DialogHeader>
                            <OverrideScoreForm attempt={a} onSave={overrideScore} t={t} />
                          </DialogContent>
                        </Dialog>
                        {/* Reset attempt */}
                        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => resetExamAttempt(a.id)}>
                          <RotateCcw className="h-3 w-3 me-1" />{t("Reset", "إعادة")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            );
          })}

          {/* Enrollments */}
          <TabsContent value="enrollments" className="mt-4 space-y-3">
            {studentEnrollments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("No enrollments", "لا توجد تسجيلات")}</p>
            ) : studentEnrollments.map(e => (
              <Card key={e.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{language === "ar" ? (e.courses as any)?.title_ar || (e.courses as any)?.title : (e.courses as any)?.title}</div>
                    <div className="text-xs text-muted-foreground">{t("Enrolled", "مسجل")}: {new Date(e.enrolled_at).toLocaleDateString()}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => removeEnrollment(e.id)}>
                    <Trash2 className="h-3 w-3 me-1" />{t("Remove", "إزالة")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Assigned Exams */}
          <TabsContent value="assignments" className="mt-4 space-y-3">
            {studentAssignments.map(a => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(a.assigned_at).toLocaleDateString()}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => removeAssignment(a.id)}>{t("Remove", "إزالة")}</Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ─── MAIN LIST VIEW ───
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Student Management", "إدارة الطلاب")}</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} {t("students", "طالب")} {selectedIds.size > 0 && `• ${selectedIds.size} ${t("selected", "محدد")}`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-3 w-3 me-1" />{t("Export CSV", "تصدير CSV")}</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {/* Status */}
        {[{ val: "all", label: t("All", "الكل") }, { val: "active", label: t("Active", "نشط") }, { val: "inactive", label: t("Inactive", "غير نشط") }].map(f => (
          <Button key={f.val} size="sm" variant={statusFilter === f.val ? "default" : "outline"} onClick={() => setStatusFilter(f.val)}>{f.label}</Button>
        ))}
        <div className="w-px h-6 bg-border self-center mx-1" />
        {/* Level */}
        {[{ val: "all", label: t("All Levels", "كل المستويات") }, { val: "beginner", label: t("Beginner", "مبتدئ") }, { val: "intermediate", label: t("Intermediate", "متوسط") }, { val: "advanced", label: t("Advanced", "متقدم") }].map(f => (
          <Button key={f.val} size="sm" variant={levelFilter === f.val ? "default" : "outline"} onClick={() => setLevelFilter(f.val)}>{f.label}</Button>
        ))}
        <div className="w-px h-6 bg-border self-center mx-1" />
        {/* Type */}
        {[{ val: "all", label: t("All Types", "كل الأنواع") }, { val: "group", label: t("Group", "مجموعة") }, { val: "private", label: t("Private", "خاص") }].map(f => (
          <Button key={f.val} size="sm" variant={typeFilter === f.val ? "default" : "outline"} onClick={() => setTypeFilter(f.val)}>{f.label}</Button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-10" placeholder={t("Search by name, email or student ID...", "البحث بالاسم أو البريد أو رقم الطالب...")} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">{selectedIds.size} {t("selected", "محدد")}:</span>
          <Button size="sm" variant="outline" onClick={() => setBulkAction("enrol")}><Users className="h-3 w-3 me-1" />{t("Bulk Enrol", "تسجيل جماعي")}</Button>
          <Button size="sm" variant="outline" onClick={() => setBulkAction("level")}><ArrowUpDown className="h-3 w-3 me-1" />{t("Change Level", "تغيير المستوى")}</Button>
          <Button size="sm" variant="outline" onClick={() => setBulkAction("notify")}><Bell className="h-3 w-3 me-1" />{t("Send Notification", "إرسال إشعار")}</Button>
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3 w-3 me-1" />{t("Export Selected", "تصدير المحدد")}</Button>
        </div>
      )}

      {/* Student List */}
      <div className="space-y-2">
        {/* Select all header */}
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
          <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="flex-1">{t("Name", "الاسم")}</span>
          <span className="w-20 text-center">{t("Level", "المستوى")}</span>
          <span className="w-16 text-center">{t("Type", "النوع")}</span>
          <span className="w-16 text-center">{t("Status", "الحالة")}</span>
          <span className="w-32 text-center">{t("Actions", "إجراءات")}</span>
        </div>

        {filtered.map(student => (
          <Card key={student.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="flex items-center gap-3 p-3 flex-wrap">
              <Checkbox checked={selectedIds.has(student.user_id)} onCheckedChange={() => toggleSelect(student.user_id)} />
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                  {(student.full_name || "?")[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{student.full_name || t("Unnamed", "بدون اسم")}</p>
                  <p className="text-xs text-muted-foreground truncate">{student.email} {student.student_id && `• ${student.student_id}`}</p>
                </div>
              </div>
              <div className="w-20 text-center">{levelBadge(student.level)}</div>
              <div className="w-16 text-center">{typeBadge(student.student_type)}</div>
              <div className="w-16 text-center">{statusBadge(student.status)}</div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button variant="ghost" size="icon" className="h-7 w-7" title={t("View Dashboard", "عرض لوحة التحكم")} onClick={() => viewStudentDetails(student)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={t("Edit Profile", "تعديل الملف")} onClick={() => openEditProfile(student)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={t("View Results", "عرض النتائج")} onClick={() => viewStudentDetails(student)}>
                  <BarChart className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={t("Assign Exam", "تعيين امتحان")} onClick={() => { setSelectedStudent(student); setAssignDialogOpen(true); }}>
                  <ClipboardList className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={t("Deactivate", "تعطيل")} onClick={() => setDeactivateStudent(student)}>
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">{t("No students found", "لم يتم العثور على طلاب")}</p>}
      </div>

      {/* ─── DIALOGS ─── */}

      {/* Assign Exam Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Assign Exam to", "تعيين امتحان لـ")} {selectedStudent?.full_name}</DialogTitle></DialogHeader>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger><SelectValue placeholder={t("Select an exam", "اختر امتحان")} /></SelectTrigger>
            <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.title} ({e.type || "exam"})</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={assignExam} className="w-full">{t("Assign", "تعيين")}</Button>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editProfileStudent} onOpenChange={o => !o && setEditProfileStudent(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("Edit Student Profile", "تعديل ملف الطالب")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">{t("Full Name", "الاسم الكامل")}</label>
                <Input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
              <div><label className="text-xs font-medium">{t("Arabic Name", "الاسم بالعربية")}</label>
                <Input value={editForm.full_name_ar} onChange={e => setEditForm({ ...editForm, full_name_ar: e.target.value })} dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">{t("Level", "المستوى")}</label>
                <Select value={editForm.level} onValueChange={v => setEditForm({ ...editForm, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
                    <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
                    <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><label className="text-xs font-medium">{t("Student Type", "نوع الطالب")}</label>
                <Select value={editForm.student_type} onValueChange={v => setEditForm({ ...editForm, student_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">{t("Group", "مجموعة")}</SelectItem>
                    <SelectItem value="private">{t("Private", "خاص")}</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">{t("Status", "الحالة")}</label>
                <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("Active", "نشط")}</SelectItem>
                    <SelectItem value="inactive">{t("Inactive", "غير نشط")}</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><label className="text-xs font-medium">{t("Phone", "الهاتف")}</label>
                <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            </div>
            <div><label className="text-xs font-medium">{t("Private Notes (admin only)", "ملاحظات خاصة")}</label>
              <Textarea value={editForm.private_notes} onChange={e => setEditForm({ ...editForm, private_notes: e.target.value })} rows={3} /></div>
            <div className="flex items-center gap-2">
              <Checkbox checked={editForm.allow_entrance_retake} onCheckedChange={c => setEditForm({ ...editForm, allow_entrance_retake: !!c })} />
              <span className="text-sm">{t("Allow entrance exam retake", "السماح بإعادة امتحان القبول")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfileStudent(null)}>{t("Cancel", "إلغاء")}</Button>
            <Button onClick={saveEditProfile}>{t("Save", "حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={!!deactivateStudent} onOpenChange={o => !o && setDeactivateStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Confirm", "تأكيد")}</DialogTitle></DialogHeader>
          <p className="text-sm">{deactivateStudent?.status === "active"
            ? t(`Deactivate ${deactivateStudent?.full_name}?`, `تعطيل ${deactivateStudent?.full_name}؟`)
            : t(`Activate ${deactivateStudent?.full_name}?`, `تفعيل ${deactivateStudent?.full_name}؟`)
          }</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateStudent(null)}>{t("Cancel", "إلغاء")}</Button>
            <Button variant={deactivateStudent?.status === "active" ? "destructive" : "default"} onClick={() => toggleStatus(deactivateStudent)}>
              {deactivateStudent?.status === "active" ? t("Deactivate", "تعطيل") : t("Activate", "تفعيل")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Enrol Dialog */}
      <Dialog open={bulkAction === "enrol"} onOpenChange={o => !o && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Bulk Enrol in Subject", "تسجيل جماعي في مادة")}</DialogTitle></DialogHeader>
          <Select value={bulkSubjectId} onValueChange={setBulkSubjectId}>
            <SelectTrigger><SelectValue placeholder={t("Select subject", "اختر المادة")} /></SelectTrigger>
            <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={executeBulkEnrol} disabled={!bulkSubjectId}>{t("Enrol", "تسجيل")} {selectedIds.size} {t("students", "طالب")}</Button>
        </DialogContent>
      </Dialog>

      {/* Bulk Change Level Dialog */}
      <Dialog open={bulkAction === "level"} onOpenChange={o => !o && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Change Level", "تغيير المستوى")}</DialogTitle></DialogHeader>
          <Select value={bulkLevel} onValueChange={setBulkLevel}>
            <SelectTrigger><SelectValue placeholder={t("Select level", "اختر المستوى")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
              <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
              <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={executeBulkLevel} disabled={!bulkLevel}>{t("Change", "تغيير")}</Button>
        </DialogContent>
      </Dialog>

      {/* Bulk Notification Dialog */}
      <Dialog open={bulkAction === "notify"} onOpenChange={o => !o && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Send Notification", "إرسال إشعار")}</DialogTitle></DialogHeader>
          <Textarea value={bulkNotifMsg} onChange={e => setBulkNotifMsg(e.target.value)} placeholder={t("Notification message...", "نص الإشعار...")} rows={3} />
          <Button onClick={executeBulkNotify} disabled={!bulkNotifMsg}>{t("Send to", "إرسال لـ")} {selectedIds.size} {t("students", "طالب")}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Override score sub-component
const OverrideScoreForm = ({ attempt, onSave, t }: { attempt: any; onSave: (id: string, score: number, total: number) => void; t: any }) => {
  const [score, setScore] = useState(String(attempt.score || 0));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("Current", "الحالي")}: {attempt.score}/{attempt.total_points} ({Math.round(attempt.percentage || 0)}%)</p>
      <div>
        <label className="text-xs font-medium">{t("New Score", "الدرجة الجديدة")}</label>
        <Input type="number" value={score} onChange={e => setScore(e.target.value)} max={attempt.total_points} min={0} />
        <p className="text-xs text-muted-foreground mt-1">{t("Max", "الحد الأقصى")}: {attempt.total_points}</p>
      </div>
      <Button onClick={() => onSave(attempt.id, Number(score), attempt.total_points)} className="w-full">{t("Save Override", "حفظ التعديل")}</Button>
    </div>
  );
};

export default StudentManagement;
