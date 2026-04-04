// src/hooks/useTasjeel.ts
// Tasjeel (registration pipeline) hook — complete 7-step flow:
// enrollment → payment → onboarding → exam → recitation → schedule_session → level_assignment → completed

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
  schedule_session: "/student/recitation-test",   // same page, stage 3
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

  if (existing) return; // already initialized

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
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  const fetchStep = useCallback(async () => {
    if (!user) { setCurrentStep(null); setLoading(false); return; }
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

  useEffect(() => { fetchStep(); }, [fetchStep]);

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
