// src/pages/student/EntranceExamResume.tsx
// Redirect page for /student/entrance-exam (no attemptId).
// Looks up the entrance exam by is_entrance=true (NOT a hardcoded UUID)
// so it works regardless of which exam ID is in the database.
// Finds or creates an in-progress attempt, then navigates to the exam.
// No step is ever skipped — if the exam is not configured, user sees a
// clear error and must wait for admin to set it up.

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

const G  = "#064E3B";
const GM = "#075E54";

const EntranceExamResume = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { currentStep, loading: stepLoading, advanceStep } = useTasjeel();

  const [status,     setStatus]     = useState<"loading" | "error">("loading");
  const [message,    setMessage]    = useState("Finding your exam…");
  const [retryCount, setRetryCount] = useState(0);
  const didNavigate = useRef(false);

  useEffect(() => {
    if (!user || stepLoading) return;

    // Step guard — redirect if they don't belong here
    if (currentStep && currentStep !== "exam" && TASJEEL_ROUTES[currentStep]) {
      navigate(TASJEEL_ROUTES[currentStep], { replace: true });
      return;
    }

    didNavigate.current = false;
    setStatus("loading");
    setMessage("Finding your exam…");

    // 10s timeout — spinner never hangs forever
    const timeoutId = setTimeout(() => {
      if (!didNavigate.current) {
        setStatus("error");
        setMessage("This is taking too long. Please check your connection and try again.");
      }
    }, 10_000);

    (async () => {
      try {
        // ── Step 1: Find the entrance exam by is_entrance flag ──────────────
        // NEVER use a hardcoded UUID — look it up so it works on any DB.
        const { data: examRow, error: examErr } = await supabase
          .from("exams")
          .select("id, title")
          .eq("is_entrance", true)
          .maybeSingle();

        if (examErr) throw new Error(`Could not load exam config: ${examErr.message}`);

        if (!examRow) {
          // Admin has not created the entrance exam yet — block and inform user.
          // Do NOT skip this step.
          clearTimeout(timeoutId);
          setStatus("error");
          setMessage(
            "The entrance exam has not been set up yet. Please contact Tahleem Academy support — your place is saved and no steps will be skipped."
          );
          return;
        }

        const EXAM_ID = examRow.id;

        // ── Step 2: Resume an existing in-progress attempt ──────────────────
        const { data: existingRows, error: e1 } = await supabase
          .from("exam_attempts")
          .select("id")
          .eq("exam_id", EXAM_ID)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
          .limit(1);

        if (e1) throw new Error(`Could not check existing attempt: ${e1.message}`);

        const existing = existingRows?.[0];
        if (existing) {
          clearTimeout(timeoutId);
          setMessage("Resuming your exam…");
          didNavigate.current = true;
          navigate(`/student/entrance-exam/${existing.id}`, { replace: true });
          return;
        }

        // ── Step 3: Check if already submitted — fix stuck tasjeel step ─────
        const { data: submittedRows } = await supabase
          .from("exam_attempts")
          .select("id")
          .eq("exam_id", EXAM_ID)
          .eq("user_id", user.id)
          .in("status", ["submitted", "graded", "completed"])
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .limit(1);

        const submitted = submittedRows?.[0];
        if (submitted) {
          // Exam was already completed but tasjeel step wasn't advanced — fix it.
          // CRITICAL: use advanceStep (not a raw supabase PATCH) so that local
          // currentStep state is immediately set to "recitation", even if the
          // DB call fails with 400. Without this, RecitationTest's step guard
          // sees currentStep="exam" and bounces back here → infinite PATCH loop.
          clearTimeout(timeoutId);
          await advanceStep("recitation");   // updates local state regardless of DB result
          didNavigate.current = true;
          navigate("/student/recitation-test", { replace: true });
          return;
        }

        // ── Step 4: Create a fresh attempt ──────────────────────────────────
        setMessage("Preparing your exam…");
        const { data: newAttempt, error: e2 } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id:    EXAM_ID,
            user_id:    user.id,
            status:     "in_progress",
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (e2 || !newAttempt) {
          throw new Error(e2?.message || "Could not start the exam. Please try again.");
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
