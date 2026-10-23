// src/hooks/useImpersonation.ts
// Provides the effective user ID — either the impersonated student or the real user.
import { useAuth } from "@/contexts/AuthContext";

export function useImpersonation() {
  const { user, hasRole } = useAuth();
  const impersonatedId = sessionStorage.getItem("admin_impersonate_student");
  const impersonatedName = sessionStorage.getItem("admin_impersonate_name");
  const impersonatedEmail = sessionStorage.getItem("admin_impersonate_email");
  const isImpersonating = !!(hasRole("admin") && impersonatedId);

  // The effective user ID for data queries
  const effectiveUserId = isImpersonating ? impersonatedId! : user?.id ?? "";

  const stopImpersonating = () => {
    sessionStorage.removeItem("admin_impersonate_student");
    sessionStorage.removeItem("admin_impersonate_name");
    sessionStorage.removeItem("admin_impersonate_email");
  };

  return { effectiveUserId, isImpersonating, impersonatedName, impersonatedEmail, stopImpersonating };
}
