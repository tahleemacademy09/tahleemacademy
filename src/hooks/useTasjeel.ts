// src/hooks/useTasjeel.ts
// ═══════════════════════════════════════════════════════════════════════════
// TASJEEL PIPELINE HOOK
// FIX: Wrapped refresh() in try-finally so setLoading(false) is ALWAYS
// called even if the Supabase query throws (e.g. table missing, RLS error,
// network timeout). Previously an uncaught throw left loading=true forever,
// causing ProtectedRoute to spin indefinitely after sign-in.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────

export type TasjeelStep =
  | "enrollment"
  | "payment"
  | "onboarding"
  | "exam"
  | "review"
  | "level_assignment"
  | "completed";

export interface TasjeelProgress {
  id: string;
  user_id: string;
  current_step: TasjeelStep;
  payment_ref: string | null;
  payment_status: "pending" | "paid" | "skipped" | null;
  payment_amount: number | null;
  payment_currency: string;
  payment_paid_at: string | null;
  onboarding_completed_at: string | null;
  exam_attempt_id: string | null;
  exam_completed_at: string | null;
  level_assigned: string | null;
  level_assigned_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseTasjeelReturn {
  progress: TasjeelProgress | null;
  loading: boolean;
  isCompleted: boolean;
  currentStep: TasjeelStep | null;
  advanceStep: (
    toStep: TasjeelStep,
    metadata?: Partial<TasjeelProgress>
  ) => Promise<void>;
  refresh: () => Promise<void>;
  /** Route path for the current Tasjeel step */
  stepRoute: string;
}

// ── Step → route mapping ───────────────────────────────────────────────────

export const TASJEEL_ROUTES: Record<TasjeelStep, string> = {
  enrollment:       "/register",
  payment:          "/register",
  onboarding:       "/onboarding",
  exam:             "/student/entrance-exam",
  review:           "/student/entrance-results",
  level_assignment: "/student/awaiting-level",
  completed:        "/student",
};

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTasjeel(): UseTasjeelReturn {
  const { user } = useAuth();
  const [progress, setProgress] = useState<TasjeelProgress | null>(null);
  const [loading, setLoading]   = useState(true);

  // ── Fetch progress from DB ──────────────────────────────────────────────
  // FIX: try-finally guarantees setLoading(false) always fires, even when
  // the query throws instead of returning { data, error }.
  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("tasjeel_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        // Log but don't crash — user can still proceed
        console.error("[useTasjeel] refresh error:", error);
      } else if (data) {
        setProgress(data as TasjeelProgress);
      }
    } catch (err) {
      // Network / unexpected errors — log but don't leave spinner stuck
      console.error("[useTasjeel] refresh threw:", err);
    } finally {
      // ALWAYS clear loading — this was missing before and caused the
      // infinite spinner on sign-in via ProtectedRoute
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Advance to a new step ───────────────────────────────────────────────
  const advanceStep = useCallback(
    async (toStep: TasjeelStep, metadata?: Partial<TasjeelProgress>) => {
      if (!user) return;

      const update: Record<string, unknown> = {
        current_step: toStep,
        updated_at:   new Date().toISOString(),
        ...metadata,
      };

      if (toStep === "completed") {
        update.completed_at = new Date().toISOString();
      }

      try {
        const { data, error } = await supabase
          .from("tasjeel_progress" as any)
          .upsert(
            { user_id: user.id, ...update } as any,
            { onConflict: "user_id" }
          )
          .select()
          .single();

        if (!error && data) {
          setProgress(data as TasjeelProgress);
        } else if (error) {
          console.error("[useTasjeel] advanceStep error:", error);
        }
      } catch (err) {
        console.error("[useTasjeel] advanceStep threw:", err);
      }
    },
    [user, progress]
  );

  const currentStep = progress?.current_step ?? null;
  const isCompleted = currentStep === "completed";
  const stepRoute   = currentStep ? TASJEEL_ROUTES[currentStep] : "/register";

  return { progress, loading, isCompleted, currentStep, advanceStep, refresh, stepRoute };
}

// ── Utility: Initialize Tasjeel for a user (idempotent) ───────────────────

export async function initializeTasjeel(
  userId: string,
  registrationEnabled: boolean
): Promise<TasjeelProgress | null> {
  const targetStep: TasjeelStep = registrationEnabled ? "enrollment" : "completed";

  const { data, error } = await supabase
    .from("tasjeel_progress" as any)
    .upsert(
      {
        user_id:      userId,
        current_step: targetStep,
        completed_at: !registrationEnabled ? new Date().toISOString() : null,
        updated_at:   new Date().toISOString(),
      } as any,
      {
        onConflict:       "user_id",
        ignoreDuplicates: true,
      }
    )
    .select()
    .single();

  if (error && error.code !== "23505") {
    console.error("[Tasjeel] initializeTasjeel error:", error);
  }

  // Always fetch current state after upsert
  const { data: current } = await supabase
    .from("tasjeel_progress" as any)
    .select("*")
    .eq("user_id", userId)
    .single();

  return (current as TasjeelProgress) ?? null;
}

// ── Utility: Create dashboard record (idempotent) ──────────────────────────

export async function createDashboardIfNotExists(userId: string): Promise<void> {
  await supabase
    .from("dashboards" as any)
    .upsert(
      { user_id: userId, updated_at: new Date().toISOString() } as any,
      { onConflict: "user_id", ignoreDuplicates: true }
    );
}
