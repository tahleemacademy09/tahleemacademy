import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Loader2, Lock, Eye, EyeOff, Check } from "lucide-react";
import { motion } from "framer-motion";

const ResetPassword = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check for recovery token in hash
    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({
        title: t("Error", "خطأ"),
        description: t("Passwords do not match.", "كلمات المرور غير متطابقة."),
        variant: "destructive",
      });
      return;
    }
    if (password.length < 6) {
      toast({
        title: t("Error", "خطأ"),
        description: t("Password must be at least 6 characters.", "يجب أن تكون كلمة المرور 6 أحرف على الأقل."),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    }
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Left panel */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-primary lg:flex"
      >
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
          <p className="font-arabic text-xl text-secondary" style={{ direction: "rtl" }}>
            ابدأ رحلتك في طلب العلم
          </p>
        </div>
      </motion.div>

      {/* Right panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex w-full flex-col items-center justify-center bg-background px-4 py-8 lg:w-1/2"
      >
        <div className="w-full max-w-md">
          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 font-display text-2xl font-bold text-foreground">
                {t("Password Updated!", "تم تحديث كلمة المرور!")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("Redirecting to login...", "جاري التوجيه لصفحة الدخول...")}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="mb-1 font-display text-2xl font-bold text-foreground">
                  {t("Set New Password", "تعيين كلمة مرور جديدة")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("Enter your new password below.", "أدخل كلمة المرور الجديدة أدناه.")}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("New Password", "كلمة المرور الجديدة")}
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
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder={t("Confirm Password", "تأكيد كلمة المرور")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="h-12 ps-10"
                  />
                </div>
                <Button type="submit" className="h-12 w-full" disabled={loading}>
                  {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("Update Password", "تحديث كلمة المرور")}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
