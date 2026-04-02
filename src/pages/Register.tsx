// src/pages/Register.tsx
// UNIFIED FLOW: Account → Payment → Onboarding (inline) → Done
// Users NEVER need to log in mid-registration to complete onboarding.

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Eye, EyeOff, Check, X, User, Mail, Lock, BookOpen, ArrowRight, ArrowLeft,
  Globe, Star, CreditCard, Shield, FileText, GraduationCap, Mic,
  CheckCircle2, AlertCircle, Loader2, ChevronDown,
} from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

const checkPassword = (pw: string) => ({
  length: pw.length >= 8,
  upper:  /[A-Z]/.test(pw),
  lower:  /[a-z]/.test(pw),
  number: /\d/.test(pw),
});

// ── Helpers shared across phases ─────────────────────────────────────────────
const inputSt = (focused: boolean): React.CSSProperties => ({
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: `2px solid ${focused ? GM : "#e5e7eb"}`,
  fontSize: 14, outline: "none", color: "#111", background: "#fafafa",
  transition: "border-color .2s, box-shadow .2s", boxSizing: "border-box" as const,
  boxShadow: focused ? "0 0 0 4px rgba(6,78,59,.08)" : "none",
  fontFamily: "inherit",
});
const selSt: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "2px solid #e5e7eb", fontSize: 14, outline: "none",
  color: "#111", background: "#fafafa", fontFamily: "inherit",
  appearance: "none" as any, cursor: "pointer", boxSizing: "border-box" as const,
};
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6, display: "block" };

const Sel = ({ val, onChange, opts, placeholder }: { val: string; onChange: (v: string) => void; opts: string[]; placeholder?: string }) => (
  <div style={{ position: "relative" }}>
    <select value={val} onChange={e => onChange(e.target.value)} style={selSt}>
      <option value="">{placeholder || "Select…"}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }} />
  </div>
);

const Radio = ({ name, val, checked, label, onChange }: any) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `2px solid ${checked ? GM : "#e5e7eb"}`, background: checked ? "#F0FDF4" : "#fafafa", cursor: "pointer", fontSize: 13, color: "#333", transition: "all .15s" }}>
    <input type="radio" name={name} value={val} checked={checked} onChange={onChange} style={{ display: "none" }} />
    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${checked ? GM : "#d1d5db"}`, background: checked ? GM : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
    </div>
    {label}
  </label>
);

const Chip = ({ label, sel, onClick }: { label: string; sel: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${sel ? GM : "#e5e7eb"}`, background: sel ? "#F0FDF4" : "#fafafa", color: sel ? G : "#666", fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 6 }}>
    {sel && <CheckCircle2 size={11} color={GM} />}{label}
  </button>
);

// ── Registration stepper (top of form) ───────────────────────────────────────
const STEP_LABELS = [
  { en: "Create Account", ar: "إنشاء الحساب" },
  { en: "Payment",        ar: "الدفع" },
  { en: "Onboarding",     ar: "الاستبيان" },
  { en: "Exams",          ar: "الاختبارات" },
  { en: "Recitation",     ar: "Recitation" },
];

