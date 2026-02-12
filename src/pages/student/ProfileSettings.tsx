import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, User, Camera, ShieldCheck, ShieldAlert, Shield } from "lucide-react";

const ProfileSettings = () => {
  const { t } = useLanguage();
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

  // Fetch proctoring status
  useEffect(() => {
    if (!user) return;
    const fetchStatus = async () => {
      // Check if there's a verification snapshot (face registered)
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

      // Check for active proctoring session
      const activeAttempt = attempts.find(a => a.status === "in_progress");
      if (activeAttempt) {
        const { data: session } = await supabase
          .from("proctoring_sessions")
          .select("id")
          .eq("attempt_id", activeAttempt.id)
          .maybeSingle();
        if (session) {
          setProctoringStatus("active");
          return;
        }
      }

      // Check if any face snapshot exists (face registered)
      const attemptIds = attempts.map(a => a.id);
      const { data: media } = await supabase
        .from("proctoring_media")
        .select("id")
        .in("attempt_id", attemptIds)
        .eq("file_type", "verification_snapshot")
        .limit(1);

      if (media && media.length > 0) {
        setProctoringStatus("registered");
      } else {
        setProctoringStatus("not_registered");
      }
    };
    fetchStatus();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update(form)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Profile updated!", "تم تحديث الملف الشخصي!") });
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
      color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    },
    active: {
      label: t("Proctoring Active", "المراقبة نشطة"),
      icon: Shield,
      color: "bg-primary/10 text-primary border-primary/30",
    },
  };

  const currentStatus = statusConfig[proctoringStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">{t("Profile Settings", "إعدادات الملف الشخصي")}</h1>

      {/* Proctoring Status Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {t("Proctoring Status", "حالة المراقبة")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${currentStatus.color}`}>
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
            <Label>{t("Full Name", "الاسم الكامل")}</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder={t("Enter your full name", "أدخل اسمك الكامل")}
            />
          </div>

          <div>
            <Label>{t("Phone", "الهاتف")}</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={t("Enter your phone number", "أدخل رقم هاتفك")}
            />
          </div>

          <div>
            <Label>{t("Bio", "نبذة")}</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder={t("Tell us about yourself", "أخبرنا عن نفسك")}
              rows={3}
            />
          </div>

          <div>
            <Label>{t("Preferred Language", "اللغة المفضلة")}</Label>
            <select
              value={form.preferred_language}
              onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? t("Saving...", "جاري الحفظ...") : t("Save Changes", "حفظ التغييرات")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSettings;
