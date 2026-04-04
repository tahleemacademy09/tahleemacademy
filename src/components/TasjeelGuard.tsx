// src/components/TasjeelGuard.tsx
// Wraps student dashboard — redirects to correct pipeline step if not completed.
// Students at level_assignment step are blocked until admin approves.

import { Navigate } from "react-router-dom";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useAuth } from "@/contexts/AuthContext";

interface TasjeelGuardProps { children: React.ReactNode; }

const TasjeelGuard = ({ children }: TasjeelGuardProps) => {
  const { hasRole, loading: authLoading } = useAuth();
  const { currentStep, loading: tasjeelLoading } = useTasjeel();

  if (authLoading || tasjeelLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #064E3B",
          borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Admins / teachers bypass pipeline entirely
  if (hasRole("admin") || hasRole("teacher")) return <>{children}</>;

  // Student: redirect to correct pipeline step if not completed
  if (currentStep && currentStep !== "completed") {
    // level_assignment = waiting for admin approval → show waiting page
    const route = TASJEEL_ROUTES[currentStep] ?? "/student/awaiting-level";
    return <Navigate to={route} replace />;
  }

  return <>{children}</>;
};

export default TasjeelGuard;
