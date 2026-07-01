// src/pages/Register.tsx
// NEW FLOW: Account Creation → Verify Email (check inbox)
// Payment, Onboarding, Exam, Recitation are handled AFTER email verification
// via /auth/register-continue → /onboarding → /student/entrance-exam → /student/recitation-test → /registration-complete

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Eye, EyeOff, Check, X, User, Mail, Lock, BookOpen,
  ArrowRight, Globe, Star, FileText, GraduationCap, Mic,
  CheckCircle2, AlertCircle, Loader2, MailCheck, RefreshCw,
} from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

const checkPassword = (pw: string) => ({
  length: pw.length >= 8,
  upper:  /[A-Z]/.test(pw),
  lower:  /[a-z]/.test(pw),
  number: /\d/.test(pw),
});

// ── Shell must be OUTSIDE Register so React doesn't recreate it on every
// keystroke (which would unmount inputs and dismiss the Android keyboard).
interface ShellProps {
  children: React.ReactNode;
  language: string;
  setLanguage: (l: string) => void;
  config: any;
  currencySymbol: (c: string) => string;
}

const Shell = ({ children, language, setLanguage, config, currencySymbol }: ShellProps) => {
  const isRTL = language === "ar";
  const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "'Cairo',sans-serif", background: `radial-gradient(ellipse at 20% 50%,rgba(15,45,31,.08) 0%,transparent 60%),#f8fafb` }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .reg-input::placeholder{color:#9ca3af}
        .reg-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(15,45,31,.35)!important}
        @media(max-width:1024px){.lg-hide{display:none!important}}
      `}</style>
      {/* LEFT decorative panel */}
      <div className="lg-hide" style={{ flex: 1, background: `linear-gradient(160deg,${G},${GM},#0a1f12)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative", overflow: "hidden" }}>
        {[160, 240, 340].map((sz, i) => <div key={i} style={{ position: "absolute", width: sz, height: sz, borderRadius: "50%", border: `1px solid rgba(201,168,76,${.12 - i * .03})`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />)}
        <div style={{ position: "relative", textAlign: "center", animation: "fadeUp .8s ease" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(201,168,76,.15)", border: "1.5px solid rgba(201,168,76,.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <BookOpen style={{ width: 34, height: 34, color: GOLD }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", margin: "0 0 8px" }}>Tahleem<span style={{ color: GOLD }}> Academy</span></h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,.55)", margin: "0 0 36px", lineHeight: 1.6 }}>أكاديمية تعليم الإسلامية<br />Your journey to Islamic knowledge</p>
          <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 16, padding: "16px 20px", border: "1px solid rgba(255,255,255,.08)", textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>Registration Journey</div>
            {[
              { show: true,                            icon: <User size={13} color={GOLD} />,           label: "1. Create Account" },
              { show: true,                            icon: <Mail size={13} color={GOLD} />,           label: "2. Verify Email" },
              { show: config.entrance_fee_enabled,     icon: <Star size={13} color={GOLD} />,           label: `3. Pay ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()}` },
              { show: config.onboarding_required,      icon: <FileText size={13} color="#60A5FA" />,    label: "Fill Onboarding Form" },
              { show: config.entrance_exam_required,   icon: <GraduationCap size={13} color="#A78BFA" />, label: "Entrance Exam" },
              { show: config.recitation_test_required, icon: <Mic size={13} color="#34D399" />,         label: "Recitation Test" },
            ].filter(s => s.show).map((s, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < arr.length - 1 ? 8 : 0 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.icon}</div>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", minWidth: 0 }}>
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <button onClick={() => setLanguage && setLanguage(language === "ar" ? "en" : "ar")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: "rgba(15,45,31,.07)", border: `1px solid rgba(15,45,31,.12)`, color: G, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Globe style={{ width: 13, height: 13 }} />{language === "ar" ? "English" : "العربية"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: G, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen style={{ width: 20, height: 20, color: GOLD }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: G }}>Tahleem <span style={{ color: GOLD }}>Academy</span></div>
            <div style={{ fontSize: 10, color: "#7a9e88" }}>أكاديمية تعليم</div>
          </div>
        </div>
        <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 24, border: "1px solid rgba(15,45,31,.1)", boxShadow: "0 8px 40px rgba(15,45,31,.1)", padding: "36px 28px", animation: "fadeUp .5s ease" }}>
          {children}
        </div>
        <p style={{ marginTop: 20, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>Tahleem Academy — Islamic Education Platform</p>
      </div>
    </div>
  );
};

const Register = () => {
  const { t, language, setLanguage } = useLanguage() as any;
  const { signUp, user, loading: authLoading } = useAuth();
  const { toast }                    = useToast();
  const { config, loading: configLoading, currencySymbol } = useRegistrationSettings();
  const navigate = useNavigate();

  // ── Guard: already signed in + email verified → skip register form ─────────
  // A user who verified their email and logs back in should land at
  // /auth/register-continue (which reads their pipeline step and routes
  // them forward) — NOT the register form, which would force them to
  // re-enter details for an email that already exists.
  useEffect(() => {
    if (authLoading || !user) return;
    navigate("/auth/register-continue", { replace: true });
  }, [user, authLoading, navigate]);

  const isRTL = language === "ar";

  // ── Daily cap check ────────────────────────────────────────────────────────
  const [dailyCapReached, setDailyCapReached] = useState(false);
  useEffect(() => {
    if (!config.max_daily_registrations || config.max_daily_registrations === 0) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase.from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00`);
      if ((count || 0) >= config.max_daily_registrations) setDailyCapReached(true);
    })();
  }, [config.max_daily_registrations]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [focused, setFocused]     = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);
  const [phase, setPhase]         = useState<"form" | "verify">("form");
  const [resending, setResending] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const pwChecks   = checkPassword(password);
  const pwStrength = Object.values(pwChecks).filter(Boolean).length;
  const pwValid    = Object.values(pwChecks).every(Boolean);
  const strengthColor = ["#ef4444","#ef4444","#f59e0b","#f59e0b","#22c55e"][pwStrength];

  const fieldStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
    border: `2px solid ${focused === name ? GM : "rgba(15,45,31,0.15)"}`,
    fontSize: 14, outline: "none", color: G, background: "#fafefb",
    transition: "border-color .2s, box-shadow .2s", fontFamily: "'Cairo',sans-serif",
    boxShadow: focused === name ? `0 0 0 4px rgba(26,71,49,.1)` : "none",
    direction: isRTL ? "rtl" : "ltr", boxSizing: "border-box" as const,
  });

  // ── Onboarding pipeline steps (for display) ────────────────────────────────
  const buildSteps = () => {
    const s: string[] = ["Create Account", "Verify Email"];
    if (config.entrance_fee_enabled)     s.push(`Pay Registration Fee`);
    if (config.onboarding_required)      s.push("Fill Onboarding Form");
    if (config.entrance_exam_required)   s.push("Entrance Exam");
    if (config.recitation_test_required) s.push("Recitation Test");
    s.push("Await Level Assignment");
    return s;
  };

  // ── Submit: create account only ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast({ title: "Enter your full name", variant: "destructive" }); return; }
    if (!email.trim())    { toast({ title: "Enter your email", variant: "destructive" }); return; }
    if (!pwValid)         { toast({ title: "Weak password", description: "Meet all requirements.", variant: "destructive" }); return; }

    setCreating(true);
    const { error } = await signUp(email, password, fullName) as any;
    setCreating(false);

    if (error) {
      toast({ title: "Sign-up error", description: error.message, variant: "destructive" });
      return;
    }

    // Show the "check your email" screen
    setPhase("verify");
  };

  // ── Resend verification email ──────────────────────────────────────────────
  // FIX: supabase.auth.resend() returns { data, error } — it does NOT throw
  // on failure. The old code never checked `error`, so it showed "Email
  // resent ✅" every time even when Supabase silently rejected the request
  // (almost always its built-in rate limit — by default only one auth email
  // is allowed roughly every 60s). Students kept clicking resend, kept
  // seeing a fake success toast, and only ever got the very first email.
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/register-continue` },
      });

      if (error) {
        // Surface the real reason — usually a rate limit like "For security
        // purposes, you can only request this after N seconds".
        toast({ title: "Could not resend email", description: error.message, variant: "destructive" });
        // Try to read a wait time out of the message so the cooldown UI
        // matches what Supabase is actually enforcing; fall back to 60s.
        const match = error.message?.match(/(\d+)\s*second/i);
        setResendCooldown(match ? parseInt(match[1], 10) : 60);
      } else {
        toast({ title: "Email resent", description: "Check your inbox again." });
        // Cooldown so repeated taps don't immediately hit the rate limit
        // and produce the same silent-failure symptom again.
        setResendCooldown(60);
      }

      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast({ title: "Could not resend email", description: err?.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (configLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
        <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── REGISTRATION CLOSED ────────────────────────────────────────────────────
  if (!config.registration_open || dailyCapReached) {
    const msg = dailyCapReached
      ? "Daily registration limit reached. Please try again tomorrow."
      : (isRTL ? config.closed_message_ar : config.closed_message);
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Cairo',sans-serif", background: `radial-gradient(ellipse at 20% 50%,rgba(15,45,31,.08),transparent 60%),#f8fafb` }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 24, border: "1px solid rgba(15,45,31,.1)", boxShadow: "0 8px 40px rgba(15,45,31,.1)", padding: "40px 32px", textAlign: "center", animation: "fadeUp .5s ease" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: G, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <BookOpen style={{ width: 30, height: 30, color: GOLD }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Tahleem <span style={{ color: GOLD }}>Academy</span></h1>
          <p style={{ fontSize: 12, color: "#7a9e88", margin: "0 0 28px" }}>أكاديمية تعليم</p>
          <div style={{ background: "#FEF2F2", borderRadius: 16, padding: "20px", border: "2px solid #FECACA", marginBottom: 24 }}>
            <AlertCircle size={32} color="#DC2626" style={{ margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontWeight: 800, fontSize: 16, color: "#991B1B", margin: "0 0 8px" }}>{dailyCapReached ? "Daily Limit Reached" : "Registration Closed"}</p>
            <p style={{ fontSize: 13, color: "#DC2626", margin: 0, lineHeight: 1.6 }}>{msg}</p>
          </div>
          <Link to="/login" style={{ display: "block", padding: "13px 0", borderRadius: 14, background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 14, fontWeight: 800, textDecoration: "none", marginBottom: 12 }}>Sign In Instead →</Link>
          <Link to="/" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "underline" }}>← Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── WELCOME SPLASH ─────────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cairo',sans-serif", background: `linear-gradient(160deg,${G} 0%,${GM} 50%,#0a1f12 100%)`, position: "relative", overflow: "hidden" }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}} @keyframes spin{to{transform:rotate(360deg)}} .welcome-ring{position:absolute;border-radius:50%;border:1px solid rgba(201,168,76,.15);}`}</style>
        {[200, 320, 440, 560].map((sz, i) => <div key={i} className="welcome-ring" style={{ width: sz, height: sz, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />)}
        <div style={{ position: "absolute", inset: 0, opacity: .05, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='30,2 58,16 58,44 30,58 2,44 2,16' fill='none' stroke='%23c9a84c' stroke-width='1'/%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "40px 28px", maxWidth: 520, animation: "fadeUp .8s ease" }}>
          <p style={{ fontFamily: "'Amiri',serif", fontSize: 26, color: "rgba(201,168,76,.9)", margin: "0 0 24px", direction: "rtl", letterSpacing: 2 }}>بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ</p>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: "rgba(201,168,76,.15)", border: "2px solid rgba(201,168,76,.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
            <BookOpen style={{ width: 38, height: 38, color: GOLD }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: "0 0 6px", lineHeight: 1.3 }}>Welcome to Tahleem Academy</h1>
          <p style={{ fontSize: 16, color: GOLD, fontFamily: "'Amiri',serif", margin: "0 0 28px", direction: "rtl" }}>مرحباً بك في رحلة طلب العلم</p>
          <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 18, padding: "24px 28px", marginBottom: 28, textAlign: "left" }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.85)", lineHeight: 1.7, margin: "0 0 12px" }}>
              Your registration journey:
            </p>
            {buildSteps().map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < buildSteps().length - 1 ? 8 : 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(201,168,76,.2)", border: "1px solid rgba(201,168,76,.3)", color: GOLD, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.75)" }}>{s}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowWelcome(false)} style={{ width: "100%", padding: "16px 32px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 32px rgba(201,168,76,.4)" }}>
            Begin Your Journey <ArrowRight size={18} />
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 14 }}>Already have an account? <Link to="/login" style={{ color: GOLD, fontWeight: 700 }}>Sign In</Link></p>
        </div>
      </div>
    );
  }

  // ── PHASE: VERIFY EMAIL ────────────────────────────────────────────────────
  if (phase === "verify") {
    return (
      <Shell language={language} setLanguage={setLanguage} config={config} currencySymbol={currencySymbol}>
        <div style={{ textAlign: "center" }}>
          {/* Animated email icon */}
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: `0 8px 32px rgba(15,45,31,.25)` }}>
            <MailCheck size={38} color={GOLD} />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Check Your Email</h2>
          <p style={{ fontSize: 14, color: "#7a9e88", margin: "0 0 24px", lineHeight: 1.6 }}>
            We sent a verification link to:
          </p>
          <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "12px 16px", border: "1px solid #86EFAC", marginBottom: 24, fontSize: 14, fontWeight: 700, color: G }}>
            ✉️ {email}
          </div>

          {/* Steps */}
          <div style={{ background: "#f8fafb", borderRadius: 14, padding: "16px 18px", border: "1px solid rgba(15,45,31,.08)", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: G, marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>Next steps</div>
            {[
              "Open your email inbox",
              "Click the verification link we sent",
              "You'll be redirected to complete your registration",
              config.entrance_fee_enabled && `Pay the ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()} registration fee`,
              config.onboarding_required && "Fill in your onboarding form",
              config.entrance_exam_required && "Take the entrance exam",
              config.recitation_test_required && "Submit your recitation audio",
            ].filter(Boolean).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < 6 ? 8 : 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: `rgba(15,45,31,.08)`, color: G, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <span style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{s as string}</span>
              </div>
            ))}
          </div>

          {/* Spam note */}
          <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "10px 14px", border: "1px solid #F9D46A", marginBottom: 20, fontSize: 12, color: "#92400E" }}>
            📂 If you don't see the email, check your spam / junk folder.
          </div>

          {/* Resend */}
          <button
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            style={{ width: "100%", padding: "13px", borderRadius: 14, border: `2px solid ${G}`, background: "transparent", color: G, fontSize: 14, fontWeight: 700, cursor: (resending || resendCooldown > 0) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, opacity: (resending || resendCooldown > 0) ? .6 : 1 }}
          >
            {resending
              ? <><Loader2 style={{ width: 16, height: 16, animation: "spin .8s linear infinite" }} /> Resending…</>
              : resendCooldown > 0
                ? <>Resend available in {resendCooldown}s</>
                : <><RefreshCw size={16} /> Resend Verification Email</>
            }
          </button>

          <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
            Wrong email?{" "}
            <button onClick={() => setPhase("form")} style={{ background: "none", border: "none", cursor: "pointer", color: G, fontWeight: 700, fontSize: 12, textDecoration: "underline" }}>
              Go back
            </button>
          </p>
        </div>
      </Shell>
    );
  }

  // ── PHASE: ACCOUNT FORM ────────────────────────────────────────────────────
  return (
    <Shell language={language} setLanguage={setLanguage} config={config} currencySymbol={currencySymbol}>
      <div style={{ marginBottom: 24, direction: isRTL ? "rtl" : "ltr" }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Create your account</h2>
        <p style={{ fontSize: 13, color: "#7a9e88", margin: 0 }}>
          Step 1 of {buildSteps().length}: Enter your details to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ position: "relative" }}>
          <User style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: focused === "name" ? GM : "#9ca3af", pointerEvents: "none" }} />
          <input className="reg-input" style={fieldStyle("name")} placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} onFocus={() => setFocused("name")} onBlur={() => setFocused(null)} required autoComplete="name" />
        </div>

        <div style={{ position: "relative" }}>
          <Mail style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: focused === "email" ? GM : "#9ca3af", pointerEvents: "none" }} />
          <input className="reg-input" style={fieldStyle("email")} type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} required autoComplete="email" />
        </div>

        <div>
          <div style={{ position: "relative" }}>
            <Lock style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: focused === "pw" ? GM : "#9ca3af", pointerEvents: "none" }} />
            <input className="reg-input" style={fieldStyle("pw")} type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onFocus={() => setFocused("pw")} onBlur={() => setFocused(null)} required autoComplete="new-password" />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 2 }}>
              {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
            </button>
          </div>
          {password.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= pwStrength ? strengthColor : "#e5e7eb", transition: "background .3s" }} />)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                {[[pwChecks.length, "8+ characters"],[pwChecks.upper, "Uppercase"],[pwChecks.lower, "Lowercase"],[pwChecks.number, "Number"]].map(([ok, label], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    {ok ? <Check style={{ width: 11, height: 11, color: "#22c55e" }} /> : <X style={{ width: 11, height: 11, color: "#d1d5db" }} />}
                    <span style={{ color: ok ? "#22c55e" : "#9ca3af" }}>{label as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", lineHeight: 1.5, margin: 0 }}>
          By continuing you agree to our <span style={{ color: GOLD, fontWeight: 600 }}>Terms &amp; Privacy Policy</span>
        </p>

        <button
          type="submit"
          disabled={creating}
          className="reg-btn"
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: creating ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`, border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: creating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(15,45,31,.3)", transition: "all .2s", fontFamily: "'Cairo',sans-serif" }}
        >
          {creating
            ? <><Loader2 style={{ width: 16, height: 16, animation: "spin .8s linear infinite" }} /> Creating account…</>
            : <>Create Account &amp; Verify Email <ArrowRight style={{ width: 16, height: 16 }} /></>
          }
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <div style={{ flex: 1, height: 1, background: "rgba(15,45,31,.1)" }} />
        <span style={{ fontSize: 12, color: "#9ca3af" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "rgba(15,45,31,.1)" }} />
      </div>
      <p style={{ textAlign: "center", fontSize: 13, color: "#7a9e88", margin: 0 }}>
        Already have an account?{" "}<Link to="/login" style={{ color: G, fontWeight: 800, textDecoration: "none" }}>Sign In →</Link>
      </p>
    </Shell>
  );
};

export default Register;
