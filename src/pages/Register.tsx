import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2 } from "lucide-react";

const Register = () => {
  const { t } = useLanguage();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    if (password.length < 8 || !(hasUpperCase && hasLowerCase && hasNumbers)) {
      toast({ title: t("Error", "خطأ"), description: t("Password must be at least 8 characters with uppercase, lowercase, and numbers", "يجب أن تكون كلمة المرور 8 أحرف على الأقل مع أحرف كبيرة وصغيرة وأرقام"), variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Account created!", "تم إنشاء الحساب!"), description: t("Please check your email to verify your account.", "يرجى التحقق من بريدك الإلكتروني لتأكيد حسابك.") });
      navigate("/login");
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t("Create Account", "إنشاء حساب")}</CardTitle>
          <CardDescription>{t("Join Tahleem Academy today", "انضم إلى أكاديمية تعليم اليوم")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder={t("Full Name", "الاسم الكامل")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              type="email"
              placeholder={t("Email", "البريد الإلكتروني")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder={t("Password", "كلمة المرور")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Create Account", "إنشاء حساب")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
            <Link to="/login" className="text-primary hover:underline">{t("Sign In", "تسجيل الدخول")}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
