import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Check, X, User, Mail, Lock, BookOpen, ArrowRight, Globe } from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c", GOLD_LIGHT = "#f0d090";

// Password strength checker
const checkPassword = (pw: string) => ({
  length:  pw.length >= 8,
  upper:   /[A-Z]/.test(pw),
  lower:   /[a-z]/.test(pw),
  number:  /\d/.test(pw),
});

const Register = () => {
  const { t, language, setLanguage } = useLanguage() as any;
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [focused, setFocused]     = useState<string|null>(null);
  const [submitted, setSubmitted] = useState(false);

  const pwChecks = checkPassword(password);
  const pwStrength = Object.values(pwChecks).filter(Boolean).length;
  const pwValid = Object.values(pwChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!pwValid) {
      toast({ title: t("Weak password","كلمة مرور ضعيفة"), description: t("Meet all password requirements below.","استوفِ جميع متطلبات كلمة المرور."), variant:"destructive" });
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    if (error) {
      toast({ title: t("Error","خطأ"), description: error.message, variant:"destructive" });
    } else {
      toast({ title: t("Account created! 🎉","تم إنشاء الحساب! 🎉"), description: t("Check your email to verify your account.","تحقق من بريدك الإلكتروني لتأكيد حسابك.") });
      navigate("/login");
    }
  };

  const isRTL = language === "ar";

  const fieldStyle = (name: string): React.CSSProperties => ({
    width:"100%", padding:"13px 14px 13px 42px", borderRadius:12,
    border: `2px solid ${focused===name ? GM : "rgba(15,45,31,0.15)"}`,
    fontSize:14, outline:"none", color:G, background:"#fafefb",
    transition:"border-color .2s, box-shadow .2s", fontFamily:"'Cairo',sans-serif",
    boxShadow: focused===name ? `0 0 0 4px rgba(26,71,49,.1)` : "none",
    direction: isRTL ? "rtl" : "ltr",
    boxSizing:"border-box" as const,
  });

  const strengthColor = ["#ef4444","#ef4444","#f59e0b","#f59e0b","#22c55e"][pwStrength];
  const strengthLabel = ["","Weak","Fair","Good","Strong"][pwStrength];

  return (
    <div style={{
      minHeight:"100vh", display:"flex", fontFamily:"'Cairo',sans-serif",
      background: `radial-gradient(ellipse at 20% 50%, rgba(15,45,31,.08) 0%, transparent 60%),
                   radial-gradient(ellipse at 80% 20%, rgba(201,168,76,.06) 0%, transparent 50%),
                   #f8fafb`,
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%,100%{opacity:.6} 50%{opacity:1} }
        .reg-input::placeholder { color:#9ca3af; }
        .reg-btn:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(15,45,31,.35)!important; }
        .reg-btn:active { transform:translateY(0); }
        .reg-link:hover { color:${GOLD}!important; }
      `}</style>

      {/* ── LEFT PANEL — decorative (desktop) ── */}
      <div style={{
        flex:1, background:`linear-gradient(160deg,${G} 0%,${GM} 50%,#0a1f12 100%)`,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"40px", position:"relative", overflow:"hidden",
      }} className="hidden lg:flex">
        {/* Decorative circles */}
        {[160,240,340].map((sz,i)=>(
          <div key={i} style={{ position:"absolute", width:sz, height:sz, borderRadius:"50%", border:`1px solid rgba(201,168,76,${.12-i*.03})`, top:"50%", left:"50%", transform:"translate(-50%,-50%)" }} />
        ))}
        {/* Pattern dots */}
        <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(rgba(201,168,76,.15) 1px,transparent 1px)`, backgroundSize:"28px 28px", opacity:.5 }} />

        <div style={{ position:"relative", textAlign:"center", animation:"fadeUp .8s ease" }}>
          {/* Logo */}
          <div style={{ width:72, height:72, borderRadius:20, background:"rgba(201,168,76,.15)", border:"1.5px solid rgba(201,168,76,.3)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px" }}>
            <BookOpen style={{ width:34, height:34, color:GOLD }} />
          </div>
          <h1 style={{ fontSize:32, fontWeight:900, color:"#fff", margin:"0 0 8px", letterSpacing:-.5 }}>
            Tahleem<span style={{ color:GOLD }}> Academy</span>
          </h1>
          <p style={{ fontSize:15, color:"rgba(255,255,255,.55)", margin:"0 0 48px", lineHeight:1.6 }}>
            أكاديمية تعليم الإسلامية<br/>Your journey to Islamic knowledge
          </p>

          {/* Feature list */}
          {[
            { icon:"📖", en:"Quran Memorisation (Hifdh)", ar:"حفظ القرآن الكريم" },
            { icon:"🎓", en:"Structured Curriculum",      ar:"منهج دراسي منظم" },
            { icon:"🌍", en:"Learn from Anywhere",        ar:"تعلّم من أي مكان" },
            { icon:"🏆", en:"Certified Teachers",         ar:"معلمون معتمدون" },
          ].map((f,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, background:"rgba(255,255,255,.05)", borderRadius:12, padding:"10px 16px", border:"1px solid rgba(255,255,255,.07)", animation:`fadeUp ${.6+i*.1}s ease` }}>
              <span style={{ fontSize:20 }}>{f.icon}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{f.en}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", direction:"rtl" }}>{f.ar}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 20px", minWidth:0 }}>

        {/* Language toggle */}
        <div style={{ position:"absolute", top:16, right:16 }}>
          <button onClick={()=>setLanguage&&setLanguage(language==="ar"?"en":"ar")}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:20, background:"rgba(15,45,31,.07)", border:`1px solid rgba(15,45,31,.12)`, color:G, fontSize:12, fontWeight:700, cursor:"pointer" }}>
            <Globe style={{ width:13, height:13 }} />
            {language==="ar"?"English":"العربية"}
          </button>
        </div>

        {/* Mobile logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }} className="lg:hidden">
          <div style={{ width:40, height:40, borderRadius:12, background:G, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <BookOpen style={{ width:20, height:20, color:GOLD }} />
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:900, color:G }}>Tahleem <span style={{ color:GOLD }}>Academy</span></div>
            <div style={{ fontSize:10, color:"#7a9e88" }}>أكاديمية تعليم</div>
          </div>
        </div>

        {/* Form card */}
        <div style={{
          width:"100%", maxWidth:440,
          background:"#fff", borderRadius:24,
          border:"1px solid rgba(15,45,31,.1)",
          boxShadow:"0 8px 40px rgba(15,45,31,.1)",
          padding:"36px 32px",
          animation:"fadeUp .5s ease",
        }}>
          <div style={{ marginBottom:28, direction:isRTL?"rtl":"ltr" }}>
            <h2 style={{ fontSize:24, fontWeight:900, color:G, margin:"0 0 6px" }}>{t("Create your account","أنشئ حسابك")}</h2>
            <p style={{ fontSize:13, color:"#7a9e88", margin:0 }}>{t("Join thousands of students learning Islamic knowledge","انضم إلى آلاف الطلاب الذين يتعلمون العلوم الإسلامية")}</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Full Name */}
            <div style={{ position:"relative" }}>
              <User style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", width:16, height:16, color: focused==="name"?GM:"#9ca3af", pointerEvents:"none" }} />
              <input
                className="reg-input"
                style={fieldStyle("name")}
                placeholder={t("Full Name","الاسم الكامل")}
                value={fullName}
                onChange={e=>setFullName(e.target.value)}
                onFocus={()=>setFocused("name")}
                onBlur={()=>setFocused(null)}
                required
                autoComplete="name"
              />
            </div>

            {/* Email */}
            <div style={{ position:"relative" }}>
              <Mail style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", width:16, height:16, color:focused==="email"?GM:"#9ca3af", pointerEvents:"none" }} />
              <input
                className="reg-input"
                style={fieldStyle("email")}
                type="email"
                placeholder={t("Email Address","عنوان البريد الإلكتروني")}
                value={email}
                onChange={e=>setEmail(e.target.value)}
                onFocus={()=>setFocused("email")}
                onBlur={()=>setFocused(null)}
                required
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ position:"relative" }}>
                <Lock style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", width:16, height:16, color:focused==="pw"?GM:"#9ca3af", pointerEvents:"none" }} />
                <input
                  className="reg-input"
                  style={fieldStyle("pw")}
                  type={showPw?"text":"password"}
                  placeholder={t("Password","كلمة المرور")}
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  onFocus={()=>setFocused("pw")}
                  onBlur={()=>setFocused(null)}
                  required
                  autoComplete="new-password"
                />
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#9ca3af", cursor:"pointer", padding:2 }}>
                  {showPw ? <EyeOff style={{width:15,height:15}}/> : <Eye style={{width:15,height:15}}/>}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                    {[1,2,3,4].map(i=>(
                      <div key={i} style={{ flex:1, height:3, borderRadius:3, background:i<=pwStrength?strengthColor:"#e5e7eb", transition:"background .3s" }} />
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 12px" }}>
                    {[
                      [pwChecks.length,  t("8+ characters","8+ أحرف")],
                      [pwChecks.upper,   t("Uppercase letter","حرف كبير")],
                      [pwChecks.lower,   t("Lowercase letter","حرف صغير")],
                      [pwChecks.number,  t("Number","رقم")],
                    ].map(([ok, label],i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                        {ok
                          ? <Check style={{ width:11, height:11, color:"#22c55e" }} />
                          : <X style={{ width:11, height:11, color:"#d1d5db" }} />}
                        <span style={{ color: ok?"#22c55e":"#9ca3af" }}>{label as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Terms note */}
            <p style={{ fontSize:11, color:"#9ca3af", textAlign:"center", lineHeight:1.5, margin:0 }}>
              {t("By creating an account you agree to our","بإنشاء حساب فإنك توافق على")} <span style={{ color:GOLD, fontWeight:600 }}>{t("Terms & Privacy Policy","الشروط وسياسة الخصوصية")}</span>
            </p>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="reg-btn"
              style={{
                width:"100%", padding:"13px 0", borderRadius:14,
                background: loading ? "#7a9e88" : `linear-gradient(135deg,${G},${GM})`,
                border:"none", color:"#fff", fontSize:15, fontWeight:800,
                cursor: loading?"not-allowed":"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow:"0 4px 16px rgba(15,45,31,.3)",
                transition:"all .2s", fontFamily:"'Cairo',sans-serif",
              }}>
              {loading ? (
                <><div style={{ width:18, height:18, border:"2.5px solid rgba(255,255,255,.4)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }} />{t("Creating account…","جاري إنشاء الحساب…")}</>
              ) : (
                <>{t("Create Account","إنشاء حساب")}<ArrowRight style={{ width:16, height:16 }} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
            <div style={{ flex:1, height:1, background:"rgba(15,45,31,.1)" }} />
            <span style={{ fontSize:12, color:"#9ca3af" }}>{t("or","أو")}</span>
            <div style={{ flex:1, height:1, background:"rgba(15,45,31,.1)" }} />
          </div>

          {/* Sign in link */}
          <p style={{ textAlign:"center", fontSize:13, color:"#7a9e88", margin:0 }}>
            {t("Already have an account?","لديك حساب بالفعل؟")}{" "}
            <Link to="/login" className="reg-link" style={{ color:G, fontWeight:800, textDecoration:"none", transition:"color .2s" }}>
              {t("Sign In →","تسجيل الدخول ←")}
            </Link>
          </p>
        </div>

        {/* Footer note */}
        <p style={{ marginTop:20, fontSize:11, color:"#9ca3af", textAlign:"center" }}>
          {t("Tahleem Academy — Islamic Education Platform","أكاديمية تعليم — منصة التعليم الإسلامي")}
        </p>
      </div>

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @media(max-width:1024px){ .lg\\:hidden{display:flex!important} .hidden{display:none!important} }
      `}</style>
    </div>
  );
};

export default Register;
