import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  skipOnboardingCheck?: boolean;
}

const ROLE_FALLBACKS: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  admin:   "/admin",
};

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading: authLoading, hasRole, roles } = useAuth();
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

  // Not logged in → send to login
  if (!user) return <Navigate to="/login" replace />;

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
