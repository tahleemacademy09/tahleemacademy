import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, ArrowLeft, Clock, Play, Pause, Volume2, FileText, Image, Download } from "lucide-react";

const ExamResults = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      setExam(attemptData.exams);

      const [questionsRes, answersRes] = await Promise.all([
        supabase.from("exam_questions").select("*").eq("exam_id", attemptData.exam_id).order("sort_order"),
        supabase.from("exam_answers").select("*").eq("attempt_id", attemptId),
      ]);

      setQuestions(questionsRes.data || []);
      setAnswers(answersRes.data || []);
      setLoading(false);
    };
    load();
  }, [attemptId, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!attempt || !exam) return null;

  const totalPts = questions.reduce((s, q) => s + (q.points || 1), 0);
  const earnedPts = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
  const pct = attempt.percentage != null ? Math.round(attempt.percentage) : (totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : 0);
  const passed = attempt.passed;
  const isGraded = attempt.status === "graded";
  const allowReview = exam.allow_review !== false;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/student/exams")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{language === "ar" ? exam.title_ar || exam.title : exam.title}</h1>
          <p className="text-sm text-muted-foreground">
            {isGraded ? t("Graded", "مُصحّح") : t("Awaiting Grade", "بانتظار التصحيح")}
            {attempt.submitted_at && ` • ${new Date(attempt.submitted_at).toLocaleString()}`}
          </p>
        </div>
      </div>

      {/* Score Summary */}
      <Card className="mb-6">
        <CardContent className="p-6 text-center space-y-3">
          {isGraded ? (
            <>
              <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${passed ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                {passed ? <CheckCircle className="h-8 w-8 text-emerald-500" /> : <XCircle className="h-8 w-8 text-destructive" />}
              </div>
              <div className="text-4xl font-bold">
                <span className={passed ? "text-emerald-500" : "text-destructive"}>{pct}%</span>
              </div>
              <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                <span><strong>{earnedPts}</strong>/{totalPts} {t("points", "نقاط")}</span>
                <Badge variant={passed ? "default" : "destructive"}>
                  {passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
                </Badge>
              </div>
              {attempt.feedback && (
                <p className="text-sm text-muted-foreground mt-2">{attempt.feedback}</p>
              )}
            </>
          ) : (
            <>
              <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-lg font-semibold">{t("Awaiting Grading", "بانتظار التصحيح")}</p>
              <p className="text-sm text-muted-foreground">{t("Your instructor will grade this exam soon.", "سيقوم مدرسك بتصحيح هذا الامتحان قريبًا.")}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Answer Sheet */}
      {allowReview && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mb-3">{t("Answer Sheet", "ورقة الإجابة")}</h2>
          {questions.map((q, i) => {
            const ans = answers.find((a) => a.question_id === q.id);
            return (
              <Card key={q.id} className={isGraded ? (ans?.is_correct ? "border-emerald-500/30" : ans?.is_correct === false ? "border-destructive/30" : "") : ""}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{t("Q", "س")} {i + 1}</Badge>
                    <Badge variant="secondary" className="text-xs">{q.question_type}</Badge>
                    <span className="text-xs text-muted-foreground">{q.points} {t("pts", "نقاط")}</span>
                    {isGraded && ans?.is_correct === true && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    {isGraded && ans?.is_correct === false && <XCircle className="h-4 w-4 text-destructive" />}
                    {isGraded && ans && <span className="text-xs font-medium">{ans.points_awarded || 0}/{q.points || 1}</span>}
                  </div>

                  <p className="mb-2 font-medium text-sm" dir={language === "ar" ? "rtl" : "ltr"}>
                    {language === "ar" ? q.question_text_ar || q.question_text : q.question_text}
                  </p>

                  {/* Student's Answer */}
                  <div className="rounded-lg bg-muted p-3 mb-2">
                    <p className="text-xs font-medium mb-1">{t("Your Answer", "إجابتك")}:</p>
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
                    {ans?.answer_data?.audioUrl && <MediaPreview src={ans.answer_data.audioUrl} label={t("Your Recording", "تسجيلك")} />}
                    {ans?.answer_data?.fileUrl && <MediaPreview src={ans.answer_data.fileUrl} label={t("Your File", "ملفك")} />}
                  </div>

                  {/* Correct Answer (only after grading) */}
                  {isGraded && exam.show_results_immediately !== false && (
                    <>
                      {q.question_type === "mcq" && q.options && (
                        <p className="text-xs text-emerald-500">
                          {t("Correct", "صحيح")}: {(q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => language === "ar" ? o.text_ar || o.text : o.text).join(", ")}
                        </p>
                      )}
                      {q.correct_answer && (
                        <p className="text-xs text-emerald-500">{t("Correct Answer", "الإجابة الصحيحة")}: {q.correct_answer}</p>
                      )}
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === "ar" ? q.explanation_ar || q.explanation : q.explanation}
                        </p>
                      )}
                    </>
                  )}

                  {/* Feedback */}
                  {isGraded && ans?.feedback && (
                    <div className="mt-2 rounded bg-accent/50 p-2">
                      <p className="text-xs font-medium">{t("Feedback", "ملاحظات")}:</p>
                      <p className="text-xs" dir="auto">{ans.feedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Button onClick={() => navigate("/student/exams")} className="w-full">
          {t("Back to Exams", "العودة إلى الامتحانات")}
        </Button>
      </div>
    </div>
  );
};

const MediaPreview = ({ src, label }: { src: string; label: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const lower = src.toLowerCase().split("?")[0];
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].some(ext => lower.endsWith(ext));
  const isPdf = lower.endsWith(".pdf");

  if (isImage) return (
    <div className="mt-1">
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3 w-3" />{label}</p>
      <img src={src} alt={label} className="max-h-48 rounded-lg border object-contain" />
    </div>
  );

  if (isPdf) return (
    <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-2 mt-1">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs flex-1">{label}</span>
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1"><Download className="h-3 w-3" />View</a>
    </div>
  );

  return (
    <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-2 mt-1">
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
        if (!audioRef.current) return;
        playing ? audioRef.current.pause() : audioRef.current.play();
        setPlaying(!playing);
      }}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Volume2 className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

export default ExamResults;
