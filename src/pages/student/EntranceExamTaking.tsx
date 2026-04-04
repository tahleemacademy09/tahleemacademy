/**
 * EntranceExamTaking — Full CBT Interface with Proctoring (Mobile-Responsive)
 * ✅ ANTI-MINIMIZE: Students cannot minimize/leave except by pressing 3 times.
 * ✅ MOBILE-FIRST: Fully responsive layout for phones, tablets, and desktop
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
  Shield, AlertTriangle, BookOpen, Camera, Eye, EyeOff
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

// ── Mobile Detection Helper ────────────────────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  
  return isMobile;
};

const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

const stripHtml = (html: string) => {
  const d = new DOMParser().parseFromString(html || "", "text/html");
  return d.body.textContent || "";
};

// ── Pre-exam instructions overlay (Mobile-Optimized) ───────────────────────
const PreExamInstructions = ({
  exam, procEnabled, onStart,
}: { exam: any; procEnabled: boolean; onStart: () => void; }) => {  const isMobile = useIsMobile();
  
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg,#0a1f14 0%,#0f3122 60%,#061a0e 100%)",
      padding: isMobile ? "10px" : "20px",
      overflowY: "auto",
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='30,2 58,16 58,44 30,58 2,44 2,16' fill='none' stroke='%23c9a84c' stroke-width='1'/%3E%3C/svg%3E")`,
      }} />
      <div style={{
        position: "relative", zIndex: 1, maxWidth: 560, width: isMobile ? "100%" : "95%", 
        margin: "0 auto",
        background: "rgba(255,255,255,.03)", border: "1px solid rgba(201,168,76,.2)", 
        borderRadius: isMobile ? 16 : 24, 
        padding: isMobile ? "24px 20px" : "36px 32px",
      }}>
        <div style={{ textAlign: "center", marginBottom: isMobile ? 16 : 24 }}>
          <p style={{ fontFamily: "'Amiri',serif", fontSize: isMobile ? 18 : 22, color: GOLD, margin: "0 0 8px", direction: "rtl" }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </p>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#fff", margin: 0, lineHeight: 1.3 }}>
            {exam?.title || "Entrance Examination"}
          </h1>
          <p style={{ fontSize: isMobile ? 12 : 13, color: GOLD, marginTop: 4, fontFamily: "'Amiri',serif" }}>اختبار القبول</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, 1fr)", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 16 : 24 }}>
          {[
            { icon: "⏱️", v: `${exam?.time_limit_minutes || 15} min` },
            { icon: "❓", v: "Loading questions…" },
            { icon: "✅", v: `Pass: ${exam?.passing_score || 50}%` },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,.05)", borderRadius: 10, padding: isMobile ? "8px 6px" : "10px", textAlign: "center" }}>
              <p style={{ fontSize: isMobile ? 14 : 18, margin: "0 0 2px" }}>{s.icon}</p>
              <p style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>{s.v}</p>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,.04)", borderRadius: isMobile ? 12 : 14, padding: isMobile ? "14px 16px" : "18px 20px", marginBottom: isMobile ? 16 : 20, border: "1px solid rgba(255,255,255,.08)" }}>
          <p style={{ fontWeight: 800, fontSize: isMobile ? 12 : 13, color: GOLD, margin: "0 0 12px", letterSpacing: 0.5 }}>📋 INSTRUCTIONS</p>
          {[
            "Read each question carefully before answering.",
            "Use the navigation grid to jump between questions.",
            "Your answers are auto-saved — no need to worry.",
            "You can flag questions to revisit them later.",
            "Submit only when you are ready — this is final.",            "Do NOT minimize or switch tabs — violations will trigger auto-submission.",
            "This test evaluates your current knowledge to place you in the correct level.",
          ].map((ins, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
              <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 800, color: GOLD, minWidth: 18, flexShrink: 0 }}>{i + 1}.</span>
              <p style={{ fontSize: isMobile ? 12 : 13, color: "rgba(255,255,255,.75)", margin: 0, lineHeight: 1.5 }}>{ins}</p>
            </div>
          ))}
        </div>

        {/* Anti-minimize warning */}
        <div style={{ background: "rgba(239,68,68,.1)", borderRadius: isMobile ? 10 : 12, padding: isMobile ? "12px" : "14px 16px", marginBottom: isMobile ? 16 : 20, border: "1px solid rgba(239,68,68,.25)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <EyeOff size={isMobile ? 16 : 18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: isMobile ? 12 : 13, color: "#ef4444", margin: "0 0 4px" }}>⚠️ Tab / Window Monitoring</p>
            <p style={{ fontSize: isMobile ? 11 : 12, color: "rgba(239,68,68,.8)", margin: 0, lineHeight: 1.5 }}>
              Minimizing, switching tabs or leaving the page is tracked. After <strong style={{ color: "#ef4444" }}>3 violations</strong> your exam will be auto-submitted.
            </p>
          </div>
        </div>

        {procEnabled && (
          <div style={{ background: "rgba(239,68,68,.1)", borderRadius: isMobile ? 10 : 12, padding: isMobile ? "12px" : "14px 16px", marginBottom: isMobile ? 16 : 20, border: "1px solid rgba(239,68,68,.25)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Shield size={isMobile ? 16 : 18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: isMobile ? 12 : 13, color: "#ef4444", margin: "0 0 4px" }}>🔒 Proctored Exam</p>
              <p style={{ fontSize: isMobile ? 11 : 12, color: "rgba(239,68,68,.8)", margin: 0, lineHeight: 1.5 }}>
                Your camera and activity will be monitored. Ensure your camera is on and your face is clearly visible.
              </p>
            </div>
          </div>
        )}

        <button onClick={onStart} style={{
          width: "100%", padding: isMobile ? "14px" : "16px", borderRadius: isMobile ? 12 : 14, border: "none",
          background: `linear-gradient(135deg,${G},${GM})`,
          color: "#fff", fontSize: isMobile ? 15 : 16, fontWeight: 800, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: "0 8px 32px rgba(6,78,59,.5)",
          minHeight: isMobile ? 48 : "auto",
        }}>
          <BookOpen size={isMobile ? 16 : 18} /> Begin Exam
        </button>
      </div>
    </div>
  );
};

// ── Violation Warning Overlay (Mobile-Optimized) ───────────────────────────
const ViolationWarning = ({  count, onReturn,
}: { count: number; onReturn: () => void; }) => {
  const isMobile = useIsMobile();
  const remaining = 3 - count;
  
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.9)", backdropFilter: "blur(10px)",
      padding: isMobile ? "10px" : "20px",
    }}>
      <div style={{
        maxWidth: 460, width: isMobile ? "100%" : "90%", background: "#1a0a0a",
        border: "2px solid rgba(239,68,68,.5)", borderRadius: isMobile ? 16 : 24, 
        padding: isMobile ? "24px 20px" : "36px 32px", textAlign: "center",
      }}>
        <div style={{ width: isMobile ? 56 : 72, height: isMobile ? 56 : 72, borderRadius: "50%", background: "rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <AlertTriangle size={isMobile ? 28 : 36} color="#ef4444" />
        </div>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: "#ef4444", margin: "0 0 12px", lineHeight: 1.2 }}>
          ⚠️ Violation {count} of 3
        </h2>
        <p style={{ fontSize: isMobile ? 13 : 15, color: "rgba(255,255,255,.8)", margin: "0 0 20px", lineHeight: 1.6 }}>
          You left or minimized the exam window.
        </p>
        <div style={{ background: "rgba(239,68,68,.1)", borderRadius: isMobile ? 12 : 14, padding: isMobile ? "12px 16px" : "16px 20px", marginBottom: isMobile ? 16 : 24, border: "1px solid rgba(239,68,68,.25)" }}>
          <p style={{ fontSize: isMobile ? 12 : 14, fontWeight: 800, color: "#ef4444", margin: "0 0 8px", lineHeight: 1.3 }}>
            {remaining === 1
              ? "⚡ FINAL WARNING — Next violation will auto-submit!"
              : `You have ${remaining} violation${remaining !== 1 ? "s" : ""} remaining`}
          </p>
          <p style={{ fontSize: isMobile ? 11 : 13, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5 }}>
            Stay on this page. Do not switch tabs, minimize, or leave the browser.
          </p>
        </div>
        <button
          onClick={onReturn}
          style={{
            width: "100%", padding: isMobile ? "13px" : "15px", borderRadius: isMobile ? 12 : 14, border: "none",
            background: `linear-gradient(135deg,${G},${GM})`,
            color: "#fff", fontSize: isMobile ? 14 : 15, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: isMobile ? 44 : "auto",
          }}
        >
          <Eye size={isMobile ? 14 : 16} /> Return to Exam
        </button>
      </div>
    </div>
  );};

