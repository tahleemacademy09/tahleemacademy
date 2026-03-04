import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, User, Camera, ShieldCheck, ShieldAlert, Shield, Globe } from "lucide-react";

const ProfileSettings = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState<"not_registered" | "registered" | "active">("not_registered");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    bio: "",
    preferred_language: "en",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        bio: profile.bio || "",
        preferred_language: profile.preferred_language || "en",
      });
    }
  }, [profile]);

  // Proctoring status
  useEffect(() => {
    if (!user) return;
    const fetchStatus = async () => {
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!attempts || attempts.length === 0) {
        setProctoringStatus("not_registered");
        return;
      }

      const activeAttempt = attempts.find(a => a.status === "in_progress");
      if (activeAttempt) {
        const { data: session } = await supabase
          .from("proctoring_sessions")
          .select("id")
          .eq("attempt_id", activeAttempt.id)
          .maybeSingle();
        if (session) { setProctoringStatus("active"); return; }
      }

      const attemptIds = attempts.map(a => a.id);
      const { data: media } = await supabase
        .from("proctoring_media")
        .select("id")
        .in("attempt_id", attemptIds)
        .eq("file_type", "verification_snapshot")
        .limit(1);

      setProctoringStatus(media && media.length > 0 ? "registered" : "not_registered");
    };
    fetchStatus();
  }, [user]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.full_name.trim()) errs.full_name = t("Full name is required", "الاسم الكامل مطلوب");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!user || !validate()) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        ...form,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Profile updated!", "تم تحديث الملف الشخصي!") });
      // Apply language preference
      if (form.preferred_language !== language) {
        setLanguage(form.preferred_language as "en" | "ar");
      }
    }
    setSaving(false);
  };

  const statusConfig = {
    not_registered: {
      label: t("Face Not Registered", "الوجه غير مسجل"),
      icon: ShieldAlert,
      color: "bg-destructive/10 text-destructive border-destructive/30",
    },
    registered: {
      label: t("Face Registered", "الوجه مسجل"),
      icon: ShieldCheck,
      color: "bg-primary/10 text-primary border-primary/30",
    },
    active: {
      label: t("Proctoring Active", "المراقبة نشطة"),
      icon: Shield,
      color: "bg-secondary/10 text-secondary border-secondary/30",
    },
  };

  const currentStatus = statusConfig[proctoringStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold font-display mb-6">{t("Scholar's Settings", "إعدادات الدارس")}</h1>

      {/* Proctoring Status */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {t("Proctoring Status", "حالة المراقبة")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${currentStatus.color}`}>
            <StatusIcon className="h-4 w-4" />
            {currentStatus.label}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {proctoringStatus === "not_registered" && t("Your face will be registered when you start a proctored exam.", "سيتم تسجيل وجهك عند بدء اختبار مراقب.")}
            {proctoringStatus === "registered" && t("Your face has been verified for proctored exams.", "تم التحقق من وجهك للاختبارات المراقبة.")}
            {proctoringStatus === "active" && t("You are currently in a proctored exam session.", "أنت حاليًا في جلسة اختبار مراقبة.")}
          </p>
        </CardContent>
      </Card>

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("Personal Information", "المعلومات الشخصية")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("Email", "البريد الإلكتروني")}</Label>
            <Input value={user?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">{t("Email cannot be changed", "لا يمكن تغيير البريد الإلكتروني")}</p>
          </div>

          <div>
            <Label>{t("Full Name", "الاسم الكامل")} <span className="text-destructive">*</span></Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder={t("Enter your full name", "أدخل اسمك الكامل")}
              dir="auto"
            />
            {errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name}</p>}
          </div>

          <div>
            <Label>{t("Phone", "الهاتف")}</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={t("Enter your phone number", "أدخل رقم هاتفك")}
              type="tel"
            />
          </div>

          <div>
            <Label>{t("Bio", "نبذة")}</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder={t("Tell us about yourself", "أخبرنا عن نفسك")}
              rows={3}
              dir="auto"
            />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t("Preferred Language", "اللغة المفضلة")}
            </Label>
            <Select
              value={form.preferred_language}
              onValueChange={(v) => setForm({ ...form, preferred_language: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 me-2" />
            {saving ? t("Saving...", "جاري الحفظ...") : t("Save Changes", "حفظ التغييرات")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSettings;
