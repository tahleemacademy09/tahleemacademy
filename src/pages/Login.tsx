import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

import { Loader2, Mail, Lock, Eye, EyeOff, Check, Globe, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const G    = "#064E3B";
const GOLD = "#C9973A";
const GOLD2= "#E8C070";

const Login = () => {
  const idleLoggedOut = new URLSearchParams(window.location.search).get("reason") === "idle";
  const { t, language, setLanguage } = useLanguage();
  const { signIn, user, roles, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent]   = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // ── Single navigation effect ─────────────────────────────────────────────
  // Waits for authLoading=false (roles are fetched) before navigating.
  // We do NOT navigate inside handleSubmit to avoid a race where the dashboard
  // receives authLoading=true and empty roles, causing ProtectedRoute to bounce
  // the user back to login. Removing the duplicate navigate from handleSubmit
  // and relying solely on this effect fixes the "must refresh to login" bug.
  //
  // BUG 4 FIX: For students who are mid-registration, navigating to /student
  // relies on TasjeelGuard to redirect them — but if TasjeelGuard times out
  // on a slow connection they get stuck on the spinner forever. Instead, we
  // proactively fetch their tasjeel step here and send them straight to the
  // right pipeline page, bypassing TasjeelGuard entirely for this case.
  useEffect(() => {
    if (!user || authLoading) return;
    const isAdmin   = roles.includes("admin");
    const isTeacher = roles.includes("teacher");
    if (isAdmin)        { navigate("/admin",   { replace: true }); return; }
    if (isTeacher)      { navigate("/teacher", { replace: true }); return; }

    // Student: check their registration step before navigating
    (async () => {
      try {
        const { data: tp } = await supabase
          .from("tasjeel_progress" as any)
          .select("current_step")
          .eq("user_id", user.id)
          .maybeSingle();

        const step = (tp as any)?.current_step;

        // Route map matching TASJEEL_ROUTES in useTasjeel.ts.
        // IMPORTANT: enrollment/payment must go to /auth/register-continue,
        // NOT /register — the register page starts the form from scratch.
        // RegisterContinue detects the session, reads the current step,
        // and shows the payment screen or skips ahead if fee is disabled.
        const pipelineRoute: Record<string, string> = {
          enrollment:       "/auth/register-continue",
          payment:          "/auth/register-continue",
          onboarding:       "/onboarding",
          exam:             "/student/entrance-exam",
          recitation:       "/student/recitation-test",
          schedule_session: "/student/recitation-test",
          level_assignment: "/student/awaiting-level",
        };

        if (step && step !== "completed" && pipelineRoute[step]) {
          navigate(pipelineRoute[step], { replace: true });
        } else if (!step) {
          // No tasjeel_progress row yet — email was verified but RegisterContinue
          // never ran (e.g. link opened in a different browser). Send them there
          // now so it can initialise their pipeline and route them correctly.
          navigate("/auth/register-continue", { replace: true });
        } else {
          // completed or unknown — go to dashboard as normal
          navigate("/student", { replace: true });
        }
      } catch {
        // If the query fails just go to /student and let TasjeelGuard handle it
        navigate("/student", { replace: true });
      }
    })();
  }, [user, roles, authLoading, navigate]);

  const validateEmail = (val: string) => {
    if (!val) { setEmailValid(null); return; }
    setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Race sign-in against a 12-second timeout so spinner never hangs forever
    const signInPromise = signIn(email, password);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out — check your internet connection")), 12000)
    );

    try {
      const { error } = await Promise.race([signInPromise, timeoutPromise]) as any;

      if (error) {
        toast({
          title: t("Login Failed", "فشل تسجيل الدخول"),
          description: error.message?.includes("Invalid")
            ? t("Incorrect email or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة.")
            : error.message || t("Please try again.", "حاول مرة أخرى."),
          variant: "destructive",
        });
      }
      // ✅ Do NOT navigate here — let the useEffect above handle it once
      // AuthContext has finished fetching roles (authLoading becomes false).
      // Navigating here with authLoading=true causes ProtectedRoute to see
      // empty roles and redirect back to /login, which is why it seemed to
      // only work after a refresh.
    } catch (err: any) {
      toast({
        title: t("Login Failed", "فشل تسجيل الدخول"),
        description: err.message || t("Please check your connection and try again.", "تحقق من اتصالك وحاول مرة أخرى."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result: any = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result?.error) {
        toast({
          title: t("Sign-in failed", "فشل تسجيل الدخول"),
          description: result.error.message || "Google sign-in could not start.",
          variant: "destructive",
        });
        return;
      }
      // If redirected: browser navigates to Google — nothing else to do
      // If tokens received: AuthContext picks up the session automatically
    } catch (err: any) {
      toast({
        title: t("Sign-in failed", "فشل تسجيل الدخول"),
        description: err?.message || "Google sign-in could not start.",
        variant: "destructive",
      });
    }
  };
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetCooldown > 0) return;

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      toast({
        title: t("Invalid email", "بريد إلكتروني غير صالح"),
        description: t("Please enter a valid email address.", "أدخل بريداً إلكترونياً صحيحاً."),
        variant: "destructive",
      });
      return;
    }

    setResetLoading(true);
    // We intentionally ignore the error to prevent email enumeration:
    // showing different responses for registered vs unregistered emails
    // lets attackers discover which accounts exist. Always show success.
    await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    setResetSent(true);

    // Rate-limit: 60-second cooldown before another request can be sent
    setResetCooldown(60);
    const interval = setInterval(() => {
      setResetCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <>
      {idleLoggedOut && (
        <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"center",fontSize:13,color:"#92400E"}}>
          <span>⏰</span>
          <span>You were logged out due to inactivity. Please sign in again.</span>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Amiri:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        @keyframes fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
        @keyframes shimmer  { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes spin-slow { to{transform:rotate(360deg)} }
        @keyframes pulse-gold { 0%,100%{box-shadow:0 0 0 0 rgba(201,151,58,.35)} 50%{box-shadow:0 0 0 10px rgba(201,151,58,0)} }

        .login-root { font-family:'DM Sans',sans-serif; }

        .gold-input {
          width:100%; height:52px;
          border: 1.5px solid #E5E0D8;
          border-radius: 14px;
          background: #FAFAF8;
          padding: 0 16px 0 48px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          color: #1a1a1a;
          outline: none;
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .gold-input:focus {
          border-color: ${GOLD};
          background: #fff;
          box-shadow: 0 0 0 4px rgba(201,151,58,.12);        }
        .gold-input::placeholder { color: #B0A898; }

        .sign-btn {
          width:100%; height:52px;
          background: linear-gradient(135deg, ${G} 0%, #075E54 100%);
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex; align-items:center; justify-content:center; gap:8px;
          transition: opacity .2s, transform .15s;
          box-shadow: 0 4px 20px rgba(6,78,59,.3);
          letter-spacing:.3px;
        }
        .sign-btn:hover:not(:disabled) { opacity:.93; transform:translateY(-1px); box-shadow:0 6px 26px rgba(6,78,59,.38); }
        .sign-btn:disabled { opacity:.6; cursor:not-allowed; }

        .google-btn {
          width:100%; height:52px;
          background: #fff;
          border: 1.5px solid #E5E0D8;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex; align-items:center; justify-content:center; gap:10px;
          color: #333;
          transition: border-color .2s, box-shadow .2s, transform .15s;
        }
        .google-btn:hover { border-color: #C9973A; box-shadow:0 4px 14px rgba(201,151,58,.12); transform:translateY(-1px); }

        .remember-check {
          width:18px; height:18px; border-radius:5px;
          border:1.5px solid #D5CEC5; cursor:pointer;
          appearance:none; -webkit-appearance:none;
          background:#fff; transition:.15s; flex-shrink:0;
        }
        .remember-check:checked {
          background: ${GOLD};
          border-color: ${GOLD};
          background-image: url("image/svg+xml,%3Csvg viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 6l3 3 5-5' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position:center; background-size:12px;
        }

        .geo-bg {          position:absolute; inset:0; opacity:.045;
          background-image: url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='40,4 76,22 76,58 40,76 4,58 4,22' fill='none' stroke='%23C9973A' stroke-width='1.2'/%3E%3Cpolygon points='40,14 66,28 66,52 40,66 14,52 14,28' fill='none' stroke='%23C9973A' stroke-width='.6'/%3E%3Ccircle cx='40' cy='40' r='12' fill='none' stroke='%23C9973A' stroke-width='.6'/%3E%3C/svg%3E");
        }
      `}</style>

      <div className="login-root" style={{ flex:1, background:"#FDFCF9", display:"flex", flexDirection:"column" }}>

        {/* ── DESKTOP SPLIT LAYOUT ──────────────────────────────── */}
        <div style={{ display:"flex", minHeight:"calc(100vh - 66px)" }}>

          {/* LEFT PANEL — desktop only */}
          <motion.div
            initial={{ opacity:0, x:-30 }}
            animate={{ opacity:1, x:0 }}
            transition={{ duration:.7 }}
            style={{
              display:"none",
              width:"42%", flexShrink:0,
              background:`linear-gradient(160deg, #042E22 0%, ${G} 50%, #075E54 100%)`,
              position:"relative", overflow:"hidden",
              flexDirection:"column", alignItems:"center", justifyContent:"center",
              padding:"60px 48px",
            }}
            className="lg-panel"
          >
            <style>{`@media(min-width:900px){ .lg-panel{ display:flex!important } }`}</style>

            {/* Geometric bg */}
            <div className="geo-bg" />

            {/* Decorative circles */}
            <div style={{ position:"absolute", top:-60, right:-60, width:220, height:220, borderRadius:"50%", border:`1px solid rgba(201,151,58,.15)` }} />
            <div style={{ position:"absolute", top:-30, right:-30, width:140, height:140, borderRadius:"50%", border:`1px solid rgba(201,151,58,.1)` }} />
            <div style={{ position:"absolute", bottom:-80, left:-80, width:280, height:280, borderRadius:"50%", border:`1px solid rgba(201,151,58,.1)` }} />

            {/* Spinning ring */}
            <div style={{ position:"absolute", top:40, left:40, width:80, height:80, borderRadius:"50%", border:`1px dashed rgba(201,151,58,.3)`, animation:"spin-slow 20s linear infinite" }} />

            <div style={{ position:"relative", zIndex:2, textAlign:"center" }}>
              {/* Logo mark */}
              <motion.div
                animate={{ y:[0,-8,0] }}
                transition={{ duration:4, repeat:Infinity, ease:"easeInOut" }}
                style={{ width:90, height:90, borderRadius:24, background:"rgba(255,255,255,.08)", border:"1.5px solid rgba(201,151,58,.3)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 32px", backdropFilter:"blur(8px)" }}
              >
                <BookOpen style={{ width:42, height:42, color:GOLD }} />
              </motion.div>

              {/* Bismillah */}
              <div style={{ fontFamily:"'Amiri',serif", fontSize:22, color:"rgba(232,192,112,.85)", marginBottom:24, direction:"rtl", letterSpacing:1, lineHeight:1.8 }}>                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </div>

              {/* Name */}
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:42, fontWeight:700, color:"#fff", lineHeight:1.1, marginBottom:8 }}>
                Tahleem<br />
                <span style={{ color:GOLD }}>Academy</span>
              </h1>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:16, color:"rgba(232,192,112,.7)", marginBottom:32, direction:"rtl" }}>
                أكاديمية تعليم
              </div>

              {/* Divider */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28 }}>
                <div style={{ flex:1, height:1, background:`linear-gradient(to right,transparent,rgba(201,151,58,.4))` }} />
                <span style={{ color:GOLD, fontSize:12 }}>◆</span>
                <div style={{ flex:1, height:1, background:`linear-gradient(to left,transparent,rgba(201,151,58,.4))` }} />
              </div>

              {/* Hadith */}
              <p style={{ fontFamily:"'Amiri',serif", fontSize:18, color:"rgba(255,255,255,.7)", lineHeight:1.8, direction:"rtl", marginBottom:10 }}>
                طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ
              </p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,.4)", letterSpacing:.5, fontStyle:"italic" }}>
                "Seeking knowledge is an obligation upon every Muslim"
              </p>

              {/* Feature pills */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:40 }}>
                {[
                  { icon:"📖", text:"Quran & Tajweed" },
                  { icon:"🌙", text:"Islamic Sciences" },
                  { icon:"🔤", text:"Arabic Language" },
                ].map(f => (
                  <div key={f.text} style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,.05)", border:"1px solid rgba(201,151,58,.15)", borderRadius:12, padding:"10px 16px" }}>
                    <span style={{ fontSize:18 }}>{f.icon}</span>
                    <span style={{ fontSize:13, color:"rgba(255,255,255,.75)", fontWeight:500 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* RIGHT PANEL — form */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 20px", background:"#FDFCF9", overflowY:"auto" }}>
            <motion.div
              initial={{ opacity:0, y:20 }}
              animate={{ opacity:1, y:0 }}
              transition={{ duration:.55, delay:.15 }}
              style={{ width:"100%", maxWidth:420 }}            >
              {/* ── MOBILE TOP BRAND ── */}
              {/* Mobile brand hidden — PublicNav already shows the logo + hamburger */}
              <div style={{ display:"none" }} className="mobile-brand">
                <style>{`@media(min-width:900px){ .mobile-brand{ display:none!important } }`}</style>

                {/* Brand pill */}
                <div style={{ display:"inline-flex", alignItems:"center", gap:10, background:G, borderRadius:16, padding:"12px 20px", marginBottom:12, boxShadow:`0 4px 20px rgba(6,78,59,.25)` }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:GOLD, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <BookOpen style={{ width:18, height:18, color:"#fff" }} />
                  </div>
                  <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:700, color:"#fff", letterSpacing:.5 }}>
                    Tahleem <span style={{ color:GOLD2 }}>Academy</span>
                  </span>
                </div>

                {/* Arabic tagline */}
                <div style={{ fontFamily:"'Amiri',serif", fontSize:15, color:"#9a8c7c", direction:"rtl", letterSpacing:.5 }}>
                  ابدأ رحلتك في طلب العلم
                </div>
              </div>

              {/* ── GOLDEN ORNAMENT DIVIDER ── */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
                <div style={{ flex:1, height:1, background:`linear-gradient(to right,transparent,rgba(201,151,58,.3))` }} />
                <div style={{ display:"flex", gap:5 }}>
                  <span style={{ color:GOLD, fontSize:8 }}>◆</span>
                  <span style={{ color:GOLD, fontSize:12 }}>◆</span>
                  <span style={{ color:GOLD, fontSize:8 }}>◆</span>
                </div>
                <div style={{ flex:1, height:1, background:`linear-gradient(to left,transparent,rgba(201,151,58,.3))` }} />
              </div>

              {/* ── WELCOME HEADING ── */}
              <div style={{ textAlign:"center", marginBottom:28 }}>
                <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:700, color:G, lineHeight:1.1, marginBottom:6 }}>
                  {t("Welcome Back", "أهلاً وسهلاً")}
                  {language === "en" && <span style={{ fontFamily:"'Amiri',serif", fontSize:22, color:GOLD, display:"block", marginTop:2 }}>أهلاً وسهلاً</span>}
                </h2>
                <p style={{ fontSize:13.5, color:"#8a7d70", lineHeight:1.6 }}>
                  {t("Sign in to continue your learning journey", "سجّل الدخول لمتابعة رحلتك التعليمية")}
                </p>
              </div>

              {/* ── LANGUAGE TOGGLE ── */}
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}>
                <button
                  onClick={() => setLanguage(language === "en" ? "ar" : "en")}
                  style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(201,151,58,.08)", border:"1px solid rgba(201,151,58,.25)", borderRadius:20, padding:"5px 12px", fontSize:12, color:GOLD, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                >                  <Globe size={13} />
                  {language === "en" ? "العربية" : "English"}
                </button>
              </div>

              {/* ── FORM ── */}
              <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>

                {/* Email */}
                <div style={{ position:"relative" }}>
                  <Mail size={16} style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color: focusedField==="email" ? GOLD : "#B0A898", transition:".2s" }} />
                  <input
                    className="gold-input"
                    type="email"
                    placeholder={t("Email address", "البريد الإلكتروني")}
                    value={email}
                    onChange={e => { setEmail(e.target.value); validateEmail(e.target.value); }}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    required
                    style={{ paddingRight: emailValid === true ? 44 : 16 }}
                  />
                  {emailValid === true && (
                    <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", width:22, height:22, borderRadius:"50%", background:"#E8F5E9", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Check size={13} color="#2E7D32" />
                    </div>
                  )}
                </div>

                {/* Password */}
                <div style={{ position:"relative" }}>
                  <Lock size={16} style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color: focusedField==="password" ? GOLD : "#B0A898", transition:".2s" }} />
                  <input
                    className="gold-input"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("Password", "كلمة المرور")}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    required
                    style={{ paddingRight:44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#B0A898", display:"flex", alignItems:"center" }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>                </div>

                {/* Remember + Forgot */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, color:"#7a6e64", userSelect:"none" }}>
                    <input
                      type="checkbox"
                      className="remember-check"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                    />
                    {t("Remember me", "تذكرني")}
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotOpen(true); setResetSent(false); setResetEmail(""); }}
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:GOLD, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}
                  >
                    {t("Forgot Password?", "نسيت كلمة المرور؟")}
                  </button>
                </div>

                {/* Sign In button */}
                <button className="sign-btn" type="submit" disabled={loading} style={{ marginTop:4 }}>
                  {loading
                    ? <><Loader2 size={17} style={{ animation:"spin .7s linear infinite" }} /> {t("Signing in…", "جارٍ الدخول…")}</>
                    : t("Sign In", "تسجيل الدخول")
                  }
                </button>
              </form>

              {/* ── DIVIDER ── */}
              <div style={{ display:"flex", alignItems:"center", gap:12, margin:"22px 0" }}>
                <div style={{ flex:1, height:1, background:"#EDE7DC" }} />
                <span style={{ fontSize:12, color:"#C0B4A6", letterSpacing:.5 }}>{t("or continue with", "أو تابع مع")}</span>
                <div style={{ flex:1, height:1, background:"#EDE7DC" }} />
              </div>

              {/* ── GOOGLE ── */}
              <button className="google-btn" onClick={handleGoogleSignIn}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t("Continue with Google", "المتابعة مع جوجل")}
              </button>

              {/* ── REGISTER LINK ── */}              <p style={{ textAlign:"center", marginTop:24, fontSize:13.5, color:"#9a8c7c" }}>
                {t("Don't have an account?", "ليس لديك حساب؟")}{" "}
                <Link to="/register" style={{ color:GOLD, fontWeight:700, textDecoration:"none" }}>
                  {t("Register now", "سجّل الآن")} →
                </Link>
              </p>

              {/* ── BOTTOM ORNAMENT ── */}
              <div style={{ textAlign:"center", marginTop:32 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginBottom:8 }}>
                  <div style={{ width:30, height:1, background:`linear-gradient(to right,transparent,rgba(201,151,58,.4))` }} />
                  <span style={{ fontSize:8, color:GOLD }}>◆</span>
                  <div style={{ width:30, height:1, background:`linear-gradient(to left,transparent,rgba(201,151,58,.4))` }} />
                </div>
                <p style={{ fontFamily:"'Amiri',serif", fontSize:14, color:"rgba(201,151,58,.6)", direction:"rtl" }}>
                  وَقُل رَّبِّ زِدْنِي عِلْمًا
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── FORGOT PASSWORD DIALOG ── */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent style={{ borderRadius:20, border:`1.5px solid rgba(201,151,58,.2)`, fontFamily:"'DM Sans',sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:G }}>
              {t("Reset Password", "إعادة تعيين كلمة المرور")}
            </DialogTitle>
            <DialogDescription style={{ fontSize:13, color:"#8a7d70" }}>
              {t("Enter your email and we'll send you a reset link.", "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.")}
            </DialogDescription>
          </DialogHeader>
          {resetSent ? (
            <div style={{ padding:"20px 0", textAlign:"center" }}>
              <div style={{ width:60, height:60, borderRadius:"50%", background:"#E8F5E9", border:"2px solid #A5D6A7", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", animation:"pulse-gold 2s infinite" }}>
                <Check size={26} color="#2E7D32" />
              </div>
              <p style={{ fontSize:14, color:"#333", marginBottom:6 }}>
                {t("A reset link has been sent to your email.", "تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني.")}
              </p>
              <p style={{ fontFamily:"'Amiri',serif", fontSize:15, color:GOLD }}>بارك الله فيك</p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ position:"relative" }}>
                <Mail size={15} style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#B0A898" }} />
                <input
                  className="gold-input"                  type="email"
                  placeholder={t("Your email address", "بريدك الإلكتروني")}
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  required
                />
              </div>
              <button className="sign-btn" type="submit" disabled={resetLoading || resetCooldown > 0}>
                {resetLoading
                  ? <><Loader2 size={16} style={{ animation:"spin .7s linear infinite" }} /> {t("Sending…", "جارٍ الإرسال…")}</>
                  : resetCooldown > 0
                    ? t(`Resend in ${resetCooldown}s`, `إعادة الإرسال بعد ${resetCooldown}ث`)
                    : t("Send Reset Link", "إرسال رابط إعادة التعيين")
                }
                }
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Login;