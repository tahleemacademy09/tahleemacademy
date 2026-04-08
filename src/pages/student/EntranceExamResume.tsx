// src/pages/student/EntranceExamResume.tsx
// Redirect page for /student/entrance-exam (no attemptId)
// Finds the active in-progress attempt and navigates to it.
// If none found, creates a new one. Called by TasjeelGuard when step === "exam".

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
const G  = "#064E3B";
const GM = "#075E54";

const EntranceExamResume = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [status, setStatus] = useState("Finding your exam…");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // 1. Look for existing in-progress attempt
        const { data: existing } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", ENTRANCE_EXAM_ID)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .maybeSingle();

        if (existing) {
          setStatus("Resuming your exam…");
          navigate(`/student/entrance-exam/${existing.id}`, { replace: true });
          return;
        }

        // 2. Check if already submitted (shouldn't be here then)
        const { data: submitted } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", ENTRANCE_EXAM_ID)
          .eq("user_id", user.id)
          .in("status", ["submitted", "graded", "completed"])
          .maybeSingle();

        if (submitted) {
          // Exam already done — advance step and go to recitation
          await (supabase as any).from("tasjeel_progress").update({
            current_step: "recitation",
            updated_at:   new Date().toISOString(),
          }).eq("user_id", user.id);
          navigate("/student/recitation-test", { replace: true });
          return;
        }

        // 3. Create a new attempt
        setStatus("Preparing your exam…");
        const { data: newAttempt, error } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id:    ENTRANCE_EXAM_ID,
            user_id:    user.id,
            status:     "in_progress",
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error || !newAttempt) {
          setStatus("Error starting exam. Please refresh.");
          return;
        }

        navigate(`/student/entrance-exam/${newAttempt.id}`, { replace: true });
      } catch (e) {
        console.error("[EntranceExamResume]", e);
        setStatus("Something went wrong. Please refresh.");
      }
    })();
  }, [user, navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg,${G},${GM})`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20, fontFamily: "'Cairo',sans-serif",
    }}>
      <Loader2 size={36} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
      <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>{status}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default EntranceExamResume;
