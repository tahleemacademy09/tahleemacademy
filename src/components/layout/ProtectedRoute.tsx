import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  // Note: TasjeelGuard lives inside DashboardLayout, so any route rendered
  // outside DashboardLayout (e.g. exam-taking, awaiting-level) is already
  // outside the guard boundary. No extra prop is needed here.
}

const ROLE_FALLBACKS: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  admin:   "/admin",
};

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading: authLoading, hasRole, roles, mustChangePassword } = useAuth();
  const location = useLocation();

  // Wait for auth to finish loading before making any decision
  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Not logged in → send to login, preserving current URL so we can restore it after sign-in
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Admin created this account → force password change before anything else
  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // ── Admins must not land on /student/* UNLESS impersonating ───────────
  const isImpersonating = !!sessionStorage.getItem("admin_impersonate_student");
  if (hasRole("admin") && location.pathname.startsWith("/student") && !isImpersonating) {
    return <Navigate to="/admin" replace />;
  }

  // Wrong role → redirect to the user's own dashboard (not always /student)
  if (requiredRole && !hasRole(requiredRole) && !hasRole("admin")) {
    const myRole = ["admin", "teacher"].find(r => hasRole(r)) || "student";
    return <Navigate to={ROLE_FALLBACKS[myRole]} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
