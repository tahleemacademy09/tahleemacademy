/*  src/hooks/usePaymentAccess.ts
    Shared hook — import in any page/component to check student payment access.
    Reads from profiles.payment_status + profiles.subscription_end_date
    (same source as EnrollmentPayment.tsx — single source of truth).

    Fix (2026-06-18): Same root cause as useTasjeel — useCallback depended on
    [user, isStaff, authLoading]. The user object is a new reference after every
    TOKEN_REFRESHED, causing a full re-fetch and isLoading flicker on every app
    resume from background. Fixed by depending on user?.id instead of user.

    Usage:
      const { hasAccess, accessStatus, isLoading } = usePaymentAccess();
      if (!hasAccess) return <PaymentGuard feature="Al-Hifdh" />;
*/
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type AccessStatus = "active" | "grace" | "locked" | "loading";

export interface PaymentAccessResult {
  hasAccess: boolean;       // true = active OR grace (can enter, with banner)
  hasFullAccess: boolean;   // true = paid and subscription valid only
  accessStatus: AccessStatus;
  daysInGrace: number;      // days remaining in grace / until lock
  isLoading: boolean;
  refetch: () => void;
}

const GRACE_DAYS = 7;

export const usePaymentAccess = (): PaymentAccessResult => {
  const { user, hasRole, loading: authLoading } = useAuth();

  // KEY FIX: use stable primitives, not the user object.
  // user is replaced with a new reference on every TOKEN_REFRESHED.
  const userId  = user?.id ?? null;
  const isAdmin   = hasRole("admin");
  const isTeacher = hasRole("teacher");

  const [status, setStatus]     = useState<AccessStatus>("loading");
  const [graceEnd, setGraceEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Admins and teachers always bypass payment checks.
  // IMPORTANT: evaluate isStaff only after auth has finished loading so that
  // roles[] is populated. Before that, hasRole() always returns false.
  const isStaff = !authLoading && (isAdmin || isTeacher);

  const fetchStatus = useCallback(async () => {
    // Wait for auth to finish so roles are available before checking isStaff
    if (authLoading) return;
    if (!userId) { setStatus("loading"); return; }
    if (isStaff) { setStatus("active"); setIsLoading(false); return; }

    setIsLoading(true);

    // ── iOS timeout guard ─────────────────────────────────────────────────
    // Fail-open after 6 seconds: grant grace access rather than hanging forever.
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      console.warn("[usePaymentAccess] fetch timed out — defaulting to grace");
      setStatus("grace");
      setIsLoading(false);
    }, 6000);

    try {
      const { data } = await supabase
        .from("profiles")
        .select("payment_status, subscription_end_date, is_payment_exempt, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (didTimeout) return; // timeout already resolved

      if (!data) {
        // Profile not yet created — grant grace while it loads
        setStatus("grace");
        setIsLoading(false);
        return;
      }

      const p = data as any;

      // ── 1. Exempt students always have full access ──────────────
      if (p.is_payment_exempt) {
        setStatus("active");
        setIsLoading(false);
        return;
      }

      const now = new Date();

      // ── 2. Has an active subscription end date ──────────────────
      if (p.subscription_end_date) {
        const end = new Date(p.subscription_end_date);
        if (end > now) {
          setStatus("active");
          setIsLoading(false);
          return;
        }
        // Within 7 days after expiry = grace window
        const graceCutoff = new Date(end.getTime() + GRACE_DAYS * 86400000);
        if (graceCutoff > now) {
          setGraceEnd(graceCutoff.toISOString());
          setStatus("grace");
          setIsLoading(false);
          return;
        }
        // Past grace window → locked
        setStatus("locked");
        setIsLoading(false);
        return;
      }

      // ── 3. No subscription date — use payment_status field ───────
      if (p.payment_status === "paid") {
        setStatus("active");
        setIsLoading(false);
        return;
      }

      // New students get 7-day grace from their join date
      const joined   = new Date(p.created_at);
      const graceEnd = new Date(joined.getTime() + GRACE_DAYS * 86400000);
      if (graceEnd > now) {
        setGraceEnd(graceEnd.toISOString());
        setStatus("grace");
        setIsLoading(false);
        return;
      }

      setStatus("locked");
    } catch {
      if (!didTimeout) { setStatus("grace"); }
    } finally {
      clearTimeout(timeoutId);
      if (!didTimeout) { setIsLoading(false); }
    }
  // KEY FIX: depend on userId (stable string) not user (new object every TOKEN_REFRESHED)
  }, [userId, isStaff, authLoading]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const daysInGrace = graceEnd
    ? Math.max(0, Math.ceil((new Date(graceEnd).getTime() - Date.now()) / 86400000))
    : 0;

  return {
    hasAccess:     status !== "locked",
    hasFullAccess: status === "active",
    accessStatus:  status as AccessStatus,
    daysInGrace,
    isLoading,
    refetch: fetchStatus,
  };
};
