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
import { Plus, Calendar, Check, X, BookMarked, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GOLD = "#c9a84c";

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

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <BookMarked className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">
                  {t("Private Sessions", "الجلسات الخاصة")}
                </h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">
                  {t("Schedule and track one-on-one sessions", "جدولة ومتابعة الجلسات الفردية")}
                </p>
              </div>
            </div>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <button className="flex shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 sm:gap-2 sm:px-6 sm:text-sm" style={{ background: GOLD, color: "#064E3B" }}>
                  <Plus className="h-4 w-4" /> {t("New Session", "جلسة جديدة")}
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader><DialogTitle>{t("Schedule Private Session", "جدولة جلسة خاصة")}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Student", "الطالب")}</Label>
                    <Select value={form.student_id} onValueChange={v => setForm({ ...form, student_id: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>{students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Subject", "المادة")}</Label>
                    <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Date", "التاريخ")}</Label><Input type="date" className="h-11 rounded-lg" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Start Time", "وقت البدء")}</Label><Input type="time" className="h-11 rounded-lg" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("End Time", "وقت الانتهاء")}</Label><Input type="time" className="h-11 rounded-lg" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Notes", "ملاحظات")}</Label><Textarea className="rounded-lg" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                  <button
                    onClick={handleCreate}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-0 py-3 text-sm font-black text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
                    style={{ background: "#064E3B" }}
                  >
                    {t("Schedule", "جدولة")}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-4xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Calendar className="h-4 w-4 text-emerald-700 sm:h-5 sm:w-5" />
              {t("All Sessions", "كل الجلسات")}
              {sessions.length > 0 && <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{sessions.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-6">
            {sessions.map(s => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 p-3.5 transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-slate-800">{(s as any).profiles?.full_name || "Student"}</p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="h-3 w-3 shrink-0" />
                    {(s as any).subjects?.title || ""} • {s.session_date} • {s.start_time} - {s.end_time}
                  </p>
                  {s.notes && <p className="text-xs text-slate-400">{s.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant={s.status === "completed" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"}
                    className="rounded-full"
                  >
                    {s.status === "scheduled" ? t("Scheduled", "مجدولة") : s.status === "completed" ? t("Completed", "مكتملة") : t("Cancelled", "ملغاة")}
                  </Badge>
                  {s.status === "scheduled" && (
                    <>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-50" onClick={() => updateStatus(s.id, "completed")}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50" onClick={() => updateStatus(s.id, "cancelled")}><X className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                <BookMarked className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">{t("No private sessions", "لا توجد جلسات خاصة")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherPrivateSessions;
