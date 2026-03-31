// src/components/layout/ProtectedRoute.tsx
// TASJEEL-AWARE: dashboard is only accessible when current_step === "completed"
// All other students are redirected to their pipeline step.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  skipOnboardingCheck?: boolean;
}

// Paths that ARE the pipeline — never redirect away from these
const PIPELINE_PATHS = [
  "/register",
  "/onboarding",
  "/student/entrance-exam",
  "/student/entrance-results",
  "/student/awaiting-level",
  "/student/recitation-test",
  "/student/payment",
  "/auth/callback",
  "/login",
  "/reset-password",
];

const isPipelinePath = (pathname: string) =>
  PIPELINE_PATHS.some((p) => pathname.startsWith(p));

const ProtectedRoute = ({ children, requiredRole, skipOnboardingCheck }: ProtectedRouteProps) => {
  const { user, loading: authLoading, hasRole, profile } = useAuth();
  const { currentStep, loading: tasjeelLoading }         = useTasjeel();
  const location = useLocation();

  const loading = authLoading || tasjeelLoading;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && !hasRole(requiredRole) && !hasRole("admin")) {
    return <Navigate to="/" replace />;
  }

  // ── Tasjeel enforcement (students only) ──────────────────────────────
  // Admins and teachers bypass all pipeline checks
  if (!hasRole("admin") && !hasRole("teacher") && !skipOnboardingCheck) {
    // If we're already on a pipeline path, don't redirect
    if (!isPipelinePath(location.pathname)) {
      // Student must be "completed" to access any dashboard route
      if (currentStep && currentStep !== "completed") {
        const targetRoute = TASJEEL_ROUTES[currentStep];
        // Avoid redirect loop
        if (!location.pathname.startsWith(targetRoute)) {
          return <Navigate to={targetRoute} replace />;
        }
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
