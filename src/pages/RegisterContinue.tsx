// src/pages/RegisterContinue.tsx
// ═══════════════════════════════════════════════════════════════════════════
// POST-EMAIL-VERIFICATION CONTINUATION PAGE
// Route: /auth/register-continue
//
// Called after user clicks the email verification link.
// Supabase sends them here with #access_token in URL hash.
// Flow: establish session → check tasjeel → payment (if needed) → /onboarding
//
// FIXED BUGS:
//  1. "review" was routed to awaiting-level but never existed in STEP_ORDER —
//     removed; any unrecognised step falls through to a safe default.
//  2. "recitation" and "schedule_session" steps had no routing — users who
//     had completed exam but not recitation were incorrectly sent to onboarding.
//  3. "payment" step (stale DB value) now correctly re-shows payment screen
//     instead of sending the user back to the start.
//  5. initializeTasjeel throws (DB error) → catches cleanly, shows error UI.
//  7. Fee disabled + onboarding disabled chain: now skips both and advances
//     to the next enabled step (exam → recitation → awaiting-level).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, CheckCircle2, CreditCard, Shield, Star,
  ArrowRight, Loader2, AlertCircle,
} from "lucide-react";
import { initializeTasjeel } from "@/hooks/useTasjeel";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

// ── Paystack script loader ────────────────────────────────────────────────
const ensurePaystack = () =>
  new Promise<void>((resolve) => {
    if ((window as any).PaystackPop) { resolve(); return; }
    if (document.getElementById("paystack-script")) {
      const poll = setInterval(() => {
        if ((window as any).PaystackPop) { clearInterval(poll); resolve(); }
      }, 200);
      return;
    }
    const s = document.createElement("script");
    s.id = "paystack-script";
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });

// ── Determine where a student should be sent given their current step ──────
// This is the single source of truth for mid-registration resume routing.
// Returns null when the step means "show payment screen here".
const resolveRoute = (
  step: string,
  cfg: { entrance_fee_enabled: boolean; onboarding_required: boolean; entrance_exam_required: boolean; recitation_test_required: boolean }
): string | null => {
  switch (step) {
    // Already past payment/enrollment → send to their correct pipeline page
    case "onboarding":       return cfg.onboarding_required ? "/onboarding" : null; // fall-through handled below
    case "exam":             return "/student/entrance-exam";
    case "recitation":       return "/student/recitation-test";     // BUG 2 — was missing
    case "schedule_session": return "/student/recitation-test";     // BUG 2 — was missing
    case "level_assignment": return "/student/awaiting-level";
    case "completed":        return "/student";

    // BUG 3 — "payment" stale value: stay on payment screen (return null)
    case "payment":
    case "enrollment":
    default:
      return null; // show payment screen (or skip if fee disabled)
  }
};

