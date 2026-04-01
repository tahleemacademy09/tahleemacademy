// src/components/TasjeelGuard.tsx
// Wraps student dashboard — redirects to the correct pipeline step if not completed.

import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";

interface TasjeelGuardProps {
  children: React.ReactNode;
}

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  const { hasRole } = useAuth();
  const { currentStep, loading } = useTasjeel();

  // Admins / teachers bypass
  if (hasRole("admin") || hasRole("teacher")) return <>{children}</>;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (currentStep && currentStep !== "completed") {
    const route = TASJEEL_ROUTES[currentStep] ?? "/student";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
