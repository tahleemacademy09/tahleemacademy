import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Save, User, Camera, ShieldCheck, ShieldAlert, Shield, Globe,
  Phone, Users, GraduationCap, Calendar, IdCard
} from "lucide-react";

const ProfileSettings = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState<"not_registered" | "registered" | "active">("not_registered");

  const isAdmin = hasRole("admin") || hasRole("teacher");
  const isStudent = !isAdmin;

  const [teachers, setTeachers] = useState<any[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    full_name_ar: "",
    date_of_birth: "",
    gender: "",
    nationality: "",
    country: "",
    city: "",
    phone: "",
    whatsapp: "",
    parent_name: "",
    parent_phone: "",
    parent_whatsapp: "",
    parent_relationship: "",
    preferred_language: "en",
    bio: "",
    level: "beginner",
    status: "active",
    student_type: "group",
    assigned_teacher_id: "",
    private_session_rate: "",
    private_notes: "",
  });

  const [readOnlyFields] = useState({
    student_id: "",
    enrollment_date: "",
    email: "",
  });

  const [studentId, setStudentId] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        full_name_ar: profile.full_name_ar || "",
        date_of_birth: profile.date_of_birth || "",
        gender: profile.gender || "",
        nationality: profile.nationality || "",
        country: profile.country || "",
        city: profile.city || "",
        phone: profile.phone || "",
        whatsapp: profile.whatsapp || "",
        parent_name: profile.parent_name || "",
        parent_phone: profile.parent_phone || "",
        parent_whatsapp: profile.parent_whatsapp || "",
        parent_relationship: profile.parent_relationship || "",
        preferred_language: profile.preferred_language || "en",
        bio: profile.bio || "",
        level: profile.level || "beginner",
        status: profile.status || "active",
        student_type: profile.student_type || "group",
        assigned_teacher_id: profile.assigned_teacher_id || "",
        private_session_rate: profile.private_session_rate || "",
        private_notes: profile.private_notes || "",
      });
      setStudentId(profile.student_id || "");
      setEnrollmentDate(profile.enrollment_date || "");
    }
  }, [profile]);

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

    // Students can only update certain fields
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (isStudent) {
      // Students can edit: phone, whatsapp, city, preferred_language, bio, full_name
      updateData.full_name = form.full_name.trim();
      updateData.phone = form.phone.trim();
      updateData.whatsapp = form.whatsapp.trim();
      updateData.city = form.city.trim();
      updateData.preferred_language = form.preferred_language;
      updateData.bio = form.bio.trim();
    } else {
      // Admins/teachers can edit everything
      Object.entries(form).forEach(([key, val]) => {
        updateData[key] = typeof val === 'string' ? val.trim() : val;
      });
    }

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Profile updated!", "تم تحديث الملف الشخصي!") });
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

  const canEdit = (field: string) => {
    if (isAdmin) return true;
    const studentEditable = ["full_name", "phone", "whatsapp", "city", "bio", "preferred_language"];
    return studentEditable.includes(field);
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold font-display">{t("Scholar's Profile", "الملف الشخصي للدارس")}</h1>

      {/* Proctoring Status */}
      <Card>
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

      {/* ══════════════════════════════════════════
          SECTION 1: Personal Info
      ══════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {t("Personal Information", "المعلومات الشخصية")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Full Name (English)", "الاسم الكامل (إنجليزي)")} <span className="text-destructive">*</span></Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                disabled={!canEdit("full_name")}
                placeholder="John Doe"
              />
              {errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name}</p>}
            </div>
            <div>
              <Label>{t("Full Name (Arabic)", "الاسم الكامل (عربي)")}</Label>
              <Input
                value={form.full_name_ar}
                onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })}
                disabled={!canEdit("full_name_ar")}
                placeholder="محمد أحمد"
                dir="rtl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Date of Birth", "تاريخ الميلاد")}</Label>
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                disabled={!canEdit("date_of_birth")}
              />
            </div>
            <div>
              <Label>{t("Gender", "الجنس")}</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => setForm({ ...form, gender: v })}
                disabled={!canEdit("gender")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Select", "اختر")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t("Male", "ذكر")}</SelectItem>
                  <SelectItem value="female">{t("Female", "أنثى")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>{t("Nationality", "الجنسية")}</Label>
              <Input
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                disabled={!canEdit("nationality")}
                placeholder={t("e.g. Nigerian", "مثال: نيجيري")}
              />
            </div>
            <div>
              <Label>{t("Country", "البلد")}</Label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                disabled={!canEdit("country")}
                placeholder={t("e.g. Nigeria", "مثال: نيجيريا")}
              />
            </div>
            <div>
              <Label>{t("City", "المدينة")}</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                disabled={!canEdit("city")}
                placeholder={t("e.g. Lagos", "مثال: لاجوس")}
              />
            </div>
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
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════
          SECTION 2: Contact Info
      ══════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            {t("Contact Information", "معلومات التواصل")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("Email", "البريد الإلكتروني")}</Label>
            <Input value={user?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">{t("Email cannot be changed", "لا يمكن تغيير البريد الإلكتروني")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Phone", "الهاتف")}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={!canEdit("phone")}
                placeholder="+234..."
                type="tel"
              />
            </div>
            <div>
              <Label>{t("WhatsApp", "واتساب")}</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                disabled={!canEdit("whatsapp")}
                placeholder="+234..."
                type="tel"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════
          SECTION 3: Parent Info
      ══════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("Parent / Guardian Information", "معلومات ولي الأمر")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Parent Full Name", "اسم ولي الأمر")}</Label>
              <Input
                value={form.parent_name}
                onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                disabled={!canEdit("parent_name")}
                placeholder={t("Parent's full name", "الاسم الكامل لولي الأمر")}
              />
            </div>
            <div>
              <Label>{t("Relationship", "صلة القرابة")}</Label>
              <Select
                value={form.parent_relationship}
                onValueChange={(v) => setForm({ ...form, parent_relationship: v })}
                disabled={!canEdit("parent_relationship")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Select", "اختر")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="father">{t("Father", "الأب")}</SelectItem>
                  <SelectItem value="mother">{t("Mother", "الأم")}</SelectItem>
                  <SelectItem value="other">{t("Other", "آخر")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Parent Phone", "هاتف ولي الأمر")}</Label>
              <Input
                value={form.parent_phone}
                onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                disabled={!canEdit("parent_phone")}
                placeholder="+234..."
                type="tel"
              />
            </div>
            <div>
              <Label>{t("Parent WhatsApp", "واتساب ولي الأمر")}</Label>
              <Input
                value={form.parent_whatsapp}
                onChange={(e) => setForm({ ...form, parent_whatsapp: e.target.value })}
                disabled={!canEdit("parent_whatsapp")}
                placeholder="+234..."
                type="tel"
              />
            </div>
          </div>

          {isStudent && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              {t("Parent information can only be updated by an administrator.", "يمكن تحديث معلومات ولي الأمر فقط بواسطة المسؤول.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════
          SECTION 4: Academic Info
      ══════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            {t("Academic Information", "المعلومات الأكاديمية")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                <IdCard className="h-3.5 w-3.5" />
                {t("Student ID", "رقم الطالب")}
              </Label>
              <Input value={studentId} disabled className="bg-muted font-mono" />
              <p className="text-xs text-muted-foreground mt-1">{t("Auto-generated", "يتم إنشاؤه تلقائيًا")}</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {t("Enrollment Date", "تاريخ التسجيل")}
              </Label>
              <Input value={enrollmentDate} disabled className="bg-muted" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("Level", "المستوى")}</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm({ ...form, level: v })}
                disabled={!canEdit("level")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("Beginner / المبتدئة", "المبتدئة")}</SelectItem>
                  <SelectItem value="intermediate">{t("Intermediate / المتوسطة", "المتوسطة")}</SelectItem>
                  <SelectItem value="advanced">{t("Advanced / المتقدمة", "المتقدمة")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Status", "الحالة")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
                disabled={!canEdit("status")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("Active", "نشط")}</SelectItem>
                  <SelectItem value="inactive">{t("Inactive", "غير نشط")}</SelectItem>
                  <SelectItem value="graduated">{t("Graduated", "متخرج")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isStudent && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              {t("Academic details can only be updated by an administrator.", "يمكن تحديث التفاصيل الأكاديمية فقط بواسطة المسؤول.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        <Save className="h-4 w-4 me-2" />
        {saving ? t("Saving...", "جاري الحفظ...") : t("Save Changes", "حفظ التغييرات")}
      </Button>
    </div>
  );
};

export default ProfileSettings;