import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Calendar, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TeacherPrivateSessions = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ student_id: "", subject_id: "", session_date: "", start_time: "", end_time: "", notes: "" });

  const fetchData = async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
    setSubjects(subs || []);
    const { data: pvtStudents } = await supabase.from("profiles").select("user_id, full_name").eq("assigned_teacher_id", user.id).eq("student_type", "private");
    setStudents(pvtStudents || []);
    const { data } = await supabase.from("private_sessions").select("*, profiles!private_sessions_student_id_fkey(full_name), subjects(title)").eq("teacher_id", user.id).order("session_date", { ascending: false });
    setSessions(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleCreate = async () => {
    if (!form.student_id || !form.session_date || !form.start_time || !form.end_time || !user) return;
    const { error } = await supabase.from("private_sessions").insert({
      student_id: form.student_id,
      teacher_id: user.id,
      subject_id: form.subject_id || null,
      session_date: form.session_date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes || null,
    });
    if (!error) {
      toast({ title: t("Session scheduled!", "تم جدولة الجلسة!") });
      setShowCreate(false);
      setForm({ student_id: "", subject_id: "", session_date: "", start_time: "", end_time: "", notes: "" });
      fetchData();
    } else {
      toast({ title: t("Error creating session", "خطأ في إنشاء الجلسة"), variant: "destructive" });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("private_sessions").update({ status }).eq("id", id);
    fetchData();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Private Sessions", "الجلسات الخاصة")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 me-2" /> {t("New Session", "جلسة جديدة")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Schedule Private Session", "جدولة جلسة خاصة")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("Student", "الطالب")}</Label>
                <Select value={form.student_id} onValueChange={v => setForm({ ...form, student_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("Date", "التاريخ")}</Label><Input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Start Time", "وقت البدء")}</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
                <div><Label>{t("End Time", "وقت الانتهاء")}</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
              </div>
              <div><Label>{t("Notes", "ملاحظات")}</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full">{t("Schedule", "جدولة")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {sessions.map(s => (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium text-sm">{(s as any).profiles?.full_name || "Student"}</p>
                <p className="text-xs text-muted-foreground">{(s as any).subjects?.title || ""} • {s.session_date} • {s.start_time} - {s.end_time}</p>
                {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={s.status === "completed" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"}>
                  {s.status === "scheduled" ? t("Scheduled", "مجدولة") : s.status === "completed" ? t("Completed", "مكتملة") : t("Cancelled", "ملغاة")}
                </Badge>
                {s.status === "scheduled" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(s.id, "completed")}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(s.id, "cancelled")}><X className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {sessions.length === 0 && <p className="text-muted-foreground text-center py-8">{t("No private sessions", "لا توجد جلسات خاصة")}</p>}
      </div>
    </div>
  );
};

export default TeacherPrivateSessions;
