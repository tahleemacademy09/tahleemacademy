// src/hooks/useTasjeel.ts
// Fixed: hook now waits for auth to finish loading before resolving its own
// loading state. Previously when user was null (auth still initialising),
// it set loading=false and currentStep=null. Since null !== "completed",
// the StudentDashboard gate redirected completed students to /student/awaiting-level.
//
// Fix (2026-06-18): useCallback depended on [user, authLoading] — the user object
// is replaced with a new reference on every TOKEN_REFRESHED event (Supabase creates
// a new object even when the userId hasn't changed). This caused useTasjeel to
// re-run fetchStep on every app resume, setting loading=true and showing the
// TasjeelGuard full-page spinner. Fix: depend on user?.id (stable string) instead
// of the user object itself.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Step → route mapping ───────────────────────────────────────────────────
export const TASJEEL_ROUTES: Record<string, string> = {
  enrollment:       "/register",
  payment:          "/register",
  onboarding:       "/onboarding",
  exam:             "/student/entrance-exam",
  recitation:       "/student/recitation-test",
  schedule_session: "/student/recitation-test",
  level_assignment: "/student/awaiting-level",
  completed:        "/student",
};

// ── Step ordering (for progress display) ──────────────────────────────────
export const STEP_ORDER = [
  "enrollment", "payment", "onboarding", "exam",
  "recitation", "schedule_session", "level_assignment", "completed",
] as const;

export type TasjeelStep = typeof STEP_ORDER[number];

// ── createDashboardIfNotExists ────────────────────────────────────────────
export async function createDashboardIfNotExists(userId: string) {
  const { data } = await supabase
    .from("dashboards")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabase.from("dashboards").insert({ user_id: userId });
  }
}

// ── initializeTasjeel ─────────────────────────────────────────────────────
export async function initializeTasjeel(userId: string, registrationEnabled = true) {
  const { data: existing } = await supabase
    .from("tasjeel_progress")
    .select("id, current_step")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return;

  const step = registrationEnabled ? "enrollment" : "completed";
  const now  = new Date().toISOString();

  await supabase.from("tasjeel_progress").insert({
    user_id:      userId,
    current_step: step,
    created_at:   now,
    updated_at:   now,
    ...(step === "completed" ? { completed_at: now } : {}),
  });
}

// ── useTasjeel hook ───────────────────────────────────────────────────────
export function useTasjeel() {
  const { user, loading: authLoading } = useAuth();

  // KEY FIX: extract stable primitives from auth state.
  // The user object is replaced with a NEW reference on every TOKEN_REFRESHED
  // (Supabase always constructs a new object). Using user?.id (a stable string)
  // as the dependency means we only re-fetch when the actual user changes
  // (login / logout), NOT on every silent token refresh.
  const userId = user?.id ?? null;

  // Keep loading=true until both auth AND the tasjeel fetch are done.
  // This prevents the StudentDashboard gate from firing with currentStep=null.
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  const fetchStep = useCallback(async () => {
    // Don't resolve until auth itself has finished initialising
    if (authLoading) return;

    if (!userId) {
      setCurrentStep(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // ── iOS timeout guard ──────────────────────────────────────────────────
    // On iOS, WebKit can stall concurrent connections to the same host.
    // Without a timeout, this query hangs indefinitely, keeping tasjeelLoading=true
    // which gates the StudentDashboard spinner forever (looks like blank screen).
    // SECURITY: we use a dedicated "timeout" state rather than "completed" so that
    // TasjeelGuard can show a retry prompt rather than silently granting dashboard
    // access to students who haven't finished the registration pipeline.
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      console.warn("[useTasjeel] fetch timed out — showing retry screen");
      setCurrentStep("timeout");
      setLoading(false);
    }, 6000);

    try {
      const { data } = await supabase
        .from("tasjeel_progress")
        .select("current_step")
        .eq("user_id", userId)
        .maybeSingle();

      if (!didTimeout) {
        // SAFETY: if no tasjeel_progress row exists yet, treat as "enrollment"
        // (beginning of the pipeline), NOT "completed". Falling back to
        // "completed" silently grants full dashboard access to brand-new
        // users who haven't finished registration.
        setCurrentStep(data?.current_step ?? "enrollment");
      }
    } catch {
      if (!didTimeout) {
        setCurrentStep("timeout");
      }
    } finally {
      clearTimeout(timeoutId);
      if (!didTimeout) {
        setLoading(false);
      }
    }
  // KEY FIX: depend on userId (stable string) not user (new object every TOKEN_REFRESHED)
  }, [userId, authLoading]);

  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  const advanceStep = useCallback(async (nextStep: string) => {
    if (!userId) return;
    // Always update local state FIRST so guards on the destination page
    // see the new step immediately — even if the DB call fails with 400.
    // (A 400 here usually means an RLS UPDATE policy is missing; see the
    // supabase/migrations note below for the fix.)
    setCurrentStep(nextStep);
    try {
      const { error } = await supabase
        .from("tasjeel_progress")
        .update({ current_step: nextStep, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) {
        console.error("[useTasjeel] advanceStep DB error — local state already updated:", error.message);
      }
    } catch (err) {
      console.error("[useTasjeel] advanceStep network error — local state already updated:", err);
    }
  }, [userId]);

  return { currentStep, loading, refresh: fetchStep, advanceStep };
}
