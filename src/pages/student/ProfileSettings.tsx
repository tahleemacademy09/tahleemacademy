import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, User } from "lucide-react";

const ProfileSettings = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">{t("Profile Settings", "إعدادات الملف الشخصي")}</h1>

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
