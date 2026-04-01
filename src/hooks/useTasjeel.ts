// src/hooks/useTasjeel.ts
// Tasjeel (registration pipeline) hook and helpers

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Step → route mapping (used by ProtectedRoute) ────────────────────────
export const TASJEEL_ROUTES: Record<string, string> = {
  enrollment:       "/register",
  payment:          "/register",
  onboarding:       "/onboarding",
  exam:             "/student/entrance-exam",
  review:           "/student/entrance-results",
  level_assignment: "/student/awaiting-level",
  completed:        "/student",
};

// ── createDashboardIfNotExists ───────────────────────────────────────────
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

// ── initializeTasjeel ────────────────────────────────────────────────────
// Idempotent — safe to call multiple times.
// If registrationEnabled is false, auto-complete the pipeline.
export async function initializeTasjeel(userId: string, registrationEnabled = true) {
  // Check if record already exists
  const { data: existing } = await supabase
    .from("tasjeel_progress")
    .select("id, current_step")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return; // already initialized

  const step = registrationEnabled ? "enrollment" : "completed";
  const now = new Date().toISOString();

  await supabase.from("tasjeel_progress").insert({
    user_id: userId,
    current_step: step,
    created_at: now,
    updated_at: now,
    ...(step === "completed" ? { completed_at: now } : {}),
  });
}

// ── useTasjeel hook ──────────────────────────────────────────────────────
export function useTasjeel() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStep = useCallback(async () => {
    if (!user) {
      setCurrentStep(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("tasjeel_progress")
        .select("current_step")
        .eq("user_id", user.id)
        .maybeSingle();

      setCurrentStep(data?.current_step ?? "completed");
    } catch {
      setCurrentStep("completed");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  const advanceStep = useCallback(
    async (nextStep: string) => {
      if (!user) return;
      await supabase
        .from("tasjeel_progress")
        .update({
          current_step: nextStep,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      setCurrentStep(nextStep);
    },
    [user]
  );

  return {
    currentStep,
    loading,
    refresh: fetchStep,
    advanceStep,
  };
}
