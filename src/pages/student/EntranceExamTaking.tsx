/**
 * EntranceExamTaking — Full CBT Interface with Proctoring
 * REUSES: exam_attempts, exam_questions, exam_answers tables
 * REUSES: useProctoring hook, ProctoringOverlay component
 * Routes: /student/entrance-exam/:attemptId
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProctoring } from "@/hooks/useProctoring";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { useTasjeel } from "@/hooks/useTasjeel";
import {
  Clock, Flag, Send, CheckCircle2, ChevronLeft, ChevronRight,
  Shield, AlertTriangle, BookOpen, Camera, Monitor
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

// ── Format seconds → MM:SS ────────────────────────────────────────────────
const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

// ── Strip HTML to plain text ──────────────────────────────────────────────
const stripHtml = (html: string) => {
  const d = new DOMParser().parseFromString(html || "", "text/html");
  return d.body.textContent || "";
};

// ── Pre-exam instructions overlay ────────────────────────────────────────
const PreExamInstructions = ({
  exam, procEnabled, onStart,
}: {
  exam: any; procEnabled: boolean; onStart: () => void;
}) => (
  <div style={{
    position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(160deg,#0a1f14 0%,#0f3122 60%,#061a0e 100%)",
  }}>
    {/* Islamic pattern overlay */}
    <div style={{ position: "absolute", inset: 0, opacity: 0.04,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='30,2 58,16 58,44 30,58 2,44 2,16' fill='none' stroke='%23c9a84c' stroke-width='1'/%3E%3C/svg%3E")`,
    }} />

    <div style={{
      position: "relative", zIndex: 1, maxWidth: 560, width: "100%",
      margin: "0 20px", background: "rgba(255,255,255,.03)",
      border: "1px solid rgba(201,168,76,.2)", borderRadius: 24, padding: "36px 32px",
    }}>
      {/* Bismillah */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <p style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: GOLD, margin: "0 0 8px", direction: "rtl" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>
          {exam?.title || "Entrance Examination"}
        </h1>
        <p style={{ fontSize: 13, color: GOLD, marginTop: 4, fontFamily: "'Amiri',serif" }}>اختبار القبول</p>
      </div>

      {/* Exam info strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { icon: "⏱️", v: `${exam?.time_limit_minutes || 15} min` },
          { icon: "❓", v: "Loading questions…" },
          { icon: "✅", v: `Pass: ${exam?.passing_score || 50}%` },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,.05)", borderRadius: 10, padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: 18, margin: "0 0 2px" }}>{s.icon}</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", margin: 0 }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,.08)" }}>
        <p style={{ fontWeight: 800, fontSize: 13, color: GOLD, margin: "0 0 12px", letterSpacing: 0.5 }}>📋 INSTRUCTIONS</p>
        {[
          "Read each question carefully before answering.",
          "Use the navigation grid to jump between questions.",
          "Your answers are auto-saved — no need to worry.",
          "You can flag questions to revisit them later.",
          "Submit only when you are ready — this is final.",
          "This test evaluates your current knowledge to place you in the correct level.",
        ].map((ins, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, minWidth: 20 }}>{i + 1}.</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", margin: 0, lineHeight: 1.6 }}>{ins}</p>
          </div>
        ))}
      </div>

      {/* Proctoring warning if enabled */}
      {procEnabled && (
        <div style={{ background: "rgba(239,68,68,.1)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, border: "1px solid rgba(239,68,68,.25)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Shield size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", margin: "0 0 4px" }}>🔒 Proctored Exam</p>
            <p style={{ fontSize: 12, color: "rgba(239,68,68,.8)", margin: 0, lineHeight: 1.6 }}>
              Your camera and activity will be monitored. Ensure your camera is on,
              you are in a quiet environment, and your face is clearly visible at all times.
              Tab switching and copy/paste are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Start button */}
      <button onClick={onStart} style={{
        width: "100%", padding: "16px", borderRadius: 14, border: "none",
        background: `linear-gradient(135deg,${G},${GM})`,
        color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        boxShadow: "0 8px 32px rgba(6,78,59,.5)",
      }}>
        <BookOpen size={18} /> Begin Exam
      </button>
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────
const EntranceExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user }      = useAuth();
  const { toast }     = useToast();
  const navigate      = useNavigate();
  const { advanceStep } = useTasjeel();

  const [exam, setExam]           = useState<any>(null);
  const [attempt, setAttempt]     = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers]     = useState<Record<string, string>>({});
  const [flagged, setFlagged]     = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [procConfig, setProcConfig] = useState<any>({});

  const submittedRef  = useRef(false);
  const answersRef    = useRef(answers);
  const timerRef      = useRef<any>(null);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attemptId || !user) return;
    (async () => {
      const { data: att } = await supabase
        .from("exam_attempts").select("*, exams(*)")
        .eq("id", attemptId).single();

      if (!att || att.user_id !== user.id) { navigate("/onboarding"); return; }
      if (att.status !== "in_progress") {
        navigate(`/student/entrance-results/${attemptId}`); return;
      }

      setAttempt(att);
      const ex = att.exams as any;
      setExam(ex);

      // Time remaining
      const elapsed = Date.now() - new Date(att.started_at).getTime();
      const limitMs  = (ex.time_limit_minutes || 15) * 60_000;
      setTimeLeft(Math.max(0, Math.floor((limitMs - elapsed) / 1000)));

      // Load questions (reuse existing RPC)
      const { data: qs } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: ex.id });
      setQuestions(qs || []);

      // Load existing saved answers
      const { data: ea } = await supabase
        .from("exam_answers").select("question_id, answer_text, is_flagged")
        .eq("attempt_id", attemptId);
      if (ea) {
        const am: Record<string, string> = {};
        const fl = new Set<string>();
        ea.forEach((a: any) => {
          if (a.answer_text) am[a.question_id] = a.answer_text;
          if (a.is_flagged)  fl.add(a.question_id);
        });
        setAnswers(am);
        setFlagged(fl);
      }

      // Load proctoring config from exam settings
      setProcConfig({
        proctoring_enabled:       ex.proctoring_enabled       ?? false,
        fullscreen_required:      ex.fullscreen_required      ?? false,
        tab_switch_limit:         ex.tab_switch_limit         ?? 3,
        max_warnings:             ex.max_warnings             ?? 3,
        auto_submit_on_violation: ex.auto_submit_on_violation ?? false,
        screenshot_interval_seconds: ex.screenshot_interval_seconds ?? 30,
        webcam_required:          ex.webcam_required          ?? false,
      });

      setLoading(false);
    })();
  }, [attemptId, user, navigate]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || showInstructions || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); if (!submittedRef.current) handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, showInstructions]);

  // ── Proctoring ────────────────────────────────────────────────────────────
  const procEnabled = !showInstructions && !loading && (procConfig.proctoring_enabled ?? false);
  const proc = useProctoring(
    { attemptId: attemptId!, userId: user?.id || "", ...procConfig },
    procEnabled,
    () => { if (!submittedRef.current) handleSubmit(); }
  );

  // ── Save answer ────────────────────────────────────────────────────────────
  const saveAnswer = useCallback(async (questionId: string, answerText: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answerText }));
    const { data: ex } = await supabase
      .from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", questionId).maybeSingle();
    if (ex) {
      await supabase.from("exam_answers").update({ answer_text: answerText, updated_at: new Date().toISOString() }).eq("id", ex.id);
    } else {
      await supabase.from("exam_answers").insert({ attempt_id: attemptId!, question_id: questionId, answer_text: answerText });
    }
  }, [attemptId]);

  // ── Toggle flag ────────────────────────────────────────────────────────────
  const toggleFlag = useCallback(async (questionId: string) => {
    const isNowFlagged = !flagged.has(questionId);
    setFlagged(prev => { const n = new Set(prev); isNowFlagged ? n.add(questionId) : n.delete(questionId); return n; });
    const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", questionId).maybeSingle();
    if (ex) {
      await supabase.from("exam_answers").update({ is_flagged: isNowFlagged }).eq("id", ex.id);
    }
  }, [flagged, attemptId]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    clearInterval(timerRef.current);

    try {
      // Flush all unsaved answers
      const cur = answersRef.current;
      for (const [qId, ans] of Object.entries(cur)) {
        if (ans) {
          const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", qId).maybeSingle();
          if (ex) await supabase.from("exam_answers").update({ answer_text: ans }).eq("id", ex.id);
          else     await supabase.from("exam_answers").insert({ attempt_id: attemptId!, question_id: qId, answer_text: ans });
        }
      }

      // Grade using existing function
      await supabase.rpc("grade_exam_attempt", { _attempt_id: attemptId! });

      // Advance Tasjeel step to "review"
      await advanceStep("review");

      navigate(`/student/entrance-results/${attemptId}`, { replace: true });
    } catch (err) {
      toast({ title: "Submission error — please try again", variant: "destructive" });
      submittedRef.current = false;
      setSubmitting(false);
    }
  }, [submitting, attemptId, navigate, advanceStep, toast]);

  // ── UI helpers ────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f3122" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (showInstructions) return (
    <PreExamInstructions exam={exam} procEnabled={procConfig.proctoring_enabled} onStart={() => setShowInstructions(false)} />
  );

  const q          = questions[currentIdx];
  const answered   = Object.keys(answers).filter(k => answers[k]).length;
  const isWarning  = timeLeft > 0 && timeLeft < 120;
  const isCritical = timeLeft > 0 && timeLeft < 30;
  const totalPts   = questions.reduce((s, q) => s + (q.points || 1), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0b1f14", fontFamily: "'Cairo',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes timerPulse{0%,100%{opacity:1}50%{opacity:.5}}
        .q-nav-btn:hover{opacity:.85}
      `}</style>

      {/* ── Proctoring overlay ── */}
      {procEnabled && (
        <ProctoringOverlay
          {...proc}
          attemptId={attemptId!}
          onPointDeduction={() => {}}
        />
      )}

      {/* ── TOP BAR ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(11,31,20,.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Exam title */}
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: "#fff", margin: 0 }}>{exam?.title || "Entrance Exam"}</p>
          <p style={{ fontSize: 11, color: GOLD, margin: 0, fontFamily: "'Amiri',serif" }}>اختبار القبول</p>
        </div>

        {/* Answered count */}
        <div style={{ textAlign: "center", padding: "4px 12px", background: "rgba(255,255,255,.06)", borderRadius: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "#fff", margin: 0 }}>{answered}<span style={{ color: "rgba(255,255,255,.4)", fontSize: 10 }}>/{questions.length}</span></p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,.4)", margin: 0 }}>answered</p>
        </div>

        {/* Timer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, fontWeight: 900, fontSize: 18,
          background: isCritical ? "rgba(239,68,68,.2)" : isWarning ? "rgba(245,158,11,.15)" : "rgba(201,168,76,.12)",
          color: isCritical ? "#ef4444" : isWarning ? "#f59e0b" : GOLD,
          border: `1.5px solid ${isCritical ? "rgba(239,68,68,.4)" : isWarning ? "rgba(245,158,11,.3)" : "rgba(201,168,76,.3)"}`,
          animation: isCritical ? "timerPulse 1s infinite" : "none",
        }}>
          <Clock size={16} /> {fmtTime(timeLeft)}
        </div>

        {/* Proctoring status */}
        {procEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, background: proc.cameraReady ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: proc.cameraReady ? "#22c55e" : "#ef4444" }} />
            <Camera size={12} color={proc.cameraReady ? "#22c55e" : "#ef4444"} />
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT: Left=Question, Right=Navigation panel ── */}
      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "16px", gap: 16 }}>

        {/* ── LEFT: QUESTION PANEL ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Progress bar */}
          <div style={{ height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(answered / Math.max(1, questions.length)) * 100}%`, background: `linear-gradient(90deg,${G},${GOLD})`, borderRadius: 2, transition: "width .4s" }} />
          </div>

          {q ? (
            <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, overflow: "hidden" }}>
              {/* Question header */}
              <div style={{ background: "rgba(255,255,255,.04)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {currentIdx + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "rgba(201,168,76,.15)", color: GOLD, fontWeight: 700 }}>
                    {q.question_type?.replace("_", " ")} · {q.points || 1} pt{(q.points || 1) !== 1 ? "s" : ""}
                  </span>
                </div>
                {/* Flag button */}
                <button
                  onClick={() => toggleFlag(q.id)}
                  style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${flagged.has(q.id) ? "#f59e0b" : "rgba(255,255,255,.2)"}`, background: flagged.has(q.id) ? "rgba(245,158,11,.15)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: flagged.has(q.id) ? "#f59e0b" : "rgba(255,255,255,.5)" }}
                >
                  <Flag size={12} /> {flagged.has(q.id) ? "Flagged" : "Flag"}
                </button>
              </div>

              <div style={{ padding: "24px 24px 20px" }}>
                {/* Question text */}
                <div style={{ marginBottom: 24 }}>
                  {q.question_text_ar ? (
                    <>
                      <p style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 2.2, direction: "rtl", margin: "0 0 10px" }}>
                        {stripHtml(q.question_text_ar)}
                      </p>
                      <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.7, margin: 0 }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text || "") }} />
                    </>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1.7 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text || "") }} />
                  )}
                </div>

                {/* Media */}
                {q.media_url && (
                  <div style={{ marginBottom: 20 }}>
                    {q.media_url.match(/\.(mp3|wav|ogg|webm)$/i)
                      ? <audio controls src={q.media_url} style={{ width: "100%", borderRadius: 10 }} />
                      : <img src={q.media_url} alt="Question media" style={{ maxHeight: 200, borderRadius: 10, display: "block" }} />}
                  </div>
                )}

                {/* Options — MCQ */}
                {(q.question_type === "mcq" || q.question_type === "true_false") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(q.question_type === "true_false"
                      ? [{ id: "true", text: "True / صحيح" }, { id: "false", text: "False / خطأ" }]
                      : (q.options as any[] || [])
                    ).map((opt: any) => {
                      const optId  = typeof opt === "string" ? opt : opt.id;
                      const optTxt = typeof opt === "string" ? opt : (opt.text || opt.text_ar || opt.id);
                      const isSel  = answers[q.id] === optId;
                      return (
                        <button
                          key={optId}
                          onClick={() => saveAnswer(q.id, optId)}
                          style={{
                            width: "100%", padding: "14px 18px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                            border: `2px solid ${isSel ? GOLD : "rgba(255,255,255,.1)"}`,
                            background: isSel ? "rgba(201,168,76,.15)" : "rgba(255,255,255,.04)",
                            color: isSel ? GOLD : "rgba(255,255,255,.8)", fontWeight: isSel ? 700 : 500,
                            fontSize: 14, display: "flex", alignItems: "center", gap: 12, transition: "all .2s",
                          }}
                        >
                          <span style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isSel ? GOLD : "rgba(255,255,255,.3)"}`, background: isSel ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {isSel && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "block" }} />}
                          </span>
                          {optTxt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Short answer */}
                {(q.question_type === "short_answer" || q.question_type === "essay" || q.question_type === "fill_blank") && (
                  <textarea
                    value={answers[q.id] || ""}
                    onChange={e => saveAnswer(q.id, e.target.value)}
                    placeholder="Type your answer here…"
                    rows={q.question_type === "essay" ? 6 : 3}
                    dir="auto"
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "2px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                )}
              </div>

              {/* ── Bottom navigation ── */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                  disabled={currentIdx === 0}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.7)", cursor: currentIdx === 0 ? "not-allowed" : "pointer", opacity: currentIdx === 0 ? 0.4 : 1, fontWeight: 700, fontSize: 13 }}
                >
                  <ChevronLeft size={15} /> Previous
                </button>

                <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                  {currentIdx + 1} / {questions.length}
                </span>

                {currentIdx < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentIdx(currentIdx + 1)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConfirm(true)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13 }}
                  >
                    <Send size={14} /> Submit Exam
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "rgba(255,255,255,.4)" }}>
              No questions found.
            </div>
          )}
        </div>

        {/* ── RIGHT: NAVIGATION PANEL ── */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ position: "sticky", top: 80, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "16px 14px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", margin: "0 0 12px", letterSpacing: 1, textTransform: "uppercase" }}>Questions</p>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 16 }}>
              {questions.map((qs, idx) => {
                const isAnswered = !!answers[qs.id];
                const isCurrent  = idx === currentIdx;
                const isFlagged  = flagged.has(qs.id);
                return (
                  <button
                    key={idx}
                    className="q-nav-btn"
                    onClick={() => setCurrentIdx(idx)}
                    style={{
                      width: "100%", aspectRatio: "1", borderRadius: 8, border: "none",
                      fontWeight: 800, fontSize: 12, cursor: "pointer", transition: "all .15s",
                      background: isCurrent ? GOLD : isFlagged ? "rgba(245,158,11,.2)" : isAnswered ? "rgba(34,197,94,.2)" : "rgba(255,255,255,.06)",
                      color: isCurrent ? "#fff" : isFlagged ? "#f59e0b" : isAnswered ? "#22c55e" : "rgba(255,255,255,.4)",
                      outline: isCurrent ? `2px solid ${GOLD}` : "none",
                    }}
                    title={`Q${idx + 1}${isFlagged ? " (Flagged)" : ""}${isAnswered ? " (Answered)" : ""}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
              {[
                { color: GOLD, label: "Current" },
                { color: "#22c55e", label: "Answered" },
                { color: "#f59e0b", label: "Flagged" },
                { color: "rgba(255,255,255,.15)", label: "Unanswered" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, color: "rgba(255,255,255,.45)" }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  {s.label}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,.5)" }}>Answered</span>
                <span style={{ fontWeight: 800, color: "#22c55e" }}>{answered}/{questions.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                <span style={{ color: "rgba(255,255,255,.5)" }}>Flagged</span>
                <span style={{ fontWeight: 800, color: "#f59e0b" }}>{flagged.size}</span>
              </div>
            </div>

            {/* Submit from panel */}
            <button
              onClick={() => setShowConfirm(true)}
              style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              <Send size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      {/* ── SUBMIT CONFIRMATION MODAL ── */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.75)", padding: 20 }}>
          <div style={{ background: "#0f2d1f", border: "1px solid rgba(201,168,76,.3)", borderRadius: 22, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(201,168,76,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CheckCircle2 size={32} color={GOLD} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: "0 0 8px" }}>Submit Exam?</h3>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", margin: "0 0 20px", lineHeight: 1.6 }}>
              You answered <strong style={{ color: GOLD }}>{answered}</strong> of <strong style={{ color: "#fff" }}>{questions.length}</strong> questions.
              {answered < questions.length && (
                <span style={{ display: "block", marginTop: 8, color: "#ef4444", fontWeight: 700 }}>
                  ⚠️ {questions.length - answered} question{questions.length - answered !== 1 ? "s" : ""} unanswered!
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Go Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? .7 : 1 }}
              >
                {submitting ? "Submitting…" : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntranceExamTaking;
