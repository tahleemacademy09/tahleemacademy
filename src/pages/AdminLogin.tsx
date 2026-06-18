import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react";

const AdminLogin = () => {
  const { t } = useLanguage();
  const { signIn, user, hasRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect logic: if already logged in, redirect based on role.
  // Fix: previously both admin and teacher were sent to "/admin", relying on
  // ProtectedRoute's requiredRole check to notice teachers don't belong there
  // and bounce them to "/teacher" — a visible extra hop. Each role now goes
  // straight to its own route the first time.
  useEffect(() => {
    if (!authLoading && user) {
      if (hasRole("admin")) {
        navigate("/admin", { replace: true });
      } else if (hasRole("teacher")) {
        navigate("/teacher", { replace: true });
      } else {
        // Non-admin, non-teacher user trying to access admin-secure: redirect home silently
        navigate("/", { replace: true });
      }
    }
  }, [authLoading, user, hasRole, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error, data } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
      return;
    }
    // Check role after login
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user?.id);
    const isAdmin   = roleRows?.some((r) => r.role === "admin");
    const isTeacher = roleRows?.some((r) => r.role === "teacher");
    if (isAdmin) {
      navigate("/admin");
    } else if (isTeacher) {
      navigate("/teacher");
    } else {
      // Not admin or teacher - sign them out and show error
      await supabase.auth.signOut();
      toast({
        title: t("Access Denied", "تم رفض الوصول"),
        description: t("You do not have admin privileges.", "ليس لديك صلاحيات المدير."),
        variant: "destructive",
      });
    }
  };

  // Don't render until we know auth state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sidebar via-background to-sidebar px-4">
      <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-4 ring-primary/5">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t("Admin Portal", "بوابة المدير")}</CardTitle>
          <CardDescription className="flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" />
            {t("Secure admin access only", "وصول المدير الآمن فقط")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder={t("Admin Email", "البريد الإلكتروني للمدير")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 ps-10"
              />
            </div>
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
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("Sign In as Admin", "تسجيل الدخول كمدير")}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("Student? ", "طالب؟ ")}
            <Link to="/login" className="text-primary hover:underline">{t("Sign in here", "سجّل الدخول هنا")}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
