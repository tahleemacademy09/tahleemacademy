import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, User, ClipboardList, Lock, Unlock, UserCheck } from "lucide-react";

const StudentManagement = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState("");

  const fetchData = async () => {
    const [studentsRes, examsRes] = await Promise.all([
      supabase.from("profiles").select("*, user_roles(role)"),
      supabase.from("exams").select("id, title, title_ar, is_published"),
    ]);
    setStudents(studentsRes.data || []);
    setExams(examsRes.data || []);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = students.filter((s) =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  const assignExam = async () => {
    if (!selectedStudent || !selectedExamId) return;
    const { error } = await supabase.from("exam_assignments").insert({
      user_id: selectedStudent.user_id,
      exam_id: selectedExamId,
    });
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Exam assigned!", "تم تعيين الامتحان!") });
      setAssignDialogOpen(false);
    }
  };

  const toggleExamLock = async (studentUserId: string, examId: string, lock: boolean) => {
    if (lock) {
      // Cancel any in-progress attempts
      await supabase.from("exam_attempts")
        .update({ status: "locked" })
        .eq("user_id", studentUserId)
        .eq("exam_id", examId)
        .eq("status", "in_progress");
      toast({ title: t("Exam locked for student", "تم قفل الامتحان للطالب") });
    } else {
      await supabase.from("exam_attempts")
        .update({ status: "in_progress" })
        .eq("user_id", studentUserId)
        .eq("exam_id", examId)
        .eq("status", "locked");
      toast({ title: t("Exam unlocked for student", "تم فتح الامتحان للطالب") });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("Student Management", "إدارة الطلاب")}</h1>
        <Badge variant="outline" className="text-sm">{filtered.length} {t("students", "طالب")}</Badge>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder={t("Search by name or phone...", "البحث بالاسم أو الهاتف...")}
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
                    <div className="text-xs text-muted-foreground">{student.phone || t("No phone", "بدون هاتف")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {student.user_roles?.map((r: any) => (
                    <Badge key={r.role} variant={r.role === "admin" ? "destructive" : r.role === "teacher" ? "default" : "secondary"}>
                      {r.role}
                    </Badge>
                  ))}
                  {isStudent && (
                    <>
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
                    </>
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
