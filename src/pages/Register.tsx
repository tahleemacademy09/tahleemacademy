// src/pages/Register.tsx
// FULLY CONTROLLED BY ADMIN:
//   • registration_open        → shows closed screen if false
//   • entrance_fee_enabled     → skips payment step if false
//   • entrance_fee_amount      → dynamic fee from admin
//   • entrance_fee_currency    → dynamic currency from admin
//   • entrance_exam_required   → shown in stepper info only
//   • onboarding_required      → shown in stepper info only
//   • max_daily_registrations  → enforces daily cap
//   • closed_message           → shown when closed

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Eye, EyeOff, Check, X, User, Mail, Lock, BookOpen, ArrowRight,
  Globe, Star, CreditCard, Shield, FileText, GraduationCap, Mic,
  CheckCircle2, AlertCircle, Loader2, Video,
} from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

const checkPassword = (pw: string) => ({
  length: pw.length >= 8,
  upper:  /[A-Z]/.test(pw),
  lower:  /[a-z]/.test(pw),
  number: /\d/.test(pw),
});

// ── Dynamic stepper — built from admin config ─────────────────────────────
const DynamicStepper = ({ activeStep, steps }: { activeStep: number; steps: { label: string; sub: string }[] }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", alignItems: "center" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0, fontSize: 10, fontWeight: 800,
            background: activeStep > i + 1 ? "#22c55e" : activeStep === i + 1 ? G : "#e5e7eb",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .3s", boxShadow: activeStep === i + 1 ? `0 0 0 3px rgba(6,78,59,.2)` : "none",
          }}>
            {activeStep > i + 1 ? <CheckCircle2 size={13} /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: activeStep > i + 1 ? "#22c55e" : "#e5e7eb", transition: "background .4s" }} />
          )}
        </div>
      ))}
    </div>
    <div style={{ marginTop: 10, textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase" as const, letterSpacing: .6 }}>
        Step {activeStep} of {steps.length} — {steps[activeStep - 1]?.label}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{steps[activeStep - 1]?.sub}</div>
    </div>
  </div>
);

const Register = () => {
  const { t, language, setLanguage } = useLanguage() as any;
  const { signUp }                   = useAuth();
  const { toast }                    = useToast();
  const navigate                     = useNavigate();
  const { config, loading: configLoading, currencySymbol } = useRegistrationSettings();

  const isRTL = language === "ar";

  // Ensure Paystack script loaded
  useEffect(() => {
    if ((window as any).PaystackPop) return;
    if (document.getElementById("paystack-script")) return;
    const s = document.createElement("script");
    s.id  = "paystack-script";
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  // ── Check daily registration cap ──────────────────────────────────────
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

  // ── Form state ────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep]         = useState(1);
  const [paying, setPaying]     = useState(false);
  const [creating, setCreating] = useState(false);

  const pwChecks    = checkPassword(password);
  const pwStrength  = Object.values(pwChecks).filter(Boolean).length;
  const pwValid     = Object.values(pwChecks).every(Boolean);
  const strengthColor = ["#ef4444","#ef4444","#f59e0b","#f59e0b","#22c55e"][pwStrength];

  // ── Build dynamic steps list based on admin config ────────────────────
  const buildSteps = () => {
    const s = [{ label: "Create Account", sub: "Your name, email & password" }];
    if (config.entrance_fee_enabled) s.push({ label: `Pay ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()}`, sub: "One-time registration fee" });
    if (config.onboarding_required)  s.push({ label: "Onboarding", sub: "Tell us about yourself" });
    if (config.entrance_exam_required) s.push({ label: "Entrance Exam", sub: "Written placement test" });
    if (config.recitation_test_required) s.push({ label: "Recitation", sub: "Audio evaluation" });
    return s;
  };
  const steps = buildSteps();
  // step 2 in UI = payment step (if enabled), else step 2 = "done" screen
  const paymentStepIndex = config.entrance_fee_enabled ? 2 : null;
  const doneStep = config.entrance_fee_enabled ? 3 : 2;

  const fieldStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
    border: `2px solid ${focused === name ? GM : "rgba(15,45,31,0.15)"}`,
    fontSize: 14, outline: "none", color: G, background: "#fafefb",
    transition: "border-color .2s, box-shadow .2s", fontFamily: "'Cairo',sans-serif",
    boxShadow: focused === name ? `0 0 0 4px rgba(26,71,49,.1)` : "none",
    direction: isRTL ? "rtl" : "ltr", boxSizing: "border-box" as const,
  });

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!fullName.trim()) { toast({ title: "Enter your full name", variant: "destructive" }); return; }
    if (!email.trim())    { toast({ title: "Enter your email", variant: "destructive" }); return; }
    if (!pwValid)         { toast({ title: "Weak password", description: "Meet all password requirements.", variant: "destructive" }); return; }
    // If no fee required → create account directly
    if (!config.entrance_fee_enabled) {
      createAccount("NO_FEE");
    } else {
      setStep(2);
    }
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
        key:      PAYSTACK_KEY,
        email,
        amount:   config.entrance_fee_amount * 100,
        currency: config.entrance_fee_currency,
        ref,
        metadata: { full_name: fullName, type: "registration" },
        callback: (res: any) => { setPaying(false); createAccount(res.reference); },
        onClose:  () => { setPaying(false); toast({ title: "Payment cancelled. Try again when ready." }); },
      });
      handler.openIframe();
    } catch (err: any) {
      setPaying(false);
      toast({ title: "Payment failed to launch", description: err?.message, variant: "destructive" });
    }
  };

  const createAccount = async (ref: string) => {
    setCreating(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      setCreating(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Record payment if fee was paid
    if (ref !== "NO_FEE") {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: ud } = await supabase.auth.getUser();
        if (ud?.user) {
          await supabase.from("payment_history" as any).insert({
            user_id: ud.user.id,
            amount: config.entrance_fee_amount,
            paid_at: new Date().toISOString(),
            status: "success",
            payment_ref: ref,
            payment_type: "registration",
            plan_type: "registration",
          });
          await supabase.from("enrollments" as any).upsert({
            user_id: ud.user.id,
            level: "pending",
            plan_type: "monthly",
            amount: config.entrance_fee_amount,
            status: "grace",
            grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
            registration_paid: true,
            registration_paid_at: new Date().toISOString(),
            admin_override: false,
          }, { onConflict: "user_id" });
        }
      } catch (_) {}
    }

    setCreating(false);
    setStep(doneStep);
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (configLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
        <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── REGISTRATION CLOSED ────────────────────────────────────────────────
  if (!config.registration_open || dailyCapReached) {
    const msg = dailyCapReached
      ? "Daily registration limit reached. Please try again tomorrow."
      : (isRTL ? config.closed_message_ar : config.closed_message);

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "'Cairo',sans-serif",
        background: `radial-gradient(ellipse at 20% 50%,rgba(15,45,31,.08),transparent 60%),#f8fafb`,
      }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 24, border: "1px solid rgba(15,45,31,.1)", boxShadow: "0 8px 40px rgba(15,45,31,.1)", padding: "40px 32px", textAlign: "center", animation: "fadeUp .5s ease" }}>
          {/* Logo */}
          <div style={{ width: 64, height: 64, borderRadius: 18, background: G, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <BookOpen style={{ width: 30, height: 30, color: GOLD }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 6px" }}>
            Tahleem <span style={{ color: GOLD }}>Academy</span>
          </h1>
          <p style={{ fontSize: 12, color: "#7a9e88", margin: "0 0 28px" }}>أكاديمية تعليم</p>

          {/* Closed banner */}
          <div style={{ background: "#FEF2F2", borderRadius: 16, padding: "20px", border: "2px solid #FECACA", marginBottom: 24 }}>
            <AlertCircle size={32} color="#DC2626" style={{ margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontWeight: 800, fontSize: 16, color: "#991B1B", margin: "0 0 8px" }}>
              {dailyCapReached ? "Daily Limit Reached" : "Registration Closed"}
            </p>
            <p style={{ fontSize: 13, color: "#DC2626", margin: 0, lineHeight: 1.6 }}>{msg}</p>
          </div>

          {/* Arabic if available */}
          {!dailyCapReached && config.closed_message_ar && !isRTL && (
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 20, direction: "rtl", fontFamily: "'Amiri',serif" }}>
              {config.closed_message_ar}
            </p>
          )}

          <Link to="/login"
            style={{ display: "block", padding: "13px 0", borderRadius: 14, background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 14, fontWeight: 800, textDecoration: "none", marginBottom: 12 }}>
            Sign In Instead →
          </Link>
          <Link to="/" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "underline" }}>← Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── MAIN REGISTRATION FLOW ────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", display: "flex", fontFamily: "'Cairo',sans-serif",
      background: `radial-gradient(ellipse at 20% 50%,rgba(15,45,31,.08) 0%,transparent 60%),
                   radial-gradient(ellipse at 80% 20%,rgba(201,168,76,.06) 0%,transparent 50%),#f8fafb`,
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(212,168,67,.4)} 50%{box-shadow:0 0 0 10px rgba(212,168,67,0)} }
        .reg-input::placeholder { color:#9ca3af; }
        .reg-btn:hover  { transform:translateY(-1px); box-shadow:0 8px 24px rgba(15,45,31,.35)!important; }
        .pay-btn:hover  { transform:translateY(-1px); box-shadow:0 8px 24px rgba(212,168,67,.4)!important; }
        @media(max-width:1024px){ .lg-hide{display:none!important} }
      `}</style>

      {/* LEFT PANEL */}
      <div className="lg-hide" style={{ flex: 1, background: `linear-gradient(160deg,${G},${GM},#0a1f12)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative", overflow: "hidden" }}>
        {[160,240,340].map((sz,i)=>(
          <div key={i} style={{ position:"absolute",width:sz,height:sz,borderRadius:"50%",border:`1px solid rgba(201,168,76,${.12-i*.03})`,top:"50%",left:"50%",transform:"translate(-50%,-50%)" }} />
        ))}
        <div style={{ position:"relative",textAlign:"center",animation:"fadeUp .8s ease" }}>
          <div style={{ width:72,height:72,borderRadius:20,background:"rgba(201,168,76,.15)",border:"1.5px solid rgba(201,168,76,.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px" }}>
            <BookOpen style={{ width:34,height:34,color:GOLD }} />
          </div>
          <h1 style={{ fontSize:32,fontWeight:900,color:"#fff",margin:"0 0 8px",letterSpacing:-.5 }}>
            Tahleem<span style={{ color:GOLD }}> Academy</span>
          </h1>
          <p style={{ fontSize:15,color:"rgba(255,255,255,.55)",margin:"0 0 36px",lineHeight:1.6 }}>
            أكاديمية تعليم الإسلامية<br/>Your journey to Islamic knowledge
          </p>

          {/* Dynamic enrollment steps preview */}
          <div style={{ background:"rgba(255,255,255,.06)",borderRadius:16,padding:"16px 20px",border:"1px solid rgba(255,255,255,.08)",textAlign:"left" }}>
            <div style={{ fontSize:12,fontWeight:800,color:GOLD,marginBottom:12,textTransform:"uppercase",letterSpacing:.5 }}>Enrolment Process</div>
            {[
              { show: true,                          icon:<User size={13} color={GOLD} />,           label:"Create Account" },
              { show: config.entrance_fee_enabled,   icon:<Star size={13} color={GOLD} />,           label:`Pay ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()} Registration Fee` },
              { show: config.onboarding_required,    icon:<FileText size={13} color="#60A5FA" />,     label:"Fill Onboarding Form" },
              { show: config.entrance_exam_required, icon:<GraduationCap size={13} color="#A78BFA"/>, label:"Written Entrance Exam" },
              { show: config.recitation_test_required,icon:<Mic size={13} color="#34D399"/>,          label:"Recitation Audio Test" },
            ].filter(s => s.show).map((s,i,arr)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:i<arr.length-1?8:0 }}>
                <div style={{ width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{s.icon}</div>
                <span style={{ fontSize:12,color:"rgba(255,255,255,.75)" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Welcome message from admin */}
          {config.registration_message && (
            <div style={{ marginTop:20,background:"rgba(201,168,76,.1)",borderRadius:12,padding:"12px 16px",border:"1px solid rgba(201,168,76,.2)",textAlign:"left" }}>
              <p style={{ fontSize:11,color:"rgba(255,255,255,.7)",margin:0,lineHeight:1.6 }}>{config.registration_message}</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 20px",minWidth:0 }}>

        {/* Language toggle */}
        <div style={{ position:"absolute",top:16,right:16 }}>
          <button onClick={()=>setLanguage&&setLanguage(language==="ar"?"en":"ar")}
            style={{ display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:20,background:"rgba(15,45,31,.07)",border:`1px solid rgba(15,45,31,.12)`,color:G,fontSize:12,fontWeight:700,cursor:"pointer" }}>
            <Globe style={{ width:13,height:13 }} />{language==="ar"?"English":"العربية"}
          </button>
        </div>

        {/* Mobile logo */}
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24 }}>
          <div style={{ width:40,height:40,borderRadius:12,background:G,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <BookOpen style={{ width:20,height:20,color:GOLD }} />
          </div>
          <div>
            <div style={{ fontSize:16,fontWeight:900,color:G }}>Tahleem <span style={{ color:GOLD }}>Academy</span></div>
            <div style={{ fontSize:10,color:"#7a9e88" }}>أكاديمية تعليم</div>
          </div>
        </div>

        <div style={{ width:"100%",maxWidth:440,background:"#fff",borderRadius:24,border:"1px solid rgba(15,45,31,.1)",boxShadow:"0 8px 40px rgba(15,45,31,.1)",padding:"36px 32px",animation:"fadeUp .5s ease" }}>

          {/* ── STEP 1: FORM ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              <DynamicStepper activeStep={1} steps={steps} />
              <div style={{ marginBottom:24,direction:isRTL?"rtl":"ltr" }}>
                <h2 style={{ fontSize:22,fontWeight:900,color:G,margin:"0 0 6px" }}>Create your account</h2>
                <p style={{ fontSize:13,color:"#7a9e88",margin:0 }}>
                  {config.entrance_fee_enabled
                    ? `Fill in your details, then pay the ${currencySymbol(config.entrance_fee_currency)}${config.entrance_fee_amount.toLocaleString()} registration fee`
                    : "Fill in your details to create your account — no payment required"}
                </p>
              </div>

              <form onSubmit={handleStep1} style={{ display:"flex",flexDirection:"column",gap:16 }}>
                <div style={{ position:"relative" }}>
                  <User style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="name"?GM:"#9ca3af",pointerEvents:"none" }} />
                  <input className="reg-input" style={fieldStyle("name")} placeholder="Full Name" value={fullName} onChange={e=>setFullName(e.target.value)} onFocus={()=>setFocused("name")} onBlur={()=>setFocused(null)} required autoComplete="name" />
                </div>
                <div style={{ position:"relative" }}>
                  <Mail style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="email"?GM:"#9ca3af",pointerEvents:"none" }} />
                  <input className="reg-input" style={fieldStyle("email")} type="email" placeholder="Email Address" value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>setFocused("email")} onBlur={()=>setFocused(null)} required autoComplete="email" />
                </div>
                <div>
                  <div style={{ position:"relative" }}>
                    <Lock style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="pw"?GM:"#9ca3af",pointerEvents:"none" }} />
                    <input className="reg-input" style={fieldStyle("pw")} type={showPw?"text":"password"} placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onFocus={()=>setFocused("pw")} onBlur={()=>setFocused(null)} required autoComplete="new-password" />
                    <button type="button" onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:2 }}>
                      {showPw?<EyeOff style={{width:15,height:15}}/>:<Eye style={{width:15,height:15}}/>}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ display:"flex",gap:4,marginBottom:6 }}>
                        {[1,2,3,4].map(i=>(
                          <div key={i} style={{ flex:1,height:3,borderRadius:3,background:i<=pwStrength?strengthColor:"#e5e7eb",transition:"background .3s" }} />
                        ))}
                      </div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px" }}>
                        {[
                          [pwChecks.length, "8+ characters"],
                          [pwChecks.upper,  "Uppercase"],
                          [pwChecks.lower,  "Lowercase"],
                          [pwChecks.number, "Number"],
                        ].map(([ok,label],i)=>(
                          <div key={i} style={{ display:"flex",alignItems:"center",gap:5,fontSize:11 }}>
                            {ok?<Check style={{width:11,height:11,color:"#22c55e"}}/>:<X style={{width:11,height:11,color:"#d1d5db"}}/>}
                            <span style={{ color:ok?"#22c55e":"#9ca3af" }}>{label as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <p style={{ fontSize:11,color:"#9ca3af",textAlign:"center",lineHeight:1.5,margin:0 }}>
                  By continuing you agree to our <span style={{ color:GOLD,fontWeight:600 }}>Terms & Privacy Policy</span>
                </p>

                <button type="submit" disabled={creating} className="reg-btn"
                  style={{ width:"100%",padding:"13px 0",borderRadius:14,background:creating?`#9CA3AF`:`linear-gradient(135deg,${G},${GM})`,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:creating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px rgba(15,45,31,.3)",transition:"all .2s",fontFamily:"'Cairo',sans-serif" }}>
                  {creating
                    ? <><Loader2 style={{width:16,height:16,animation:"spin .8s linear infinite"}} /> Creating account…</>
                    : config.entrance_fee_enabled
                      ? <>{`Continue to Payment`} <ArrowRight style={{ width:16,height:16 }} /></>
                      : <>{`Create Account`} <ArrowRight style={{ width:16,height:16 }} /></>
                  }
                </button>
              </form>

              <div style={{ display:"flex",alignItems:"center",gap:12,margin:"20px 0" }}>
                <div style={{ flex:1,height:1,background:"rgba(15,45,31,.1)" }} />
                <span style={{ fontSize:12,color:"#9ca3af" }}>or</span>
                <div style={{ flex:1,height:1,background:"rgba(15,45,31,.1)" }} />
              </div>
              <p style={{ textAlign:"center",fontSize:13,color:"#7a9e88",margin:0 }}>
                Already have an account?{" "}<Link to="/login" style={{ color:G,fontWeight:800,textDecoration:"none" }}>Sign In →</Link>
              </p>
            </>
          )}

          {/* ── STEP 2: PAYMENT (only if entrance_fee_enabled) ───────── */}
          {step === 2 && config.entrance_fee_enabled && (
            <>
              <DynamicStepper activeStep={2} steps={steps} />
              <div style={{ textAlign:"center",marginBottom:24 }}>
                <div style={{ width:60,height:60,borderRadius:"50%",background:"linear-gradient(135deg,#D4A843,#B8860B)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}>
                  <Star size={28} color="#fff" fill="#fff" />
                </div>
                <h2 style={{ fontSize:22,fontWeight:900,color:G,margin:"0 0 6px" }}>Pay Registration Fee</h2>
                <p style={{ fontSize:13,color:"#7a9e88",margin:0,lineHeight:1.5 }}>
                  A one-time fee to activate your account and unlock the entrance process
                </p>
              </div>

              {/* Fee summary — amounts from admin */}
              <div style={{ background:"#FFFBEB",borderRadius:14,padding:"16px 18px",border:"2px solid #F9D46A",marginBottom:20 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                  <span style={{ fontSize:14,color:"#92400E",fontWeight:700 }}>Registration Fee</span>
                  <span style={{ fontSize:24,fontWeight:900,color:"#92400E" }}>
                    {currencySymbol(config.entrance_fee_currency)}{config.entrance_fee_amount.toLocaleString()}
                  </span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                  {[
                    config.onboarding_required      && "Onboarding form access",
                    config.entrance_exam_required   && "Written entrance exam",
                    config.recitation_test_required && "Recitation audio submission",
                    "Admin level assignment",
                  ].filter(Boolean).map((item,i)=>(
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#78350F" }}>
                      <CheckCircle2 size={13} color="#D4A843" /> {item as string}
                    </div>
                  ))}
                </div>
              </div>

              {/* Who's paying */}
              <div style={{ background:"#F0FDF4",borderRadius:12,padding:"12px 16px",border:"1px solid #86EFAC",marginBottom:20,display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:36,height:36,borderRadius:"50%",background:G,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",fontWeight:800,fontSize:14 }}>
                  {fullName[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:G,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{fullName}</div>
                  <div style={{ fontSize:11,color:"#7a9e88",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{email}</div>
                </div>
                <button onClick={()=>setStep(1)} style={{ background:"none",border:"none",fontSize:11,color:"#7a9e88",cursor:"pointer",textDecoration:"underline",flexShrink:0 }}>Edit</button>
              </div>

              <button onClick={handlePayment} disabled={paying||creating} className="pay-btn"
                style={{ width:"100%",padding:"15px 0",borderRadius:14,background:paying||creating?"#9ca3af":"linear-gradient(135deg,#D4A843,#B8860B)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:paying||creating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 16px rgba(212,168,67,.35)",transition:"all .2s",fontFamily:"'Cairo',sans-serif",animation:paying||creating?"none":"glow 2s infinite" }}>
                {paying || creating
                  ? <><div style={{ width:18,height:18,border:"2.5px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite" }} />{creating?"Creating account…":"Processing payment…"}</>
                  : <><CreditCard size={18} /> Pay {currencySymbol(config.entrance_fee_currency)}{config.entrance_fee_amount.toLocaleString()} & Create Account</>
                }
              </button>

              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:11,color:"#9ca3af",marginTop:10 }}>
                <Shield size={12} /> Secured by Paystack · SSL Encrypted · One-time payment
              </div>
              <button onClick={()=>setStep(1)} style={{ display:"block",margin:"14px auto 0",background:"none",border:"none",fontSize:12,color:"#9ca3af",cursor:"pointer",textDecoration:"underline" }}>
                ← Back to details
              </button>
            </>
          )}

          {/* ── DONE SCREEN ──────────────────────────────────────────── */}
          {step === doneStep && (
            <div style={{ textAlign:"center",padding:"10px 0" }}>
              <DynamicStepper activeStep={doneStep} steps={steps} />
              <div style={{ width:72,height:72,borderRadius:"50%",background:"#E8F5E9",border:"3px solid #22c55e",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",animation:"fadeUp .4s ease" }}>
                <CheckCircle2 size={36} color="#22c55e" />
              </div>
              <h2 style={{ fontSize:24,fontWeight:900,color:G,margin:"0 0 8px" }}>
                {config.entrance_fee_enabled ? "Steps 1 & 2 Complete! 🎉" : "Account Created! 🎉"}
              </h2>
              <p style={{ fontSize:14,color:"#7a9e88",lineHeight:1.6,margin:"0 0 20px" }}>
                {config.entrance_fee_enabled ? "Registration fee paid." : ""} Your account is being set up.<br/>
                <strong style={{ color:G }}>Check your email</strong> to verify, then log in to continue.
              </p>

              {/* Remaining steps (only show if there are any after account creation) */}
              {(config.onboarding_required || config.entrance_exam_required || config.recitation_test_required) && (
                <div style={{ background:"#F0FDF4",borderRadius:14,padding:"14px 18px",border:"1px solid #86EFAC",marginBottom:20,textAlign:"left" }}>
                  <div style={{ fontSize:12,fontWeight:700,color:"#166534",marginBottom:10,textTransform:"uppercase" as const,letterSpacing:.5 }}>After Login You'll Complete</div>
                  {[
                    { show: config.onboarding_required,      icon:<FileText size={13} color="#2563EB" />,      label:"Complete the onboarding form" },
                    { show: config.entrance_exam_required,   icon:<GraduationCap size={13} color="#7C3AED" />, label:"Take the written entrance exam" },
                    { show: config.recitation_test_required, icon:<Mic size={13} color="#16A34A" />,           label:"Submit recitation audio + live evaluation" },
                  ].filter(s => s.show).map((s,i)=>(
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#166534",marginBottom:8 }}>
                      <div style={{ width:22,height:22,borderRadius:"50%",background:"rgba(6,78,59,.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{s.icon}</div>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background:"#FFF8E1",borderRadius:12,padding:"11px 16px",border:"1px solid #F9D46A",marginBottom:20,fontSize:12,color:"#92400E",textAlign:"left" }}>
                <strong>📧 First:</strong> Check your inbox for a verification email and click the link before logging in.
              </div>

              <button onClick={()=>navigate("/login")}
                style={{ width:"100%",padding:"13px 0",borderRadius:14,background:`linear-gradient(135deg,${G},${GM})`,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'Cairo',sans-serif" }}>
                Go to Login <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        <p style={{ marginTop:20,fontSize:11,color:"#9ca3af",textAlign:"center" }}>
          Tahleem Academy — Islamic Education Platform
        </p>
      </div>
    </div>
  );
};

export default Register;
