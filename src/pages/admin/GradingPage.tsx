import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, XCircle } from "lucide-react";

const GradingPage = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select("*, exams(title, title_ar), profiles:user_id(full_name)")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      setAttempts(data || []);
    };
    fetch();
  }, []);

  const loadAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    const [answersRes, questionsRes] = await Promise.all([
      supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id),
      supabase.from("exam_questions").select("*").eq("exam_id", attempt.exam_id).order("sort_order"),
    ]);
    setAnswers(answersRes.data || []);
    setQuestions(questionsRes.data || []);
  };

  const updateGrade = (answerId: string, pointsAwarded: number, feedback: string) => {
    setAnswers((prev) =>
      prev.map((a) => (a.id === answerId ? { ...a, points_awarded: pointsAwarded, feedback, is_correct: pointsAwarded > 0 } : a))
    );
  };

  const submitGrading = async () => {
    for (const ans of answers) {
      await supabase.from("exam_answers").update({
        points_awarded: ans.points_awarded,
        feedback: ans.feedback,
        is_correct: ans.is_correct,
        graded_by: user!.id,
        graded_at: new Date().toISOString(),
      }).eq("id", ans.id);
    }

    const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
    const earnedPoints = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
    const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    await supabase.from("exam_attempts").update({
      status: "graded",
      score: earnedPoints,
      total_points: totalPoints,
      percentage,
      passed: percentage >= 50,
    }).eq("id", selectedAttempt.id);

    toast({ title: t("Grading submitted!", "تم تقديم التصحيح!") });
    setSelectedAttempt(null);
    // Refresh
    const { data } = await supabase.from("exam_attempts").select("*, exams(title, title_ar), profiles:user_id(full_name)").eq("status", "submitted").order("submitted_at", { ascending: true });
    setAttempts(data || []);
  };

  if (selectedAttempt) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("Grading", "التصحيح")}: {selectedAttempt.exams?.title}</h1>
            <p className="text-sm text-muted-foreground">{t("Student", "الطالب")}: {selectedAttempt.profiles?.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedAttempt(null)}>{t("Back", "رجوع")}</Button>
            <Button onClick={submitGrading}>{t("Submit Grades", "تقديم الدرجات")}</Button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => {
            const ans = answers.find((a) => a.question_id === q.id);
            return (
              <Card key={q.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">{t("Q", "س")} {i + 1}</Badge>
                    <Badge variant="secondary">{q.question_type}</Badge>
                    <span className="text-xs text-muted-foreground">{q.points} {t("pts", "نقاط")}</span>
                  </div>
                  <p className="mb-2 font-medium">{language === "ar" ? q.question_text_ar || q.question_text : q.question_text}</p>
                  {q.correct_answer && <p className="mb-2 text-sm text-emerald">{t("Correct Answer", "الإجابة الصحيحة")}: {q.correct_answer}</p>}
                  <div className="mb-3 rounded-lg bg-muted p-3">
                    <p className="text-sm font-medium">{t("Student's Answer", "إجابة الطالب")}:</p>
                    <p className="text-sm">{ans?.answer_text || t("No answer", "لا إجابة")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <Label className="text-xs">{t("Points", "نقاط")}</Label>
                      <Input
                        type="number"
                        className="w-20"
                        value={ans?.points_awarded ?? 0}
                        min={0}
                        max={q.points}
                        onChange={(e) => ans && updateGrade(ans.id, +e.target.value, ans.feedback || "")}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">{t("Feedback", "ملاحظات")}</Label>
                      <Textarea
                        rows={2}
                        value={ans?.feedback || ""}
                        onChange={(e) => ans && updateGrade(ans.id, ans.points_awarded || 0, e.target.value)}
                        placeholder={t("Add feedback...", "أضف ملاحظات...")}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("Grading Queue", "قائمة التصحيح")}</h1>
      {attempts.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No exams to grade", "لا توجد امتحانات للتصحيح")}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => (
            <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadAttempt(attempt)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold">{attempt.exams?.title}</div>
                  <div className="text-sm text-muted-foreground">{attempt.profiles?.full_name} • {new Date(attempt.submitted_at).toLocaleString()}</div>
                </div>
                <Badge>{t("Needs Grading", "يحتاج تصحيح")}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// Need Label import
const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <label className={`block text-sm font-medium ${className || ""}`}>{children}</label>
);

export default GradingPage;