// ── Main component ─────────────────────────────────────────────────────────────
const EntranceExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user }      = useAuth();
  const { toast }     = useToast();
  const navigate      = useNavigate();
  const { advanceStep } = useTasjeel();
  const isMobile = useIsMobile();

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

  // ── Anti-minimize state ───────────────────────────────────────────────────
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const violationRef  = useRef(0);
  const examActiveRef = useRef(false);

  const submittedRef  = useRef(false);
  const answersRef    = useRef(answers);
  const timerRef      = useRef<any>(null);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  // ── Load ──────────────────────────────────────────────────────────────────
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

      setAttempt(att);      const ex = att.exams as any;
      setExam(ex);

      const elapsed = Date.now() - new Date(att.started_at).getTime();
      const limitMs  = (ex.time_limit_minutes || 15) * 60_000;
      setTimeLeft(Math.max(0, Math.floor((limitMs - elapsed) / 1000)));

      const { data: qs } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: ex.id });
      setQuestions(qs || []);

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

  // ── Timer ─────────────────────────────────────────────────────────────────
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
  // ── Anti-minimize: Visibility & Blur tracking ─────────────────────────────
  useEffect(() => {
    if (showInstructions || loading) return;

    const handleViolation = () => {
      if (!examActiveRef.current || submittedRef.current) return;
      if (document.visibilityState === "visible") return;

      violationRef.current += 1;
      const count = violationRef.current;
      setViolationCount(count);

      if (attemptId) {
        supabase.from("exam_attempts").update({
          updated_at: new Date().toISOString(),
        } as any).eq("id", attemptId).then(() => {});
      }

      if (count >= 3) {
        toast({
          title: "⚠️ Exam auto-submitted",
          description: "You left the exam page 3 times. Your exam has been submitted.",
          variant: "destructive",
        });
        setTimeout(() => { if (!submittedRef.current) handleSubmit(); }, 1000);
      } else {
        setShowViolationWarning(true);
      }
    };

    const handleBlur = () => {
      if (!examActiveRef.current || submittedRef.current) return;
      violationRef.current += 1;
      const count = violationRef.current;
      setViolationCount(count);

      if (count >= 3) {
        toast({
          title: "⚠️ Exam auto-submitted",
          description: "You left the exam page 3 times. Your exam has been submitted.",
          variant: "destructive",
        });
        setTimeout(() => { if (!submittedRef.current) handleSubmit(); }, 1000);
      } else {
        setShowViolationWarning(true);
      }
    };

    document.addEventListener("visibilitychange", handleViolation);
    window.addEventListener("blur", handleBlur);    examActiveRef.current = true;

    return () => {
      document.removeEventListener("visibilitychange", handleViolation);
      window.removeEventListener("blur", handleBlur);
      examActiveRef.current = false;
    };
  }, [showInstructions, loading, attemptId]);

  // ── Proctoring ─────────────────────────────────────────────────────────────
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
    if (ex) { await supabase.from("exam_answers").update({ is_flagged: isNowFlagged }).eq("id", ex.id); }
  }, [flagged, attemptId]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    examActiveRef.current = false;
    setSubmitting(true);
    clearInterval(timerRef.current);

    try {
      const cur = answersRef.current;
      for (const [qId, ans] of Object.entries(cur)) {
        if (ans) {
          const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", qId).maybeSingle();          if (ex) await supabase.from("exam_answers").update({ answer_text: ans }).eq("id", ex.id);
          else     await supabase.from("exam_answers").insert({ attempt_id: attemptId!, question_id: qId, answer_text: ans });
        }
      }

      await supabase.rpc("grade_exam_attempt", { _attempt_id: attemptId! });
      await advanceStep("review");
      navigate(`/student/entrance-results/${attemptId}`, { replace: true });
    } catch (err) {
      toast({ title: "Submission error — please try again", variant: "destructive" });
      submittedRef.current = false;
      examActiveRef.current = true;
      setSubmitting(false);
    }
  }, [submitting, attemptId, navigate, advanceStep, toast]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f3122", padding: isMobile ? "20px" : "40px" }}>
      <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: "50%", border: `3px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (showInstructions) return (
    <PreExamInstructions
      exam={exam}
      procEnabled={procConfig.proctoring_enabled}
      onStart={() => { setShowInstructions(false); examActiveRef.current = true; }}
    />
  );

  const q          = questions[currentIdx];
  const answered   = Object.keys(answers).filter(k => answers[k]).length;
  const isWarning  = timeLeft > 0 && timeLeft < 120;
  const isCritical = timeLeft > 0 && timeLeft < 30;

  return (
    <div style={{ minHeight: "100vh", background: "#0b1f14", fontFamily: "'Cairo',sans-serif", paddingBottom: isMobile ? 80 : 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes timerPulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        .q-nav-btn:active{transform:scale(.95)}
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* ── Violation Warning Overlay ── */}
      {showViolationWarning && (        <ViolationWarning
          count={violationCount}
          onReturn={() => setShowViolationWarning(false)}
        />
      )}

      {/* ── Proctoring overlay ── */}
      {procEnabled && (
        <ProctoringOverlay {...proc} attemptId={attemptId!} onPointDeduction={() => {}} />
      )}

      {/* ── TOP BAR (Mobile-Optimized) ── */}
      <div style={{ 
        position: "sticky", top: 0, zIndex: 30, 
        background: "rgba(11,31,20,.97)", backdropFilter: "blur(12px)", 
        borderBottom: "1px solid rgba(201,168,76,.2)", 
        padding: isMobile ? "8px 12px" : "10px 16px", 
        display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {exam?.title || "Entrance Exam"}
          </p>
          <p style={{ fontSize: isMobile ? 10 : 11, color: GOLD, margin: 0, fontFamily: "'Amiri',serif" }}>اختبار القبول</p>
        </div>

        {/* Violation indicator */}
        {violationCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 4 : 6, 
            padding: isMobile ? "4px 10px" : "6px 12px", borderRadius: 8,
            background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.35)",
            animation: "shake .4s ease",
            flexShrink: 0,
          }}>
            <AlertTriangle size={isMobile ? 12 : 13} color="#ef4444" />
            <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#ef4444" }}>
              {violationCount}/3
            </span>
          </div>
        )}

        <div style={{ textAlign: "center", padding: isMobile ? "4px 10px" : "4px 12px", background: "rgba(255,255,255,.06)", borderRadius: 8, flexShrink: 0 }}>
          <p style={{ fontSize: isMobile ? 11 : 12, fontWeight: 800, color: "#fff", margin: 0 }}>{answered}<span style={{ color: "rgba(255,255,255,.4)", fontSize: isMobile ? 9 : 10 }}>/{questions.length}</span></p>
          <p style={{ fontSize: isMobile ? 8 : 9, color: "rgba(255,255,255,.4)", margin: 0 }}>answered</p>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: isMobile ? 5 : 7,           padding: isMobile ? "6px 12px" : "8px 16px", borderRadius: 10, fontWeight: 900, 
          fontSize: isMobile ? 16 : 18,
          background: isCritical ? "rgba(239,68,68,.2)" : isWarning ? "rgba(245,158,11,.15)" : "rgba(201,168,76,.12)",
          color: isCritical ? "#ef4444" : isWarning ? "#f59e0b" : GOLD,
          border: `1.5px solid ${isCritical ? "rgba(239,68,68,.4)" : isWarning ? "rgba(245,158,11,.3)" : "rgba(201,168,76,.3)"}`,
          animation: isCritical ? "timerPulse 1s infinite" : "none",
          flexShrink: 0,
        }}>
          <Clock size={isMobile ? 14 : 16} /> {fmtTime(timeLeft)}
        </div>

        {procEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 5, padding: isMobile ? "4px 8px" : "6px 10px", borderRadius: 8, background: proc.cameraReady ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", flexShrink: 0 }}>
            <div style={{ width: isMobile ? 6 : 7, height: isMobile ? 6 : 7, borderRadius: "50%", background: proc.cameraReady ? "#22c55e" : "#ef4444" }} />
            <Camera size={isMobile ? 10 : 12} color={proc.cameraReady ? "#22c55e" : "#ef4444"} />
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT (Mobile-Stacked) ── */}
      <div style={{ 
        display: "flex", 
        maxWidth: 1200, 
        margin: "0 auto", 
        padding: isMobile ? "12px" : "16px", 
        gap: isMobile ? "12px" : "16px",
        flexDirection: isMobile ? "column" : "row",
      }}>

        {/* LEFT: QUESTION PANEL */}
        <div style={{ flex: isMobile ? "none" : 1, minWidth: 0, width: "100%" }}>
          <div style={{ height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, marginBottom: isMobile ? 12 : 16, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(answered / Math.max(1, questions.length)) * 100}%`, background: `linear-gradient(90deg,${G},${GOLD})`, borderRadius: 2, transition: "width .4s" }} />
          </div>

          {q ? (
            <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: isMobile ? 14 : 18, overflow: "hidden" }}>
              <div style={{ background: "rgba(255,255,255,.04)", padding: isMobile ? "12px 16px" : "14px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,.06)", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <span style={{ 
                  width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: isMobile ? 8 : 10, 
                  background: G, display: "flex", alignItems: "center", justifyContent: "center", 
                  fontSize: isMobile ? 12 : 13, fontWeight: 800, color: "#fff", flexShrink: 0 
                }}>
                  {currentIdx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ 
                    fontSize: isMobile ? 10 : 11, padding: isMobile ? "2px 8px" : "2px 10px", 
                    borderRadius: 20, background: "rgba(201,168,76,.15)", color: GOLD, fontWeight: 700,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "100%"                  }}>
                    {q.question_type?.replace("_", " ")} · {q.points || 1} pt{(q.points || 1) !== 1 ? "s" : ""}
                  </span>
                </div>
                <button onClick={() => toggleFlag(q.id)}
                  style={{ 
                    padding: isMobile ? "5px 10px" : "6px 12px", borderRadius: 8, 
                    border: `1.5px solid ${flagged.has(q.id) ? "#f59e0b" : "rgba(255,255,255,.2)"}`, 
                    background: flagged.has(q.id) ? "rgba(245,158,11,.15)" : "transparent", 
                    cursor: "pointer", display: "flex", alignItems: "center", gap: isMobile ? 4 : 5, 
                    fontSize: isMobile ? 10 : 11, fontWeight: 700, 
                    color: flagged.has(q.id) ? "#f59e0b" : "rgba(255,255,255,.5)",
                    flexShrink: 0,
                    minHeight: isMobile ? 32 : "auto",
                  }}>
                  <Flag size={isMobile ? 10 : 12} /> {isMobile ? (flagged.has(q.id) ? "Flagged" : "Flag") : (flagged.has(q.id) ? "Flagged" : "Flag")}
                </button>
              </div>

              <div style={{ padding: isMobile ? "16px" : "24px 24px 20px" }}>
                <div style={{ marginBottom: isMobile ? 16 : 24 }}>
                  {q.question_text_ar ? (
                    <>
                      <p style={{ 
                        fontFamily: "'Scheherazade New','Amiri',serif", 
                        fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#fff", 
                        lineHeight: isMobile ? 2 : 2.2, direction: "rtl", margin: "0 0 10px",
                        wordWrap: "break-word", overflowWrap: "break-word"
                      }}>
                        {stripHtml(q.question_text_ar)}
                      </p>
                      <p style={{ 
                        fontSize: isMobile ? 13 : 14, color: "rgba(255,255,255,.6)", 
                        lineHeight: 1.7, margin: 0,
                        wordWrap: "break-word", overflowWrap: "break-word"
                      }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text || "") }} />
                    </>
                  ) : (
                    <div style={{ 
                      fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#fff", 
                      lineHeight: 1.7,
                      wordWrap: "break-word", overflowWrap: "break-word"
                    }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text || "") }} />
                  )}
                </div>

                {q.media_url && (
                  <div style={{ marginBottom: isMobile ? 16 : 20 }}>                    {q.media_url.match(/\.(mp3|wav|ogg|webm)$/i)
                      ? <audio controls src={q.media_url} style={{ width: "100%", borderRadius: isMobile ? 8 : 10 }} />
                      : <img src={q.media_url} alt="Question media" style={{ maxWidth: "100%", height: "auto", maxHeight: isMobile ? 160 : 200, borderRadius: isMobile ? 8 : 10, display: "block" }} />}
                  </div>
                )}

                {(q.question_type === "mcq" || q.question_type === "true_false") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 10 }}>
                    {(q.question_type === "true_false"
                      ? [{ id: "true", text: "True / صحيح" }, { id: "false", text: "False / خطأ" }]
                      : (q.options as any[] || [])
                    ).map((opt: any) => {
                      const optId  = typeof opt === "string" ? opt : opt.id;
                      const optTxt = typeof opt === "string" ? opt : (opt.text || opt.text_ar || opt.id);
                      const isSel  = answers[q.id] === optId;
                      return (
                        <button key={optId} onClick={() => saveAnswer(q.id, optId)}
                          style={{ 
                            width: "100%", padding: isMobile ? "12px 14px" : "14px 18px", 
                            borderRadius: isMobile ? 10 : 12, textAlign: "left", cursor: "pointer",
                            border: `2px solid ${isSel ? GOLD : "rgba(255,255,255,.1)"}`,
                            background: isSel ? "rgba(201,168,76,.15)" : "rgba(255,255,255,.04)",
                            color: isSel ? GOLD : "rgba(255,255,255,.8)", fontWeight: isSel ? 700 : 500,
                            fontSize: isMobile ? 13 : 14, display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, 
                            transition: "all .2s", minHeight: isMobile ? 44 : "auto",
                            wordWrap: "break-word", overflowWrap: "break-word",
                          }}>
                          <span style={{ 
                            width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, 
                            borderRadius: "50%", border: `2px solid ${isSel ? GOLD : "rgba(255,255,255,.3)"}`, 
                            background: isSel ? GOLD : "transparent", display: "flex", alignItems: "center", 
                            justifyContent: "center", flexShrink: 0 
                          }}>
                            {isSel && <span style={{ width: isMobile ? 6 : 8, height: isMobile ? 6 : 8, borderRadius: "50%", background: "#fff", display: "block" }} />}
                          </span>
                          <span style={{ flex: 1, textAlign: "left", wordWrap: "break-word" }}>{optTxt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {(q.question_type === "short_answer" || q.question_type === "essay" || q.question_type === "fill_blank") && (
                  <textarea value={answers[q.id] || ""} onChange={e => saveAnswer(q.id, e.target.value)}
                    placeholder="Type your answer here…" rows={isMobile ? (q.question_type === "essay" ? 4 : 3) : (q.question_type === "essay" ? 6 : 3)} dir="auto"
                    style={{ 
                      width: "100%", padding: isMobile ? "10px 12px" : "12px 14px", 
                      borderRadius: isMobile ? 10 : 12, border: "2px solid rgba(255,255,255,.15)", 
                      background: "rgba(255,255,255,.06)", color: "#fff", 
                      fontSize: isMobile ? 13 : 14, outline: "none", resize: "vertical",                       fontFamily: "inherit", boxSizing: "border-box",
                      minHeight: isMobile ? 80 : "auto",
                    }} />
                )}
              </div>

              <div style={{ 
                padding: isMobile ? "12px 16px" : "14px 20px", 
                borderTop: "1px solid rgba(255,255,255,.06)", 
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                flexDirection: isMobile ? "column" : "row",
              }}>
                <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
                  style={{ 
                    width: isMobile ? "100%" : "auto", 
                    display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, 
                    padding: isMobile ? "12px 16px" : "10px 18px", borderRadius: 10, 
                    border: "1.5px solid rgba(255,255,255,.15)", background: "transparent", 
                    color: "rgba(255,255,255,.7)", cursor: currentIdx === 0 ? "not-allowed" : "pointer", 
                    opacity: currentIdx === 0 ? 0.4 : 1, fontWeight: 700, fontSize: isMobile ? 12 : 13,
                    minHeight: isMobile ? 44 : "auto",
                    justifyContent: "center",
                  }}>
                  <ChevronLeft size={isMobile ? 14 : 15} /> Previous
                </button>
                <span style={{ fontSize: isMobile ? 11 : 12, color: "rgba(255,255,255,.4)" }}>{currentIdx + 1} / {questions.length}</span>
                {currentIdx < questions.length - 1 ? (
                  <button onClick={() => setCurrentIdx(currentIdx + 1)}
                    style={{ 
                      width: isMobile ? "100%" : "auto",
                      display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, 
                      padding: isMobile ? "12px 16px" : "10px 18px", borderRadius: 10, 
                      border: "none", background: G, color: "#fff", cursor: "pointer", 
                      fontWeight: 700, fontSize: isMobile ? 12 : 13,
                      minHeight: isMobile ? 44 : "auto",
                      justifyContent: "center",
                    }}>
                    Next <ChevronRight size={isMobile ? 14 : 15} />
                  </button>
                ) : (
                  <button onClick={() => setShowConfirm(true)}
                    style={{ 
                      width: isMobile ? "100%" : "auto",
                      display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, 
                      padding: isMobile ? "12px 16px" : "10px 20px", borderRadius: 10, 
                      border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, 
                      color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 12 : 13,
                      minHeight: isMobile ? 44 : "auto",
                      justifyContent: "center",
                    }}>                    <Send size={isMobile ? 12 : 14} /> Submit Exam
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: isMobile ? "40px 20px" : "60px 20px", textAlign: "center", color: "rgba(255,255,255,.4)" }}>No questions found.</div>
          )}
        </div>

        {/* RIGHT: NAVIGATION PANEL (Mobile: Bottom-Fixed) */}
        <div style={{ 
          width: isMobile ? "100%" : 220, 
          flexShrink: 0,
          order: isMobile ? 2 : 1,
          position: isMobile ? "fixed" : "sticky",
          bottom: isMobile ? 0 : "auto",
          left: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          top: isMobile ? "auto" : 80,
          background: isMobile ? "rgba(11,31,20,.98)" : "rgba(255,255,255,.03)",
          border: isMobile ? "none" : "1px solid rgba(255,255,255,.08)",
          borderTop: isMobile ? "1px solid rgba(255,255,255,.08)" : "none",
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          padding: isMobile ? "12px 14px 20px" : "16px 14px",
          zIndex: isMobile ? 25 : 20,
          boxShadow: isMobile ? "0 -4px 20px rgba(0,0,0,.3)" : "none",
        }}>
          <p style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, color: "rgba(255,255,255,.45)", margin: "0 0 12px", letterSpacing: 1, textTransform: "uppercase" }}>Questions</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: isMobile ? 4 : 6, marginBottom: isMobile ? 12 : 16 }}>
            {questions.map((qs, idx) => {
              const isAnswered = !!answers[qs.id];
              const isCurrent  = idx === currentIdx;
              const isFlagged  = flagged.has(qs.id);
              return (
                <button key={idx} className="q-nav-btn" onClick={() => setCurrentIdx(idx)}
                  style={{ 
                    width: "100%", aspectRatio: "1", borderRadius: isMobile ? 6 : 8, border: "none", 
                    fontWeight: 800, fontSize: isMobile ? 11 : 12, cursor: "pointer", transition: "all .15s",
                    background: isCurrent ? GOLD : isFlagged ? "rgba(245,158,11,.2)" : isAnswered ? "rgba(34,197,94,.2)" : "rgba(255,255,255,.06)",
                    color: isCurrent ? "#fff" : isFlagged ? "#f59e0b" : isAnswered ? "#22c55e" : "rgba(255,255,255,.4)",
                    outline: isCurrent ? `2px solid ${GOLD}` : "none",
                    minHeight: isMobile ? 36 : "auto",
                  }}>
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 4 : 5, marginBottom: isMobile ? 12 : 16 }}>
            {[{color:GOLD,label:"Current"},{color:"#22c55e",label:"Answered"},{color:"#f59e0b",label:"Flagged"},{color:"rgba(255,255,255,.15)",label:"Unanswered"}].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: isMobile ? 5 : 7, fontSize: isMobile ? 9 : 10, color: "rgba(255,255,255,.45)" }}>
                <div style={{ width: isMobile ? 10 : 12, height: isMobile ? 10 : 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                {s.label}
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: isMobile ? 8 : 10, padding: isMobile ? "8px 12px" : "10px 12px", marginBottom: isMobile ? 12 : 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: isMobile ? 11 : 12 }}>
              <span style={{ color: "rgba(255,255,255,.5)" }}>Answered</span>
              <span style={{ fontWeight: 800, color: "#22c55e" }}>{answered}/{questions.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: isMobile ? 11 : 12, marginTop: isMobile ? 3 : 4 }}>
              <span style={{ color: "rgba(255,255,255,.5)" }}>Flagged</span>
              <span style={{ fontWeight: 800, color: "#f59e0b" }}>{flagged.size}</span>
            </div>
            {violationCount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: isMobile ? 11 : 12, marginTop: isMobile ? 3 : 4 }}>
                <span style={{ color: "rgba(239,68,68,.7)" }}>Violations</span>
                <span style={{ fontWeight: 800, color: "#ef4444" }}>{violationCount}/3</span>
              </div>
            )}
          </div>

          <button onClick={() => setShowConfirm(true)}
            style={{ 
              width: "100%", padding: isMobile ? "12px" : "11px", borderRadius: isMobile ? 10 : 10, 
              border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, 
              color: "#fff", fontWeight: 800, fontSize: isMobile ? 13 : 13, cursor: "pointer",
              minHeight: isMobile ? 44 : "auto",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <Send size={isMobile ? 12 : 13} />
            Submit Exam
          </button>
          
          {/* Mobile spacer to prevent content hiding behind fixed nav */}
          {isMobile && <div style={{ height: 20 }} />}
        </div>
      </div>

      {/* SUBMIT CONFIRMATION MODAL (Mobile-Optimized) */}
      {showConfirm && (
        <div style={{ 
          position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", 
          background: "rgba(0,0,0,.75)", padding: isMobile ? "16px" : 20 
        }}>
          <div style={{             background: "#0f2d1f", border: "1px solid rgba(201,168,76,.3)", 
            borderRadius: isMobile ? 16 : 22, padding: isMobile ? "24px 20px" : "32px 28px", 
            maxWidth: 420, width: isMobile ? "100%" : "100%", textAlign: "center",
            margin: isMobile ? "0 8px" : 0,
          }}>
            <div style={{ width: isMobile ? 52 : 64, height: isMobile ? 52 : 64, borderRadius: "50%", background: "rgba(201,168,76,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CheckCircle2 size={isMobile ? 26 : 32} color={GOLD} />
            </div>
            <h3 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>Submit Exam?</h3>
            <p style={{ fontSize: isMobile ? 13 : 14, color: "rgba(255,255,255,.6)", margin: "0 0 20px", lineHeight: 1.5 }}>
              You answered <strong style={{ color: GOLD }}>{answered}</strong> of <strong style={{ color: "#fff" }}>{questions.length}</strong> questions.
              {answered < questions.length && (
                <span style={{ display: "block", marginTop: isMobile ? 6 : 8, color: "#ef4444", fontWeight: 700, fontSize: isMobile ? 12 : 13 }}>
                  ⚠️ {questions.length - answered} question{questions.length - answered !== 1 ? "s" : ""} unanswered!
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row" }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ 
                  flex: 1, padding: isMobile ? "12px" : "12px", borderRadius: isMobile ? 10 : 12, 
                  border: "1.5px solid rgba(255,255,255,.2)", background: "transparent", 
                  color: "#fff", fontWeight: 700, cursor: "pointer",
                  minHeight: isMobile ? 44 : "auto",
                }}>
                Go Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ 
                  flex: 1, padding: isMobile ? "12px" : "12px", borderRadius: isMobile ? 10 : 12, 
                  border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, 
                  color: "#fff", fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", 
                  opacity: submitting ? .7 : 1,
                  minHeight: isMobile ? 44 : "auto",
                }}>
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