/**
 * Entrance Exam Taking — A simplified wrapper around the regular exam flow.
 * Uses the same exam_attempts + exam_questions tables.
 * After submission, redirects to the entrance results page instead of regular results.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, Flag, Send, CheckCircle2, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const EntranceExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const submittedRef = useRef(false);
  const answersRef = useRef(answers);

  useEffect(() => { answersRef.current = answers; }, [answers]);

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
        navigate("/onboarding");
        return;
      }

      if (attemptData.status !== "in_progress") {
        navigate(`/student/entrance-results/${attemptId}`);
        return;
      }

      setAttempt(attemptData);
      const examData = attemptData.exams as any;
      setExam(examData);

      // Calculate time left
      const startedAt = new Date(attemptData.started_at).getTime();
      const limitMs = (examData.time_limit_minutes || 15) * 60 * 1000;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.floor((limitMs - elapsed) / 1000));
      setTimeLeft(remaining);

      // Load questions using the secure function
      const { data: qs } = await supabase.rpc("get_exam_questions_for_student", {
        _exam_id: examData.id,
      });
      setQuestions(qs || []);

      // Load existing answers
      const { data: existingAnswers } = await supabase
        .from("exam_answers")
        .select("question_id, answer_text")
        .eq("attempt_id", attemptId);

      if (existingAnswers) {
        const ansMap: Record<string, string> = {};
        existingAnswers.forEach((a: any) => { ansMap[a.question_id] = a.answer_text || ""; });
        setAnswers(ansMap);
      }

      setLoading(false);
    };
    load();
  }, [attemptId, user]);

  // Timer
  useEffect(() => {
    if (loading || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!submittedRef.current) handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const saveAnswer = async (questionId: string, answerText: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answerText }));

    // Upsert answer
    const { data: existing } = await supabase
      .from("exam_answers")
      .select("id")
      .eq("attempt_id", attemptId!)
      .eq("question_id", questionId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("exam_answers")
        .update({ answer_text: answerText, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("exam_answers").insert({
        attempt_id: attemptId!,
        question_id: questionId,
        answer_text: answerText,
      });
    }
  };

  const handleSubmit = async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);

    try {
      // Save all current answers first
      const currentAnswers = answersRef.current;
      for (const [qId, ansText] of Object.entries(currentAnswers)) {
        if (ansText) {
          const { data: existing } = await supabase
            .from("exam_answers")
            .select("id")
            .eq("attempt_id", attemptId!)
            .eq("question_id", qId)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("exam_answers")
              .update({ answer_text: ansText, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
          } else {
            await supabase.from("exam_answers").insert({
              attempt_id: attemptId!,
              question_id: qId,
              answer_text: ansText,
            });
          }
        }
      }

      // Grade using existing function
      const { data: result } = await supabase.rpc("grade_exam_attempt", {
        _attempt_id: attemptId!,
      });

      navigate(`/student/entrance-results/${attemptId}`, { replace: true });
    } catch (err) {
      toast({ title: "Submission error", variant: "destructive" });
      submittedRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#c9973a", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const q = questions[currentIdx];
  const answered = Object.keys(answers).filter((k) => answers[k]).length;
  const isWarning = timeLeft < 60;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f3122 0%, #1a4a35 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
        .entrance-exam { font-family: 'Cairo', sans-serif; }
        .amiri { font-family: 'Amiri', serif; }
      `}</style>

      <div className="entrance-exam max-w-3xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 text-white">
          <div>
            <h1 className="text-lg font-bold">Entrance Exam</h1>
            <p className="amiri text-sm" style={{ color: "#c9973a" }}>اختبار القبول</p>
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full font-bold"
            style={{
              background: isWarning ? "rgba(239,68,68,0.2)" : "rgba(201,151,58,0.15)",
              color: isWarning ? "#ef4444" : "#c9973a",
            }}
          >
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            <span>{answered}/{questions.length} answered</span>
            <span>Q{currentIdx + 1} of {questions.length}</span>
          </div>
          <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${(answered / questions.length) * 100}%`, background: "#c9973a" }}
            />
          </div>
        </div>

        {/* Question navigation pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIdx(idx)}
              className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
              style={{
                background:
                  idx === currentIdx
                    ? "#c9973a"
                    : answers[questions[idx]?.id]
                    ? "rgba(34,197,94,0.3)"
                    : "rgba(255,255,255,0.08)",
                color:
                  idx === currentIdx ? "#fff" : answers[questions[idx]?.id] ? "#22c55e" : "rgba(255,255,255,0.4)",
                border: idx === currentIdx ? "2px solid #e8c070" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        {/* Question Card */}
        {q && (
          <motion.div key={currentIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-0 shadow-xl" style={{ background: "#fdf8f0" }}>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <Badge variant="outline" style={{ color: "#c9973a", borderColor: "#c9973a" }}>
                    Q{currentIdx + 1}
                  </Badge>
                  <span className="text-xs" style={{ color: "#888" }}>
                    {q.question_type === "true_false" ? "True/False" : "Multiple Choice"}
                  </span>
                </div>

                {/* Question text */}
                <div className="space-y-2">
                  <p className="text-base font-semibold" style={{ color: "#0f3122" }}>
                    {q.question_text}
                  </p>
                  {q.question_text_ar && (
                    <p className="amiri text-base" dir="rtl" style={{ color: "#c9973a" }}>
                      {q.question_text_ar}
                    </p>
                  )}
                </div>

                {/* Options */}
                <RadioGroup
                  value={answers[q.id] || ""}
                  onValueChange={(val) => saveAnswer(q.id, val)}
                  className="space-y-2"
                >
                  {(q.options as any[])?.map((opt: any) => (
                    <Label
                      key={opt.id}
                      className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border-2"
                      style={{
                        borderColor: answers[q.id] === opt.id ? "#c9973a" : "#e5e5e5",
                        background: answers[q.id] === opt.id ? "rgba(201,151,58,0.08)" : "#fff",
                      }}
                    >
                      <RadioGroupItem value={opt.id} />
                      <span className="text-sm" style={{ color: "#333" }}>{opt.text}</span>
                    </Label>
                  ))}
                </RadioGroup>

                {/* Navigation */}
                <div className="flex justify-between pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                    disabled={currentIdx === 0}
                    className="text-sm"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>

                  {currentIdx < questions.length - 1 ? (
                    <Button
                      onClick={() => setCurrentIdx(currentIdx + 1)}
                      className="text-sm"
                      style={{ background: "#c9973a", color: "#fff" }}
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowConfirm(true)}
                      className="text-sm"
                      style={{ background: "#c9973a", color: "#fff" }}
                    >
                      <Send className="h-4 w-4 mr-1" /> Submit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Submit confirmation */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-sm border-0" style={{ background: "#fdf8f0" }}>
              <CardContent className="p-6 text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: "#c9973a" }} />
                <h3 className="text-lg font-bold" style={{ color: "#0f3122" }}>Submit Exam?</h3>
                <p className="text-sm" style={{ color: "#666" }}>
                  You answered {answered} of {questions.length} questions.
                  {answered < questions.length && (
                    <span className="block mt-1 font-semibold" style={{ color: "#ef4444" }}>
                      {questions.length - answered} questions unanswered!
                    </span>
                  )}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(false)}
                    className="flex-1"
                  >
                    Go Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1"
                    style={{ background: "#c9973a", color: "#fff" }}
                  >
                    {submitting ? "Submitting..." : "Confirm Submit"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default EntranceExamTaking;
