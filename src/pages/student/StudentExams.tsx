import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Clock, CheckCircle, XCircle, PlayCircle } from "lucide-react";

const StudentExams = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [pastAttempts, setPastAttempts] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchExams = async () => {
      const [examsRes, attemptsRes] = await Promise.all([
        supabase.from("exams").select("*").eq("is_published", true),
        supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setAvailableExams(examsRes.data || []);
      setPastAttempts(attemptsRes.data || []);
    };
    fetchExams();
  }, [user]);

  const startExam = async (examId: string) => {
    // Check existing in-progress attempt
    const { data: existing } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", examId)
      .eq("user_id", user!.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existing) {
      navigate(`/student/exam/${existing.id}`);
      return;
    }

    const { data, error } = await supabase
      .from("exam_attempts")
      .insert({ exam_id: examId, user_id: user!.id })
      .select("id")
      .single();

    if (!error && data) navigate(`/student/exam/${data.id}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("Exams", "الامتحانات")}</h1>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">{t("Available", "المتاحة")}</TabsTrigger>
          <TabsTrigger value="history">{t("History", "السجل")}</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-6">
          {availableExams.length === 0 ? (
            <p className="text-muted-foreground">{t("No exams available", "لا توجد امتحانات متاحة")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableExams.map((exam) => (
                <Card key={exam.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <h3 className="mb-2 text-lg font-semibold">
                      {language === "ar" ? exam.title_ar || exam.title : exam.title}
                    </h3>
                    <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                      {language === "ar" ? exam.description_ar || exam.description : exam.description}
                    </p>
                    <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {exam.time_limit_minutes} {t("min", "دقيقة")}</span>
                      <Badge variant="outline">{t("Pass", "نجاح")}: {exam.passing_score}%</Badge>
                    </div>
                    <Button size="sm" onClick={() => startExam(exam.id)} className="w-full">
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {t("Start Exam", "بدء الامتحان")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {pastAttempts.length === 0 ? (
            <p className="text-muted-foreground">{t("No exam history", "لا يوجد سجل امتحانات")}</p>
          ) : (
            <div className="space-y-3">
              {pastAttempts.map((attempt) => (
                <Card key={attempt.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">
                        {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(attempt.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {attempt.status === "graded" && (
                        <div className="flex items-center gap-1">
                          {attempt.passed ? (
                            <CheckCircle className="h-4 w-4 text-emerald" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="font-semibold">{Math.round(attempt.percentage || 0)}%</span>
                        </div>
                      )}
                      <Badge variant={attempt.status === "graded" ? (attempt.passed ? "default" : "destructive") : "secondary"}>
                        {attempt.status === "in_progress" ? t("In Progress", "قيد التنفيذ") : attempt.status === "submitted" ? t("Submitted", "مُقدم") : attempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentExams;
