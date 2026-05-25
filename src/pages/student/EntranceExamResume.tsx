// src/pages/student/EntranceExamResume.tsx
// Redirect page for /student/entrance-exam (no attemptId)
// Finds the active in-progress attempt and navigates to it.
// If none found, creates a new one. Called by TasjeelGuard when step === "exam".
//
// RULE: No step is ever skipped. If the exam is not configured in the DB,
// the user sees a clear error and must contact support. They do NOT advance
// to the next step without completing the exam.

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
const G  = "#064E3B";
const GM = "#075E54";

const EntranceExamResume = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { currentStep, loading: stepLoading } = useTasjeel();

  const [status,  setStatus]  = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Finding your exam…");
  const [retryCount, setRetryCount] = useState(0); // increment to retry
  const didNavigate = useRef(false);

  useEffect(() => {
    // Wait until both auth and tasjeel are ready
    if (!user || stepLoading) return;

    // Step guard — if they don't belong here, redirect to the right page
    if (currentStep && currentStep !== "exam" && TASJEEL_ROUTES[currentStep]) {
      navigate(TASJEEL_ROUTES[currentStep], { replace: true });
      return;
    }

    didNavigate.current = false;
    setStatus("loading");
    setMessage("Finding your exam…");

    // ── 10 second timeout — spinner NEVER hangs forever ──────────────────────
    const timeoutId = setTimeout(() => {
      if (!didNavigate.current) {
        setStatus("error");
        setMessage("This is taking too long. Please check your connection and try again.");
      }
    }, 10_000);

    (async () => {
      try {
        // 1. Look for an existing in-progress attempt → resume it
        const { data: existing, error: e1 } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", ENTRANCE_EXAM_ID)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .maybeSingle();

        if (e1) throw new Error(`Could not load exam: ${e1.message}`);

        if (existing) {
          clearTimeout(timeoutId);
          setMessage("Resuming your exam…");
          didNavigate.current = true;
          navigate(`/student/entrance-exam/${existing.id}`, { replace: true });
          return;
        }

        // 2. Check if already submitted — tasjeel step should have been advanced
        //    by the exam submission handler but may have been missed. Fix it now.
        const { data: submitted } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", ENTRANCE_EXAM_ID)
          .eq("user_id", user.id)
          .in("status", ["submitted", "graded", "completed"])
          .maybeSingle();

        if (submitted) {
          // Exam was already completed — advance the stuck tasjeel step and continue
          clearTimeout(timeoutId);
          await (supabase as any).from("tasjeel_progress").update({
            current_step: "recitation",
            updated_at:   new Date().toISOString(),
          }).eq("user_id", user.id);
          didNavigate.current = true;
          navigate("/student/recitation-test", { replace: true });
          return;
        }

        // 3. No attempt at all — verify the exam exists in the DB first.
        //    If it doesn't exist, we show an error. We NEVER skip the exam step.
        const { data: examRow, error: e3 } = await supabase
          .from("exams")
          .select("id, title")
          .eq("id", ENTRANCE_EXAM_ID)
          .maybeSingle();

        if (e3) throw new Error(`Could not verify exam: ${e3.message}`);

        if (!examRow) {
          // Exam not configured in the database — block and inform the user.
          // Do NOT skip to recitation. Admin must set up the exam first.
          clearTimeout(timeoutId);
          setStatus("error");
          setMessage(
            "The entrance exam has not been set up yet. Please contact Tahleem Academy support so they can configure it for you."
          );
          return;
        }

        // 4. Exam exists — create a fresh attempt
        setMessage("Preparing your exam…");
        const { data: newAttempt, error: e4 } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id:    ENTRANCE_EXAM_ID,
            user_id:    user.id,
            status:     "in_progress",
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (e4 || !newAttempt) {
          throw new Error(
            e4?.message || "Could not start the exam. Please try again."
          );
        }

        clearTimeout(timeoutId);
        didNavigate.current = true;
        navigate(`/student/entrance-exam/${newAttempt.id}`, { replace: true });

      } catch (e: any) {
        clearTimeout(timeoutId);
        if (!didNavigate.current) {
          console.error("[EntranceExamResume]", e);
          setStatus("error");
          setMessage(e?.message || "Something went wrong. Please try again.");
        }
      }
    })();

    return () => clearTimeout(timeoutId);
  }, [user, stepLoading, currentStep, navigate, retryCount]);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg,${G},${GM})`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20, fontFamily: "'Cairo',sans-serif",
      padding: "0 24px", textAlign: "center",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {status === "loading" ? (
        <>
          <Loader2
            size={40} color="#fff"
            style={{ animation: "spin .8s linear infinite", flexShrink: 0 }}
          />
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>
            {message}
          </p>
          <p style={{ color: "rgba(255,255,255,.5)", fontSize: 12, margin: 0 }}>
            This usually takes a few seconds…
          </p>
        </>
      ) : (
        <>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(255,255,255,.1)", border: "2px solid rgba(255,255,255,.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertCircle size={30} color="#fff" />
          </div>
          <div>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>
              Could not load exam
            </p>
            <p style={{ color: "rgba(255,255,255,.65)", fontSize: 13, margin: 0, maxWidth: 300, lineHeight: 1.6 }}>
              {message}
            </p>
          </div>
          <button
            onClick={() => { setStatus("loading"); setRetryCount(c => c + 1); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)",
              borderRadius: 12, padding: "12px 28px",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={16} /> Try Again
          </button>
        </>
      )}
    </div>
  );
};

export default EntranceExamResume;
