import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TeacherAnnouncements = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", target_type: "all", target_id: "", priority: "normal" });

  const fetchData = async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
    setSubjects(subs || []);
    // Get students
    const subjectIds = (subs || []).map(s => s.id);
    if (subjectIds.length > 0) {
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map((c: any) => c.id);
      if (courseIds.length > 0) {
        const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
        const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
        if (userIds.length > 0) {
          const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
          setStudents(data || []);
        }
      }
    }
    const { data } = await supabase.from("teacher_announcements").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
    setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleCreate = async () => {
    if (!form.title || !form.message || !user) return;
    const { error } = await supabase.from("teacher_announcements").insert({
      teacher_id: user.id,
      title: form.title,
      message: form.message,
      target_type: form.target_type,
      target_id: form.target_type !== "all" && form.target_id ? form.target_id : null,
      priority: form.priority,
    });
    if (!error) {
      toast({ title: t("Announcement sent!", "تم إرسال الإعلان!") });
      setShowCreate(false);
      setForm({ title: "", message: "", target_type: "all", target_id: "", priority: "normal" });
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("teacher_announcements").delete().eq("id", id);
    setAnnouncements(announcements.filter(a => a.id !== id));
  };

  const priorityColor = (p: string) => p === "urgent" ? "destructive" : p === "important" ? "secondary" : "outline";

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Announcements", "الإعلانات")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 me-2" /> {t("New Announcement", "إعلان جديد")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Create Announcement", "إنشاء إعلان")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("Message", "الرسالة")}</Label><Textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></div>
              <div><Label>{t("Target", "الهدف")}</Label>
                <Select value={form.target_type} onValueChange={v => setForm({ ...form, target_type: v, target_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All My Students", "كل طلابي")}</SelectItem>
                    <SelectItem value="subject">{t("Specific Subject", "مادة محددة")}</SelectItem>
                    <SelectItem value="student">{t("Specific Student", "طالب محدد")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.target_type === "subject" && (
                <Select value={form.target_id} onValueChange={v => setForm({ ...form, target_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {form.target_type === "student" && (
                <Select value={form.target_id} onValueChange={v => setForm({ ...form, target_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <div><Label>{t("Priority", "الأولوية")}</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t("Normal", "عادي")}</SelectItem>
                    <SelectItem value="important">{t("Important", "مهم")}</SelectItem>
                    <SelectItem value="urgent">{t("Urgent", "عاجل")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">{t("Send", "إرسال")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {announcements.map(a => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  <p className="font-medium">{a.title}</p>
                  <Badge variant={priorityColor(a.priority) as any}>{a.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{a.message}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()} • {a.target_type === "all" ? t("All Students", "كل الطلاب") : a.target_type}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </CardContent>
          </Card>
        ))}
        {announcements.length === 0 && <p className="text-muted-foreground text-center py-8">{t("No announcements", "لا توجد إعلانات")}</p>}
      </div>
    </div>
  );
};

export default TeacherAnnouncements;
