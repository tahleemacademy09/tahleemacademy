// src/pages/student/TasjeelAwaitingLevel.tsx
// ═══════════════════════════════════════════════════════════════════════════
// AWAITING LEVEL ASSIGNMENT PAGE
// Route: /student/awaiting-level
// Shown after review step when admin needs to manually assign level.
// Polls Tasjeel progress every 30s and redirects when level_assigned.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel } from "@/hooks/useTasjeel";

const G    = "#064E3B";
const GOLD = "#C9973A";

const TasjeelAwaitingLevel = () => {
  const { user } = useAuth();
  const { currentStep, refresh } = useTasjeel();
  const navigate = useNavigate();

  // Redirect away if step has advanced
  useEffect(() => {
    if (currentStep === "completed") {
      navigate("/student", { replace: true });
    }
  }, [currentStep, navigate]);

  // Poll every 30 seconds for level assignment
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      await refresh();

      // Also check profiles directly for level assignment
      const { data: profile } = await supabase
        .from("profiles")
        .select("level")
        .eq("user_id", user.id)
        .single();

      if ((profile as any)?.level && (profile as any).level !== "pending") {
        // Admin has assigned a level — advance to completed
        await supabase
          .from("tasjeel_progress" as any)
          .update({
            current_step:     "completed",
            level_assigned:   (profile as any).level,
            level_assigned_at: new Date().toISOString(),
            completed_at:     new Date().toISOString(),
            updated_at:       new Date().toISOString(),
          } as any)
          .eq("user_id", user.id);

        navigate("/student", { replace: true });
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [user, refresh, navigate]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Amiri:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#FDFCF9",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
          padding: "24px 20px",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            background: G,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
            animation: "float 3s ease-in-out infinite",
            boxShadow: `0 8px 32px rgba(6,78,59,.25)`,
          }}
        >
          <BookOpen style={{ width: 38, height: 38, color: GOLD }} />
        </div>

        {/* Clock icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `rgba(201,151,58,.12)`,
            border: `2px solid rgba(201,151,58,.3)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Clock style={{ color: GOLD, width: 26, height: 26 }} />
        </div>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28,
            fontWeight: 700,
            color: G,
            textAlign: "center",
            margin: "0 0 12px",
          }}
        >
          Awaiting Level Assignment
        </h1>

        <p
          style={{
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
            maxWidth: 360,
            lineHeight: 1.7,
            marginBottom: 24,
          }}
        >
          Your exam results are being reviewed by our instructors. We will assign
          your learning level and activate your dashboard shortly.
        </p>

        {/* Arabic */}
        <p
          style={{
            fontFamily: "'Amiri', serif",
            fontSize: 18,
            color: GOLD,
            direction: "rtl",
            marginBottom: 32,
            animation: "pulse 2.5s ease infinite",
          }}
        >
          جَزَاكَ اللَّهُ خَيْرًا عَلَى صَبْرِكَ
        </p>

        {/* Polling indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 20px",
            background: "#F0FDF4",
            border: `1px solid rgba(6,78,59,.15)`,
            borderRadius: 12,
            fontSize: 12,
            color: G,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: `2px solid ${G}`,
              borderTopColor: "transparent",
              animation: "spin .8s linear infinite",
            }}
          />
          Checking for updates every 30 seconds…
        </div>
      </div>
    </>
  );
};

export default TasjeelAwaitingLevel;
