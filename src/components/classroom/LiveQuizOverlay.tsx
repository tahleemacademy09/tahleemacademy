import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Check, X, Timer } from "lucide-react";

interface LiveQuizOverlayProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const LiveQuizOverlay = ({ sessionId, isOpen, onClose }: LiveQuizOverlayProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  // Creation form
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("0");
  const [timeLimit, setTimeLimit] = useState("30");

  // Active quiz
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [timer, setTimer] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("class_quiz_live")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.length) {
        setActiveQuiz(data[0]);
        setTimer(data[0].time_limit_seconds);
      }
    };
    load();

    const channel = supabase.channel(`quiz-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_quiz_live", filter: `session_id=eq.${sessionId}` },
        () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Timer countdown
  useEffect(() => {
    if (!activeQuiz || timer <= 0 || submitted) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          setShowResult(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeQuiz, submitted]);

  const launchQuiz = async () => {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    await supabase.from("class_quiz_live").insert({
      session_id: sessionId,
      question: question.trim(),
      options: validOptions.map((o, i) => ({ index: i, text: o.trim() })),
      correct_answer: parseInt(correctAnswer),
      time_limit_seconds: parseInt(timeLimit),
      created_by: user?.id,
    });
    setQuestion("");
    setOptions(["", "", "", ""]);
    onClose();
  };

  const submitAnswer = async () => {
    if (selectedAnswer === null || !activeQuiz) return;
    setSubmitted(true);
    setShowResult(true);
    // Store answer in poll_answers table reusing structure
    await supabase.from("class_poll_answers").insert({
      poll_id: activeQuiz.id,
      student_id: user!.id,
      answer_index: selectedAnswer,
    });
  };

  const endQuiz = async () => {
    if (activeQuiz) {
      await supabase.from("class_quiz_live").update({ is_active: false }).eq("id", activeQuiz.id);
      setActiveQuiz(null);
      setShowResult(false);
      setSubmitted(false);
      setSelectedAnswer(null);
    }
  };

  // Active quiz overlay for students
  if (activeQuiz && !isPrivileged) {
    const quizOptions = (activeQuiz.options as any[]) || [];
    const isCorrect = selectedAnswer === activeQuiz.correct_answer;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Badge className="bg-secondary/20 text-secondary gap-1"><Zap className="h-3 w-3" /> {t("Live Quiz", "اختبار مباشر")}</Badge>
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className={`font-mono text-lg font-bold ${timer <= 5 ? "text-destructive" : ""}`}>{timer}s</span>
              </div>
            </div>

            <Progress value={(timer / activeQuiz.time_limit_seconds) * 100} className="h-1.5" />

            <h3 className="text-lg font-bold">{activeQuiz.question}</h3>

            <div className="space-y-2">
              {quizOptions.map((opt: any) => {
                const isSelected = selectedAnswer === opt.index;
                const isCorrectOpt = opt.index === activeQuiz.correct_answer;
                let variant: "outline" | "default" | "destructive" = "outline";
                let extraClass = "";

                if (showResult) {
                  if (isCorrectOpt) extraClass = "border-green-500 bg-green-500/10 text-green-700";
                  else if (isSelected && !isCorrectOpt) extraClass = "border-destructive bg-destructive/10 text-destructive";
                } else if (isSelected) {
                  extraClass = "border-secondary bg-secondary/10";
                }

                return (
                  <Button
                    key={opt.index}
                    variant="outline"
                    className={`w-full justify-start h-auto py-3 text-left ${extraClass}`}
                    disabled={submitted || timer <= 0}
                    onClick={() => setSelectedAnswer(opt.index)}
                  >
                    <span className="font-bold mr-2">{String.fromCharCode(65 + opt.index)}.</span>
                    {opt.text}
                    {showResult && isCorrectOpt && <Check className="h-4 w-4 ml-auto text-green-500" />}
                    {showResult && isSelected && !isCorrectOpt && <X className="h-4 w-4 ml-auto text-destructive" />}
                  </Button>
                );
              })}
            </div>

            {!submitted && timer > 0 && selectedAnswer !== null && (
              <Button onClick={submitAnswer} className="w-full">{t("Submit Answer", "إرسال الإجابة")}</Button>
            )}

            {showResult && (
              <div className={`text-center py-2 rounded-lg ${isCorrect ? "bg-green-500/10" : "bg-destructive/10"}`}>
                <p className="font-bold text-lg">{isCorrect ? "✅ " + t("Correct!", "إجابة صحيحة!") : "❌ " + t("Wrong", "إجابة خاطئة")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Creation dialog for teachers
  if (!isPrivileged) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-secondary" /> {t("Launch Live Quiz", "إطلاق اختبار مباشر")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder={t("Question...", "السؤال...")}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{String.fromCharCode(65 + i)}</Badge>
              <Input
                placeholder={`${t("Option", "خيار")} ${String.fromCharCode(65 + i)}`}
                value={opt}
                onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">{t("Correct Answer", "الإجابة الصحيحة")}</label>
              <Select value={correctAnswer} onValueChange={setCorrectAnswer}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((_, i) => (
                    <SelectItem key={i} value={String(i)}>{String.fromCharCode(65 + i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">{t("Time Limit", "الوقت")}</label>
              <Select value={timeLimit} onValueChange={setTimeLimit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="45">45s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={launchQuiz} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
            <Zap className="h-4 w-4 mr-2" /> {t("Launch Quiz", "إطلاق الاختبار")}
          </Button>
          {activeQuiz && (
            <Button onClick={endQuiz} variant="destructive" className="w-full">
              {t("End Active Quiz", "إنهاء الاختبار")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveQuizOverlay;