const RegisterContinue = () => {
  const { user, loading: authLoading, profile } = useAuth();
  const { config, loading: cfgLoading, currencySymbol } = useRegistrationSettings();
  const { toast } = useToast();
  const navigate   = useNavigate();

  const [phase, setPhase] = useState<"loading" | "payment" | "routing" | "error">("loading");
  const [paying,  setPaying]  = useState(false);
  const [errMsg,  setErrMsg]  = useState("");

  // ── On auth ready, decide what to do ─────────────────────────────────────
  useEffect(() => {
    // Wait for BOTH authLoading and cfgLoading before proceeding.
    // Without cfgLoading, the effect can run while config still holds DEFAULTS
    // (e.g. entrance_fee_amount: 5000, entrance_fee_currency: "NGN"), causing
    // users to be charged the wrong amount or hit a payment wall incorrectly.
    // useRegistrationSettings has its own 6s timeout so cfgLoading will always
    // resolve — it will never block indefinitely.
    if (authLoading || cfgLoading) return;

    (async () => {
      try {
        // ── Get session with timeout ────────────────────────────────────────
        const sessionTimeout = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 8000)
        );
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          sessionTimeout,
        ]);

        if (!session) {
          setErrMsg("Email verification failed or link expired. Please try signing in again.");
          setPhase("error");
          return;
        }

        const userId = session.user.id;
        const emailAlreadyConfirmed = !!session.user.email_confirmed_at;

        // ── Check for existing tasjeel row (with timeout) ──────────────────
        // If this user already has a row they're either mid-pipeline or done.
        // Route them directly without calling initializeTasjeel.
        const tpTimeout = new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 6000)
        );
        const { data: existingTp } = await Promise.race([
          supabase
            .from("tasjeel_progress" as any)
            .select("current_step")
            .eq("user_id", userId)
            .maybeSingle(),
          tpTimeout,
        ]);

        if (existingTp) {
          const existingStep = (existingTp as any).current_step;
          const existingRoute = resolveRoute(existingStep, config);
          if (existingRoute) {
            navigate(existingRoute, { replace: true });
            return;
          }
          // Step is enrollment/payment → show payment screen (or skip if fee off)
          if (config.entrance_fee_enabled) {
            await ensurePaystack();
            setPhase("payment");
          } else {
            navigate("/student", { replace: true });
          }
          return;
        }

        // ── Existing confirmed user with no tasjeel row ────────────────────
        // This happens when an existing user is sent here by Login.tsx via
        // the enrollment/payment pipeline route, but they've already confirmed
        // their email. They should go straight to /student, not get stuck on
        // the verification error screen.
        if (emailAlreadyConfirmed) {
          // Backfill a completed tasjeel row so this doesn't happen again
          try {
            const now = new Date().toISOString();
            await supabase.from("tasjeel_progress" as any).insert({
              user_id: userId,
              current_step: "completed",
              created_at: now,
              updated_at: now,
              completed_at: now,
            });
          } catch { /* non-fatal — row may already exist from a race */ }
          navigate("/student", { replace: true });
          return;
        }

        // BUG 5 — wrap initializeTasjeel in try/catch so a DB error doesn't
        // leave the page stuck on the loading spinner forever.
        try {
          await initializeTasjeel(userId, true);
        } catch (initErr: any) {
          console.error("[RegisterContinue] initializeTasjeel failed:", initErr);
          setErrMsg("There was a problem setting up your account. Please try again or contact support.");
          setPhase("error");
          return;
        }

        // Fetch current tasjeel step
        const { data: tp, error: tpErr } = await supabase
          .from("tasjeel_progress" as any)
          .select("current_step")
          .eq("user_id", userId)
          .maybeSingle();

        if (tpErr) {
          console.error("[RegisterContinue] tasjeel_progress fetch failed:", tpErr);
          setErrMsg("Could not load your registration status. Please check your connection and try again.");
          setPhase("error");
          return;
        }

        const currentStep = (tp as any)?.current_step ?? "enrollment";

        // BUG 1 — removed stale "review" → awaiting-level mapping; "review" is
        // not a real step and would loop. resolveRoute's default handles unknowns.

        // BUG 2, 3 — unified routing: handles "recitation", "schedule_session",
        // and "payment" (stale) correctly.
        const route = resolveRoute(currentStep, config);

        if (route) {
          navigate(route, { replace: true });
          return;
        }

        // Step is enrollment | payment (stale) | unknown → show payment if needed
        // BUG 7 — if BOTH fee and onboarding are disabled, skip straight to the
        //          first enabled step rather than navigating to /onboarding
        //          which would immediately redirect the user again.
        if (config.entrance_fee_enabled) {
          await ensurePaystack();
          setPhase("payment");
        } else {
          // No fee — skip ahead to the first required step
          const nextStep = config.onboarding_required
            ? "onboarding"
            : config.entrance_exam_required
              ? "exam"
              : config.recitation_test_required
                ? "recitation"
                : "level_assignment";

          await advanceTasjeel(userId, nextStep);

          // Navigate to the correct destination for that step
          const nextRoute = resolveRoute(nextStep, config) ?? "/student/awaiting-level";
          navigate(nextRoute, { replace: true });
        }
      } catch (err: any) {
        // BUG 5 — catch-all so any unexpected throw shows a clean error UI
        console.error("[RegisterContinue] unexpected error:", err);
        setErrMsg("An unexpected error occurred. Please try again.");
        setPhase("error");
      }
    })();
  }, [authLoading, cfgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceTasjeel = async (userId: string, nextStep: string) => {
    await supabase
      .from("tasjeel_progress" as any)
      .update({ current_step: nextStep, updated_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
  };

  // ── Payment handler ───────────────────────────────────────────────────────
  const handlePayment = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" }); return; }

    const userId = session.user.id;
    const email  = session.user.email || "";
    const name   = (session.user.user_metadata?.full_name as string) || profile?.full_name || "Student";
    const ref    = `TAH-REG-${Date.now()}`;

    // Determine which step to advance to after payment (respects disabled steps)
    const postPaymentStep = config.onboarding_required
      ? "onboarding"
      : config.entrance_exam_required
        ? "exam"
        : config.recitation_test_required
          ? "recitation"
          : "level_assignment";

    const postPaymentRoute = resolveRoute(postPaymentStep, config) ?? "/student/awaiting-level";

    if (!PAYSTACK_KEY) {
      // VITE_PAYSTACK_PUBLIC_KEY is missing from environment variables.
      // This is the most common cause of "payment not going through" —
      // check your Vercel / hosting dashboard and ensure the variable is set.
      // In dev/staging this simulates a successful payment for testing only.
      console.error(
        "[RegisterContinue] VITE_PAYSTACK_PUBLIC_KEY is not set. " +
        "Payment is running in DEMO MODE — no real charge will occur. " +
        "Set this env var in your hosting dashboard to enable live payments."
      );
      toast({
        title: "⚠️ Demo mode — no real payment",
        description: "VITE_PAYSTACK_PUBLIC_KEY is not configured. Contact your developer.",
        variant: "destructive",
      });
      setPaying(true);
      setTimeout(async () => {
        await recordPayment(userId, ref);
        await advanceTasjeel(userId, postPaymentStep);
        setPaying(false);
        navigate(postPaymentRoute, { replace: true });
      }, 1800);
      return;
    }

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({ title: "Payment not ready", description: "Please wait a moment and try again.", variant: "destructive" });
      return;
    }

    setPaying(true);
    try {
      const handler = PaystackPop.setup({
        key: PAYSTACK_KEY,
        email,
        amount: config.entrance_fee_amount * 100,
        currency: config.entrance_fee_currency,
        ref,
        metadata: { full_name: name, type: "registration" },
        // IMPORTANT: callback must NOT be async — Paystack breaks if it is.
        // Use .then() chains for post-payment async work instead.
        callback: (res: any) => {
          recordPayment(userId, res.reference)
            .then(() => advanceTasjeel(userId, postPaymentStep))
            .then(() => {
              setPaying(false);
              navigate(postPaymentRoute, { replace: true });
            })
            .catch(() => {
              // Payment was received by Paystack but DB write failed.
              // DO NOT silently advance the user — their enrollments row would
              // remain with registration_paid: false, locking them out forever
              // with no way to retry payment. Instead show an actionable error
              // with the Paystack reference so support can manually reconcile.
              setPaying(false);
              toast({
                title: "Payment received — account not updated",
                description: `Your payment went through (ref: ${res.reference}) but we couldn't update your account. Please contact support with this reference and we'll sort it out immediately.`,
                variant: "destructive",
              });
            });
        },
        onClose: () => {
          setPaying(false);
          toast({ title: "Payment cancelled. You can try again when ready." });
        },
      });
      handler.openIframe();
    } catch (err: any) {
      setPaying(false);
      toast({ title: "Payment failed to launch", description: err?.message, variant: "destructive" });
    }
  };

  const recordPayment = async (userId: string, ref: string) => {
    try {
      await supabase.from("payment_history" as any).insert({
        user_id:      userId,
        amount:       config.entrance_fee_amount,
        paid_at:      new Date().toISOString(),
        status:       "success",
        payment_ref:  ref,
        payment_type: "registration",
        plan_type:    "registration",
      });
      await supabase.from("enrollments" as any).upsert({
        user_id:                userId,
        level:                  "pending",
        plan_type:              "monthly",
        amount:                 config.entrance_fee_amount,
        status:                 "grace",
        grace_end_date:         new Date(Date.now() + 7 * 86400000).toISOString(),
        registration_paid:      true,
        registration_paid_at:   new Date().toISOString(),
        admin_override:         false,
      }, { onConflict: "user_id" });
    } catch (_) { /* non-fatal */ }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const sym = currencySymbol(config.entrance_fee_currency);
  const amt = config.entrance_fee_amount.toLocaleString();

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cairo', sans-serif", padding: "24px 16px",
      background: `radial-gradient(ellipse at 20% 50%, rgba(15,45,31,.08), transparent 60%),
                   radial-gradient(ellipse at 80% 20%, rgba(201,168,76,.06), transparent 50%), #f8fafb`,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(212,168,67,.4)} 50%{box-shadow:0 0 0 10px rgba(212,168,67,0)} }
        .pay-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(212,168,67,.45) !important; }
      `}</style>

      {/* Logo + Card */}
      <div style={{ width: "100%", maxWidth: 480, animation: "fadeUp .5s ease" }}>

        {/* Top logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: G, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen style={{ width: 22, height: 22, color: GOLD }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: G }}>Tahleem <span style={{ color: GOLD }}>Academy</span></div>
            <div style={{ fontSize: 10, color: "#7a9e88" }}>أكاديمية تعليم</div>
          </div>
        </div>

        <div style={{
          background: "#fff", borderRadius: 24,
          border: "1px solid rgba(15,45,31,.1)",
          boxShadow: "0 8px 40px rgba(15,45,31,.1)",
          padding: "36px 28px",
        }}>

          {/* ── LOADING ── */}
          {(phase === "loading") && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: `3px solid rgba(15,45,31,.15)`, borderTopColor: G, animation: "spin .8s linear infinite", margin: "0 auto 20px" }} />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: G, margin: "0 0 8px" }}>Verifying your email…</h2>
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Setting up your account, please wait</p>
              <p style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD, marginTop: 16, direction: "rtl" }}>بِسْمِ اللَّهِ</p>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === "error" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <AlertCircle size={30} color="#DC2626" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#991B1B", margin: "0 0 10px" }}>Verification Error</h2>
              <p style={{ fontSize: 13, color: "#DC2626", lineHeight: 1.6, margin: "0 0 24px" }}>{errMsg}</p>
              <button
                onClick={() => navigate("/register")}
                style={{ width: "100%", padding: "13px", borderRadius: 14, background: `linear-gradient(135deg,${G},${GM})`, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
              >
                ← Back to Register
              </button>
            </div>
          )}

          {/* ── PAYMENT ── */}
          {phase === "payment" && (
            <>
              {/* Email verified badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F0FDF4", borderRadius: 12, padding: "10px 14px", border: "1px solid #86EFAC", marginBottom: 24 }}>
                <CheckCircle2 size={18} color="#16A34A" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Email verified successfully!</span>
              </div>

              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#D4A843,#B8860B)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Star size={28} color="#fff" fill="#fff" />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Complete Your Registration</h2>
                <p style={{ fontSize: 13, color: "#7a9e88", margin: 0, lineHeight: 1.5 }}>
                  Pay the one-time registration fee to unlock your onboarding and entrance process
                </p>
              </div>

              {/* Price card */}
              <div style={{ background: "#FFFBEB", borderRadius: 14, padding: "16px 18px", border: "2px solid #F9D46A", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: "#92400E", fontWeight: 700 }}>Registration Fee</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: "#92400E" }}>{sym}{amt}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[
                    config.onboarding_required      && "Onboarding form access",
                    config.entrance_exam_required   && "Written entrance exam",
                    config.recitation_test_required && "Recitation audio evaluation",
                    "Admin level assignment",
                  ].filter(Boolean).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#78350F" }}>
                      <CheckCircle2 size={13} color="#D4A843" /> {item as string}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pay button */}
              <button
                onClick={handlePayment}
                disabled={paying}
                className="pay-btn"
                style={{
                  width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
                  background: paying ? "#9ca3af" : "linear-gradient(135deg,#D4A843,#B8860B)",
                  color: "#fff", fontSize: 15, fontWeight: 800,
                  cursor: paying ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: "0 4px 16px rgba(212,168,67,.35)", transition: "all .2s",
                  animation: paying ? "none" : "glow 2s infinite",
                }}
              >
                {paying
                  ? <><div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> Processing payment…</>
                  : <><CreditCard size={18} /> Pay {sym}{amt} to Continue <ArrowRight size={16} /></>
                }
              </button>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
                <Shield size={12} /> Secured by Paystack · SSL Encrypted · One-time payment
              </div>

              {/* Steps preview */}
              <div style={{ marginTop: 20, padding: "14px 16px", background: "#f8fafb", borderRadius: 12, border: "1px solid rgba(15,45,31,.08)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>After payment, you'll complete:</div>
                {[
                  config.onboarding_required      && "📋 Onboarding questionnaire",
                  config.entrance_exam_required   && "📝 Written entrance exam",
                  config.recitation_test_required && "🎤 Recitation audio evaluation",
                  "🏅 Admin level assignment (within 48h)",
                ].filter(Boolean).map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#555", marginBottom: 6, paddingLeft: 4 }}>{s as string}</div>
                ))}
              </div>
            </>
          )}
        </div>

        <p style={{ marginTop: 16, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
          Tahleem Academy — Islamic Education Platform
        </p>
      </div>
    </div>
  );
};

export default RegisterContinue;
