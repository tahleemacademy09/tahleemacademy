import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Check, X, User, Mail, Lock, BookOpen, ArrowRight, Globe, Star, CreditCard, Shield, FileText, GraduationCap, Mic, Video, CheckCircle2 } from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";
const REGISTRATION_FEE = 5000;

const checkPassword = (pw: string) => ({
  length: pw.length >= 8,
  upper:  /[A-Z]/.test(pw),
  lower:  /[a-z]/.test(pw),
  number: /\d/.test(pw),
});

// ── Step indicator ────────────────────────────────────────────────
// ── Full 5-step enrollment journey stepper ───────────────────────
const EnrollmentSteps = ({ activeStep }: { activeStep: number }) => {
  const steps = [
    { n: 1, label: "Create Account",  sub: "Name, email & password" },
    { n: 2, label: "Pay ₦5,000",      sub: "One-time registration" },
    { n: 3, label: "Onboarding",      sub: "Tell us about yourself" },
    { n: 4, label: "Entrance Exam",   sub: "Written placement test" },
    { n: 5, label: "Recitation",      sub: "Audio + live evaluation" },
  ];
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < 4 ? 1 : undefined }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: activeStep > s.n ? "#22c55e" : activeStep === s.n ? G : "#e5e7eb",
              color: "#fff", fontSize: 10, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .3s", boxShadow: activeStep === s.n ? `0 0 0 3px rgba(6,78,59,.2)` : "none",
            }}>
              {activeStep > s.n ? <CheckCircle2 size={13} /> : s.n}
            </div>
            {i < 4 && <div style={{ flex: 1, height: 2, background: activeStep > s.n ? "#22c55e" : "#e5e7eb", transition: "background .4s" }} />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase" as const, letterSpacing: .6 }}>
          Step {activeStep} of 5 — {steps[activeStep - 1]?.label}
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
          {activeStep < 3
            ? "Complete here on this page"
            : "Continues after email verification & login"}
        </div>
      </div>
    </div>
  );
};

