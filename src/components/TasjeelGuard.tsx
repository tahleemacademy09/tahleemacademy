// src/components/TasjeelGuard.tsx
// Wraps student dashboard — redirects to correct pipeline step if not completed.
// Students at level_assignment step are blocked until admin approves.

import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";

interface TasjeelGuardProps { children: React.ReactNode; }

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  const { hasRole, loading: authLoading } = useAuth();
  const { currentStep, loading: tasjeelLoading, refresh } = useTasjeel();

  if (authLoading || tasjeelLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B",
          borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Admins / teachers bypass pipeline entirely
  if (hasRole("admin") || hasRole("teacher")) return <>{children}</>;

  // ── Timeout / network error ──────────────────────────────────────────────
  // Show a retry screen rather than silently granting dashboard access.
  // This prevents students who haven't finished the pipeline from bypassing it
  // during a slow connection on iOS/poor networks.
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
    // No tasjeel_progress row at all — should not happen for normal students
    // but guard against it: send to register to start the pipeline.
    return <Navigate to="/register" replace />;
  }

  if (currentStep !== "completed") {
    // level_assignment = waiting for admin approval → show waiting page
    const route = TASJEEL_ROUTES[currentStep] ?? "/student/awaiting-level";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
