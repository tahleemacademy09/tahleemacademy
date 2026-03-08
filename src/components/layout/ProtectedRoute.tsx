import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  skipOnboardingCheck?: boolean;
}

const ProtectedRoute = ({ children, requiredRole, skipOnboardingCheck }: ProtectedRouteProps) => {
  const { user, loading, hasRole, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole(requiredRole) && !hasRole("admin")) {
    return <Navigate to="/" replace />;
  }

  // Onboarding redirect for students only
  if (
    !skipOnboardingCheck &&
    profile &&
    !hasRole("admin") &&
    !hasRole("teacher") &&
    !(profile as any).onboarding_completed &&
    !(profile as any).has_taken_entrance_exam &&
    !location.pathname.startsWith("/onboarding") &&
    !location.pathname.startsWith("/student/entrance")
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
