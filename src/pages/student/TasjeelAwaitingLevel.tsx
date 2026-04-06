// src/pages/student/TasjeelAwaitingLevel.tsx
// Shown after schedule_session step — blocks dashboard until admin approves.
// Now includes a "Join Virtual Session" button using LiveKit.

import { useEffect, useState } from "react";
import { useNavigate }        from "react-router-dom";
import { supabase }           from "@/integrations/supabase/client";
import { useAuth }            from "@/contexts/AuthContext";
import { useTasjeel }         from "@/hooks/useTasjeel";
import { Video } from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9973A";

const TasjeelAwaitingLevel = () => {
  const { user, profile }         = useAuth();
  const { currentStep, refresh }  = useTasjeel();
  const navigate                  = useNavigate();
  const [recData,   setRecData]   = useState<any>(null);
  const [checkTime, setCheckTime] = useState(0);

  // Redirect if approved
  useEffect(() => {
    if (currentStep === "completed") navigate("/student", { replace: true });
  }, [currentStep, navigate]);

  // Load recitation data
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("recitation_tests")
        .select("virtual_session_date, virtual_session_time, ai_score, status, admin_approved")
        .eq("user_id", user.id)
        .maybeSingle();
      setRecData(data);
    })();
  }, [user]);

  // Poll every 30s
  useEffect(() => {
    if (!user) return;
    const iv = setInterval(async () => {
      setCheckTime(0);
      await refresh();
      const { data: prof } = await supabase.from("profiles").select("level").eq("user_id", user.id).single();
      if ((prof as any)?.level && (prof as any).level !== "pending") {
        await supabase.from("tasjeel_progress" as any).update({
          current_step: "completed",
          level_assigned: (prof as any).level,
          level_assigned_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any).eq("user_id", user.id);
        navigate("/student", { replace: true });
      }
    }, 30_000);
    const cnt = setInterval(() => setCheckTime(t => t + 1), 1000);
    return () => { clearInterval(iv); clearInterval(cnt); };
  }, [user, refresh, navigate]);

  const sessionDate = recData?.virtual_session_date;
  const sessionTime = recData?.virtual_session_time;
  const aiScore     = recData?.ai_score;

  // Check if the session is happening now or within 15 min
  const isSessionTime = (() => {
    if (!sessionDate || !sessionTime) return false;
    try {
      const sessionDT = new Date(`${sessionDate}T${sessionTime}:00`);
      const now = new Date();
      const diffMin = (sessionDT.getTime() - now.getTime()) / 60000;
      return diffMin <= 15 && diffMin >= -120;
    } catch { return false; }
  })();

  const joinSession = () => {
    const roomName = `recitation-eval-${user?.id}`;
    navigate(`/student/live-classes?room=${roomName}&type=recitation`);
  };

  const steps = [
    { icon: "📝", label: "Account Created",    done: true  },
    { icon: "💳", label: "Payment Completed",  done: true  },
    { icon: "📋", label: "Onboarding Done",    done: true  },
    { icon: "📖", label: "Entrance Exam Done", done: true  },
    { icon: "🎙️", label: "Recitation Done",    done: true  },
    { icon: "📅", label: sessionDate ? `Session: ${sessionDate}${sessionTime ? " · " + sessionTime : ""}` : "Session Booked", done: !!sessionDate },
    { icon: "✅", label: "Admin Approval",     done: false },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800&display=swap');
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>

      <div style={{
        minHeight: "100vh", background: "#FDFCF9",
        fontFamily: "'Cairo',sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "flex-start", padding: "32px 16px 48px",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 22, background: G,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24, animation: "float 3.5s ease-in-out infinite",
          boxShadow: `0 8px 32px rgba(6,78,59,.28)`,
        }}>
          <span style={{ fontSize: 36 }}>📖</span>
        </div>

        <p style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: GOLD, margin: "0 0 8px", direction: "rtl", animation: "pulse 3s ease infinite" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: G, textAlign: "center", margin: "0 0 10px" }}>
          Registration Under Review
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", maxWidth: 380, lineHeight: 1.8, margin: "0 0 28px" }}>
          Your registration is complete! Our instructors are reviewing your exam and recitation results to assign your learning level.
        </p>

        {/* Progress steps */}
        <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb", padding: "20px 20px 10px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Your Progress</p>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: s.done ? G : i === steps.length - 1 ? "rgba(6,78,59,.08)" : "#f3f4f6",
                border: `2px solid ${s.done ? G : i === steps.length - 1 ? "rgba(6,78,59,.3)" : "#e5e7eb"}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}>
                {s.done ? <span style={{ color: "#fff", fontSize: 16 }}>✓</span> : <span>{s.icon}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: s.done ? 700 : 600, color: s.done ? G : i === steps.length - 1 ? "#6b7280" : "#9ca3af" }}>
                  {s.label}
                </p>
              </div>
              {i === steps.length - 1 && (
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: GOLD, animation: "pulse 1.5s ease infinite" }} />
              )}
            </div>
          ))}
        </div>

        {/* Session info card with Join button */}
        {sessionDate && (
          <div style={{ width: "100%", maxWidth: 440, background: "#F0FDF4", borderRadius: 16, border: "1px solid #86EFAC", padding: "16px 20px", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#166534", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>📅 Virtual Session Scheduled</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: G, margin: "0 0 4px" }}>
              {sessionDate}{sessionTime ? ` at ${sessionTime}` : ""}
            </p>
            <p style={{ fontSize: 12, color: "#16a34a", margin: "0 0 12px" }}>
              An instructor will join you via the platform at the scheduled time.
            </p>
            {isSessionTime ? (
              <button onClick={joinSession}
                style={{
                  width: "100%", padding: "12px 20px", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg,${G},${GM})`, color: "#fff",
                  cursor: "pointer", fontWeight: 800, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(6,78,59,.3)",
                }}>
                <Video size={18} /> Join Virtual Session Now
              </button>
            ) : (
              <p style={{ fontSize: 11, color: "#6b7280", margin: 0, textAlign: "center" }}>
                🔒 Join button will appear 15 minutes before session time
              </p>
            )}
          </div>
        )}

        {/* AI score */}
        {aiScore !== null && aiScore !== undefined && (
          <div style={{ width: "100%", maxWidth: 440, background: "#FFFBEB", borderRadius: 16, border: "1px solid #FDE68A", padding: "14px 20px", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>🎙️ Recitation AI Score</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#b45309", margin: 0 }}>{aiScore}%</p>
          </div>
        )}

        <p style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: GOLD, direction: "rtl", margin: "0 0 24px", textAlign: "center" }}>
          جَزَاكَ اللَّهُ خَيْرًا عَلَى صَبْرِكَ
        </p>
        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", maxWidth: 320, lineHeight: 1.7, margin: "0 0 24px" }}>
          "May Allah reward you for your patience." We will notify you as soon as your level has been assigned.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#F0FDF4", border: "1px solid rgba(6,78,59,.15)", borderRadius: 12, fontSize: 12, color: G }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${G}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
          Checking for approval… ({30 - (checkTime % 30)}s)
        </div>

        <button
          onClick={async () => { await supabase.auth.signOut(); }}
          style={{ marginTop: 24, background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
        >
          Sign out and come back later
        </button>
      </div>
    </>
  );
};

export default TasjeelAwaitingLevel;
