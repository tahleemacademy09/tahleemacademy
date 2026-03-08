import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Save, User, Camera, ShieldCheck, ShieldAlert, Shield, Globe,
  Phone, Users, GraduationCap, Calendar, IdCard, Bell, Lock,
  Monitor, BookOpen, Trash2, Download, LogOut, Eye, EyeOff,
  Sun, Moon, Play, AlertTriangle
} from "lucide-react";

const ProfileSettings = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile, hasRole, signOut } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState<"not_registered" | "registered" | "active">("not_registered");
  const [passwordForm, setPasswordForm] = useState({ current: "", new_password: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const isAdmin = hasRole("admin") || hasRole("teacher");
  const isStudent = !isAdmin;

  const [teachers, setTeachers] = useState<any[]>([]);
  const [form, setForm] = useState({
    full_name: "", full_name_ar: "", date_of_birth: "", gender: "",
    nationality: "", country: "", city: "", phone: "", whatsapp: "",
    parent_name: "", parent_phone: "", parent_whatsapp: "", parent_relationship: "",
    preferred_language: "en", bio: "", level: "beginner", status: "active",
    student_type: "group", assigned_teacher_id: "", private_session_rate: "",
    private_notes: "",
  });

  const [prefs, setPrefs] = useState({
    email_notifications: true, whatsapp_notifications: false,
    class_reminder: true, class_reminder_minutes: 30,
    exam_reminder: true, new_recording_alert: true, results_notification: true,
    language: "both", dark_mode: false, text_direction: "auto",
    show_profile_photo: true, default_subject_view: "grid",
    autoplay_recordings: true, playback_speed: "1x", show_subtitles: false,
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [studentId, setStudentId] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load profile data
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "", full_name_ar: profile.full_name_ar || "",
        date_of_birth: profile.date_of_birth || "", gender: profile.gender || "",
        nationality: profile.nationality || "", country: profile.country || "",
        city: profile.city || "", phone: profile.phone || "", whatsapp: profile.whatsapp || "",
        parent_name: profile.parent_name || "", parent_phone: profile.parent_phone || "",
        parent_whatsapp: profile.parent_whatsapp || "", parent_relationship: profile.parent_relationship || "",
        preferred_language: profile.preferred_language || "en", bio: profile.bio || "",
        level: profile.level || "beginner", status: profile.status || "active",
        student_type: profile.student_type || "group",
        assigned_teacher_id: profile.assigned_teacher_id || "",
        private_session_rate: profile.private_session_rate || "",
        private_notes: profile.private_notes || "",
      });
      setStudentId(profile.student_id || "");
      setEnrollmentDate(profile.enrollment_date || "");
    }
  }, [profile]);

  // Load preferences
  useEffect(() => {
    if (!user) return;
    const loadPrefs = async () => {
      const { data } = await supabase
        .from("student_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setPrefs({
          email_notifications: d.email_notifications ?? true,
          whatsapp_notifications: d.whatsapp_notifications ?? false,
          class_reminder: d.class_reminder ?? true,
          class_reminder_minutes: d.class_reminder_minutes ?? 30,
          exam_reminder: d.exam_reminder ?? true,
          new_recording_alert: d.new_recording_alert ?? true,
          results_notification: d.results_notification ?? true,
          language: d.language ?? "both",
          dark_mode: d.dark_mode ?? false,
          text_direction: d.text_direction ?? "auto",
          show_profile_photo: d.show_profile_photo ?? true,
          default_subject_view: d.default_subject_view ?? "grid",
          autoplay_recordings: d.autoplay_recordings ?? true,
          playback_speed: d.playback_speed ?? "1x",
          show_subtitles: d.show_subtitles ?? false,
        });
      }
      setPrefsLoaded(true);
    };
    loadPrefs();
  }, [user]);

  // Apply dark mode
  useEffect(() => {
    if (!prefsLoaded) return;
    document.documentElement.classList.toggle("dark", prefs.dark_mode);
  }, [prefs.dark_mode, prefsLoaded]);

  // Fetch teachers for assignment dropdown
  useEffect(() => {
    const fetchTeachers = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher", "admin"]);
      if (roles && roles.length > 0) {
        const teacherIds = roles.map(r => r.user_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", teacherIds);
        setTeachers(profiles || []);
      }
    };
    if (isAdmin) fetchTeachers();
  }, [isAdmin]);

  // Proctoring status
  useEffect(() => {
    if (!user) return;
    const fetchStatus = async () => {
      const { data: attempts } = await supabase
        .from("exam_attempts").select("id, status")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
      if (!attempts || attempts.length === 0) { setProctoringStatus("not_registered"); return; }
      const activeAttempt = attempts.find(a => a.status === "in_progress");
      if (activeAttempt) {
        const { data: session } = await supabase.from("proctoring_sessions").select("id").eq("attempt_id", activeAttempt.id).maybeSingle();
        if (session) { setProctoringStatus("active"); return; }
      }
      const attemptIds = attempts.map(a => a.id);
      const { data: media } = await supabase.from("proctoring_media").select("id").in("attempt_id", attemptIds).eq("file_type", "verification_snapshot").limit(1);
      setProctoringStatus(media && media.length > 0 ? "registered" : "not_registered");
    };
    fetchStatus();
  }, [user]);

  const canEdit = (field: string) => {
    if (isAdmin) return true;
    return ["full_name", "phone", "whatsapp", "city", "bio", "preferred_language"].includes(field);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.full_name.trim()) errs.full_name = t("Full name is required", "الاسم الكامل مطلوب");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveProfile = async () => {
    if (!user || !validate()) return;
    setSaving(true);
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (isStudent) {
      updateData.full_name = form.full_name.trim();
      updateData.phone = form.phone.trim();
      updateData.whatsapp = form.whatsapp.trim();
      updateData.city = form.city.trim();
      updateData.preferred_language = form.preferred_language;
      updateData.bio = form.bio.trim();
    } else {
      Object.entries(form).forEach(([key, val]) => {
        updateData[key] = typeof val === "string" ? val.trim() : val;
      });
    }
    const { error } = await supabase.from("profiles").update(updateData).eq("user_id", user.id);
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Profile updated!", "تم تحديث الملف الشخصي!") });
      if (form.preferred_language !== language) setLanguage(form.preferred_language as "en" | "ar");
    }
    setSaving(false);
  };

  const handleSavePrefs = async () => {
    if (!user) return;
    setSavingPrefs(true);
    const payload = { ...prefs, user_id: user.id, updated_at: new Date().toISOString() };
    const { data: existing } = await supabase.from("student_preferences" as any).select("id").eq("user_id", user.id).maybeSingle();
    let error;
    if (existing) {
      ({ error } = await supabase.from("student_preferences" as any).update(payload as any).eq("user_id", user.id));
    } else {
      ({ error } = await supabase.from("student_preferences" as any).insert(payload as any));
    }
    if (error) {
      toast({ title: t("Error", "خطأ"), description: (error as any).message, variant: "destructive" });
    } else {
      toast({ title: t("Preferences saved!", "تم حفظ التفضيلات!") });
    }
    setSavingPrefs(false);
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password.length < 8) {
      toast({ title: t("Error", "خطأ"), description: t("Password must be at least 8 characters", "كلمة المرور يجب أن تكون 8 أحرف على الأقل"), variant: "destructive" });
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm) {
      toast({ title: t("Error", "خطأ"), description: t("Passwords do not match", "كلمات المرور غير متطابقة"), variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.new_password });
    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Password changed successfully!", "تم تغيير كلمة المرور بنجاح!") });
      setPasswordForm({ current: "", new_password: "", confirm: "" });
    }
    setChangingPassword(false);
  };

  const handleLogoutAll = async () => {
    await supabase.auth.signOut({ scope: "global" });
    toast({ title: t("Logged out of all devices", "تم تسجيل الخروج من جميع الأجهزة") });
    signOut();
  };

  const statusConfig = {
    not_registered: { label: t("Face Not Registered", "الوجه غير مسجل"), icon: ShieldAlert, color: "bg-destructive/10 text-destructive border-destructive/30" },
    registered: { label: t("Face Registered", "الوجه مسجل"), icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/30" },
    active: { label: t("Proctoring Active", "المراقبة نشطة"), icon: Shield, color: "bg-secondary/10 text-secondary border-secondary/30" },
  };
  const currentStatus = statusConfig[proctoringStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold font-display mb-6">{t("Settings", "الإعدادات")}</h1>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="account" className="flex-1 min-w-[100px]">{t("Account", "الحساب")}</TabsTrigger>
          <TabsTrigger value="notifications" className="flex-1 min-w-[100px]">{t("Notifications", "الإشعارات")}</TabsTrigger>
          <TabsTrigger value="display" className="flex-1 min-w-[100px]">{t("Display", "العرض")}</TabsTrigger>
          <TabsTrigger value="privacy" className="flex-1 min-w-[100px]">{t("Privacy", "الخصوصية")}</TabsTrigger>
          <TabsTrigger value="learning" className="flex-1 min-w-[100px]">{t("Learning", "التعلم")}</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: ACCOUNT ═══ */}
        <TabsContent value="account" className="space-y-6">

          {/* Proctoring Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" />{t("Proctoring Status", "حالة المراقبة")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${currentStatus.color}`}>
                <StatusIcon className="h-4 w-4" />{currentStatus.label}
              </div>
            </CardContent>
          </Card>

          {/* Personal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />{t("Personal Information", "المعلومات الشخصية")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Full Name (English)", "الاسم الكامل (إنجليزي)")} <span className="text-destructive">*</span></Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={!canEdit("full_name")} />
                  {errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name}</p>}
                </div>
                <div>
                  <Label>{t("Full Name (Arabic)", "الاسم الكامل (عربي)")}</Label>
                  <Input value={form.full_name_ar} onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })} disabled={!canEdit("full_name_ar")} dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Date of Birth", "تاريخ الميلاد")}</Label>
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} disabled={!canEdit("date_of_birth")} />
                </div>
                <div>
                  <Label>{t("Gender", "الجنس")}</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })} disabled={!canEdit("gender")}>
                    <SelectTrigger><SelectValue placeholder={t("Select", "اختر")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("Male", "ذكر")}</SelectItem>
                      <SelectItem value="female">{t("Female", "أنثى")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label>{t("Nationality", "الجنسية")}</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} disabled={!canEdit("nationality")} /></div>
                <div><Label>{t("Country", "البلد")}</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} disabled={!canEdit("country")} /></div>
                <div><Label>{t("City", "المدينة")}</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!canEdit("city")} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" />{t("Contact Information", "معلومات التواصل")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("Email", "البريد الإلكتروني")}</Label>
                <Input value={user?.email || ""} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">{t("Email cannot be changed here", "لا يمكن تغيير البريد الإلكتروني هنا")}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>{t("Phone", "الهاتف")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit("phone")} placeholder="+234..." type="tel" /></div>
                <div><Label>{t("WhatsApp", "واتساب")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} disabled={!canEdit("whatsapp")} placeholder="+234..." type="tel" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Parent Info */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />{t("Parent / Guardian", "ولي الأمر")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>{t("Parent Name", "اسم ولي الأمر")}</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} disabled={!canEdit("parent_name")} /></div>
                <div>
                  <Label>{t("Relationship", "صلة القرابة")}</Label>
                  <Select value={form.parent_relationship} onValueChange={(v) => setForm({ ...form, parent_relationship: v })} disabled={!canEdit("parent_relationship")}>
                    <SelectTrigger><SelectValue placeholder={t("Select", "اختر")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="father">{t("Father", "الأب")}</SelectItem>
                      <SelectItem value="mother">{t("Mother", "الأم")}</SelectItem>
                      <SelectItem value="other">{t("Other", "آخر")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>{t("Parent Phone", "هاتف ولي الأمر")}</Label><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} disabled={!canEdit("parent_phone")} type="tel" /></div>
                <div><Label>{t("Parent WhatsApp", "واتساب ولي الأمر")}</Label><Input value={form.parent_whatsapp} onChange={(e) => setForm({ ...form, parent_whatsapp: e.target.value })} disabled={!canEdit("parent_whatsapp")} type="tel" /></div>
              </div>
              {isStudent && <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{t("Parent info can only be updated by an administrator.", "يمكن تحديث معلومات ولي الأمر فقط بواسطة المسؤول.")}</p>}
            </CardContent>
          </Card>

          {/* Academic Info */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" />{t("Academic Information", "المعلومات الأكاديمية")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" />{t("Student ID", "رقم الطالب")}</Label><Input value={studentId} disabled className="bg-muted font-mono" /></div>
                <div><Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t("Enrollment Date", "تاريخ التسجيل")}</Label><Input value={enrollmentDate} disabled className="bg-muted" type="date" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Level", "المستوى")}</Label>
                  <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })} disabled={!canEdit("level")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">{t("Beginner", "المبتدئة")}</SelectItem>
                      <SelectItem value="intermediate">{t("Intermediate", "المتوسطة")}</SelectItem>
                      <SelectItem value="advanced">{t("Advanced", "المتقدمة")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Status", "الحالة")}</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canEdit("status")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t("Active", "نشط")}</SelectItem>
                      <SelectItem value="inactive">{t("Inactive", "غير نشط")}</SelectItem>
                      <SelectItem value="graduated">{t("Graduated", "متخرج")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isStudent && <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{t("Academic details can only be updated by an administrator.", "يمكن تحديث التفاصيل الأكاديمية فقط بواسطة المسؤول.")}</p>}
            </CardContent>
          </Card>

          {/* Student Type */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />{t("Student Type", "نوع الطالب")}
                {form.student_type === "private" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30">{t("Private", "خاص")}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={form.student_type} onValueChange={(v) => setForm({ ...form, student_type: v })} disabled={!canEdit("student_type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">{t("Group Student", "طالب جماعي")}</SelectItem>
                  <SelectItem value="private">{t("Private Student", "طالب خاص")}</SelectItem>
                </SelectContent>
              </Select>
              {form.student_type === "private" && (
                <>
                  <div>
                    <Label>{t("Assigned Teacher", "المعلم المسؤول")}</Label>
                    <Select value={form.assigned_teacher_id} onValueChange={(v) => setForm({ ...form, assigned_teacher_id: v })} disabled={!canEdit("assigned_teacher_id")}>
                      <SelectTrigger><SelectValue placeholder={t("Select a teacher", "اختر معلمًا")} /></SelectTrigger>
                      <SelectContent>{teachers.map(tc => <SelectItem key={tc.user_id} value={tc.user_id}>{tc.full_name || tc.email}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t("Session Rate", "سعر الجلسة")}</Label><Input value={form.private_session_rate} onChange={(e) => setForm({ ...form, private_session_rate: e.target.value })} disabled={!canEdit("private_session_rate")} placeholder="$20/hour" /></div>
                </>
              )}
              {isStudent && <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{t("Student type can only be changed by an administrator.", "يمكن تغيير نوع الطالب فقط بواسطة المسؤول.")}</p>}
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />{t("Change Password", "تغيير كلمة المرور")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>{t("New Password", "كلمة المرور الجديدة")}</Label><Input type="password" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} placeholder="••••••••" /></div>
              <div><Label>{t("Confirm Password", "تأكيد كلمة المرور")}</Label><Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="••••••••" /></div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !passwordForm.new_password} variant="outline">
                {changingPassword ? t("Changing...", "جاري التغيير...") : t("Change Password", "تغيير كلمة المرور")}
              </Button>
            </CardContent>
          </Card>

          <Button onClick={handleSaveProfile} disabled={saving} className="w-full" size="lg">
            <Save className="h-4 w-4 me-2" />{saving ? t("Saving...", "جاري الحفظ...") : t("Save Profile", "حفظ الملف الشخصي")}
          </Button>
        </TabsContent>

        {/* ═══ TAB 2: NOTIFICATIONS ═══ */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />{t("Notification Preferences", "تفضيلات الإشعارات")}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {[
                { key: "email_notifications", label: t("Email Notifications", "إشعارات البريد الإلكتروني"), desc: t("Receive updates via email", "تلقي التحديثات عبر البريد") },
                { key: "whatsapp_notifications", label: t("WhatsApp Notifications", "إشعارات واتساب"), desc: t("Receive updates via WhatsApp", "تلقي التحديثات عبر واتساب") },
                { key: "exam_reminder", label: t("Exam Reminders", "تذكير بالامتحانات"), desc: t("Get notified before exams", "التنبيه قبل الامتحانات") },
                { key: "new_recording_alert", label: t("New Recording Alerts", "تنبيه تسجيل جديد"), desc: t("When a new class recording is available", "عند توفر تسجيل جديد") },
                { key: "results_notification", label: t("Results Published", "نشر النتائج"), desc: t("When exam results are available", "عند توفر نتائج الامتحان") },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                  <Switch checked={(prefs as any)[item.key]} onCheckedChange={(v) => setPrefs({ ...prefs, [item.key]: v })} />
                </div>
              ))}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Class Reminder", "تذكير بالحصة")}</p>
                  <p className="text-xs text-muted-foreground">{t("Reminder before live class starts", "تذكير قبل بدء الحصة المباشرة")}</p>
                </div>
                <Switch checked={prefs.class_reminder} onCheckedChange={(v) => setPrefs({ ...prefs, class_reminder: v })} />
              </div>
              {prefs.class_reminder && (
                <div className="ms-4">
                  <Label>{t("Remind me before", "ذكرني قبل")}</Label>
                  <Select value={String(prefs.class_reminder_minutes)} onValueChange={(v) => setPrefs({ ...prefs, class_reminder_minutes: parseInt(v) })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">{t("15 minutes", "١٥ دقيقة")}</SelectItem>
                      <SelectItem value="30">{t("30 minutes", "٣٠ دقيقة")}</SelectItem>
                      <SelectItem value="60">{t("1 hour", "ساعة واحدة")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleSavePrefs} disabled={savingPrefs} className="w-full" size="lg">
            <Save className="h-4 w-4 me-2" />{savingPrefs ? t("Saving...", "جاري الحفظ...") : t("Save Preferences", "حفظ التفضيلات")}
          </Button>
        </TabsContent>

        {/* ═══ TAB 3: LANGUAGE & DISPLAY ═══ */}
        <TabsContent value="display" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-primary" />{t("Language & Display", "اللغة والعرض")}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>{t("Language Preference", "تفضيل اللغة")}</Label>
                <Select value={prefs.language} onValueChange={(v) => setPrefs({ ...prefs, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{t("Arabic Only", "عربي فقط")}</SelectItem>
                    <SelectItem value="en">{t("English Only", "إنجليزي فقط")}</SelectItem>
                    <SelectItem value="both">{t("Both / الاثنان", "الاثنان")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t("Text Direction", "اتجاه النص")}</Label>
                <Select value={prefs.text_direction} onValueChange={(v) => setPrefs({ ...prefs, text_direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("Auto", "تلقائي")}</SelectItem>
                    <SelectItem value="rtl">{t("Right to Left (RTL)", "يمين إلى يسار")}</SelectItem>
                    <SelectItem value="ltr">{t("Left to Right (LTR)", "يسار إلى يمين")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {prefs.dark_mode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                  <div>
                    <p className="text-sm font-medium">{t("Dark Mode", "الوضع الداكن")}</p>
                    <p className="text-xs text-muted-foreground">{t("Toggle dark/light theme", "تبديل بين الوضع الداكن والفاتح")}</p>
                  </div>
                </div>
                <Switch checked={prefs.dark_mode} onCheckedChange={(v) => setPrefs({ ...prefs, dark_mode: v })} />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSavePrefs} disabled={savingPrefs} className="w-full" size="lg">
            <Save className="h-4 w-4 me-2" />{savingPrefs ? t("Saving...", "جاري الحفظ...") : t("Save Preferences", "حفظ التفضيلات")}
          </Button>
        </TabsContent>

        {/* ═══ TAB 4: PRIVACY & SECURITY ═══ */}
        <TabsContent value="privacy" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />{t("Privacy & Security", "الخصوصية والأمان")}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Show Profile Photo", "إظهار صورة الملف الشخصي")}</p>
                  <p className="text-xs text-muted-foreground">{t("Let other students see your photo", "السماح للطلاب الآخرين برؤية صورتك")}</p>
                </div>
                <Switch checked={prefs.show_profile_photo} onCheckedChange={(v) => setPrefs({ ...prefs, show_profile_photo: v })} />
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">{t("Session Management", "إدارة الجلسات")}</p>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogoutAll}>
                  <LogOut className="h-4 w-4" />{t("Log Out of All Devices", "تسجيل الخروج من جميع الأجهزة")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Management */}
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />{t("Account Management", "إدارة الحساب")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-3">{t("These actions are permanent and cannot be undone.", "هذه الإجراءات دائمة ولا يمكن التراجع عنها.")}</p>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => {
                    toast({ title: t("Coming Soon", "قريبًا"), description: t("Data download will be available soon.", "سيتوفر تنزيل البيانات قريبًا.") });
                  }}>
                    <Download className="h-4 w-4" />{t("Download My Data", "تنزيل بياناتي")}
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={() => {
                    toast({ title: t("Contact Admin", "تواصل مع المسؤول"), description: t("Please contact an administrator to deactivate or delete your account.", "يرجى التواصل مع المسؤول لإلغاء تفعيل أو حذف حسابك.") });
                  }}>
                    <Trash2 className="h-4 w-4" />{t("Delete Account", "حذف الحساب")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSavePrefs} disabled={savingPrefs} className="w-full" size="lg">
            <Save className="h-4 w-4 me-2" />{savingPrefs ? t("Saving...", "جاري الحفظ...") : t("Save Preferences", "حفظ التفضيلات")}
          </Button>
        </TabsContent>

        {/* ═══ TAB 5: LEARNING PREFERENCES ═══ */}
        <TabsContent value="learning" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />{t("Learning Preferences", "تفضيلات التعلم")}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>{t("Default Subject View", "عرض المواد الافتراضي")}</Label>
                <Select value={prefs.default_subject_view} onValueChange={(v) => setPrefs({ ...prefs, default_subject_view: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">{t("Grid", "شبكة")}</SelectItem>
                    <SelectItem value="list">{t("List", "قائمة")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Auto-play Next Recording", "تشغيل التسجيل التالي تلقائيًا")}</p>
                  <p className="text-xs text-muted-foreground">{t("Automatically play the next recording when one ends", "تشغيل التسجيل التالي تلقائيًا عند انتهاء الحالي")}</p>
                </div>
                <Switch checked={prefs.autoplay_recordings} onCheckedChange={(v) => setPrefs({ ...prefs, autoplay_recordings: v })} />
              </div>

              <div>
                <Label>{t("Playback Speed", "سرعة التشغيل")}</Label>
                <Select value={prefs.playback_speed} onValueChange={(v) => setPrefs({ ...prefs, playback_speed: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.75x">0.75x</SelectItem>
                    <SelectItem value="1x">1x</SelectItem>
                    <SelectItem value="1.25x">1.25x</SelectItem>
                    <SelectItem value="1.5x">1.5x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Show Subtitles", "إظهار الترجمة")}</p>
                  <p className="text-xs text-muted-foreground">{t("Show subtitles on recordings when available", "إظهار الترجمة على التسجيلات عند توفرها")}</p>
                </div>
                <Switch checked={prefs.show_subtitles} onCheckedChange={(v) => setPrefs({ ...prefs, show_subtitles: v })} />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSavePrefs} disabled={savingPrefs} className="w-full" size="lg">
            <Save className="h-4 w-4 me-2" />{savingPrefs ? t("Saving...", "جاري الحفظ...") : t("Save Preferences", "حفظ التفضيلات")}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfileSettings;
