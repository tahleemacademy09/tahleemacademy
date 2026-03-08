import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { BookOpen, Loader2, Mail, Lock, Eye, EyeOff, Check, Globe } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const Login = () => {
  const { t, language, setLanguage } = useLanguage();
  const { signIn, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user) {
      // Check role to redirect appropriately
      supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data: roles }) => {
        const isAdmin = roles?.some(r => r.role === "admin");
        const isTeacher = roles?.some(r => r.role === "teacher");
        if (isAdmin) navigate("/admin", { replace: true });
        else if (isTeacher) navigate("/teacher/dashboard", { replace: true });
        else navigate("/student", { replace: true });
      });
    }
  }, [user, navigate]);

  const validateEmail = (val: string) => {
    if (!val) { setEmailValid(null); return; }
    setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error, data } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({
        title: t("Login Failed", "فشل تسجيل الدخول"),
        description: t(
          "Incorrect email or password. Please try again.",
          "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى."
        ),
        variant: "destructive",
      });
    } else {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user?.id);
      const isAdmin = roles?.some((r) => r.role === "admin");
      const isTeacher = roles?.some((r) => r.role === "teacher");
      navigate(isAdmin ? "/admin" : isTeacher ? "/teacher/dashboard" : "/student");
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Left panel - Desktop only */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-primary lg:flex"
      >
        {/* Islamic geometric overlay */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        
        <div className="relative z-10 flex flex-col items-center px-12 text-center">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-2 ring-white/20">
            <BookOpen className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="mb-4 font-display text-4xl font-bold text-primary-foreground">
            Tahleem <span className="text-secondary">Academy</span>
          </h1>
          <p className="mb-6 font-arabic text-2xl leading-relaxed text-primary-foreground/90" style={{ direction: "rtl" }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </p>
          <p className="mb-2 text-lg font-medium text-primary-foreground/90">
            Begin Your Journey of Knowledge
          </p>
          <p className="font-arabic text-xl text-secondary" style={{ direction: "rtl" }}>
            ابدأ رحلتك في طلب العلم
          </p>
        </div>

        {/* Decorative bottom arc */}
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-secondary/10" />
        <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full bg-white/5" />
      </motion.div>

      {/* Right panel - Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex w-full flex-col items-center justify-center bg-background px-4 py-8 lg:w-1/2"
      >
        {/* Mobile header banner */}
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <div className="mb-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-5">
            <BookOpen className="h-7 w-7 text-primary-foreground" />
            <span className="font-display text-xl font-bold text-primary-foreground">
              Tahleem <span className="text-secondary">Academy</span>
            </span>
          </div>
          <p className="font-arabic text-base text-muted-foreground" style={{ direction: "rtl" }}>
            ابدأ رحلتك في طلب العلم
          </p>
        </div>

        <div className="w-full max-w-md">
          {/* Language toggle */}
          <div className="mb-6 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Globe className="mr-1.5 h-4 w-4" />
              {language === "en" ? "العربية" : "English"}
            </Button>
          </div>

          {/* Welcome */}
          <div className="mb-8 text-center">
            <h2 className="mb-1 font-display text-2xl font-bold text-foreground">
              {t("Ahlan wa Sahlan!", "أهلاً وسهلاً!")}
              <span className="font-arabic text-lg text-muted-foreground lg:hidden"> {t("أهلاً وسهلاً", "")}</span>
            </h2>
            <p className="hidden text-lg text-muted-foreground lg:block font-arabic" style={{ direction: "rtl" }}>
              أهلاً وسهلاً
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Sign in to continue your learning journey", "سجّل الدخول لمتابعة رحلتك التعليمية")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder={t("Email", "البريد الإلكتروني")}
                value={email}
                onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value); }}
                required
                className="h-12 ps-10 pe-10"
              />
              {emailValid === true && (
                <Check className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
              )}
            </div>

            {/* Password */}
            <div>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("Password", "كلمة المرور")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 ps-10 pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(!!v)}
                  />
                  {t("Remember me", "تذكرني")}
                </label>
                <button
                  type="button"
                  onClick={() => { setForgotOpen(true); setResetSent(false); setResetEmail(""); }}
                  className="text-sm font-medium text-secondary hover:underline"
                >
                  {t("Forgot Password?", "نسيت كلمة المرور؟")}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-12 w-full text-base transition-transform hover:scale-[1.01]" disabled={loading}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("Sign In", "تسجيل الدخول")}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{t("or", "أو")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google */}
          <Button
            variant="outline"
            className="h-12 w-full gap-2 text-sm"
            onClick={handleGoogleSignIn}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t("Continue with Google", "المتابعة مع جوجل")}
          </Button>

          {/* Register link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("Don't have an account?", "ليس لديك حساب؟")}{" "}
            <Link to="/register" className="font-semibold text-secondary hover:underline">
              {t("Register", "التسجيل")}
            </Link>
          </p>
        </div>
      </motion.div>

      {/* Forgot Password Modal */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Reset Password", "إعادة تعيين كلمة المرور")}</DialogTitle>
            <DialogDescription>
              {t(
                "Enter your email and we'll send you a reset link.",
                "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين."
              )}
            </DialogDescription>
          </DialogHeader>
          {resetSent ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <Check className="h-7 w-7 text-green-600" />
              </div>
              <p className="text-sm text-foreground">
                {t(
                  "A reset link has been sent to your email.",
                  "تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني."
                )}
              </p>
              <p className="mt-1 font-arabic text-sm text-secondary">بارك الله فيك</p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder={t("Email", "البريد الإلكتروني")}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="h-12 ps-10"
                />
              </div>
              <Button type="submit" className="h-12 w-full" disabled={resetLoading}>
                {resetLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("Send Reset Link", "إرسال رابط إعادة التعيين")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
