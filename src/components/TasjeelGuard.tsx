// src/components/TasjeelGuard.tsx
// ═══════════════════════════════════════════════════════════════════════════
// TASJEEL GUARD
// Wraps student routes. Checks if user has completed the Tasjeel pipeline.
// In Guided Mode (registration_enabled=true): enforces step order.
// In Quick Mode (registration_enabled=false): passes through immediately.
//
// Usage in App.tsx:
//   <TasjeelGuard><StudentDashboard /></TasjeelGuard>
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel, TASJEEL_ROUTES, TasjeelStep } from "@/hooks/useTasjeel";

// Steps that are allowed to bypass the guard (they ARE the pipeline steps)
const PIPELINE_PATHS = new Set([
  "/register",
  "/onboarding",
  "/student/entrance-exam",
  "/student/entrance-results",
  "/student/awaiting-level",
  "/auth/callback",
]);

// Steps where we DON'T want to redirect (e.g. user is already at the right step)
const BYPASS_STEPS: TasjeelStep[] = ["completed"];

interface TasjeelGuardProps {
  children: React.ReactNode;
  /** Set to true on pipeline step pages themselves to avoid redirect loops */
  isPipelineStep?: boolean;
}

const TasjeelGuard: React.FC<TasjeelGuardProps> = ({
  children,
  isPipelineStep = false,
}) => {
  const { user, hasRole } = useAuth();
  const { currentStep, loading } = useTasjeel();
  const navigate   = useNavigate();
  const location   = useLocation();

  useEffect(() => {
    // Don't enforce for non-students or while loading
    if (loading || !user) return;
    if (hasRole("admin") || hasRole("teacher")) return;

    // Don't redirect if already on a pipeline step page
    if (isPipelineStep) return;
    const onPipelinePath = [...PIPELINE_PATHS].some(
      (p) => location.pathname.startsWith(p)
    );
    if (onPipelinePath) return;

    // Don't redirect if Tasjeel is completed
    if (!currentStep || BYPASS_STEPS.includes(currentStep)) return;

    // Redirect user to their current required step
    const targetRoute = TASJEEL_ROUTES[currentStep];

    // Avoid redirect loop if already there
    if (location.pathname === targetRoute || location.pathname.startsWith(targetRoute)) {
      return;
    }

    console.info(`[TasjeelGuard] User at step="${currentStep}", redirecting to ${targetRoute}`);
    navigate(targetRoute, { replace: true });
  }, [loading, user, currentStep, location.pathname, navigate, hasRole, isPipelineStep]);

  // Show spinner while checking Tasjeel status
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "3px solid #064E3B",
            borderTopColor: "transparent",
            animation: "spin .7s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return <>{children}</>;
};

export default TasjeelGuard;
