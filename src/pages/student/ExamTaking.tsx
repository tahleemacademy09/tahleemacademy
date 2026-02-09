import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, Flag, ChevronLeft, ChevronRight, Send, AlertTriangle } from "lucide-react";

const ExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, { text: string; data: any; flagged: boolean }>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const autoSaveRef = useRef<NodeJS.Timeout>();

  // Load exam data
  useEffect(() => {
    if (!attemptId || !user) return;
    const load = async () => {
      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("*, exams(*)")
        .eq("id", attemptId)
        .single();

      if (!attempt || attempt.user_id !== user.id || attempt.status !== "in_progress") {
        navigate("/student/exams");
        return;
      }

      setExam(attempt.exams);
      const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
      setTimeLeft(Math.max(0, (attempt.exams.time_limit_minutes || 60) * 60 - elapsed));
      setTabSwitches(attempt.tab_switches || 0);

      const { data: qs } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", attempt.exam_id)
        .order("sort_order");

      let questionList = qs || [];
      if (attempt.exams.randomize_questions) {
        questionList = questionList.sort(() => Math.random() - 0.5);
      }
      setQuestions(questionList);

      // Load existing answers
      const { data: existingAnswers } = await supabase
        .from("exam_answers")
        .select("*")
        .eq("attempt_id", attemptId);

      const answersMap: Record<string, any> = {};
      (existingAnswers || []).forEach((a) => {
        answersMap[a.question_id] = { text: a.answer_text || "", data: a.answer_data, flagged: a.is_flagged || false };
      });
      setAnswers(answersMap);
      setLoading(false);
    };
    load();
  }, [attemptId, user]);

  // Timer
  useEffect(() => {
    if (timeLeft <= 0 && !loading && exam) {
      handleSubmit();
      return;
    }
    const interval = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [timeLeft, loading]);

  // Tab switch detection
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        setTabSwitches((prev) => {
          const next = prev + 1;
          supabase.from("exam_attempts").update({ tab_switches: next }).eq("id", attemptId!);
          if (next >= 3) {
            toast({ title: t("Warning!", "تحذير!"), description: t("Excessive tab switching detected. Your exam may be flagged.", "تم اكتشاف تبديل مفرط للنوافذ. قد يتم تعليم امتحانك."), variant: "destructive" });
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [attemptId]);

  // Auto-save every 30s
  useEffect(() => {
    autoSaveRef.current = setInterval(() => saveAnswers(), 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [answers]);

  const saveAnswers = async () => {
    if (!attemptId) return;
    for (const [qId, ans] of Object.entries(answers)) {
      await supabase.from("exam_answers").upsert(
        { attempt_id: attemptId, question_id: qId, answer_text: ans.text, answer_data: ans.data, is_flagged: ans.flagged },
        { onConflict: "attempt_id,question_id" as any }
      );
    }
  };

  const setAnswer = (qId: string, text: string, data?: any) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text, data: data ?? prev[qId]?.data, flagged: prev[qId]?.flagged || false } }));
  };

  const toggleFlag = (qId: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text: prev[qId]?.text || "", data: prev[qId]?.data, flagged: !prev[qId]?.flagged } }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await saveAnswers();

    // Auto-grade objective questions
    let totalPoints = 0;
    let earnedPoints = 0;
    for (const q of questions) {
      totalPoints += q.points || 1;
      const ans = answers[q.id];
      if (!ans) continue;

      let isCorrect: boolean | null = null;
      let pts = 0;

      if (q.question_type === "mcq" && q.options) {
        const correctOpts = (q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => o.id);
        isCorrect = correctOpts.length === 1 && ans.text === correctOpts[0];
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "true_false") {
        isCorrect = ans.text?.toLowerCase() === q.correct_answer?.toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "fill_blank") {
        isCorrect = ans.text?.trim().toLowerCase() === q.correct_answer?.trim().toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      }
      // Essay/short_answer need manual grading

      if (isCorrect !== null) {
        earnedPoints += pts;
        await supabase.from("exam_answers").update({ is_correct: isCorrect, points_awarded: pts }).eq("attempt_id", attemptId!).eq("question_id", q.id);
      }
    }

    const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const hasSubjective = questions.some((q) => ["short_answer", "essay"].includes(q.question_type));

    await supabase.from("exam_attempts").update({
      status: hasSubjective ? "submitted" : "graded",
      submitted_at: new Date().toISOString(),
      score: earnedPoints,
      total_points: totalPoints,
      percentage,
      passed: percentage >= (exam?.passing_score || 50),
    }).eq("id", attemptId!);

    toast({ title: t("Exam Submitted!", "تم تقديم الامتحان!") });
    navigate("/student/exams");
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  const q = questions[currentIdx];
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.text).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold truncate">
            {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
          </h2>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1 font-mono text-sm font-bold ${timeLeft < 300 ? "text-destructive" : ""}`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
            {tabSwitches > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="mr-1 h-3 w-3" /> {tabSwitches}
              </Badge>
            )}
            <Button size="sm" variant="destructive" onClick={handleSubmit} disabled={submitting}>
              <Send className="mr-1 h-3 w-3" />
              {t("Submit", "تقديم")}
            </Button>
          </div>
        </div>
        <Progress value={(answeredCount / questions.length) * 100} className="h-1" />
      </div>

      <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[1fr_250px]">
        {/* Question area */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <Badge variant="outline">
                {t("Question", "سؤال")} {currentIdx + 1} / {questions.length}
              </Badge>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{q?.points || 1} {t("pts", "نقاط")}</Badge>
                <Button variant={answers[q?.id]?.flagged ? "destructive" : "ghost"} size="icon" onClick={() => q && toggleFlag(q.id)}>
                  <Flag className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-lg font-medium">{language === "ar" ? q?.question_text_ar || q?.question_text : q?.question_text}</p>
              {q?.media_url && (
                <div className="mt-3">
                  {q.question_type === "audio" ? (
                    <audio controls src={q.media_url} className="w-full" />
                  ) : q.question_type === "video" ? (
                    <video controls src={q.media_url} className="w-full rounded-lg" />
                  ) : null}
                </div>
              )}
            </div>

            {/* Answer input based on type */}
            {q?.question_type === "mcq" && q.options && (
              <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                <div className="space-y-3">
                  {(q.options as any[]).map((opt: any) => (
                    <div key={opt.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 cursor-pointer">
                      <RadioGroupItem value={opt.id} id={opt.id} />
                      <Label htmlFor={opt.id} className="cursor-pointer flex-1">
                        {language === "ar" ? opt.text_ar || opt.text : opt.text}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}

            {q?.question_type === "true_false" && (
              <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                <div className="space-y-3">
                  {[{ v: "true", l: t("True", "صح") }, { v: "false", l: t("False", "خطأ") }].map((opt) => (
                    <div key={opt.v} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 cursor-pointer">
                      <RadioGroupItem value={opt.v} id={opt.v} />
                      <Label htmlFor={opt.v} className="cursor-pointer flex-1">{opt.l}</Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}

            {q?.question_type === "fill_blank" && (
              <Input
                placeholder={t("Type your answer...", "اكتب إجابتك...")}
                value={answers[q.id]?.text || ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}

            {(q?.question_type === "short_answer" || q?.question_type === "essay") && (
              <Textarea
                placeholder={t("Write your answer...", "اكتب إجابتك...")}
                rows={q.question_type === "essay" ? 8 : 4}
                value={answers[q.id]?.text || ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}

            {/* Navigation */}
            <div className="mt-6 flex justify-between">
              <Button variant="outline" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("Previous", "السابق")}
              </Button>
              <Button disabled={currentIdx === questions.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)}>
                {t("Next", "التالي")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Question navigator */}
        <Card className="h-fit">
          <CardContent className="p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("Questions", "الأسئلة")}</h4>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const answered = !!answers[q.id]?.text;
                const flagged = answers[q.id]?.flagged;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      i === currentIdx ? "bg-primary text-primary-foreground" :
                      flagged ? "bg-destructive/20 text-destructive border border-destructive/50" :
                      answered ? "bg-emerald/20 text-emerald border border-emerald/50" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-emerald/20 border border-emerald/50" /> {t("Answered", "مُجاب")}</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-destructive/20 border border-destructive/50" /> {t("Flagged", "مُعلّم")}</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-muted" /> {t("Not answered", "غير مُجاب")}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExamTaking;
