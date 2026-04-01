import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const TeacherSettings = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [profileForm, setProfileForm] = useState({ full_name: "", full_name_ar: "", phone: "", whatsapp: "" });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [prefs, setPrefs] = useState({ dark_mode: false, language: "both" as string });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        full_name_ar: (profile as any).full_name_ar || "",
        phone: profile.phone || "",
        whatsapp: (profile as any).whatsapp || "",
      });
    }
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      full_name: profileForm.full_name,
      full_name_ar: profileForm.full_name_ar,
      phone: profileForm.phone,
      whatsapp: profileForm.whatsapp,
    }).eq("user_id", user.id);
    if (!error) toast({ title: t("Profile updated!", "تم تحديث الملف الشخصي!") });
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: t("Passwords don't match", "كلمات المرور غير متطابقة"), variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
    if (!error) {
      toast({ title: t("Password changed!", "تم تغيير كلمة المرور!") });
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    }
  };

  const toggleDarkMode = (v: boolean) => {
    setPrefs({ ...prefs, dark_mode: v });
    document.documentElement.classList.toggle("dark", v);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("Settings", "الإعدادات")}</h1>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle>{t("Profile", "الملف الشخصي")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("Full Name", "الاسم الكامل")}</Label><Input value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} /></div>
            <div><Label>{t("Arabic Name", "الاسم بالعربية")}</Label><Input value={profileForm.full_name_ar} onChange={e => setProfileForm({ ...profileForm, full_name_ar: e.target.value })} dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("Phone", "الهاتف")}</Label><Input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} /></div>
            <div><Label>{t("WhatsApp", "واتساب")}</Label><Input value={profileForm.whatsapp} onChange={e => setProfileForm({ ...profileForm, whatsapp: e.target.value })} /></div>
          </div>
          <Button onClick={saveProfile}>{t("Save Profile", "حفظ الملف الشخصي")}</Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader><CardTitle>{t("Change Password", "تغيير كلمة المرور")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>{t("New Password", "كلمة المرور الجديدة")}</Label><Input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} /></div>
          <div><Label>{t("Confirm Password", "تأكيد كلمة المرور")}</Label><Input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} /></div>
          <Button onClick={changePassword}>{t("Change Password", "تغيير كلمة المرور")}</Button>
        </CardContent>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader><CardTitle>{t("Display", "العرض")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>{t("Language", "اللغة")}</Label>
            <Select value={prefs.language} onValueChange={v => { setPrefs({ ...prefs, language: v }); if (v !== "both") setLanguage(v === "arabic" ? "ar" : "en"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arabic">{t("Arabic", "عربي")}</SelectItem>
                <SelectItem value="english">{t("English", "إنجليزي")}</SelectItem>
                <SelectItem value="both">{t("Both", "كلاهما")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("Dark Mode", "الوضع الداكن")}</Label>
            <Switch checked={prefs.dark_mode} onCheckedChange={toggleDarkMode} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherSettings;
