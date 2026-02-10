import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, XCircle, Play, Pause, Volume2 } from "lucide-react";
import { useRef } from "react";

const GradingPage = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [pendingAttempts, setPendingAttempts] = useState<any[]>([]);
  const [gradedAttempts, setGradedAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [gradingTab, setGradingTab] = useState("pending");

  const fetchAttempts = async () => {
    const [pendingRes, gradedRes] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("*, exams(title, title_ar, passing_score), profiles:user_id(full_name, email)")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true }),
      supabase
        .from("exam_attempts")
        .select("*, exams(title, title_ar, passing_score), profiles:user_id(full_name, email)")
        .eq("status", "graded")
        .order("submitted_at", { ascending: false })
        .limit(50),
    ]);
    setPendingAttempts(pendingRes.data || []);
    setGradedAttempts(gradedRes.data || []);
  };

  useEffect(() => { fetchAttempts(); }, []);

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

  const autoGradeObjective = () => {
    setAnswers((prev) => prev.map((ans) => {
      const q = questions.find((qq) => qq.id === ans.question_id);
      if (!q) return ans;

      let isCorrect: boolean | null = null;
      let pts = 0;

      if (q.question_type === "mcq" && q.options) {
        const correctOpts = (q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => o.id);
        isCorrect = correctOpts.length === 1 && ans.answer_text === correctOpts[0];
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "true_false") {
        isCorrect = ans.answer_text?.toLowerCase() === q.correct_answer?.toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "fill_blank") {
        isCorrect = ans.answer_text?.trim().toLowerCase() === q.correct_answer?.trim().toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      }

      if (isCorrect !== null) {
        return { ...ans, is_correct: isCorrect, points_awarded: pts };
      }
      return ans;
    }));
    toast({ title: t("Auto-graded objective questions", "تم التصحيح التلقائي للأسئلة الموضوعية") });
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
    const passingScore = selectedAttempt?.exams?.passing_score || 50;

    await supabase.from("exam_attempts").update({
      status: "graded",
      score: earnedPoints,
      total_points: totalPoints,
      percentage,
      passed: percentage >= passingScore,
    }).eq("id", selectedAttempt.id);

    toast({ title: t("Grading submitted!", "تم تقديم التصحيح!") });
    setSelectedAttempt(null);
    fetchAttempts();
  };

  if (selectedAttempt) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("Grading", "التصحيح")}: {language === "ar" ? selectedAttempt.exams?.title_ar || selectedAttempt.exams?.title : selectedAttempt.exams?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Student", "الطالب")}: {selectedAttempt.profiles?.full_name} ({selectedAttempt.profiles?.email})
              {selectedAttempt.submitted_at && ` • ${t("Submitted", "مُقدم")}: ${new Date(selectedAttempt.submitted_at).toLocaleString()}`}
              {selectedAttempt.tab_switches > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{selectedAttempt.tab_switches} {t("tab switches", "تبديل")}</Badge>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setSelectedAttempt(null)}>{t("Back", "رجوع")}</Button>
            <Button variant="secondary" onClick={autoGradeObjective}>{t("Auto-Grade Objective", "تصحيح تلقائي")}</Button>
            <Button onClick={submitGrading}>{t("Submit Grades", "تقديم الدرجات")}</Button>
          </div>
        </div>

        {/* Summary bar */}
        <Card className="mb-4">
          <CardContent className="flex items-center gap-4 p-4 flex-wrap">
            <div className="text-sm">
              <span className="font-medium">{t("Total Points", "إجمالي النقاط")}: </span>
              {questions.reduce((s, q) => s + (q.points || 1), 0)}
            </div>
            <div className="text-sm">
              <span className="font-medium">{t("Earned", "المكتسبة")}: </span>
              {answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0)}
            </div>
            <div className="text-sm">
              <span className="font-medium">{t("Percentage", "النسبة")}: </span>
              {(() => {
                const total = questions.reduce((s, q) => s + (q.points || 1), 0);
                const earned = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
                return total > 0 ? `${Math.round((earned / total) * 100)}%` : "0%";
              })()}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {questions.map((q, i) => {
            const ans = answers.find((a) => a.question_id === q.id);
            return (
              <Card key={q.id} className={ans?.is_correct === true ? "border-emerald/30" : ans?.is_correct === false ? "border-destructive/30" : ""}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{t("Q", "س")} {i + 1}</Badge>
                    <Badge variant="secondary">{q.question_type}</Badge>
                    <span className="text-xs text-muted-foreground">{q.points} {t("pts", "نقاط")}</span>
                    {ans?.is_correct === true && <CheckCircle className="h-4 w-4 text-emerald" />}
                    {ans?.is_correct === false && <XCircle className="h-4 w-4 text-destructive" />}
                  </div>

                  <p className="mb-2 font-medium" dir={language === "ar" ? "rtl" : "ltr"}>
                    {language === "ar" ? q.question_text_ar || q.question_text : q.question_text}
                  </p>

                  {/* Show correct answer */}
                  {q.correct_answer && (
                    <p className="mb-2 text-sm text-emerald">
                      {t("Correct Answer", "الإجابة الصحيحة")}: {q.correct_answer}
                    </p>
                  )}
                  {q.question_type === "mcq" && q.options && (
                    <div className="mb-2 text-sm text-emerald">
                      {t("Correct", "صحيح")}: {(q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => language === "ar" ? o.text_ar || o.text : o.text).join(", ")}
                    </div>
                  )}

                  {/* Audio playback for media questions */}
                  {q.media_url && (
                    <AudioPreview src={q.media_url} label={t("Question Audio", "صوت السؤال")} />
                  )}

                  {/* Student's answer */}
                  <div className="mb-3 rounded-lg bg-muted p-3">
                    <p className="text-sm font-medium mb-1">{t("Student's Answer", "إجابة الطالب")}:</p>
                    {q.question_type === "mcq" && q.options ? (
                      <p className="text-sm">
                        {(() => {
                          const opt = (q.options as any[]).find((o: any) => o.id === ans?.answer_text);
                          return opt ? (language === "ar" ? opt.text_ar || opt.text : opt.text) : t("No answer", "لا إجابة");
                        })()}
                      </p>
                    ) : (
                      <p className="text-sm" dir="auto">{ans?.answer_text || t("No answer", "لا إجابة")}</p>
                    )}

                    {/* Audio answer playback */}
                    {ans?.answer_data?.audioUrl && (
                      <div className="mt-2">
                        <AudioPreview src={ans.answer_data.audioUrl} label={t("Student's Audio", "صوت الطالب")} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-3 flex-wrap">
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
                    <div className="flex-1 min-w-[200px]">
                      <Label className="text-xs">{t("Feedback", "ملاحظات")}</Label>
                      <Textarea
                        rows={2}
                        value={ans?.feedback || ""}
                        onChange={(e) => ans && updateGrade(ans.id, ans.points_awarded || 0, e.target.value)}
                        placeholder={t("Add feedback...", "أضف ملاحظات...")}
                        dir="auto"
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
      <h1 className="mb-6 text-3xl font-bold">{t("Grading", "التصحيح")}</h1>

      <Tabs value={gradingTab} onValueChange={setGradingTab}>
        <TabsList>
          <TabsTrigger value="pending">{t("Needs Grading", "يحتاج تصحيح")} ({pendingAttempts.length})</TabsTrigger>
          <TabsTrigger value="graded">{t("Graded", "مُصحح")} ({gradedAttempts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingAttempts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No exams to grade", "لا توجد امتحانات للتصحيح")}</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {pendingAttempts.map((attempt) => (
                <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadAttempt(attempt)}>
                  <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                    <div>
                      <div className="font-semibold">{language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {attempt.profiles?.full_name} ({attempt.profiles?.email}) • {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.tab_switches > 0 && (
                        <Badge variant="destructive" className="text-xs">{attempt.tab_switches} ⚠️</Badge>
                      )}
                      <Badge>{t("Needs Grading", "يحتاج تصحيح")}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="graded" className="mt-4">
          {gradedAttempts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No graded exams yet", "لا توجد امتحانات مُصححة")}</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {gradedAttempts.map((attempt) => (
                <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadAttempt(attempt)}>
                  <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                    <div>
                      <div className="font-semibold">{language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {attempt.profiles?.full_name} • {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.passed ? <CheckCircle className="h-4 w-4 text-emerald" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="font-semibold">{Math.round(attempt.percentage || 0)}%</span>
                      <Badge variant={attempt.passed ? "default" : "destructive"}>
                        {attempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
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

// Simple audio preview component for grading
const AudioPreview = ({ src, label }: { src: string; label: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-2">
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Volume2 className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

export default GradingPage;
