// src/components/TasjeelGuard.tsx
// Wraps student dashboard — redirects to correct pipeline step if not completed.
// Students at level_assignment step are blocked until admin approves.
//
// Fix: also guard against the race where authLoading=false but roles=[] because
// the profiles RLS fetch is still in-flight or failed. We check roles.length > 0
// OR wait for profile to confirm the user is fully loaded before bypassing.

import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";

interface TasjeelGuardProps { children: React.ReactNode; }

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  const { hasRole, loading: authLoading, roles, user } = useAuth();
  const { currentStep, loading: tasjeelLoading, refresh } = useTasjeel();

  // Wait for both auth AND tasjeel to finish loading
  if (authLoading || tasjeelLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B",
          borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Role bypass: admins and teachers skip the student pipeline entirely ──
  // We check roles.length > 0 to guard against the race where authLoading=false
  // but fetchUserData hasn't written roles yet (e.g. RLS error or slow network).
  // If user is authenticated but roles is still empty after auth finishes,
  // we do NOT assume "student" — we wait. The tasjeelLoading guard above
  // handles this for the tasjeel step; here we handle the role bypass.
  if (user && roles.length > 0 && (hasRole("admin") || hasRole("teacher"))) {
    return <>{children}</>;
  }

  // ── If user is authenticated but roles haven't loaded yet, show spinner ──
  // This prevents a teacher/admin from being incorrectly sent to the student pipeline
  // during a brief window where auth is done but the user_roles fetch is still pending.
  if (user && roles.length === 0) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B",
          borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Timeout / network error ──────────────────────────────────────────────
  if (currentStep === "timeout") {
    return (
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        minHeight:"100vh", padding:"40px 24px", textAlign:"center",
        background:"linear-gradient(160deg,#f9fafb 0%,#f0fff4 100%)",
        gap:16,
      }}>
        <div style={{
          width:60, height:60, borderRadius:"50%",
          background:"rgba(201,168,76,.12)", border:"2px solid rgba(201,168,76,.3)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:26,
        }}>⏳</div>
        <div>
          <p style={{ fontWeight:800, fontSize:18, color:"#111", margin:"0 0 6px" }}>
            Connection timeout
          </p>
          <p style={{ fontSize:13, color:"#666", margin:0, maxWidth:280 }}>
            Could not load your registration status. Please check your connection and try again.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          style={{
            background:"linear-gradient(135deg,#064E3B,#075E54)",
            color:"#fff", border:"none", borderRadius:12,
            padding:"12px 28px", fontWeight:700, fontSize:14,
            cursor:"pointer", boxShadow:"0 4px 16px rgba(6,78,59,.3)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Student: redirect to correct pipeline step if not completed
  if (!currentStep) {
    return <Navigate to="/auth/register-continue" replace />;
  }

  if (currentStep !== "completed") {
    const route = TASJEEL_ROUTES[currentStep] ?? "/student/awaiting-level";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
