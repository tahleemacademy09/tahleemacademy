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
// SINGLE SOURCE OF TRUTH. Previously Login.tsx and TasjeelGuard each kept their
// own copy of this map and they drifted apart (e.g. enrollment/payment pointed
// to "/register" here but "/auth/register-continue" in Login.tsx). That drift,
// combined with two independent timed Supabase queries reaching different
// conclusions about the same user, is what produced the "reload right after
// login on the dashboard" symptom — it wasn't a reload, it was two different
// navigate() calls landing one after another. Everything that needs to know
// "where does a mid-registration student belong" must import THIS map.
export const TASJEEL_ROUTES: Record<string, string> = {
  enrollment:       "/auth/register-continue", // resume registration where they left off
  payment:          "/auth/register-continue",
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

// ── healStuckPaymentStep ───────────────────────────────────────────────────
// FIX: students who had already confirmed their email and paid were being
// sent back to "pay again" / re-shown the payment screen. Root cause: after
// payment, RegisterContinue.tsx runs an UPDATE on tasjeel_progress to move
// current_step past "payment" — if that write fails for any reason (missing
// RLS policy, dropped connection, etc.) it fails silently and current_step
// stays on "enrollment"/"payment" forever, even though the payment actually
// succeeded. Every subsequent login re-reads that stale value and routes the
// student straight back to the payment screen.
//
// Rather than trust a single write to always have succeeded, whenever we
// resolve a student's step and find them sitting on "enrollment" or
// "payment", we cross-check the actual source of truth
// (enrollments.registration_paid) and the current registration settings. If
// they've genuinely already paid (or the fee is disabled entirely), we
// re-derive the correct next step and skip them past it — self-healing the
// stuck row (best effort) so this only has to happen once per user.
export async function healStuckPaymentStep(userId: string, step: string): Promise<string> {
  if (step !== "enrollment" && step !== "payment") return step;

  try {
    const [{ data: settingsRows }, { data: enrollment }] = await Promise.all([
      supabase.from("academy_settings" as any).select("key, value"),
      supabase.from("enrollments" as any).select("registration_paid").eq("user_id", userId).maybeSingle(),
    ]);

    const cfg: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { if (r.value !== null) cfg[r.key] = r.value; });

    const feeEnabled  = cfg.entrance_fee_enabled !== "false";
    const alreadyPaid = !!(enrollment as any)?.registration_paid;

    // Nothing to heal — fee is required and genuinely not yet paid.
    if (feeEnabled && !alreadyPaid) return step;

    const onboardingRequired = cfg.onboarding_required !== "false";
    const examRequired       = cfg.entrance_exam_required !== "false";
    const recitationRequired = cfg.recitation_test_required !== "false";

    const nextStep = onboardingRequired
      ? "onboarding"
      : examRequired
        ? "exam"
        : recitationRequired
          ? "recitation"
          : "level_assignment";

    // Best-effort write-back so future logins don't need to heal again.
    // If this UPDATE fails too (e.g. the RLS policy really is missing), we
    // still return the healed step below so the student isn't blocked now.
    try {
      await supabase
        .from("tasjeel_progress")
        .update({ current_step: nextStep, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch {
      /* non-fatal — see comment above */
    }

    return nextStep;
  } catch {
    // Couldn't verify payment/settings (e.g. offline) — leave step as-is
    // rather than guessing; showing the payment screen is still correct
    // in that case.
    return step;
  }
}

// ── resolveTasjeelStep ────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for "what step is this authenticated user actually
// at, and where do they belong." Used by both useTasjeel() (the continuous
// dashboard guard) and Login.tsx (the one-time post-sign-in redirect) so the
// two can never disagree about a user's destination. Previously each kept
// an independent Supabase query with its own timeout, which could resolve
// to two different steps a few hundred ms apart — Login.tsx would navigate
// to /student, then TasjeelGuard's own slower query would resolve and bounce
// the user again. That double-navigate is what looked like a "reload."
//
// "No row" handling is the existing-users-login-freely rule: a CONFIRMED
// user with no tasjeel_progress row is an existing/legacy account that
// predates this pipeline — back-fill them as completed rather than dropping
// them into registration. An UNCONFIRMED user with no row is genuinely new
// and belongs at the start of the pipeline.
export async function resolveTasjeelStep(
  userId: string,
  emailConfirmedAt: string | null | undefined,
  timeoutMs = 6000
): Promise<string> {
  const timeoutPromise = new Promise<{ data: null }>((resolve) =>
    setTimeout(() => resolve({ data: null }), timeoutMs)
  );
  const queryPromise = supabase
    .from("tasjeel_progress")
    .select("current_step")
    .eq("user_id", userId)
    .maybeSingle();

  const { data } = await Promise.race([queryPromise, timeoutPromise]);
  const existingStep = (data as any)?.current_step as string | undefined;

  if (existingStep) return healStuckPaymentStep(userId, existingStep);

  // No row at all.
  if (emailConfirmedAt) {
    // Existing confirmed user predating the pipeline — back-fill once so
    // this check is a no-op on every future login/dashboard visit.
    try {
      const now = new Date().toISOString();
      await supabase.from("tasjeel_progress").insert({
        user_id:      userId,
        current_step: "completed",
        created_at:   now,
        updated_at:   now,
        completed_at: now,
      });
    } catch {
      /* non-fatal — row may already exist from a concurrent request */
    }
    return "completed";
  }

  // Genuinely new, unconfirmed account — start of the pipeline.
  return "enrollment";
}

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

    // ── CRITICAL: Teachers and admins are NEVER in the student pipeline ──
    // Check user_roles first — if they are admin/teacher, short-circuit to
    // "completed" immediately without querying tasjeel_progress at all.
    // This prevents stale tasjeel rows (e.g. from accidental student enrollment)
    // from ever routing a teacher to the student registration screens.
    try {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const userRoles = (roleData || []).map((r: any) => r.role);
      if (userRoles.includes("admin") || userRoles.includes("teacher")) {
        setCurrentStep("completed");
        setLoading(false);
        return;
      }
    } catch {
      // Non-fatal — continue to tasjeel_progress check
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
      // SINGLE SOURCE OF TRUTH: same resolver Login.tsx calls for the
      // post-sign-in redirect. Previously this inline query had its own
      // "no row → enrollment" fallback that did NOT back-fill confirmed
      // legacy users, while Login.tsx's separate copy did — so a confirmed
      // existing user landing here directly (e.g. PWA resume, deep link)
      // without going through Login.tsx first could get bounced into
      // registration. resolveTasjeelStep() now handles that consistently
      // everywhere.
      const step = await resolveTasjeelStep(userId, user?.email_confirmed_at);
      if (!didTimeout) {
        setCurrentStep(step);
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
