import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  skipOnboardingCheck?: boolean; // kept for API compatibility — no longer used
}

// Safe fallback map matching your App.tsx routes
const ROLE_FALLBACKS: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
};

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading: authLoading, hasRole } = useAuth();

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

  // Wrong role → send to their correct dashboard (prevents 404 loops)
  if (requiredRole && !hasRole(requiredRole) && !hasRole("admin")) {
    // Fallback to /student if role detection is temporarily out of sync
    const safeRedirect = ROLE_FALLBACKS["student"]; 
    return <Navigate to={safeRedirect} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;