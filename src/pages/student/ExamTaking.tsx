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
import { Clock, Flag, ChevronLeft, ChevronRight, Send, AlertTriangle, BookOpen, CheckCircle2, HelpCircle } from "lucide-react";
import AudioPlayer from "@/components/exam/AudioPlayer";
import AudioRecorder from "@/components/exam/AudioRecorder";
import { motion, AnimatePresence } from "framer-motion";

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
  const [showConfirm, setShowConfirm] = useState(false);
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
            toast({
              title: t("⚠️ Warning!", "⚠️ تحذير!"),
              description: t(
                "Tab switching detected! Your exam may be flagged for suspicious activity.",
                "تم اكتشاف تبديل النوافذ! قد يتم تعليم امتحانك بنشاط مشبوه."
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
  }, [attemptId]);

  // Auto-save every 30s
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      saveAnswers();
      toast({ title: t("✓ Auto-saved", "✓ تم الحفظ التلقائي"), duration: 1500 });
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [answers]);

  const saveAnswers = async () => {
    if (!attemptId) return;
    for (const [qId, ans] of Object.entries(answers)) {
      // Check if answer already exists
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
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text, data: data ?? prev[qId]?.data, flagged: prev[qId]?.flagged || false } }));
  };

  const toggleFlag = (qId: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], text: prev[qId]?.text || "", data: prev[qId]?.data, flagged: !prev[qId]?.flagged } }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await saveAnswers();

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

      if (isCorrect !== null) {
        earnedPoints += pts;
        await supabase.from("exam_answers").update({ is_correct: isCorrect, points_awarded: pts }).eq("attempt_id", attemptId!).eq("question_id", q.id);
      }
    }

    const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const hasSubjective = questions.some((q) => ["short_answer", "essay", "audio"].includes(q.question_type));

    await supabase.from("exam_attempts").update({
      status: hasSubjective ? "submitted" : "graded",
      submitted_at: new Date().toISOString(),
      score: earnedPoints,
      total_points: totalPoints,
      percentage,
      passed: percentage >= (exam?.passing_score || 50),
    }).eq("id", attemptId!);

    toast({ title: t("✅ Exam Submitted!", "✅ تم تقديم الامتحان!") });
    navigate("/student/exams");
  };

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
    <div className="min-h-screen bg-background">
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
                  <Send className="h-7 w-7 text-destructive" />
                </div>
                <h3 className="text-xl font-bold">{t("Submit Exam?", "تقديم الامتحان؟")}</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{t("You have answered", "لقد أجبت على")} <strong className="text-foreground">{answeredCount}</strong> {t("of", "من")} <strong className="text-foreground">{questions.length}</strong> {t("questions", "سؤال")}</p>
                  {flaggedCount > 0 && (
                    <p className="text-secondary"><Flag className="inline h-3 w-3 mr-1" />{flaggedCount} {t("flagged for review", "معلّمة للمراجعة")}</p>
                  )}
                  <p className="font-medium text-destructive">{t("This action cannot be undone!", "لا يمكن التراجع عن هذا الإجراء!")}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                    {t("Go Back", "عودة")}
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => { setShowConfirm(false); handleSubmit(); }} disabled={submitting}>
                    {t("Submit Now", "قدّم الآن")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary hidden sm:block" />
            <h2 className="text-base sm:text-lg font-semibold truncate max-w-[200px] sm:max-w-none">
              {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Stats pills */}
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald" />
                {answeredCount}/{questions.length}
              </Badge>
              {flaggedCount > 0 && (
                <Badge variant="outline" className="gap-1 border-secondary/50 text-secondary">
                  <Flag className="h-3 w-3" />
                  {flaggedCount}
                </Badge>
              )}
            </div>

            {/* Timer */}
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-bold transition-colors ${
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

            <Button size="sm" variant="destructive" onClick={() => setShowConfirm(true)} disabled={submitting} className="gap-1">
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">{t("Submit", "تقديم")}</span>
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none" />
      </div>

      <div className="container mx-auto grid gap-4 px-4 py-4 lg:grid-cols-[1fr_280px]">
        {/* Question area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-2 shadow-lg">
              <CardContent className="p-5 sm:p-8">
                {/* Question header */}
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                      {currentIdx + 1}
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {q?.question_type?.replace("_", " ")}
                    </Badge>
                    {q?.difficulty && (
                      <Badge variant="outline" className={
                        q.difficulty === "hard" ? "border-destructive/50 text-destructive" :
                        q.difficulty === "easy" ? "border-emerald/50 text-emerald" : ""
                      }>
                        {q.difficulty}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{q?.points || 1} {t("pts", "نقاط")}</Badge>
                    <Button
                      variant={answers[q?.id]?.flagged ? "destructive" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => q && toggleFlag(q.id)}
                      title={t("Flag for review", "علّم للمراجعة")}
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Question text */}
                <div className="mb-6">
                  <p className="text-lg sm:text-xl font-medium leading-relaxed">
                    {language === "ar" ? q?.question_text_ar || q?.question_text : q?.question_text}
                  </p>

                  {/* Audio question */}
                  {q?.media_url && (q?.question_type === "audio" || q?.question_type === "dictation") && (
                    <div className="mt-4">
                      <AudioPlayer src={q.media_url} title={t("Listen carefully", "استمع بعناية")} maxPlays={3} />
                    </div>
                  )}

                  {/* Video question */}
                  {q?.media_url && q?.question_type === "video" && (
                    <div className="mt-4 rounded-xl overflow-hidden border">
                      <video controls src={q.media_url} className="w-full max-h-80 object-contain bg-black" />
                    </div>
                  )}

                  {/* Generic media for other types */}
                  {q?.media_url && !["audio", "dictation", "video"].includes(q?.question_type) && (
                    <div className="mt-4">
                      <AudioPlayer src={q.media_url} title={t("Audio", "صوت")} />
                    </div>
                  )}
                </div>

                {/* Answer input based on type */}
                {q?.question_type === "mcq" && q.options && (
                  <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                    <div className="space-y-3">
                      {(q.options as any[]).map((opt: any, idx: number) => {
                        const isSelected = answers[q.id]?.text === opt.id;
                        return (
                          <motion.div
                            key={opt.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-accent/50"
                            }`}
                            onClick={() => setAnswer(q.id, opt.id)}
                          >
                            <RadioGroupItem value={opt.id} id={opt.id} />
                            <Label htmlFor={opt.id} className="cursor-pointer flex-1 text-base">
                              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                {String.fromCharCode(65 + idx)}
                              </span>
                              {language === "ar" ? opt.text_ar || opt.text : opt.text}
                            </Label>
                          </motion.div>
                        );
                      })}
                    </div>
                  </RadioGroup>
                )}

                {q?.question_type === "true_false" && (
                  <RadioGroup value={answers[q.id]?.text || ""} onValueChange={(v) => setAnswer(q.id, v)}>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { v: "true", l: t("True", "صح"), emoji: "✓" },
                        { v: "false", l: t("False", "خطأ"), emoji: "✗" },
                      ].map((opt) => {
                        const isSelected = answers[q.id]?.text === opt.v;
                        return (
                          <div
                            key={opt.v}
                            className={`flex items-center justify-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all text-center ${
                              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30"
                            }`}
                            onClick={() => setAnswer(q.id, opt.v)}
                          >
                            <RadioGroupItem value={opt.v} id={opt.v} className="sr-only" />
                            <Label htmlFor={opt.v} className="cursor-pointer text-lg font-semibold">
                              <span className="block text-2xl mb-1">{opt.emoji}</span>
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
                    className="h-14 text-lg"
                  />
                )}

                {(q?.question_type === "short_answer" || q?.question_type === "essay") && (
                  <Textarea
                    placeholder={t("Write your answer here...", "اكتب إجابتك هنا...")}
                    rows={q.question_type === "essay" ? 10 : 5}
                    value={answers[q.id]?.text || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className="text-base leading-relaxed resize-y"
                  />
                )}

                {/* Audio recording answer (for dictation/audio questions) */}
                {(q?.question_type === "audio" || q?.question_type === "dictation") && (
                  <div className="space-y-3">
                    <Textarea
                      placeholder={t("Write what you heard...", "اكتب ما سمعته...")}
                      rows={4}
                      value={answers[q.id]?.text || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      className="text-base"
                    />
                    <div>
                      <p className="text-sm font-medium mb-2 text-muted-foreground">
                        {t("Or record your answer:", "أو سجّل إجابتك:")}
                      </p>
                      <AudioRecorder
                        onRecordingComplete={async (blob, url) => {
                          // Upload to storage
                          const ext = "webm";
                          const path = `student-answers/${user!.id}/${attemptId}_${q.id}.${ext}`;
                          const { error } = await supabase.storage.from("exam-media").upload(path, blob, { upsert: true });
                          if (!error) {
                            const { data: urlData } = supabase.storage.from("exam-media").getPublicUrl(path);
                            setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: urlData.publicUrl });
                          } else {
                            // Fallback to blob URL
                            setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: url });
                          }
                        }}
                        existingUrl={answers[q.id]?.data?.audioUrl}
                      />
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="mt-8 flex justify-between">
                  <Button
                    variant="outline"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx(currentIdx - 1)}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("Previous", "السابق")}
                  </Button>
                  {currentIdx === questions.length - 1 ? (
                    <Button onClick={() => setShowConfirm(true)} className="gap-1 bg-emerald hover:bg-emerald/90">
                      <Send className="h-4 w-4" />
                      {t("Review & Submit", "مراجعة وتقديم")}
                    </Button>
                  ) : (
                    <Button onClick={() => setCurrentIdx(currentIdx + 1)} className="gap-1">
                      {t("Next", "التالي")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Question navigator sidebar */}
        <div className="space-y-4">
          <Card className="shadow-lg">
            <CardContent className="p-4">
              <h4 className="mb-3 text-sm font-semibold flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                {t("Questions", "الأسئلة")}
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                  const answered = !!answers[q.id]?.text;
                  const flagged = answers[q.id]?.flagged;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIdx(i)}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                        i === currentIdx ? "bg-primary text-primary-foreground shadow-md scale-110" :
                        flagged ? "bg-secondary/20 text-secondary border-2 border-secondary/50" :
                        answered ? "bg-emerald/15 text-emerald border-2 border-emerald/40" :
                        "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-emerald/15 border-2 border-emerald/40" />
                  {t("Answered", "مُجاب")} ({answeredCount})
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-secondary/20 border-2 border-secondary/50" />
                  {t("Flagged", "مُعلّم")} ({flaggedCount})
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-muted" />
                  {t("Unanswered", "غير مُجاب")} ({questions.length - answeredCount})
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exam info card */}
          <Card>
            <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
              <p><strong>{t("Time Limit:", "الحد الزمني:")}</strong> {exam?.time_limit_minutes} {t("minutes", "دقيقة")}</p>
              <p><strong>{t("Pass Mark:", "درجة النجاح:")}</strong> {exam?.passing_score}%</p>
              <p><strong>{t("Questions:", "الأسئلة:")}</strong> {questions.length}</p>
              {exam?.guidelines && (
                <div className="mt-2 rounded-lg bg-accent/50 p-2">
                  <p className="font-medium text-foreground">{t("Guidelines:", "الإرشادات:")}</p>
                  <p>{language === "ar" ? exam.guidelines_ar || exam.guidelines : exam.guidelines}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ExamTaking;
