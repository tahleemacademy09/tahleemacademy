import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Eye, BarChart, FileText, Calendar, MessageSquare,
  StickyNote, CheckCircle, XCircle, GraduationCap, Mail, Bell, UserPlus, UserMinus
} from "lucide-react";

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
  const [noteDialog, setNoteDialog] = useState<any>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Teacher's subjects
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length === 0) { setLoading(false); return; }

      const { data: courses } = await supabase.from("courses").select("id, subject_id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) { setLoading(false); return; }

      const { data: enrollments } = await supabase.from("enrollments").select("user_id, course_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      
      // Also include private students assigned to this teacher
      const { data: privateStudents } = await supabase.from("profiles").select("user_id")
        .eq("assigned_teacher_id", user.id).eq("student_type", "private");
      const privateIds = (privateStudents || []).map(p => p.user_id);
      const allUserIds = [...new Set([...userIds, ...privateIds])];
      
      if (allUserIds.length === 0) { setLoading(false); return; }

      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", allUserIds);

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
        const pEnrollments = (enrollments || []).filter(e => e.user_id === p.user_id);
        const pSubjects = pEnrollments.map(e => {
          const course = (courses || []).find(c => c.id === e.course_id);
          return (subs || []).find(s => s.id === course?.subject_id);
        }).filter(Boolean);

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
      setLoading(false);
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

  const levelBadge = (level: string) => {
    const map: any = { beginner: { label: t("Beginner", "مبتدئ"), class: "bg-blue-100 text-blue-700 border-blue-200" },
      intermediate: { label: t("Intermediate", "متوسط"), class: "bg-amber-100 text-amber-700 border-amber-200" },
      advanced: { label: t("Advanced", "متقدم"), class: "bg-emerald-100 text-emerald-700 border-emerald-200" } };
    const b = map[level] || map.beginner;
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${b.class}`}>{b.label}</span>;
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  // ─── STUDENT DETAIL VIEW ───
  if (detailStudent) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold">
              {(detailStudent.full_name || "?")[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                {detailStudent.full_name || "—"} {levelBadge(detailStudent.level)}
                <Badge variant={detailStudent.student_type === "private" ? "secondary" : "default"} className="text-xs">
                  {detailStudent.student_type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">{detailStudent.email} • {detailStudent.subjectCount} {t("subjects", "مواد")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setNoteDialog(detailStudent); setNoteText(""); }}><StickyNote className="h-3 w-3 me-1" />{t("Add Note", "أضف ملاحظة")}</Button>
            <Button variant="outline" size="sm" onClick={() => setDetailStudent(null)}>{t("Back", "رجوع")}</Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{detailStudent.attendancePct ?? "—"}%</p>
            <p className="text-xs text-muted-foreground">{t("Attendance", "الحضور")}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{detailStudent.lastExamScore ?? "—"}%</p>
            <p className="text-xs text-muted-foreground">{t("Last Exam", "آخر امتحان")}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{detailStudent.subjectCount}</p>
            <p className="text-xs text-muted-foreground">{t("Subjects", "المواد")}</p>
          </CardContent></Card>
        </div>

        {/* Attempts */}
        <Tabs defaultValue="exams">
          <TabsList>
            <TabsTrigger value="exams">{t("Exams", "الامتحانات")}</TabsTrigger>
            <TabsTrigger value="tests">{t("Tests", "التمرينات")}</TabsTrigger>
          </TabsList>
          {["exams", "tests"].map(tab => {
            const typeKey = tab === "tests" ? "test" : "exam";
            const items = studentAttempts.filter(a => (a.exams?.type || "exam") === typeKey);
            return (
              <TabsContent key={tab} value={tab} className="space-y-2 mt-3">
                {items.length === 0 && <p className="text-muted-foreground text-center py-6 text-sm">{t("No attempts", "لا توجد محاولات")}</p>}
                {items.map(a => (
                  <Card key={a.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium text-sm">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</p>
                        <p className="text-xs text-muted-foreground">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.status === "graded" && (
                          <>
                            {a.passed ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                            <span className="font-semibold text-sm">{Math.round(a.percentage || 0)}%</span>
                          </>
                        )}
                        <Badge variant={a.status === "graded" ? (a.passed ? "default" : "destructive") : "secondary"} className="text-xs">
                          {a.status === "graded" ? (a.passed ? t("Pass", "ناجح") : t("Fail", "راسب")) : t(a.status, a.status)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            );
          })}
        </Tabs>

        {/* Private notes (read-only view) */}
        {detailStudent.private_notes && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1"><StickyNote className="h-4 w-4" /> {t("Notes", "ملاحظات")}</h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{detailStudent.private_notes}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── MAIN LIST ───
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("My Students", "طلابي")}</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} {t("students", "طالب")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", "group", "private"].map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? t("All", "الكل") : f === "group" ? t("Group", "مجموعة") : t("Private", "خاص")}
          </Button>
        ))}
        <div className="w-px h-6 bg-border self-center" />
        {["all", "beginner", "intermediate", "advanced"].map(f => (
          <Button key={f} size="sm" variant={levelFilter === f ? "default" : "outline"} onClick={() => setLevelFilter(f)}>
            {f === "all" ? t("All Levels", "كل المستويات") : f === "beginner" ? t("Beginner", "مبتدئ") : f === "intermediate" ? t("Intermediate", "متوسط") : t("Advanced", "متقدم")}
          </Button>
        ))}
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search by name...", "ابحث بالاسم...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>

      {/* Student Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <Card key={s.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                  {(s.full_name || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate flex items-center gap-1.5">
                    {s.full_name || "---"} {levelBadge(s.level)}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.subjectCount} {t("subjects", "مواد")}</p>
                </div>
                <Badge variant={s.student_type === "private" ? "secondary" : "default"} className="text-xs shrink-0">
                  {s.student_type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
                </Badge>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span title={t("Attendance", "الحضور")}>
                  📊 {s.attendancePct !== null ? `${s.attendancePct}%` : "—"}
                  {s.attendancePct !== null && s.attendancePct < 60 && <span className="text-destructive ms-1">⚠️</span>}
                </span>
                <span title={t("Last Exam", "آخر امتحان")}>
                  📝 {s.lastExamScore !== null ? (
                    <span className={s.lastExamPassed ? "text-emerald-600" : "text-destructive"}>{s.lastExamScore}%</span>
                  ) : "—"}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => viewStudentResults(s)}>
                  <BarChart className="h-3 w-3 me-1" /> {t("Results", "النتائج")}
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/teacher/transcript")}>
                  <FileText className="h-3 w-3 me-1" /> {t("Transcript", "كشف")}
                </Button>
                {s.student_type === "private" && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/teacher/private-sessions")}>
                    <Calendar className="h-3 w-3 me-1" /> {t("Session", "جلسة")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setNoteDialog(s); setNoteText(""); }}>
                  <StickyNote className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No students found", "لم يتم العثور على طلاب")}</p>}
      </div>

      {/* Add Note Dialog */}
      <Dialog open={!!noteDialog} onOpenChange={o => !o && setNoteDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Add Note for", "أضف ملاحظة لـ")} {noteDialog?.full_name}</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={t("Your note...", "ملاحظتك...")} rows={3} />
          {noteDialog?.private_notes && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">{t("Previous Notes", "ملاحظات سابقة")}:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded max-h-32 overflow-y-auto">{noteDialog.private_notes}</pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)}>{t("Cancel", "إلغاء")}</Button>
            <Button onClick={saveNote} disabled={!noteText.trim()}>{t("Save Note", "حفظ الملاحظة")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherStudents;
