import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, User, ClipboardList, Mail, Calendar, Eye, CheckCircle, XCircle, UserCheck } from "lucide-react";

const StudentManagement = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser, hasRole } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "group" | "private">("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [detailStudent, setDetailStudent] = useState<any>(null);
  const [studentAttempts, setStudentAttempts] = useState<any[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<any[]>([]);

  const fetchData = async () => {
    const [profilesRes, rolesRes, examsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("exams").select("id, title, title_ar, is_published"),
    ]);
    // Merge roles into profiles client-side (no FK between tables)
    const rolesMap = new Map<string, { role: string }[]>();
    (rolesRes.data || []).forEach((r: any) => {
      if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
      rolesMap.get(r.user_id)!.push({ role: r.role });
    });
    const merged = (profilesRes.data || []).map((p: any) => ({
      ...p,
      user_roles: rolesMap.get(p.user_id) || [],
    }));
    setStudents(merged);
    setExams(examsRes.data || []);
  };

  useEffect(() => { fetchData(); }, []);

  const isAdmin = hasRole("admin");

  const filtered = students.filter((s) => {
    const matchesSearch = s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.includes(search);
    const matchesType = typeFilter === "all" || s.student_type === typeFilter;
    // Teachers only see group students + their own private students
    const visibleToTeacher = isAdmin || s.student_type !== "private" || s.assigned_teacher_id === currentUser?.id;
    return matchesSearch && matchesType && visibleToTeacher;
  });

  const assignExam = async () => {
    if (!selectedStudent || !selectedExamId) return;
    // Check for duplicate assignment
    const { data: existing } = await supabase
      .from("exam_assignments")
      .select("id")
      .eq("user_id", selectedStudent.user_id)
      .eq("exam_id", selectedExamId)
      .maybeSingle();
    if (existing) {
      toast({ title: t("Already assigned", "تم التعيين مسبقًا"), variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("exam_assignments").insert({
      user_id: selectedStudent.user_id,
      exam_id: selectedExamId,
    });
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Exam assigned!", "تم تعيين الامتحان!") });
      setAssignDialogOpen(false);
      setSelectedExamId("");
    }
  };

  const viewStudentDetails = async (student: any) => {
    setDetailStudent(student);
    const [attemptsRes, assignmentsRes] = await Promise.all([
      supabase.from("exam_attempts")
        .select("*, exams(title, title_ar)")
        .eq("user_id", student.user_id)
        .order("created_at", { ascending: false }),
      supabase.from("exam_assignments")
        .select("*, exams(title, title_ar)")
        .eq("user_id", student.user_id)
        .order("assigned_at", { ascending: false }),
    ]);
    setStudentAttempts(attemptsRes.data || []);
    setStudentAssignments(assignmentsRes.data || []);
  };

  const removeAssignment = async (assignmentId: string) => {
    await supabase.from("exam_assignments").delete().eq("id", assignmentId);
    toast({ title: t("Assignment removed", "تم إزالة التعيين") });
    if (detailStudent) viewStudentDetails(detailStudent);
  };

  // Bulk assign exam to multiple students
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkExamId, setBulkExamId] = useState("");
  const [bulkSelectedStudents, setBulkSelectedStudents] = useState<Set<string>>(new Set());

  const toggleBulkStudent = (userId: string) => {
    setBulkSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const bulkAssign = async () => {
    if (!bulkExamId || bulkSelectedStudents.size === 0) return;
    const inserts = Array.from(bulkSelectedStudents).map(uid => ({
      user_id: uid, exam_id: bulkExamId,
    }));
    const { error } = await supabase.from("exam_assignments").insert(inserts);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t(`Exam assigned to ${bulkSelectedStudents.size} students`, `تم تعيين الامتحان لـ ${bulkSelectedStudents.size} طالب`) });
      setBulkAssignOpen(false);
      setBulkSelectedStudents(new Set());
      setBulkExamId("");
    }
  };

  if (detailStudent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{detailStudent.full_name || t("Student", "طالب")}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Mail className="h-3 w-3" /> {detailStudent.email || t("No email", "بدون بريد")}
              <span className="mx-2">•</span>
              <Calendar className="h-3 w-3" /> {t("Joined", "انضم")}: {new Date(detailStudent.created_at).toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" onClick={() => setDetailStudent(null)}>{t("Back", "رجوع")}</Button>
        </div>

        <Tabs defaultValue="attempts">
          <TabsList>
            <TabsTrigger value="attempts">{t("Exam Attempts", "محاولات الامتحان")} ({studentAttempts.length})</TabsTrigger>
            <TabsTrigger value="assignments">{t("Assigned Exams", "الامتحانات المعينة")} ({studentAssignments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="attempts" className="mt-4 space-y-3">
            {studentAttempts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("No exam attempts yet", "لا توجد محاولات بعد")}</p>
            ) : studentAttempts.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "graded" && (
                      <div className="flex items-center gap-1">
                        {a.passed ? <CheckCircle className="h-4 w-4 text-emerald" /> : <XCircle className="h-4 w-4 text-destructive" />}
                        <span className="font-semibold">{Math.round(a.percentage || 0)}%</span>
                      </div>
                    )}
                    <Badge variant={
                      a.status === "graded" ? (a.passed ? "default" : "destructive") :
                      a.status === "submitted" ? "secondary" : "outline"
                    }>
                      {a.status === "in_progress" ? t("In Progress", "قيد التنفيذ") :
                       a.status === "submitted" ? t("Needs Grading", "يحتاج تصحيح") :
                       a.status === "graded" ? (a.passed ? t("Passed", "ناجح") : t("Failed", "راسب")) :
                       a.status}
                    </Badge>
                    {a.tab_switches > 0 && (
                      <Badge variant="destructive" className="text-xs">{a.tab_switches} {t("tab switches", "تبديل")}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="assignments" className="mt-4 space-y-3">
            {studentAssignments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("No assigned exams", "لا توجد امتحانات معينة")}</p>
            ) : studentAssignments.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</div>
                    <div className="text-xs text-muted-foreground">{t("Assigned", "تم التعيين")}: {new Date(a.assigned_at).toLocaleDateString()}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeAssignment(a.id)}>
                    {t("Remove", "إزالة")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">{t("Student Management", "إدارة الطلاب")}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{filtered.length} {t("students", "طالب")}</Badge>
          <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <ClipboardList className="h-3 w-3" />
                {t("Bulk Assign Exam", "تعيين جماعي")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("Bulk Assign Exam", "تعيين امتحان جماعي")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Select value={bulkExamId} onValueChange={setBulkExamId}>
                  <SelectTrigger><SelectValue placeholder={t("Select an exam", "اختر امتحان")} /></SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.title} {exam.is_published ? "" : `(${t("Draft", "مسودة")})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {students.filter(s => s.user_roles?.some((r: any) => r.role === "student")).map((s) => (
                    <label key={s.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer">
                      <input type="checkbox" checked={bulkSelectedStudents.has(s.user_id)} onChange={() => toggleBulkStudent(s.user_id)} className="accent-primary" />
                      <span className="text-sm">{s.full_name || t("Unnamed", "بدون اسم")}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{s.email}</span>
                    </label>
                  ))}
                </div>
                <Button onClick={bulkAssign} className="w-full" disabled={!bulkExamId || bulkSelectedStudents.size === 0}>
                  {t("Assign to", "تعيين لـ")} {bulkSelectedStudents.size} {t("students", "طالب")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder={t("Search by name, email or phone...", "البحث بالاسم أو البريد أو الهاتف...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((student) => {
          const isStudent = student.user_roles?.some((r: any) => r.role === "student");
          return (
            <Card key={student.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between p-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{student.full_name || t("Unnamed", "بدون اسم")}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {student.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{student.email}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(student.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {student.user_roles?.map((r: any) => (
                    <Badge key={r.role} variant={r.role === "admin" ? "destructive" : r.role === "teacher" ? "default" : "secondary"}>
                      {r.role}
                    </Badge>
                  ))}
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => viewStudentDetails(student)}>
                    <Eye className="h-3 w-3" /> {t("Details", "تفاصيل")}
                  </Button>
                  {isStudent && (
                    <Dialog open={assignDialogOpen && selectedStudent?.id === student.id} onOpenChange={(o) => { setAssignDialogOpen(o); if (o) setSelectedStudent(student); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {t("Assign Exam", "تعيين امتحان")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("Assign Exam to", "تعيين امتحان لـ")} {student.full_name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                            <SelectTrigger><SelectValue placeholder={t("Select an exam", "اختر امتحان")} /></SelectTrigger>
                            <SelectContent>
                              {exams.map((exam) => (
                                <SelectItem key={exam.id} value={exam.id}>
                                  {exam.title} {exam.is_published ? "" : `(${t("Draft", "مسودة")})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button onClick={assignExam} className="w-full">{t("Assign", "تعيين")}</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("No students found", "لم يتم العثور على طلاب")}</p>
        )}
      </div>
    </div>
  );
};

export default StudentManagement;
