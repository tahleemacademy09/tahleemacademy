import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Plus, User, BookOpen, Edit, XCircle } from "lucide-react";

const PrivateSessions = () => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [privateStudents, setPrivateStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState({
    student_id: "",
    subject_id: "",
    session_date: "",
    start_time: "",
    end_time: "",
    notes: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    const [sessionsRes, subjectsRes] = await Promise.all([
      supabase.from("private_sessions").select("*").order("session_date", { ascending: false }),
      supabase.from("subjects").select("id, title, title_ar").eq("is_active", true),
    ]);

    // Get private students assigned to this teacher (or all for admin)
    let studentsQuery = supabase.from("profiles").select("user_id, full_name, email, avatar_url, student_type, assigned_teacher_id").eq("student_type", "private");
    if (!isAdmin) {
      studentsQuery = studentsQuery.eq("assigned_teacher_id", user.id);
    }
    const { data: students } = await studentsQuery;

    setPrivateStudents(students || []);
    setSubjects(subjectsRes.data || []);

    // Merge student/subject names into sessions
    const allStudentIds = new Set((sessionsRes.data || []).map((s: any) => s.student_id));
    const { data: sessionProfiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", Array.from(allStudentIds));
    const profileMap = new Map((sessionProfiles || []).map((p: any) => [p.user_id, p]));
    const subjectMap = new Map((subjectsRes.data || []).map((s: any) => [s.id, s]));

    const merged = (sessionsRes.data || []).map((s: any) => ({
      ...s,
      student_profile: profileMap.get(s.student_id),
      subject: subjectMap.get(s.subject_id),
    }));

    setSessions(merged);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleSubmit = async () => {
    if (!user || !form.student_id || !form.session_date || !form.start_time || !form.end_time) {
      toast({ title: t("Please fill required fields", "يرجى ملء الحقول المطلوبة"), variant: "destructive" });
      return;
    }

    const payload = {
      student_id: form.student_id,
      teacher_id: user.id,
      subject_id: form.subject_id || null,
      session_date: form.session_date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("private_sessions").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("private_sessions").insert(payload));
    }

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? t("Session updated!", "تم تحديث الجلسة!") : t("Session scheduled!", "تمت جدولة الجلسة!") });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const resetForm = () => {
    setForm({ student_id: "", subject_id: "", session_date: "", start_time: "", end_time: "", notes: "" });
    setEditingId(null);
  };

  const editSession = (session: any) => {
    setForm({
      student_id: session.student_id,
      subject_id: session.subject_id || "",
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      notes: session.notes || "",
    });
    setEditingId(session.id);
    setDialogOpen(true);
  };

  const cancelSession = async (id: string) => {
    await supabase.from("private_sessions").update({ status: "cancelled" }).eq("id", id);
    toast({ title: t("Session cancelled", "تم إلغاء الجلسة") });
    fetchData();
  };

  const statusBadge = (status: string) => {
    const config: Record<string, { variant: any; label: string }> = {
      scheduled: { variant: "default", label: t("Scheduled", "مجدولة") },
      completed: { variant: "secondary", label: t("Completed", "مكتملة") },
      cancelled: { variant: "destructive", label: t("Cancelled", "ملغاة") },
    };
    const c = config[status] || config.scheduled;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t("Private Sessions", "الجلسات الخاصة")}</h1>
          <p className="text-sm text-muted-foreground">{t("Manage one-on-one sessions with private students", "إدارة الجلسات الفردية مع الطلاب الخصوصيين")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("Schedule New Session", "جدولة جلسة جديدة")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? t("Edit Session", "تعديل الجلسة") : t("Schedule New Session", "جدولة جلسة جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("Student", "الطالب")} *</Label>
                <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("Select student", "اختر الطالب")} /></SelectTrigger>
                  <SelectContent>
                    {privateStudents.map(s => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || s.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("Select subject", "اختر المادة")} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => (
                      <SelectItem key={s.id} value={s.id}>{language === "ar" ? s.title_ar || s.title : s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Date", "التاريخ")} *</Label>
                <Input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("Start Time", "وقت البدء")} *</Label>
                  <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <Label>{t("End Time", "وقت الانتهاء")} *</Label>
                  <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t("Notes", "ملاحظات")}</Label>
                <textarea
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder={t("Session notes...", "ملاحظات الجلسة...")}
                />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingId ? t("Update Session", "تحديث الجلسة") : t("Schedule Session", "جدولة الجلسة")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-primary">{privateStudents.length}</div>
          <div className="text-xs text-muted-foreground">{t("Private Students", "طلاب خصوصيون")}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold">{sessions.filter(s => s.status === "scheduled").length}</div>
          <div className="text-xs text-muted-foreground">{t("Scheduled", "مجدولة")}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-primary">{sessions.filter(s => s.status === "completed").length}</div>
          <div className="text-xs text-muted-foreground">{t("Completed", "مكتملة")}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-destructive">{sessions.filter(s => s.status === "cancelled").length}</div>
          <div className="text-xs text-muted-foreground">{t("Cancelled", "ملغاة")}</div>
        </CardContent></Card>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {t("No private sessions yet. Schedule your first one!", "لا توجد جلسات خاصة بعد. جدول أول جلسة!")}
          </CardContent></Card>
        ) : sessions.map(session => (
          <Card key={session.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="flex items-center justify-between p-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {session.student_profile?.full_name || t("Student", "طالب")}
                    {statusBadge(session.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {session.subject && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {language === "ar" ? session.subject.title_ar || session.subject.title : session.subject.title}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {session.session_date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {session.start_time} — {session.end_time}
                    </span>
                  </div>
                  {session.notes && <p className="text-xs text-muted-foreground mt-1 italic">{session.notes}</p>}
                </div>
              </div>
              {session.status === "scheduled" && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editSession(session)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelSession(session.id)}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PrivateSessions;