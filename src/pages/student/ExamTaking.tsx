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
import { logger } from "@/lib/logger";
import { sanitizeHtml } from "@/lib/sanitize";
import { Clock, Flag, Send, AlertTriangle, BookOpen, CheckCircle2, HelpCircle, ShieldAlert, Lock, TrendingUp } from "lucide-react";
import AudioPlayer from "@/components/exam/AudioPlayer";
import AudioRecorder from "@/components/exam/AudioRecorder";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { motion, AnimatePresence } from "framer-motion";
import { useProctoring } from "@/hooks/useProctoring";

const logActivity = async (userId: string, action: string, entityType: string, entityId: string, metadata?: any) => {
  try {
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata || null,
    });
  } catch (e) {
    // non-critical
  }
};

const ExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, { text: string; data: any; flagged: boolean }>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const autoSaveRef = useRef<NodeJS.Timeout>();
  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const examRef = useRef(exam);

  // Proctoring system
  const proctoringEnabled = exam?.proctoring_enabled === true;
  const proctoring = useProctoring({
    attemptId: attemptId || "",
    userId: user?.id || "",
    proctoring_enabled: exam?.proctoring_enabled,
    fullscreen_required: exam?.fullscreen_required,
    tab_switch_limit: exam?.tab_switch_limit,
    max_warnings: exam?.max_warnings,
    auto_submit_on_violation: exam?.auto_submit_on_violation,
    screenshot_interval_seconds: exam?.screenshot_interval_seconds,
    webcam_required: exam?.webcam_required,
    record_audio: exam?.record_audio,
  }, proctoringEnabled && !submitted && !loading, () => {
    // Auto-submit callback when max strikes reached
    if (!submittedRef.current) {
      handleSubmitRef.current();
    }
  });

  // Keep refs in sync with state
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { examRef.current = exam; }, [exam]);

  // Load exam data
  useEffect(() => {
    if (!attemptId || !user) return;
    const load = async () => {
      const { data: attemptData } = await supabase
        .from("exam_attempts")
        .select("*, exams(*)")
        .eq("id", attemptId)
        .single();

      if (!attemptData || attemptData.user_id !== user.id) {
        navigate("/student/exams");
        return;
      }

      setAttempt(attemptData);

      // If already submitted/graded, show completed message with result
      if (attemptData.status !== "in_progress") {
        setSubmitted(true);
        setExam(attemptData.exams);
        setSubmissionResult({
          status: attemptData.status,
          score: attemptData.score,
          totalPoints: attemptData.total_points,
          percentage: attemptData.percentage,
          passed: attemptData.passed,
        });
        setLoading(false);
        return;
      }

      setExam(attemptData.exams);
      const elapsed = Math.floor((Date.now() - new Date(attemptData.started_at).getTime()) / 1000);
      setTimeLeft(Math.max(0, (attemptData.exams.time_limit_minutes || 60) * 60 - elapsed));
      setTabSwitches(attemptData.tab_switches || 0);

      // Log exam started
      logActivity(user.id, "exam_started", "exam_attempt", attemptId, { exam_id: attemptData.exam_id });

      // Use secure RPC to get questions without correct answers
      const { data: qs } = await supabase
        .rpc("get_exam_questions_for_student", { _exam_id: attemptData.exam_id });

      let questionList = qs || [];
      if (attemptData.exams.randomize_questions) {
        questionList = questionList.sort(() => Math.random() - 0.5);
      }
      setQuestions(questionList);

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

  const handleSubmitRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Timer — uses ref so auto-submit always has fresh data
  useEffect(() => {
    if (submitted || loading || !exam) return;
    if (timeLeft <= 0) {
      // Force auto-submit immediately when timer expires
      if (!submittedRef.current) {
        logger.log("Timer expired, auto-submitting...");
        handleSubmitRef.current();
      }
      return;
    }
    const interval = setInterval(() => setTimeLeft((t) => {
      const next = Math.max(0, t - 1);
      if (next === 0 && !submittedRef.current) {
        logger.log("Timer reached 0, triggering auto-submit...");
        // Use setTimeout to avoid state update conflicts
        setTimeout(() => handleSubmitRef.current(), 0);
      }
      return next;
    }), 1000);
    return () => clearInterval(interval);
  }, [timeLeft, loading, submitted, exam]);

  // Tab switch detection
  useEffect(() => {
    if (submitted) return;
    const handler = () => {
      if (document.hidden) {
        setTabSwitches((prev) => {
          const next = prev + 1;
          supabase.from("exam_attempts").update({ tab_switches: next }).eq("id", attemptId!);
          if (next >= 3) {
            toast({
              title: t("⚠️ Warning!", "⚠️ تحذير!"),
              description: t(
                "Tab switching detected! Your exam may be flagged.",
                "تم اكتشاف تبديل النوافذ! قد يتم تعليم امتحانك."
              ),
              variant: "destructive",
            });
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [attemptId, submitted]);

  // Auto-save every 30s
  useEffect(() => {
    if (submitted) return;
    autoSaveRef.current = setInterval(() => {
      saveAnswers();
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [answers, submitted]);

  // Prevent page refresh losing answers
  useEffect(() => {
    if (submitted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitted]);

  const saveAnswers = async () => {
    if (!attemptId || submittedRef.current) return;
    for (const [qId, ans] of Object.entries(answers)) {
      const { data: existing } = await supabase
        .from("exam_answers")
        .select("id")
        .eq("attempt_id", attemptId)
        .eq("question_id", qId)
        .maybeSingle();

      if (existing) {
        await supabase.from("exam_answers").update({
          answer_text: ans.text,
          answer_data: ans.data,
          is_flagged: ans.flagged,
        }).eq("id", existing.id);
      } else {
        await supabase.from("exam_answers").insert({
          attempt_id: attemptId,
          question_id: qId,
          answer_text: ans.text,
          answer_data: ans.data,
          is_flagged: ans.flagged,
        });
      }
    }
  };

  const setAnswer = (qId: string, text: string, data?: any) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text, data: data ?? prev[qId]?.data, flagged: prev[qId]?.flagged || false } }));
  };

  const toggleFlag = (qId: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text: prev[qId]?.text || "", data: prev[qId]?.data, flagged: !prev[qId]?.flagged } }));
  };

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setShowConfirm(false);

    const currentAnswers = answersRef.current;
    const currentQuestions = questionsRef.current;
    const currentExam = examRef.current;

    // Step 1: Save answers FIRST while attempt is still 'in_progress' (RLS requires this)
    if (attemptId) {
      for (const [qId, ans] of Object.entries(currentAnswers)) {
        if (!ans.text && !ans.data) continue;
        const { data: existing } = await supabase
          .from("exam_answers")
          .select("id")
          .eq("attempt_id", attemptId)
          .eq("question_id", qId)
          .maybeSingle();

        const ansPayload: any = {
          answer_text: ans.text || null,
          answer_data: ans.data || null,
          is_flagged: ans.flagged || false,
        };

        if (existing) {
          const { error: upErr } = await supabase.from("exam_answers").update(ansPayload).eq("id", existing.id);
          if (upErr) logger.error("Answer update error:", upErr);
        } else {
          const { error: insErr } = await supabase.from("exam_answers").insert({
            attempt_id: attemptId,
            question_id: qId,
            ...ansPayload,
          });
          if (insErr) logger.error("Answer insert error:", insErr);
        }
      }
    }

    // Step 2: Grade server-side via RPC (answers are already saved)
    const { data: gradeResult, error: gradeError } = await supabase.rpc("grade_exam_attempt", { _attempt_id: attemptId! });

    if (gradeError) {
      logger.error("Failed to grade exam:", gradeError);
      toast({ title: t("❌ Submission failed. Please try again.", "❌ فشل التقديم. حاول مرة أخرى."), variant: "destructive" });
      submittedRef.current = false;
      setSubmitting(false);
      return;
    }

    const result = gradeResult as any;
    setSubmissionResult({
      status: result.status,
      score: result.score,
      totalPoints: result.total_points,
      percentage: result.percentage,
      passed: result.passed,
    });
    setSubmitted(true);
    setSubmitting(false);
    toast({ title: t("✅ Exam Submitted!", "✅ تم تقديم الامتحان!") });

    // Log activity in background
    if (user) {
      logActivity(user.id, "exam_submitted", "exam_attempt", attemptId!, {
        exam_id: currentExam?.id,
        status: result.status,
        score: result.score,
        total_points: result.total_points,
        percentage: Math.round(result.percentage),
      });
    }
  }, [attemptId, user]);

  // Keep handleSubmit ref in sync for timer auto-submit
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  if (submitted && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="mx-4 w-full max-w-lg border-2">
          <CardContent className="p-8 text-center space-y-6">
            <div className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center ${
              submissionResult?.status === "graded"
                ? (submissionResult?.passed ? "bg-emerald/10" : "bg-destructive/10")
                : "bg-secondary/10"
            }`}>
              {submissionResult?.status === "graded" ? (
                submissionResult?.passed
                  ? <CheckCircle2 className="h-10 w-10 text-emerald" />
                  : <AlertTriangle className="h-10 w-10 text-destructive" />
              ) : (
                <Lock className="h-10 w-10 text-secondary" />
              )}
            </div>
            <h2 className="text-2xl font-bold">
              {submissionResult?.status === "graded"
                ? (submissionResult?.passed ? t("Exam Passed! 🎉", "نجحت في الامتحان! 🎉") : t("Exam Not Passed", "لم تجتز الامتحان"))
                : t("Exam Submitted", "تم تقديم الامتحان")
              }
            </h2>

            {submissionResult?.status === "graded" && (
              <div className="space-y-3">
                <div className="text-4xl font-bold">
                  <span className={submissionResult.passed ? "text-emerald" : "text-destructive"}>
                    {Math.round(submissionResult.percentage || 0)}%
                  </span>
                </div>
                <div className="flex justify-center gap-6 text-sm text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">{submissionResult.score}</span>
                    <span>/{submissionResult.totalPoints} {t("points", "نقاط")}</span>
                  </div>
                  <div>
                    <Badge variant={submissionResult.passed ? "default" : "destructive"}>
                      {submissionResult.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {submissionResult?.status === "submitted" && (
              <p className="text-muted-foreground">
                {t(
                  "Your exam has been submitted and is awaiting grading by your instructor. You will see your results once graded.",
                  "تم تقديم امتحانك وهو بانتظار التصحيح من مدرسك. ستظهر نتائجك بعد التصحيح."
                )}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              {t("You cannot re-enter this exam.", "لا يمكنك إعادة الدخول لهذا الامتحان.")}
            </p>

            <Button onClick={() => navigate("/student/exams")} className="w-full">
              {t("Back to Exams", "العودة إلى الامتحانات")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">{t("Loading your exam...", "جارٍ تحميل امتحانك...")}</p>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.text).length;
  const flaggedCount = Object.values(answers).filter((a) => a?.flagged).length;
  const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const isTimeCritical = timeLeft < 300;
  const isTimeWarning = timeLeft < 600 && timeLeft >= 300;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-4 w-full max-w-md"
          >
            <Card className="border-2 border-destructive/20">
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="h-7 w-7 text-destructive" />
                </div>
                <h3 className="text-xl font-bold">{t("Submit Exam?", "تقديم الامتحان؟")}</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{t("You have answered", "لقد أجبت على")} <strong className="text-foreground">{answeredCount}</strong> {t("of", "من")} <strong className="text-foreground">{questions.length}</strong> {t("questions", "سؤال")}</p>
                  {flaggedCount > 0 && (
                    <p className="text-secondary"><Flag className="inline h-3 w-3 mr-1" />{flaggedCount} {t("flagged for review", "معلّمة للمراجعة")}</p>
                  )}
                  <p className="font-medium text-destructive">{t("This action cannot be undone! The exam will be permanently locked.", "لا يمكن التراجع! سيتم قفل الامتحان نهائيًا.")}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                    {t("Go Back", "عودة")}
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? t("Submitting...", "جارٍ التقديم...") : t("Submit Now", "قدّم الآن")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Sticky Header */}
      <div className="shrink-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <BookOpen className="h-5 w-5 text-primary shrink-0 hidden sm:block" />
            <h2 className="text-sm sm:text-base font-semibold truncate">
              {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="gap-1 hidden sm:flex">
              <CheckCircle2 className="h-3 w-3 text-emerald" />
              {answeredCount}/{questions.length}
            </Badge>
            {flaggedCount > 0 && (
              <Badge variant="outline" className="gap-1 border-secondary/50 text-secondary hidden sm:flex">
                <Flag className="h-3 w-3" />
                {flaggedCount}
              </Badge>
            )}
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-bold transition-colors ${
              isTimeCritical ? "bg-destructive/10 text-destructive animate-pulse" :
              isTimeWarning ? "bg-secondary/10 text-secondary" :
              "bg-primary/10 text-primary"
            }`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
            {tabSwitches > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" /> {tabSwitches}
              </Badge>
            )}
            {proctoringEnabled && (
              <Badge variant={proctoring.suspicionLevel === "low" ? "outline" : "destructive"} className="text-xs gap-1">
                <ShieldAlert className="h-3 w-3" /> {Math.round(proctoring.integrityScore)}%
              </Badge>
            )}
            <Button size="sm" variant="destructive" onClick={() => setShowConfirm(true)} disabled={submitting} className="gap-1">
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">{t("Submit", "تقديم")}</span>
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none" />
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-0 overflow-hidden">
        {/* Left Panel: Question Navigation */}
        <div className="hidden lg:flex flex-col border-r bg-card/50 overflow-y-auto p-3">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            {t("Questions", "الأسئلة")}
          </h4>
          <div className="grid grid-cols-4 gap-1.5">
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id]?.text;
              const flagged = answers[qq.id]?.flagged;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentIdx(i)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    i === currentIdx ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30" :
                    flagged ? "bg-secondary/20 text-secondary border border-secondary/50" :
                    answered ? "bg-emerald/15 text-emerald border border-emerald/40" :
                    "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded bg-emerald/15 border border-emerald/40" />
              {t("Answered", "مُجاب")} ({answeredCount})
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded bg-secondary/20 border border-secondary/50" />
              {t("Flagged", "مُعلّم")} ({flaggedCount})
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded bg-muted" />
              {t("Unanswered", "غير مُجاب")} ({questions.length - answeredCount})
            </div>
          </div>
        </div>

        {/* Center Panel: Active Question */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="max-w-3xl mx-auto"
            >
              <Card className="border-2 shadow-lg">
                <CardContent className="p-5 sm:p-6">
                  {/* Question header */}
                  <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                        {currentIdx + 1}
                      </div>
                      <Badge variant="secondary" className="capitalize text-xs">
                        {q?.question_type?.replace("_", " ")}
                      </Badge>
                      {q?.difficulty && (
                        <Badge variant="outline" className={`text-xs ${
                          q.difficulty === "hard" ? "border-destructive/50 text-destructive" :
                          q.difficulty === "easy" ? "border-emerald/50 text-emerald" : ""
                        }`}>
                          {q.difficulty}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{q?.points || 1} {t("pts", "نقاط")}</Badge>
                      <Button
                        variant={answers[q?.id]?.flagged ? "destructive" : "ghost"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => q && toggleFlag(q.id)}
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Question text — bilingual merge */}
                  <div className="mb-4">
                    {q?.question_text ? (
                      <div
                        className="text-base sm:text-lg font-medium leading-relaxed prose prose-sm max-w-none"
                        dir="auto"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                      />
                    ) : null}
                    {q?.question_text_ar && q.question_text_ar !== q.question_text ? (
                      <div
                        className="arabic-exam-text mt-2 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }}
                      />
                    ) : null}
                    {!q?.question_text && !q?.question_text_ar && (
                      <p className="text-muted-foreground italic text-sm">Question text missing. Please contact administrator.</p>
                    )}
                    {q?.media_url && (q?.question_type === "audio" || q?.question_type === "dictation") && (
                      <div className="mt-3">
                        <AudioPlayer src={q.media_url} title={t("Listen carefully", "استمع بعناية")} maxPlays={3} />
                      </div>
                    )}
                    {q?.media_url && q?.question_type === "video" && (
                      <div className="mt-3 rounded-xl overflow-hidden border">
                        <video controls src={q.media_url} className="w-full max-h-60 object-contain bg-black" />
                      </div>
                    )}
                    {q?.media_url && isImageUrl(q.media_url) && !["audio", "dictation", "video"].includes(q?.question_type) && (
                      <div className="mt-3">
                        <img src={q.media_url} alt="Question media" className="max-h-60 rounded-lg border object-contain" />
                      </div>
                    )}
                    {q?.media_url && !isImageUrl(q.media_url) && !["audio", "dictation", "video"].includes(q?.question_type) && (
                      <div className="mt-3">
                        <AudioPlayer src={q.media_url} title={t("Audio", "صوت")} />
                      </div>
                    )}
                  </div>

                  {/* Answer input */}
                  {(q?.question_type === "mcq" || q?.question_type === "image_mcq") && q.options && (
                    <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                      <div className={q.question_type === "image_mcq" ? "grid grid-cols-2 gap-3" : "space-y-2"}>
                        {(q.options as any[]).map((opt: any, idx: number) => {
                          const isSelected = answers[q.id]?.text === opt.id;
                          return (
                            <div
                              key={opt.id}
                              className={`flex ${q.question_type === "image_mcq" ? "flex-col" : "flex-row"} items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all ${
                                isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-accent/50"
                              }`}
                              onClick={() => setAnswer(q.id, opt.id)}
                            >
                              {opt.image_url && (
                                <img src={opt.image_url} alt={`Option ${String.fromCharCode(65 + idx)}`} className="h-24 w-full object-contain rounded-lg" />
                              )}
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                                <Label htmlFor={`${q.id}-${opt.id}`} className="cursor-pointer flex-1 text-sm">
                                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                    {String.fromCharCode(65 + idx)}
                                  </span>
                                  <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text || "") }} />
                                  {opt.text_ar && opt.text_ar !== opt.text && (
                                    <span className="arabic-exam-text block mt-0.5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text_ar) }} />
                                  )}
                                </Label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </RadioGroup>
                  )}

                  {q?.question_type === "true_false" && (
                    <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { v: "true", l: t("True", "صح"), emoji: "✓" },
                          { v: "false", l: t("False", "خطأ"), emoji: "✗" },
                        ].map((opt) => {
                          const isSelected = answers[q.id]?.text === opt.v;
                          return (
                            <div
                              key={opt.v}
                              className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all text-center ${
                                isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30"
                              }`}
                              onClick={() => setAnswer(q.id, opt.v)}
                            >
                              <RadioGroupItem value={opt.v} id={opt.v} className="sr-only" />
                              <Label htmlFor={opt.v} className="cursor-pointer text-base font-semibold">
                                <span className="block text-xl mb-0.5">{opt.emoji}</span>
                                {opt.l}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </RadioGroup>
                  )}

                  {q?.question_type === "fill_blank" && (
                    <Input
                      placeholder={t("Type your answer here...", "اكتب إجابتك هنا...")}
                      value={answers[q.id]?.text || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      className="h-12 text-base"
                    />
                  )}

                  {(q?.question_type === "short_answer" || q?.question_type === "essay") && (
                    <Textarea
                      placeholder={t("Write your answer here...", "اكتب إجابتك هنا...")}
                      rows={q.question_type === "essay" ? 8 : 4}
                      value={answers[q.id]?.text || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      className="text-sm leading-relaxed resize-none"
                    />
                  )}

                  {(q?.question_type === "audio" || q?.question_type === "dictation") && (
                    <div className="space-y-3">
                      <Textarea
                        placeholder={t("Write what you heard...", "اكتب ما سمعته...")}
                        rows={3}
                        value={answers[q.id]?.text || ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="text-sm"
                      />
                      <div>
                        <p className="text-xs font-medium mb-1.5 text-muted-foreground">
                          {t("Or record your answer:", "أو سجّل إجابتك:")}
                        </p>
                        <AudioRecorder
                          onRecordingComplete={async (blob, url) => {
                            if (blob.size === 0) {
                              toast({ title: t("Recording is empty. Please try again.", "التسجيل فارغ. حاول مرة أخرى."), variant: "destructive" });
                              return;
                            }
                            const ext = "webm";
                            const path = `student-answers/${user!.id}/${attemptId}_${q.id}.${ext}`;
                            const { error } = await supabase.storage.from("exam-media").upload(path, blob, { upsert: true });
                            if (!error) {
                             const { data: urlData } = await supabase.storage.from("exam-media").createSignedUrl(path, 3600);
                              setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: urlData?.signedUrl || url, fileType: "audio" });
                            } else {
                              toast({ title: t("Audio upload failed. Please try again.", "فشل رفع الصوت. حاول مرة أخرى."), variant: "destructive" });
                              setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: url, fileType: "audio" });
                            }
                          }}
                          existingUrl={answers[q.id]?.data?.audioUrl}
                        />
                      </div>
                    </div>
                  )}

                  {/* Navigation buttons */}
                  <div className="mt-5 flex justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentIdx === 0}
                      onClick={() => setCurrentIdx(currentIdx - 1)}
                    >
                      {t("← Previous", "← السابق")}
                    </Button>
                    {currentIdx === questions.length - 1 ? (
                      <Button size="sm" onClick={() => setShowConfirm(true)} className="bg-emerald hover:bg-emerald/90">
                        <Send className="mr-1 h-3.5 w-3.5" />
                        {t("Review & Submit", "مراجعة وتقديم")}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setCurrentIdx(currentIdx + 1)}>
                        {t("Next →", "التالي →")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Panel: Timer + Summary */}
        <div className="hidden lg:flex flex-col border-l bg-card/50 overflow-y-auto p-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Time Remaining", "الوقت المتبقي")}</p>
              <div className={`text-2xl font-mono font-bold ${
                isTimeCritical ? "text-destructive animate-pulse" :
                isTimeWarning ? "text-secondary" :
                "text-primary"
              }`}>
                {formatTime(timeLeft)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Answered", "مُجاب")}</span>
                <span className="font-semibold text-emerald">{answeredCount}/{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Flagged", "مُعلّم")}</span>
                <span className="font-semibold text-secondary">{flaggedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Unanswered", "غير مُجاب")}</span>
                <span className="font-semibold">{questions.length - answeredCount}</span>
              </div>
              {tabSwitches > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tab Switches", "تبديل النوافذ")}</span>
                  <span className="font-semibold text-destructive">{tabSwitches}</span>
                </div>
              )}
              <Progress value={progressPercent} className="h-1.5 mt-1" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-1 text-[11px] text-muted-foreground">
              <p><strong>{t("Pass Mark:", "درجة النجاح:")}</strong> {exam?.passing_score}%</p>
              <p><strong>{t("Questions:", "الأسئلة:")}</strong> {questions.length}</p>
              {exam?.guidelines && (
                <div className="mt-1.5 rounded bg-accent/50 p-1.5 text-[10px]">
                  <p className="font-medium text-foreground mb-0.5">{t("Guidelines:", "الإرشادات:")}</p>
                  <p>{language === "ar" ? exam.guidelines_ar || exam.guidelines : exam.guidelines}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mobile bottom bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id]?.text;
              const flagged = answers[qq.id]?.flagged;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentIdx(i)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    i === currentIdx ? "bg-primary text-primary-foreground shadow" :
                    flagged ? "bg-secondary/20 text-secondary" :
                    answered ? "bg-emerald/15 text-emerald" :
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Utility to detect if a URL is an image
function isImageUrl(url: string): boolean {
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
  const lower = url.toLowerCase().split("?")[0];
  return imageExts.some((ext) => lower.endsWith(ext));
}

export default ExamTaking;
