import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2, Lock } from "lucide-react";

const AdminLogin = () => {
  const { t } = useLanguage();
  const { signIn, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
      return;
    }
    // After sign in, roles are fetched via AuthContext. We redirect to /admin
    // The ProtectedRoute will verify admin role server-side
    navigate("/admin");
  };

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
            <div>
              <Input
                type="email"
                placeholder={t("Admin Email", "البريد الإلكتروني للمدير")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder={t("Password", "كلمة المرور")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
