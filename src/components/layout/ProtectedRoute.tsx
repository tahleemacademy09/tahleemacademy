// src/components/layout/ProtectedRoute.tsx
// Tasjeel pipeline enforcement has been fully removed.
// This guard now only checks: is the user logged in? Do they have the required role?

import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  skipOnboardingCheck?: boolean; // kept for API compatibility — no longer used
}

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

  // Wrong role → send to home
  if (requiredRole && !hasRole(requiredRole) && !hasRole("admin")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
