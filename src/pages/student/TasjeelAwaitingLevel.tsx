// src/pages/student/TasjeelAwaitingLevel.tsx
// Shown after booking the virtual recitation session.
// Polls for admin confirmation + level assignment.
// Join button auto-activates at session time once admin has confirmed.

import { useEffect, useState, useRef } from "react";
import { useNavigate }  from "react-router-dom";
import { supabase }     from "@/integrations/supabase/client";
import { useAuth }      from "@/contexts/AuthContext";
import { useTasjeel }   from "@/hooks/useTasjeel";
import { Video, CheckCircle2, Clock, Loader2 } from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9973A";

const sessionActive = (date?: string, time?: string): boolean => {
  if (!date || !time) return false;
  try {
    const dt   = new Date(`${date}T${time}:00`);
    const diff = (dt.getTime() - Date.now()) / 60000;
    return diff <= 15 && diff >= -120;
  } catch { return false; }
};

const sessionPast = (date?: string, time?: string): boolean => {
  if (!date || !time) return false;
  try {
    const dt = new Date(`${date}T${time}:00`);
    return (Date.now() - dt.getTime()) / 60000 > 120;
  } catch { return false; }
};

const TasjeelAwaitingLevel = () => {
  const { user, profile }        = useAuth();
  const { currentStep, refresh } = useTasjeel();
  const navigate                 = useNavigate();
  const [recData, setRecData]    = useState<any>(null);
  const [checkTime, setCheckTime] = useState(0);
  const [tick, setTick]           = useState(0); // forces re-render for live countdown
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect once admin approves level
  useEffect(() => {
    if (currentStep === "completed") navigate("/student", { replace: true });
  }, [currentStep, navigate]);

  // Load recitation data
  const loadRec = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("recitation_tests")
      .select("virtual_session_date, virtual_session_time, ai_score, status, admin_approved, admin_approved_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setRecData(data);
  };

  useEffect(() => { loadRec(); }, [user]); // eslint-disable-line

  // Poll every 30s — only advances when admin sets tasjeel_progress to "completed"
  useEffect(() => {
    if (!user) return;
    const poll = setInterval(async () => {
      setCheckTime(0);
      await refresh();   // useTasjeel re-fetches tasjeel_progress.current_step
      await loadRec();   // refresh session confirmation status
      // Navigation happens automatically via the useEffect above
      // that watches currentStep === "completed" — set only by admin
    }, 30_000);

    const cnt = setInterval(() => {
      setCheckTime(t => t + 1);
      setTick(t => t + 1); // keep session-active check fresh
    }, 1000);

    return () => { clearInterval(poll); clearInterval(cnt); };
  }, [user, refresh, navigate]); // eslint-disable-line

  const sessionDate    = recData?.virtual_session_date;
  const sessionTime    = recData?.virtual_session_time;
  const aiScore        = recData?.ai_score;
  const adminApproved  = !!recData?.admin_approved;
  const isActive       = adminApproved && sessionActive(sessionDate, sessionTime);
  const isPast         = sessionPast(sessionDate, sessionTime);

  const joinSession = () => {
    if (!user) return;
    const roomName = `recitation-eval-${user.id}`;
    navigate(`/student/live-classes?room=${roomName}&type=recitation`);
  };

  const steps = [
    { icon: "📝", label: "Account Created",   done: true  },
    { icon: "💳", label: "Payment Completed", done: true  },
    { icon: "📋", label: "Onboarding Done",   done: true  },
    { icon: "📖", label: "Entrance Exam Done",done: true  },
    { icon: "🎙️", label: "Recitation Submitted", done: true },
    {
      icon: "📅",
      label: sessionDate
        ? `Session: ${sessionDate}${sessionTime ? " · " + sessionTime : ""}`
        : "Session Booked",
      done: !!sessionDate,
    },
    {
      icon: "✅",
      label: adminApproved ? "Session Confirmed ✓" : "Awaiting Admin Confirmation",
      done: adminApproved,
    },
    { icon: "🎓", label: "Level Assignment", done: false },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800&display=swap');
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 0 0 rgba(6,78,59,.2)} 50%{box-shadow:0 0 0 12px rgba(6,78,59,0)} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#FDFCF9", fontFamily: "'Cairo',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px 60px" }}>

        {/* Icon */}
        <div style={{ width: 80, height: 80, borderRadius: 22, background: G, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, animation: "float 3.5s ease-in-out infinite", boxShadow: `0 8px 32px rgba(6,78,59,.28)` }}>
          <span style={{ fontSize: 36 }}>📖</span>
        </div>

        <p style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: GOLD, margin: "0 0 8px", direction: "rtl", animation: "pulse 3s ease infinite" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: G, textAlign: "center", margin: "0 0 10px" }}>
          Registration Under Review
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", maxWidth: 400, lineHeight: 1.8, margin: "0 0 28px" }}>
          Your registration is complete! Our instructors are reviewing your exam and recitation results to assign your learning level.
        </p>

        {/* Progress steps */}
        <div style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb", padding: "20px 20px 12px", marginBottom: 18, boxShadow: "0 2px 12px rgba(0,0,0,.05)", animation: "fadeUp .4s ease" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Your Progress</p>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: s.done ? G : "rgba(6,78,59,.06)", border: `2px solid ${s.done ? G : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all .3s" }}>
                {s.done ? <span style={{ color: "#fff", fontSize: 16 }}>✓</span> : <span>{s.icon}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: s.done ? 700 : 600, color: s.done ? G : "#9ca3af" }}>{s.label}</p>
              </div>
              {i === steps.length - 1 && !s.done && (
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: GOLD, animation: "pulse 1.5s ease infinite", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Session Card ── */}
        {sessionDate && (
          <div style={{ width: "100%", maxWidth: 460, borderRadius: 18, border: `2px solid ${adminApproved ? "#86EFAC" : "#FDE68A"}`, background: adminApproved ? "#F0FDF4" : "#FFFBEB", padding: "18px 20px", marginBottom: 16, animation: "fadeUp .4s ease .1s both" }}>

            {/* Confirmation badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {adminApproved ? (
                <CheckCircle2 size={18} color="#16a34a" />
              ) : (
                <Clock size={18} color="#b45309" />
              )}
              <span style={{ fontSize: 12, fontWeight: 800, color: adminApproved ? "#166534" : "#92400E", textTransform: "uppercase", letterSpacing: .5 }}>
                {adminApproved ? "Session Confirmed by Admin ✅" : "Session Pending Admin Confirmation ⏳"}
              </span>
            </div>

            <p style={{ fontSize: 16, fontWeight: 800, color: G, margin: "0 0 4px" }}>
              {sessionDate}{sessionTime ? ` at ${sessionTime}` : ""}
            </p>

            {adminApproved ? (
              <p style={{ fontSize: 12, color: "#16a34a", margin: "0 0 14px", lineHeight: 1.6 }}>
                An instructor is confirmed for your session. The Join button will activate automatically 15 minutes before your scheduled time.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: "#78350F", margin: "0 0 14px", lineHeight: 1.6 }}>
                Admin is reviewing your booking and will confirm within 24 hours. You will receive a notification when confirmed.
              </p>
            )}

            {/* Join button */}
            {adminApproved && !isPast && (
              isActive ? (
                <button onClick={joinSession} style={{ width: "100%", padding: "14px 20px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 6px 20px rgba(6,78,59,.35)", animation: "glow 2s ease-in-out infinite" }}>
                  <Video size={20} /> Join Your Virtual Session — LIVE NOW
                </button>
              ) : (
                <div style={{ padding: "11px 16px", borderRadius: 12, background: "rgba(6,78,59,.06)", border: "1px solid rgba(6,78,59,.15)", fontSize: 12, color: G, textAlign: "center", fontWeight: 600 }}>
                  🔒 Join button activates automatically 15 minutes before session time
                </div>
              )
            )}

            {/* Past session */}
            {isPast && (
              <div style={{ padding: "11px 16px", borderRadius: 12, background: "#F3F4F6", border: "1px solid #E5E7EB", fontSize: 12, color: "#6B7280", textAlign: "center" }}>
                Session time has passed. Waiting for admin to assign your level.
              </div>
            )}
          </div>
        )}

        {/* AI score */}
        {aiScore !== null && aiScore !== undefined && (
          <div style={{ width: "100%", maxWidth: 460, background: "#FFFBEB", borderRadius: 16, border: "1px solid #FDE68A", padding: "14px 20px", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>🎙️ Recitation AI Score</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: "#b45309", margin: 0 }}>{aiScore}%</p>
            <p style={{ fontSize: 11, color: "#92400E", margin: "4px 0 0" }}>
              {aiScore >= 75 ? "Excellent — well done!" : aiScore >= 50 ? "Good — keep practicing!" : "Instructor will evaluate during live session"}
            </p>
          </div>
        )}

        <p style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: GOLD, direction: "rtl", margin: "8px 0 20px", textAlign: "center" }}>
          جَزَاكَ اللَّهُ خَيْرًا عَلَى صَبْرِكَ
        </p>
        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", maxWidth: 320, lineHeight: 1.7, margin: "0 0 24px" }}>
          "May Allah reward you for your patience." You will be notified once your level has been assigned and your dashboard is ready.
        </p>

        {/* Polling indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#F0FDF4", border: "1px solid rgba(6,78,59,.15)", borderRadius: 12, fontSize: 12, color: G }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${G}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
          Checking for updates… ({30 - (checkTime % 30)}s)
        </div>

        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 24, background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
          Sign out and come back later
        </button>
      </div>
    </>
  );
};

export default TasjeelAwaitingLevel;