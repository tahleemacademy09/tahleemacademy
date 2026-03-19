/*  src/hooks/usePaymentAccess.ts
    Shared hook — import in any page to check if student has access.
    Usage:
      const { hasAccess, accessStatus, isLoading } = usePaymentAccess();
      if (!hasAccess) return <PaymentLockedOverlay onPay={...} />;
*/
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type AccessStatus = "active" | "grace" | "locked" | "loading";

export interface PaymentAccessResult {
  hasAccess: boolean;         // true = full access (active or grace)
  hasFullAccess: boolean;     // true = paid and active only
  accessStatus: AccessStatus;
  daysInGrace: number;        // days remaining in grace period
  isLoading: boolean;
  refetch: () => void;
}

export const usePaymentAccess = (): PaymentAccessResult => {
  const { user, hasRole } = useAuth();
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [graceEnd, setGraceEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = hasRole("admin") || hasRole("teacher");

  const fetchStatus = useCallback(async () => {
    if (!user) { setStatus("loading"); return; }
    // Admins/teachers always have full access
    if (isAdmin) { setStatus("active"); setIsLoading(false); return; }

    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("enrollments" as any)
        .select("status,grace_end_date,admin_override,admin_override_until,next_due_date")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) { setStatus("grace"); setIsLoading(false); return; }

      const enr = data as any;
      // Admin override takes priority
      if (enr.admin_override && enr.admin_override_until && new Date(enr.admin_override_until) > new Date()) {
        setStatus("active"); setIsLoading(false); return;
      }
      // Active and not yet expired
      if (enr.status === "active" && enr.next_due_date && new Date(enr.next_due_date) > new Date()) {
        setStatus("active"); setIsLoading(false); return;
      }
      // In grace period
      if ((enr.status === "grace" || enr.status === "active") && enr.grace_end_date && new Date(enr.grace_end_date) > new Date()) {
        setGraceEnd(enr.grace_end_date);
        setStatus("grace"); setIsLoading(false); return;
      }
      setStatus("locked");
    } catch {
      setStatus("grace"); // fail-open
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const daysInGrace = graceEnd
    ? Math.max(0, Math.ceil((new Date(graceEnd).getTime() - Date.now()) / 86400000))
    : 0;

  return {
    hasAccess:     status !== "locked",
    hasFullAccess: status === "active",
    accessStatus:  status,
    daysInGrace,
    isLoading,
    refetch: fetchStatus,
  };
};


