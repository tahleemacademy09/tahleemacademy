// src/components/layout/ProtectedRoute.tsx
// CRITICAL FIX: Teacher/admin on /student/* routes must ALWAYS be redirected —
// even when roles[] is still loading. Added a direct user_roles fallback query
// so that a teacher is never shown the student pipeline even if AuthContext
// roles hasn't populated yet (e.g. after RLS error or slow network).

import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, hasPersistedSupabaseSession } from "@/integrations/supabase/client";
import { logDiag } from "@/lib/diagnostics";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import StudentMaintenanceGate from "@/components/shared/StudentMaintenanceGate";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const ROLE_FALLBACKS: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  admin:   "/admin",
};

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
    <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B", borderTopColor:"transparent", animation:"spin .7s linear infinite" }}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading: authLoading, hasRole, roles, mustChangePassword } = useAuth();
  const location = useLocation();
  const { settings: academySettings, loading: academyLoading } = useAcademySettings();

  // ── Direct role fallback ─────────────────────────────────────────────────
  // If AuthContext roles is still empty after auth finishes (e.g. RLS bug),
  // query user_roles directly so we can still protect routes correctly.
  const [fallbackRole, setFallbackRole] = useState<string | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => {
    if (authLoading || roles.length > 0 || !user) return;
    // roles is empty after auth — check directly
    setFallbackLoading(true);
    let cancelled = false;

    // FIX: this query previously had no timeout at all — unlike every other
    // Supabase call gating a loading state elsewhere in this codebase. If it
    // stalled (same iOS/Android WebView stalled-connection issue documented
    // in AuthContext and useTasjeel), fallbackLoading never flipped back to
    // false and the spinner above (`authLoading || fallbackLoading`) spun
    // forever with no way out — exactly the "still spinning after minimize
    // and go back" symptom. Race against a 5s timeout instead.
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
      if (r.includes("admin"))        setFallbackRole("admin");
      else if (r.includes("teacher")) setFallbackRole("teacher");
      else                            setFallbackRole("student");
      setFallbackLoading(false);
    });

    return () => { cancelled = true; };
  // Depend on stable primitives only. Supabase replaces the User object on a
  // silent token refresh; depending on that object restarted this fallback
  // query and briefly replaced the current page with the full-screen spinner.
  }, [authLoading, roles.length, user?.id]);

  if (authLoading || fallbackLoading) return <Spinner />;

  // Side-effecting diagnostic write belongs in an effect, not render — but
  // this component is about to return a <Navigate>, which unmounts before
  // any effect from this render would run. Logging inline here is the only
  // way to actually capture the moment it happens; it's a plain localStorage
  // append with no state update, so it's safe to run during render.
  if (!user) {
    logDiag("protected_route_redirect_to_login", {
      from: location.pathname,
      hadPersistedSession: hasPersistedSupabaseSession(),
    });
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Effective role — prefer live AuthContext roles, fall back to direct query result
  const effectiveHasRole = (role: string) =>
    hasRole(role) || fallbackRole === role;

  const isImpersonating = !!sessionStorage.getItem("admin_impersonate_student");

  // ── Student platform maintenance gate ────────────────────────────────────
  // A pure student (never an admin/teacher, and not an admin impersonating a
  // student) hitting any /student/* route while academy_status ===
  // "maintenance" sees a full-screen block instead of the route's children.
  // No dashboard, no nav, no dismiss — until an admin flips status back to
  // Active from Admin Settings → Academy.
  const isPureStudent = effectiveHasRole("student") && !effectiveHasRole("admin") && !effectiveHasRole("teacher");

  const bypassIds = (academySettings.maintenance_bypass_user_ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const isBypassed = !!user && bypassIds.includes(user.id);

  if (
    isPureStudent &&
    !isImpersonating &&
    !isBypassed &&
    !academyLoading &&
    academySettings.academy_status === "maintenance" &&
    location.pathname.startsWith("/student")
  ) {
    return <StudentMaintenanceGate />;
  }

  // ── Admin must not land on /student/* unless impersonating ──────────────
  if (effectiveHasRole("admin") && location.pathname.startsWith("/student") && !isImpersonating) {
    return <Navigate to="/admin" replace />;
  }

  // ── Teacher must not land on /student/* ever ─────────────────────────────
  // This is the primary fix — even if TasjeelGuard fails, this catches it.
  if (effectiveHasRole("teacher") && location.pathname.startsWith("/student") && !isImpersonating) {
    return <Navigate to="/teacher" replace />;
  }

  // ── Wrong role for this route ─────────────────────────────────────────────
  if (requiredRole && !effectiveHasRole(requiredRole) && !effectiveHasRole("admin")) {
    const myRole = ["admin", "teacher"].find(r => effectiveHasRole(r)) || "student";
    return <Navigate to={ROLE_FALLBACKS[myRole]} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
