// src/hooks/useTasjeel.ts
// Fixed: hook now waits for auth to finish loading before resolving its own
// loading state. Previously when user was null (auth still initialising),
// it set loading=false and currentStep=null. Since null !== "completed",
// the StudentDashboard gate redirected completed students to /student/awaiting-level.

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

  // Keep loading=true until both auth AND the tasjeel fetch are done.
  // This prevents the StudentDashboard gate from firing with currentStep=null.
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  const fetchStep = useCallback(async () => {
    // Don't resolve until auth itself has finished initialising
    if (authLoading) return;

    if (!user) {
      // Auth is done and there is no user — nothing to fetch
      setCurrentStep(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase
        .from("tasjeel_progress")
        .select("current_step")
        .eq("user_id", user.id)
        .maybeSingle();

      // If no row exists, treat as completed (safety fallback for edge cases
      // e.g. admin-created students without a pipeline row)
      setCurrentStep(data?.current_step ?? "completed");
    } catch {
      // Network error — default to completed so users aren't locked out
      setCurrentStep("completed");
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  const advanceStep = useCallback(async (nextStep: string) => {
    if (!user) return;
    await supabase
      .from("tasjeel_progress")
      .update({ current_step: nextStep, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    setCurrentStep(nextStep);
  }, [user]);

  return { currentStep, loading, refresh: fetchStep, advanceStep };
}
