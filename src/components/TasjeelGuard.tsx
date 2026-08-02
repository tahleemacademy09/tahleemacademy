// src/components/TasjeelGuard.tsx
// Guards the student dashboard pipeline.
//
// CRITICAL FIX: Teachers and admins must NEVER enter the student pipeline —
// not even for a single render frame. The previous bug was:
//   1. Teacher logs in → RLS error on profiles → roles stays []
//   2. TasjeelGuard sees roles=[] → shows spinner
//   3. useTasjeel queries tasjeel_progress → teacher had a stale "level_assignment"
//      row from being accidentally enrolled as student → redirects to awaiting-level
//
// Fix: TasjeelGuard now checks user_roles DIRECTLY from Supabase as a fallback
// when roles=[] after auth finishes, rather than spinning forever and risking
// a race where useTasjeel resolves first.

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface TasjeelGuardProps { children: React.ReactNode; }

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#f9fafb" }}>
    <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B", borderTopColor:"transparent", animation:"tgSpin .7s linear infinite" }}/>
    <style>{`@keyframes tgSpin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  const { hasRole, loading: authLoading, roles, user } = useAuth();
  const { currentStep, loading: tasjeelLoading, refresh } = useTasjeel();

  // Fallback: if roles is still [] after auth finishes, query user_roles directly.
  // This handles the case where the profiles RLS bug caused fetchUserData to fail
  // silently and never populate roles in AuthContext.
  const [directRole, setDirectRole] = useState<string | null>(null);
  const [directRoleLoading, setDirectRoleLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (roles.length > 0) return; // already have roles from AuthContext — done
    if (!user) return;
    // roles is empty after auth finished — query directly as safety net
    setDirectRoleLoading(true);
    let cancelled = false;

    // FIX: same class of bug as ProtectedRoute's fallback query and the
    // user_roles check in useTasjeel — this had NO timeout at all, so a
    // stalled connection left directRoleLoading stuck true forever and the
    // spinner below never cleared. Race against a 5s timeout instead.
    const timeoutPromise = new Promise<{ data: null }>((resolve) =>
      setTimeout(() => resolve({ data: null }), 5000)
    );
    const queryPromise = supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    Promise.race([queryPromise, timeoutPromise]).then(({ data }) => {
      if (cancelled) return;
      const r = (data || []).map((d: any) => d.role);
      if (r.includes("admin") || r.includes("teacher")) {
        setDirectRole(r.find((x: string) => x === "admin") ?? "teacher");
      } else {
        setDirectRole("student");
      }
      setDirectRoleLoading(false);
    });

    return () => { cancelled = true; };
  }, [authLoading, roles, user?.id]);

  // ── Still loading ──────────────────────────────────────────────────────
  if (authLoading || tasjeelLoading || directRoleLoading) return <Spinner />;

  // ── Determine effective role ───────────────────────────────────────────
  const isTeacherOrAdmin =
    hasRole("admin") || hasRole("teacher") ||
    directRole === "admin" || directRole === "teacher";

  // Teachers and admins NEVER go through the student pipeline
  if (isTeacherOrAdmin) return <>{children}</>;

  // ── Timeout / network error ────────────────────────────────────────────
  if (currentStep === "timeout") {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", padding:"40px 24px", textAlign:"center", background:"linear-gradient(160deg,#f9fafb 0%,#f0fff4 100%)", gap:16 }}>
        <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(201,168,76,.12)", border:"2px solid rgba(201,168,76,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>⏳</div>
        <div>
          <p style={{ fontWeight:800, fontSize:18, color:"#111", margin:"0 0 6px" }}>Connection timeout</p>
          <p style={{ fontSize:13, color:"#666", margin:0, maxWidth:280 }}>Could not load your registration status. Please check your connection and try again.</p>
        </div>
        <button onClick={() => refresh()} style={{ background:"linear-gradient(135deg,#064E3B,#075E54)", color:"#fff", border:"none", borderRadius:12, padding:"12px 28px", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:"0 4px 16px rgba(6,78,59,.3)" }}>
          Retry
        </button>
      </div>
    );
  }

  // ── Student pipeline routing ───────────────────────────────────────────
  if (!currentStep) return <Navigate to="/auth/register-continue" replace />;
  if (currentStep !== "completed") {
    const route = TASJEEL_ROUTES[currentStep] ?? "/student/awaiting-level";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
