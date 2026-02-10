import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Copy, Clock, Users, AlertTriangle } from "lucide-react";

const ExamManager = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [exams, setExams] = useState<any[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});

  const fetchExams = async () => {
    const { data } = await supabase.from("exams").select("*, exam_questions(id)").order("created_at", { ascending: false });
    setExams(data || []);

    // Fetch assignment and attempt counts
    if (data?.length) {
      const examIds = data.map(e => e.id);
      const [assignRes, attemptRes] = await Promise.all([
        supabase.from("exam_assignments").select("exam_id"),
        supabase.from("exam_attempts").select("exam_id, status"),
      ]);

      const aCounts: Record<string, number> = {};
      (assignRes.data || []).forEach((a: any) => { aCounts[a.exam_id] = (aCounts[a.exam_id] || 0) + 1; });
      setAssignmentCounts(aCounts);

      const tCounts: Record<string, number> = {};
      (attemptRes.data || []).forEach((a: any) => { tCounts[a.exam_id] = (tCounts[a.exam_id] || 0) + 1; });
      setAttemptCounts(tCounts);
    }
  };

  useEffect(() => { fetchExams(); }, []);

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from("exams").update({ is_published: !current }).eq("id", id);
    fetchExams();
    toast({ title: !current ? t("Exam published", "تم نشر الامتحان") : t("Exam unpublished", "تم إلغاء نشر الامتحان") });
  };

  const deleteExam = async (id: string) => {
    if (!window.confirm(t("Are you sure you want to delete this exam?", "هل أنت متأكد من حذف هذا الامتحان؟"))) return;
    // Delete related data first
    await supabase.from("exam_questions").delete().eq("exam_id", id);
    await supabase.from("exam_assignments").delete().eq("exam_id", id);
    await supabase.from("exams").delete().eq("id", id);
    toast({ title: t("Exam deleted", "تم حذف الامتحان") });
    fetchExams();
  };

  const duplicateExam = async (exam: any) => {
    const { id, created_at, updated_at, exam_questions, ...rest } = exam;
    const { data: newExam } = await supabase.from("exams").insert({ ...rest, title: `${rest.title} (Copy)`, is_published: false }).select("id").single();
    if (newExam && exam_questions?.length) {
      const { data: questions } = await supabase.from("exam_questions").select("*").eq("exam_id", id);
      if (questions) {
        await supabase.from("exam_questions").insert(questions.map((q: any) => {
          const { id: _, created_at: __, ...qRest } = q;
          return { ...qRest, exam_id: newExam.id };
        }));
      }
    }
    toast({ title: t("Exam duplicated", "تم نسخ الامتحان") });
    fetchExams();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("Exams", "الامتحانات")}</h1>
        <Button asChild>
          <Link to="/admin/exams/create"><Plus className="mr-2 h-4 w-4" />{t("Create Exam", "إنشاء امتحان")}</Link>
        </Button>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("No exams yet. Create your first exam!", "لا توجد امتحانات بعد. أنشئ امتحانك الأول!")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between p-4 flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{language === "ar" ? exam.title_ar || exam.title : exam.title}</h3>
                    <Badge variant={exam.is_published ? "default" : "secondary"}>
                      {exam.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {exam.time_limit_minutes} {t("min", "دقيقة")}</span>
                    <span>{exam.exam_questions?.length || 0} {t("questions", "أسئلة")}</span>
                    <span>{t("Pass", "نجاح")}: {exam.passing_score}%</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {assignmentCounts[exam.id] || 0} {t("assigned", "معين")}</span>
                    <span>{attemptCounts[exam.id] || 0} {t("attempts", "محاولات")}</span>
                    <span>{t("Max", "أقصى")}: {exam.max_attempts} {t("attempts", "محاولات")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={exam.is_published} onCheckedChange={() => togglePublish(exam.id, exam.is_published)} />
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/exams/${exam.id}/edit`)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => duplicateExam(exam)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteExam(exam.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamManager;