const Register = () => {
  const { t, language, setLanguage } = useLanguage() as any;
  const { signUp } = useAuth();
  const { toast }  = useToast();
  const navigate   = useNavigate();

  // Step 1 state
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [focused, setFocused]     = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Step tracking
  const [step, setStep]           = useState<1 | 2 | 3>(1);
  const [paying, setPaying]       = useState(false);
  const [creating, setCreating]   = useState(false);
  const [payRef, setPayRef]       = useState("");

  const pwChecks   = checkPassword(password);
  const pwStrength = Object.values(pwChecks).filter(Boolean).length;
  const pwValid    = Object.values(pwChecks).every(Boolean);
  const isRTL      = language === "ar";

  const fieldStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
    border: `2px solid ${focused === name ? GM : "rgba(15,45,31,0.15)"}`,
    fontSize: 14, outline: "none", color: G, background: "#fafefb",
    transition: "border-color .2s, box-shadow .2s", fontFamily: "'Cairo',sans-serif",
    boxShadow: focused === name ? `0 0 0 4px rgba(26,71,49,.1)` : "none",
    direction: isRTL ? "rtl" : "ltr", boxSizing: "border-box" as const,
  });

  const strengthColor = ["#ef4444","#ef4444","#f59e0b","#f59e0b","#22c55e"][pwStrength];

  // ── Step 1 → validate form ────────────────────────────────────
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!fullName.trim()) { toast({ title: "Enter your full name", variant: "destructive" }); return; }
    if (!email.trim()) { toast({ title: "Enter your email", variant: "destructive" }); return; }
    if (!pwValid) { toast({ title: t("Weak password","كلمة مرور ضعيفة"), description: t("Meet all password requirements.","استوفِ جميع متطلبات كلمة المرور."), variant: "destructive" }); return; }
    setStep(2);
  };

  // ── Step 2 → pay via Paystack then create account ────────────
  const handlePayment = () => {
    const ref = `TAH-REG-${Date.now()}`;

    // No Paystack key — demo mode
    if (!PAYSTACK_KEY) {
      toast({ title: "⚠️ Demo mode — no Paystack key configured", description: "Simulating payment..." });
      setPaying(true);
      setTimeout(() => { setPaying(false); setPayRef(ref); createAccount(ref); }, 1500);
      return;
    }

    // Paystack script not loaded yet
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({
        title: "Payment system not ready",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    setPaying(true);

    try {
      const handler = PaystackPop.setup({
        key:      PAYSTACK_KEY,
        email,
        amount:   REGISTRATION_FEE * 100, // kobo
        currency: "NGN",
        ref,
        metadata: { full_name: fullName, type: "registration" },
        callback: (res: any) => {
          setPaying(false);
          setPayRef(res.reference);
          createAccount(res.reference);
        },
        onClose: () => {
          setPaying(false);
          toast({ title: "Payment cancelled", description: "You can try again when you're ready." });
        },
      });
      handler.openIframe();
    } catch (err: any) {
      setPaying(false);
      toast({
        title: "Payment failed to launch",
        description: err?.message || "Please check your internet connection and try again.",
        variant: "destructive",
      });
    }
  };

  // ── Create account after payment ─────────────────────────────
  const createAccount = async (ref: string) => {
    setCreating(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      setCreating(false);
      toast({ title: t("Error","خطأ"), description: error.message, variant: "destructive" });
      return;
    }
    // Record registration payment
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from("payment_history" as any).insert({
          user_id: userData.user.id,
          amount: REGISTRATION_FEE,
          paid_at: new Date().toISOString(),
          level: "pending",
          plan_type: "registration",
          receipt_id: `RCT-${Math.random().toString(36).slice(2,10).toUpperCase()}`,
          status: "success",
          payment_ref: ref,
          payment_type: "registration",
        });
        // Mark enrollment registration_paid
        await supabase.from("enrollments" as any).upsert({
          user_id: userData.user.id,
          level: "pending",
          plan_type: "monthly",
          amount: 5000,
          status: "grace",
          grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
          registration_paid: true,
          registration_paid_at: new Date().toISOString(),
          admin_override: false,
        }, { onConflict: "user_id" });
      }
    } catch (_) {}
    setCreating(false);
    setStep(3);
  };

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
        <div style={{ position:"absolute",inset:0,backgroundImage:`radial-gradient(rgba(201,168,76,.15) 1px,transparent 1px)`,backgroundSize:"28px 28px",opacity:.5 }} />
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
          {/* Registration steps preview */}
          <div style={{ background:"rgba(255,255,255,.06)",borderRadius:16,padding:"16px 20px",border:"1px solid rgba(255,255,255,.08)",textAlign:"left" }}>
            <div style={{ fontSize:12,fontWeight:800,color:GOLD,marginBottom:12,textTransform:"uppercase",letterSpacing:.5 }}>Enrolment Process</div>
            {[
              { icon:<Star size={13} color={GOLD} />,          label:"Pay ₦5,000 Registration Fee" },
              { icon:<FileText size={13} color="#60A5FA" />,    label:"Fill Onboarding Form" },
              { icon:<GraduationCap size={13} color="#A78BFA" />,label:"Written Entrance Exam" },
              { icon:<Mic size={13} color="#34D399" />,         label:"Recitation Audio Test" },
              { icon:<Video size={13} color="#F87171" />,        label:"Live Teacher Evaluation" },
            ].map((s,i)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:i<4?8:0 }}>
                <div style={{ width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {s.icon}
                </div>
                <span style={{ fontSize:12,color:"rgba(255,255,255,.75)" }}>{s.label}</span>
              </div>
            ))}
          </div>
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

          {/* ── STEP 1: FORM ──────────────────────────────── */}
          {step === 1 && (
            <>
              <EnrollmentSteps activeStep={1} />
              <div style={{ marginBottom:24,direction:isRTL?"rtl":"ltr" }}>
                <h2 style={{ fontSize:22,fontWeight:900,color:G,margin:"0 0 6px" }}>{t("Create your account","أنشئ حسابك")}</h2>
                <p style={{ fontSize:13,color:"#7a9e88",margin:0 }}>{t("Fill in your details, then pay the registration fee","أدخل بياناتك ثم ادفع رسوم التسجيل")}</p>
              </div>

              <form onSubmit={handleStep1} style={{ display:"flex",flexDirection:"column",gap:16 }}>
                {/* Full Name */}
                <div style={{ position:"relative" }}>
                  <User style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="name"?GM:"#9ca3af",pointerEvents:"none" }} />
                  <input className="reg-input" style={fieldStyle("name")} placeholder={t("Full Name","الاسم الكامل")} value={fullName} onChange={e=>setFullName(e.target.value)} onFocus={()=>setFocused("name")} onBlur={()=>setFocused(null)} required autoComplete="name" />
                </div>

                {/* Email */}
                <div style={{ position:"relative" }}>
                  <Mail style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="email"?GM:"#9ca3af",pointerEvents:"none" }} />
                  <input className="reg-input" style={fieldStyle("email")} type="email" placeholder={t("Email Address","عنوان البريد الإلكتروني")} value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>setFocused("email")} onBlur={()=>setFocused(null)} required autoComplete="email" />
                </div>

                {/* Password */}
                <div>
                  <div style={{ position:"relative" }}>
                    <Lock style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:focused==="pw"?GM:"#9ca3af",pointerEvents:"none" }} />
                    <input className="reg-input" style={fieldStyle("pw")} type={showPw?"text":"password"} placeholder={t("Password","كلمة المرور")} value={password} onChange={e=>setPassword(e.target.value)} onFocus={()=>setFocused("pw")} onBlur={()=>setFocused(null)} required autoComplete="new-password" />
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
                          [pwChecks.length, t("8+ characters","8+ أحرف")],
                          [pwChecks.upper,  t("Uppercase","حرف كبير")],
                          [pwChecks.lower,  t("Lowercase","حرف صغير")],
                          [pwChecks.number, t("Number","رقم")],
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
                  {t("By continuing you agree to our","بالمتابعة توافق على")} <span style={{ color:GOLD,fontWeight:600 }}>{t("Terms & Privacy Policy","الشروط وسياسة الخصوصية")}</span>
                </p>

                <button type="submit" className="reg-btn"
                  style={{ width:"100%",padding:"13px 0",borderRadius:14,background:`linear-gradient(135deg,${G},${GM})`,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px rgba(15,45,31,.3)",transition:"all .2s",fontFamily:"'Cairo',sans-serif" }}>
                  {t("Continue to Payment","المتابعة للدفع")} <ArrowRight style={{ width:16,height:16 }} />
                </button>
              </form>

              <div style={{ display:"flex",alignItems:"center",gap:12,margin:"20px 0" }}>
                <div style={{ flex:1,height:1,background:"rgba(15,45,31,.1)" }} />
                <span style={{ fontSize:12,color:"#9ca3af" }}>{t("or","أو")}</span>
                <div style={{ flex:1,height:1,background:"rgba(15,45,31,.1)" }} />
              </div>
              <p style={{ textAlign:"center",fontSize:13,color:"#7a9e88",margin:0 }}>
                {t("Already have an account?","لديك حساب؟")}{" "}
                <Link to="/login" style={{ color:G,fontWeight:800,textDecoration:"none" }}>{t("Sign In →","تسجيل الدخول ←")}</Link>
              </p>
            </>
          )}

          {/* ── STEP 2: PAY REGISTRATION FEE ─────────────── */}
          {step === 2 && (
            <>
              <EnrollmentSteps activeStep={2} />
              <div style={{ textAlign:"center",marginBottom:24 }}>
                <div style={{ width:60,height:60,borderRadius:"50%",background:"linear-gradient(135deg,#D4A843,#B8860B)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}>
                  <Star size={28} color="#fff" fill="#fff" />
                </div>
                <h2 style={{ fontSize:22,fontWeight:900,color:G,margin:"0 0 6px" }}>Pay Registration Fee</h2>
                <p style={{ fontSize:13,color:"#7a9e88",margin:0,lineHeight:1.5 }}>
                  A one-time fee to activate your account and unlock the entrance exam process
                </p>
              </div>

              {/* Summary box */}
              <div style={{ background:"#FFFBEB",borderRadius:14,padding:"16px 18px",border:"2px solid #F9D46A",marginBottom:20 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                  <span style={{ fontSize:14,color:"#92400E",fontWeight:700 }}>Registration Fee</span>
                  <span style={{ fontSize:24,fontWeight:900,color:"#92400E" }}>₦5,000</span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                  {[
                    "Onboarding form access",
                    "Written entrance exam",
                    "Recitation audio submission",
                    "Live teacher evaluation session",
                    "Admin level assignment",
                  ].map((item,i)=>(
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#78350F" }}>
                      <CheckCircle2 size={13} color="#D4A843" /> {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Registering as */}
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

              <button onClick={handlePayment} disabled={paying||creating}
                className="pay-btn"
                style={{ width:"100%",padding:"15px 0",borderRadius:14,background:paying||creating?"#9ca3af":"linear-gradient(135deg,#D4A843,#B8860B)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:paying||creating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 16px rgba(212,168,67,.35)",transition:"all .2s",fontFamily:"'Cairo',sans-serif",animation:paying||creating?"none":"glow 2s infinite" }}>
                {paying || creating
                  ? <><div style={{ width:18,height:18,border:"2.5px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite" }} />{creating?"Creating account…":"Processing payment…"}</>
                  : <><CreditCard size={18} /> Pay ₦5,000 & Create Account</>
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

          {step === 3 && (
            <div style={{ textAlign:"center",padding:"10px 0" }}>
              <EnrollmentSteps activeStep={3} />
              <div style={{ width:72,height:72,borderRadius:"50%",background:"#E8F5E9",border:"3px solid #22c55e",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",animation:"fadeUp .4s ease" }}>
                <CheckCircle2 size={36} color="#22c55e" />
              </div>
              <h2 style={{ fontSize:24,fontWeight:900,color:G,margin:"0 0 8px" }}>Steps 1 & 2 Complete! 🎉</h2>
              <p style={{ fontSize:14,color:"#7a9e88",lineHeight:1.6,margin:"0 0 20px" }}>
                Registration fee paid. Your account is being set up.<br/>
                <strong style={{ color:G }}>Check your email</strong> to verify, then log in to continue steps 3–5.
              </p>

              {/* Remaining steps */}
              <div style={{ background:"#F0FDF4",borderRadius:14,padding:"14px 18px",border:"1px solid #86EFAC",marginBottom:20,textAlign:"left" }}>
                <div style={{ fontSize:12,fontWeight:700,color:"#166534",marginBottom:10,textTransform:"uppercase" as const,letterSpacing:.5 }}>Remaining Steps After Login</div>
                {[
                  { n:3, icon:<FileText size={13} color="#2563EB" />,      label:"Complete the onboarding form" },
                  { n:4, icon:<GraduationCap size={13} color="#7C3AED" />, label:"Take the written entrance exam" },
                  { n:5, icon:<Mic size={13} color="#16A34A" />,           label:"Submit recitation audio + live teacher session" },
                ].map((s,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#166534",marginBottom:i<2?9:0 }}>
                    <div style={{ width:22,height:22,borderRadius:"50%",background:"rgba(6,78,59,.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:800,fontSize:10,color:G }}>{s.n}</div>
                    <span style={{ display:"flex",alignItems:"center",gap:6 }}>{s.icon} {s.label}</span>
                  </div>
                ))}
              </div>

              {/* First check email */}
              <div style={{ background:"#FFF8E1",borderRadius:12,padding:"11px 16px",border:"1px solid #F9D46A",marginBottom:20,fontSize:12,color:"#92400E",textAlign:"left" }}>
                <strong>📧 First:</strong> Check your inbox for a verification email from Tahleem Academy and click the link before logging in.
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
