// src/components/TasjeelGuard.tsx
// Wraps student dashboard — redirects to the correct pipeline step if not completed.
// FIX: Also waits for AuthContext roles to finish loading before checking hasRole,
//      preventing admins/teachers from being bounced to /register on initial render.

import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";

interface TasjeelGuardProps {
  children: React.ReactNode;
}

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  // loading from AuthContext tells us whether roles have been fetched
  const { hasRole, loading: authLoading } = useAuth();
  const { currentStep, loading: tasjeelLoading } = useTasjeel();

  // Wait for BOTH auth roles AND tasjeel step before making any decision.
  // Without this, hasRole("admin") returns false before roles arrive and
  // the guard incorrectly redirects admins/teachers to /register.
  if (authLoading || tasjeelLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Admins / teachers bypass the pipeline entirely
  if (hasRole("admin") || hasRole("teacher")) return <>{children}</>;

  // Student: redirect to correct pipeline step if not yet completed
  if (currentStep && currentStep !== "completed") {
    const route = TASJEEL_ROUTES[currentStep] ?? "/student";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