const DynamicStepper = ({ activeStep, steps }: { activeStep: number; steps: { label: string; sub: string }[] }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", alignItems: "center" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0, fontSize: 10, fontWeight: 800,
            background: activeStep > i + 1 ? "#22c55e" : activeStep === i + 1 ? G : "#e5e7eb",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .3s", boxShadow: activeStep === i + 1 ? `0 0 0 4px rgba(6,78,59,.15)` : "none",
          }}>
            {activeStep > i + 1 ? <CheckCircle2 size={14} /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: activeStep > i + 1 ? "#22c55e" : "#e5e7eb", transition: "background .4s" }} />
          )}
        </div>
      ))}
    </div>
    <div style={{ display: "flex", marginTop: 8 }}>
      {steps.map((s, i) => {
        const lbI = STEP_LABELS[i] || { en: s.label, ar: s.label };
        const isActive = activeStep === i + 1;
        return (
          <div key={i} style={{ flex: i < steps.length - 1 ? 1 : undefined, textAlign: "center", opacity: isActive ? 1 : 0.45 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: isActive ? G : "#6b7280" }}>{lbI.en}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: isActive ? GOLD : "#9ca3af", fontFamily: "'Cairo',sans-serif", direction: "rtl" }}>{lbI.ar}</div>
          </div>
        );
      })}
    </div>
    <div style={{ marginTop: 8, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{steps[activeStep - 1]?.sub}</div>
    </div>
  </div>
);

// ── Onboarding progress bar ───────────────────────────────────────────────────
const ONBOARD_TOTAL = 4;
const ProgBar = ({ step }: { step: number }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: GM }}>Onboarding: Step {step} of {ONBOARD_TOTAL}</span>
      <span style={{ fontSize: 12, color: "#9ca3af" }}>{Math.round((step / ONBOARD_TOTAL) * 100)}% complete</span>
    </div>
    <div style={{ height: 6, background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${(step / ONBOARD_TOTAL) * 100}%`, background: `linear-gradient(90deg,${G},${GM})`, borderRadius: 6, transition: "width .4s ease" }} />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const Register = () => {
  const { t, language, setLanguage } = useLanguage() as any;
  const { signUp }                   = useAuth();
  const { toast }                    = useToast();
  const navigate                     = useNavigate();
  const { config, loading: configLoading, currencySymbol } = useRegistrationSettings();

  const isRTL = language === "ar";

  // ── Paystack script ────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).PaystackPop) return;
    if (document.getElementById("paystack-script")) return;
    const s = document.createElement("script");
    s.id = "paystack-script"; s.src = "https://js.paystack.co/v1/inline.js"; s.async = true;
    document.body.appendChild(s);
  }, []);

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

  // ── Phase: "register" | "onboarding" | "done" ─────────────────────────────
  const [phase, setPhase] = useState<"register" | "onboarding" | "done">("register");

  // ── Registration form state ────────────────────────────────────────────────
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [focused, setFocused]     = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep]           = useState(1);
  const [paying, setPaying]       = useState(false);
  const [creating, setCreating]   = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);

  const pwChecks   = checkPassword(password);
  const pwStrength = Object.values(pwChecks).filter(Boolean).length;
  const pwValid    = Object.values(pwChecks).every(Boolean);
  const strengthColor = ["#ef4444","#ef4444","#f59e0b","#f59e0b","#22c55e"][pwStrength];

  const buildSteps = () => {
    const s = [{ label: "Create Account", sub: "Your name, email & password" }];
    if (config.entrance_fee_enabled)    s.push({ label: `Pay ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()}`, sub: "One-time registration fee" });
    if (config.onboarding_required)     s.push({ label: "Onboarding", sub: "Tell us about yourself" });
    if (config.entrance_exam_required)  s.push({ label: "Entrance Exam", sub: "Written placement test" });
    if (config.recitation_test_required) s.push({ label: "Recitation", sub: "Audio evaluation" });
    return s;
  };
  const steps = buildSteps();
  const onboardingStepperIndex = config.entrance_fee_enabled ? 3 : 2;

  const fieldStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
    border: `2px solid ${focused === name ? GM : "rgba(15,45,31,0.15)"}`,
    fontSize: 14, outline: "none", color: G, background: "#fafefb",
    transition: "border-color .2s, box-shadow .2s", fontFamily: "'Cairo',sans-serif",
    boxShadow: focused === name ? `0 0 0 4px rgba(26,71,49,.1)` : "none",
    direction: isRTL ? "rtl" : "ltr", boxSizing: "border-box" as const,
  });

  // ── Onboarding form state ──────────────────────────────────────────────────
  const [obStep, setObStep]         = useState(1);
  const [obSaving, setObSaving]     = useState(false);
  const [obFoc, setObFoc]           = useState<string | null>(null);
  const obF = (n: string) => ({ onFocus: () => setObFoc(n), onBlur: () => setObFoc(null) });

  // Step 1
  const [phone, setPhone]           = useState("");
  const [dob, setDob]               = useState("");
  const [gender, setGender]         = useState("");
  const [country, setCountry]       = useState("");
  const [city, setCity]             = useState("");
  const [occupation, setOccupation] = useState("");
  // Step 2
  const [quranLevel, setQuranLevel] = useState("");
  const [memorized, setMemorized]   = useState<string[]>([]);
  const [yearsStudy, setYearsStudy] = useState("");
  const [tajweed, setTajweed]       = useState("");
  const [prevTeacher, setPrevTeacher] = useState("");
  // Step 3
  const [arabic, setArabic]         = useState("");
  const [islamic, setIslamic]       = useState("");
  const [subjects, setSubjects]     = useState<string[]>([]);
  // Step 4
  const [goals, setGoals]           = useState<string[]>([]);
  const [hours, setHours]           = useState("");
  const [timePrefer, setTimePrefer] = useState("");
  const [device, setDevice]         = useState("");
  const [heardFrom, setHeardFrom]   = useState("");
  const [notes, setNotes]           = useState("");

  const tog = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  // ── Registration handlers ──────────────────────────────────────────────────
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!fullName.trim()) { toast({ title: "Enter your full name", variant: "destructive" }); return; }
    if (!email.trim())    { toast({ title: "Enter your email", variant: "destructive" }); return; }
    if (!pwValid)         { toast({ title: "Weak password", description: "Meet all requirements.", variant: "destructive" }); return; }
    if (!config.entrance_fee_enabled) createAccount("NO_FEE");
    else setStep(2);
  };

  const handlePayment = () => {
    const ref = `TAH-REG-${Date.now()}`;
    if (!PAYSTACK_KEY) {
      toast({ title: "⚠️ Demo mode — no Paystack key", description: "Simulating payment…" });
      setPaying(true);
      setTimeout(() => { setPaying(false); createAccount(ref); }, 1500);
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
        key: PAYSTACK_KEY, email,
        amount: config.entrance_fee_amount * 100,
        currency: config.entrance_fee_currency,
        ref, metadata: { full_name: fullName, type: "registration" },
        callback: (res: any) => { setPaying(false); createAccount(res.reference); },
        onClose: () => { setPaying(false); toast({ title: "Payment cancelled. Try again when ready." }); },
      });
      handler.openIframe();
    } catch (err: any) {
      setPaying(false);
      toast({ title: "Payment failed to launch", description: err?.message, variant: "destructive" });
    }
  };

  const createAccount = async (ref: string) => {
    setCreating(true);
    const result = await signUp(email, password, fullName) as any;
    const { error, data } = result;

    if (error) {
      setCreating(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Store user ID for onboarding submission
    const userId = data?.user?.id;
    if (userId) setRegisteredUserId(userId);

    // Record payment
    if (ref !== "NO_FEE") {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: ud } = await supabase.auth.getUser();
        const uid = ud?.user?.id || userId;
        if (uid) {
          await supabase.from("payment_history" as any).insert({
            user_id: uid, amount: config.entrance_fee_amount,
            paid_at: new Date().toISOString(), status: "success",
            payment_ref: ref, payment_type: "registration", plan_type: "registration",
          });
          await supabase.from("enrollments" as any).upsert({
            user_id: uid, level: "pending", plan_type: "monthly",
            amount: config.entrance_fee_amount, status: "grace",
            grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
            registration_paid: true, registration_paid_at: new Date().toISOString(),
            admin_override: false,
          }, { onConflict: "user_id" });
        }
      } catch (_) {}
    }

    setCreating(false);

    // Move to next phase
    if (config.onboarding_required) {
      setPhase("onboarding");
    } else {
      setPhase("done");
    }
  };

  // ── Onboarding submission ──────────────────────────────────────────────────
  const submitOnboarding = async () => {
    setObSaving(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: ud } = await supabase.auth.getUser();
      const userId = ud?.user?.id || registeredUserId;
      if (!userId) {
        toast({ title: "Session error", description: "Could not identify user. Please continue to login.", variant: "destructive" });
        setPhase("done");
        return;
      }
      await supabase.from("onboarding_forms" as any).upsert({
        user_id: userId,
        phone, dob, gender, country, city, occupation,
        quran_level: quranLevel, memorized_surahs: memorized,
        years_studying: yearsStudy, tajweed_knowledge: tajweed,
        previous_teacher: prevTeacher, arabic_level: arabic,
        islamic_knowledge: islamic, preferred_subjects: subjects,
        learning_goals: goals, hours_per_day: hours,
        preferred_time: timePrefer, preferred_device: device,
        heard_from: heardFrom, extra_notes: notes,
        completed_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await supabase.from("profiles").update({ onboarding_completed: true } as any).eq("user_id", userId);
      toast({ title: "✅ Onboarding complete!" });
      setPhase("done");
    } catch (e: any) {
      toast({ title: "Error saving form", description: e.message, variant: "destructive" });
    } finally {
      setObSaving(false);
    }
  };

  const onboardingNext = () => {
    if (obStep === 1 && (!phone || !dob || !gender || !country)) {
      toast({ title: "Fill all required fields (*)", variant: "destructive" }); return;
    }
    if (obStep === 2 && !quranLevel) {
      toast({ title: "Please select your Quran level", variant: "destructive" }); return;
    }
    if (obStep < ONBOARD_TOTAL) setObStep(s => s + 1);
    else submitOnboarding();
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
          <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 18, padding: "24px 28px", marginBottom: 32, textAlign: "left" }}>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,.9)", lineHeight: 1.8, margin: "0 0 16px" }}>You are about to begin your blessed journey of seeking knowledge.</p>
            <p style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: GOLD, direction: "rtl", lineHeight: 2, margin: "0 0 16px" }}>"طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ"</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", fontStyle: "italic", margin: "0 0 16px" }}>"Seeking knowledge is an obligation upon every Muslim." — Ibn Mājah</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.75)", lineHeight: 1.7, margin: 0 }}>May Allah put <em style={{ color: GOLD }}>barakah</em> in your learning and make it a source of benefit for you, your family, and the Ummah.</p>
          </div>
          <button onClick={() => setShowWelcome(false)} style={{ width: "100%", padding: "16px 32px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 32px rgba(201,168,76,.4)" }}>
            Begin Your Journey <ArrowRight size={18} />
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 14 }}>Let us begin by creating your account</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared page shell (used for register, onboarding, done phases)
  // ─────────────────────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "'Cairo',sans-serif", background: `radial-gradient(ellipse at 20% 50%,rgba(15,45,31,.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(201,168,76,.06) 0%,transparent 50%),#f8fafb` }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(212,168,67,.4)}50%{box-shadow:0 0 0 10px rgba(212,168,67,0)}}
        .reg-input::placeholder{color:#9ca3af}
        .reg-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(15,45,31,.35)!important}
        .pay-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(212,168,67,.4)!important}
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
            <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>Enrolment Process</div>
            {[
              { show: true,                           icon: <User size={13} color={GOLD} />,           label: "Create Account" },
              { show: config.entrance_fee_enabled,    icon: <Star size={13} color={GOLD} />,           label: `Pay ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()} Registration Fee` },
              { show: config.onboarding_required,     icon: <FileText size={13} color="#60A5FA" />,    label: "Fill Onboarding Form" },
              { show: config.entrance_exam_required,  icon: <GraduationCap size={13} color="#A78BFA" />, label: "Written Entrance Exam" },
              { show: config.recitation_test_required, icon: <Mic size={13} color="#34D399" />,        label: "Recitation Audio Test" },
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
        {/* Language toggle */}
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <button onClick={() => setLanguage && setLanguage(language === "ar" ? "en" : "ar")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: "rgba(15,45,31,.07)", border: `1px solid rgba(15,45,31,.12)`, color: G, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Globe style={{ width: 13, height: 13 }} />{language === "ar" ? "English" : "العربية"}
          </button>
        </div>
        {/* Mobile logo */}
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

  // ── PHASE: DONE ────────────────────────────────────────────────────────────
  if (phase === "done") {
    const onboardingDone = config.onboarding_required; // we just completed it
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <DynamicStepper activeStep={steps.length + 1} steps={steps} />
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E8F5E9", border: "3px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={36} color="#22c55e" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: G, margin: "0 0 8px" }}>Registration Complete! 🎉</h2>
          <p style={{ fontSize: 14, color: "#7a9e88", lineHeight: 1.6, margin: "0 0 20px" }}>
            {config.entrance_fee_enabled ? "Registration fee paid. " : ""}Your account has been created
            {onboardingDone ? " and onboarding form submitted." : "."}<br />
            <strong style={{ color: G }}>Check your email</strong> to verify, then log in to continue.
          </p>

          {/* Remaining steps after login */}
          {(config.entrance_exam_required || config.recitation_test_required) && (
            <div style={{ background: "#F0FDF4", borderRadius: 14, padding: "14px 18px", border: "1px solid #86EFAC", marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>After Login You'll Complete</div>
              {[
                { show: config.entrance_exam_required,   icon: <GraduationCap size={13} color="#7C3AED" />, label: "Take the written entrance exam" },
                { show: config.recitation_test_required, icon: <Mic size={13} color="#16A34A" />,           label: "Submit recitation audio + live evaluation" },
              ].filter(s => s.show).map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#166534", marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(6,78,59,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.icon}</div>
                  {s.label}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#FFF8E1", borderRadius: 12, padding: "11px 16px", border: "1px solid #F9D46A", marginBottom: 20, fontSize: 12, color: "#92400E", textAlign: "left" }}>
            <strong>📧 First:</strong> Check your inbox for a verification email and click the link before logging in.
          </div>

          <button onClick={() => navigate("/login")} style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: `linear-gradient(135deg,${G},${GM})`, border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cairo',sans-serif" }}>
            Go to Login <ArrowRight size={16} />
          </button>
        </div>
      </Shell>
    );
  }

  // ── PHASE: ONBOARDING (inline, no login required) ─────────────────────────
  if (phase === "onboarding") {
    const ONBOARD_TOTAL = 4;
    const STEP_TITLES = [
      ["Personal Information",     "Tell us about yourself"],
      ["Quran Background",         "Your Quran journey so far"],
      ["Arabic & Islamic Studies", "Your knowledge background"],
      ["Goals & Schedule",         "Help us find the best plan for you"],
    ];
    const [title, subtitle] = STEP_TITLES[obStep - 1];

    return (
      <Shell>
        {/* Onboarding header banner */}
        <div style={{ background: `linear-gradient(135deg,${G},${GM})`, borderRadius: "16px 16px 0 0", margin: "-36px -28px 24px", padding: "20px 24px" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Onboarding Form</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{subtitle}</div>
        </div>

        <ProgBar step={obStep} />

        {/* ONBOARDING STEP 1 */}
        {obStep === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Phone <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={phone} onChange={e => setPhone(e.target.value)} {...obF("phone")} style={inputSt(obFoc === "phone")} placeholder="+234 800 000 0000" type="tel" />
              </div>
              <div>
                <label style={lbl}>Date of Birth <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={dob} onChange={e => setDob(e.target.value)} {...obF("dob")} style={inputSt(obFoc === "dob")} type="date" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Gender <span style={{ color: "#ef4444" }}>*</span></label>
                <Sel val={gender} onChange={setGender} opts={["Male", "Female"]} />
              </div>
              <div>
                <label style={lbl}>Occupation</label>
                <Sel val={occupation} onChange={setOccupation} opts={["Student", "Working professional", "Business owner", "Homemaker", "Retired", "Other"]} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Country <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={country} onChange={e => setCountry(e.target.value)} {...obF("country")} style={inputSt(obFoc === "country")} placeholder="e.g. Nigeria" />
              </div>
              <div>
                <label style={lbl}>City / State</label>
                <input value={city} onChange={e => setCity(e.target.value)} {...obF("city")} style={inputSt(obFoc === "city")} placeholder="e.g. Lagos" />
              </div>
            </div>
            <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "12px 16px", border: "1px solid #86EFAC", fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
              <strong>Privacy note:</strong> Your information is private and only visible to Tahleem Academy administrators.
            </div>
          </div>
        )}

        {/* ONBOARDING STEP 2 */}
        {obStep === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={lbl}>Current Quran Reading Level <span style={{ color: "#ef4444" }}>*</span></label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[["none","Cannot read Arabic letters yet"],["letters","Know the letters but cannot read words"],["qaida","On Noorani Qaida / basic reader"],["slow","Can read Quran slowly with mistakes"],["fluent","Can read Quran fluently with Tajweed"],["memorising","Currently memorising (Hifz)"],["hafiz","Already a Hafiz (memorised full Quran)"]].map(([v, l]) => (
                  <Radio key={v} name="quran" val={v} checked={quranLevel === v} onChange={() => setQuranLevel(v)} label={l} />
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Surahs memorised (select all)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Al-Fatiha","Al-Ikhlas","Al-Falaq","An-Nas","Al-Kawthar","Al-Asr","Al-Fil","Al-Quraish","Al-Maun","Al-Masad","An-Nasr","Al-Zalzalah","Al-Bayyinah","Al-Alaq","Al-Tin","Ad-Duha","Al-Layl","Al-Ghashiyah","Al-Fajr","More than 30","Full Quran"].map(s => (
                  <Chip key={s} label={s} sel={memorized.includes(s)} onClick={() => tog(memorized, s, setMemorized)} />
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Years studying Quran</label>
                <Sel val={yearsStudy} onChange={setYearsStudy} opts={["Less than 1 year","1–2 years","3–5 years","5–10 years","More than 10 years"]} />
              </div>
              <div>
                <label style={lbl}>Tajweed knowledge</label>
                <Sel val={tajweed} onChange={setTajweed} opts={["None","Basic rules only","Intermediate","Advanced / Formal study"]} />
              </div>
            </div>
            <div>
              <label style={lbl}>Previous teacher / institute (if any)</label>
              <input value={prevTeacher} onChange={e => setPrevTeacher(e.target.value)} {...obF("prev")} style={inputSt(obFoc === "prev")} placeholder="e.g. Sheikh Abdullahi, Al-Noor Institute" />
            </div>
          </div>
        )}

        {/* ONBOARDING STEP 3 */}
        {obStep === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={lbl}>Arabic Language Level</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[["none","No Arabic knowledge"],["letters","Know letters and basic sounds"],["beginner","Can read but don't understand meaning"],["intermediate","Basic grammar (Nahw/Sarf) understanding"],["advanced","Advanced — can read and understand texts"]].map(([v, l]) => (
                  <Radio key={v} name="arabic" val={v} checked={arabic === v} onChange={() => setArabic(v)} label={l} />
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Islamic Studies Knowledge</label>
              <Sel val={islamic} onChange={setIslamic} opts={["Very basic — pillars only","Intermediate — some Fiqh & Aqeedah","Advanced — studied with a scholar","Self-taught — read extensively"]} />
            </div>
            <div>
              <label style={lbl}>Subjects you're most interested in</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Quran Recitation","Quran Memorisation (Hifz)","Tajweed Rules","Arabic Grammar","Arabic Vocabulary","Fiqh (Jurisprudence)","Aqeedah (Creed)","Quran Tafseer","Hadith","Seerah","Islamic History"].map(s => (
                  <Chip key={s} label={s} sel={subjects.includes(s)} onClick={() => tog(subjects, s, setSubjects)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ONBOARDING STEP 4 */}
        {obStep === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={lbl}>Your main learning goals (select all)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Read Quran correctly","Memorise the full Quran","Learn Tajweed","Understand Arabic","Deepen Islamic knowledge","Learn Fiqh","Teach my children","Improve my Salah","Prepare to teach","General Islamic education"].map(g => (
                  <Chip key={g} label={g} sel={goals.includes(g)} onClick={() => tog(goals, g, setGoals)} />
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Study hours per day</label>
                <Sel val={hours} onChange={setHours} opts={["Less than 30 min","30 min – 1 hour","1–2 hours","2–3 hours","More than 3 hours"]} />
              </div>
              <div>
                <label style={lbl}>Preferred time to learn</label>
                <Sel val={timePrefer} onChange={setTimePrefer} opts={["Early morning (Fajr)","Morning","Afternoon","Evening","Night (after Isha)","Flexible"]} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Primary device</label>
                <Sel val={device} onChange={setDevice} opts={["Mobile phone","Tablet","Laptop / PC","Multiple devices"]} />
              </div>
              <div>
                <label style={lbl}>How did you hear about us?</label>
                <Sel val={heardFrom} onChange={setHeardFrom} opts={["Social media","Friend / Family","WhatsApp","Google","Mosque / Islamic centre","Other"]} />
              </div>
            </div>
            <div>
              <label style={lbl}>Anything else for your teacher to know?</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} {...obF("notes")} style={{ ...inputSt(obFoc === "notes"), resize: "none", lineHeight: 1.5, padding: "12px 14px" }} placeholder="Health conditions, learning difficulties, special requests…" />
            </div>
          </div>
        )}

        {/* Onboarding nav buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {obStep > 1 && (
            <button type="button" onClick={() => setObStep(s => s - 1)} style={{ padding: "13px 20px", borderRadius: 14, border: "2px solid #e5e7eb", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button type="button" onClick={onboardingNext} disabled={obSaving} style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: obSaving ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: obSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(6,78,59,.25)", transition: "all .2s" }}>
            {obSaving
              ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Saving…</>
              : obStep === ONBOARD_TOTAL
              ? <><CheckCircle2 size={18} /> Submit Onboarding</>
              : <>Next Step <ArrowRight size={16} /></>
            }
          </button>
        </div>

        {/* Skip option */}
        <p style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#9ca3af" }}>
          Having trouble?{" "}
          <button onClick={() => setPhase("done")} style={{ background: "none", border: "none", cursor: "pointer", color: G, fontWeight: 600, fontSize: 12, textDecoration: "underline" }}>
            Skip onboarding for now
          </button>
        </p>
      </Shell>
    );
  }

  // ── PHASE: REGISTER (steps 1 & 2) ─────────────────────────────────────────
  return (
    <Shell>
      {/* STEP 1: Account form */}
      {step === 1 && (
        <>
          <DynamicStepper activeStep={1} steps={steps} />
          <div style={{ marginBottom: 24, direction: isRTL ? "rtl" : "ltr" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Create your account</h2>
            <p style={{ fontSize: 13, color: "#7a9e88", margin: 0 }}>
              {config.entrance_fee_enabled
                ? `Fill in your details, then pay the ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()} registration fee`
                : "Fill in your details to create your account — no payment required"}
            </p>
          </div>

          <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              By continuing you agree to our <span style={{ color: GOLD, fontWeight: 600 }}>Terms & Privacy Policy</span>
            </p>
            <button type="submit" disabled={creating} className="reg-btn" style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: creating ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`, border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: creating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(15,45,31,.3)", transition: "all .2s", fontFamily: "'Cairo',sans-serif" }}>
              {creating
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin .8s linear infinite" }} /> Creating account…</>
                : config.entrance_fee_enabled
                ? <>Continue to Payment <ArrowRight style={{ width: 16, height: 16 }} /></>
                : <>Create Account <ArrowRight style={{ width: 16, height: 16 }} /></>
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
        </>
      )}

      {/* STEP 2: Payment */}
      {step === 2 && config.entrance_fee_enabled && (
        <>
          <DynamicStepper activeStep={2} steps={steps} />
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#D4A843,#B8860B)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Star size={28} color="#fff" fill="#fff" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>Pay Registration Fee</h2>
            <p style={{ fontSize: 13, color: "#7a9e88", margin: 0, lineHeight: 1.5 }}>A one-time fee to activate your account and unlock the entrance process</p>
          </div>

          <div style={{ background: "#FFFBEB", borderRadius: 14, padding: "16px 18px", border: "2px solid #F9D46A", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: "#92400E", fontWeight: 700 }}>Registration Fee</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: "#92400E" }}>{currencySymbol(config.entrance_fee_currency)}{config.entrance_fee_amount.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                config.onboarding_required      && "Onboarding form access",
                config.entrance_exam_required   && "Written entrance exam",
                config.recitation_test_required && "Recitation audio submission",
                "Admin level assignment",
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#78350F" }}>
                  <CheckCircle2 size={13} color="#D4A843" /> {item as string}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "12px 16px", border: "1px solid #86EFAC", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 14 }}>{fullName[0]?.toUpperCase() || "?"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
              <div style={{ fontSize: 11, color: "#7a9e88", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            </div>
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", fontSize: 11, color: "#7a9e88", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>Edit</button>
          </div>

          <button onClick={handlePayment} disabled={paying || creating} className="pay-btn" style={{ width: "100%", padding: "15px 0", borderRadius: 14, background: paying || creating ? "#9ca3af" : "linear-gradient(135deg,#D4A843,#B8860B)", border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: paying || creating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 16px rgba(212,168,67,.35)", transition: "all .2s", fontFamily: "'Cairo',sans-serif", animation: paying || creating ? "none" : "glow 2s infinite" }}>
            {paying || creating
              ? <><div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />{creating ? "Creating account…" : "Processing payment…"}</>
              : <><CreditCard size={18} /> Register Now — Pay {currencySymbol(config.entrance_fee_currency)}{config.entrance_fee_amount.toLocaleString()}</>
            }
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
            <Shield size={12} /> Secured by Paystack · SSL Encrypted · One-time payment
          </div>
          <button onClick={() => setStep(1)} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textDecoration: "underline" }}>← Back to details</button>
        </>
      )}
    </Shell>
  );
};

export default Register;
