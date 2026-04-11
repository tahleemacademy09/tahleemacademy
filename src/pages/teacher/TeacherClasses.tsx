import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Video, Plus, Calendar, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format, isFuture, isPast } from "date-fns";
import ClassroomView from "@/components/classroom/ClassroomView";

const TeacherClasses = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [classroomSubject, setClassroomSubject] = useState<any>(null);
  const [form, setForm] = useState({
    subject_id: "", topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true,
  });

  const fetchSessions = async () => {
    if (!user) return;
    const { data: ownedSubs } = await supabase
      .from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);

    const { data: ttSlots } = await supabase
      .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
    const ttSubjectIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];

    let extraSubs: any[] = [];
    if (ttSubjectIds.length > 0) {
      const ownedIds = (ownedSubs || []).map((s: any) => s.id);
      const missingIds = ttSubjectIds.filter((id: string) => !ownedIds.includes(id));
      if (missingIds.length > 0) {
        const { data: es } = await supabase
          .from("subjects").select("id, title, title_ar").in("id", missingIds);
        extraSubs = es || [];
      }
    }

    const allSubs = [...(ownedSubs || []), ...extraSubs];
    setSubjects(allSubs);
    const subjectIds = allSubs.map((s: any) => s.id);
    if (subjectIds.length > 0) {
      const { data } = await supabase
        .from("live_sessions")
        .select("*, subjects(title, title_ar)")
        .in("subject_id", subjectIds)
        .order("scheduled_at", { ascending: false, nullsFirst: false });
      setSessions(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, [user]);

  const handleCreate = async () => {
    if (!form.subject_id || !form.date || !form.time || !user) return;
    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
    const subjectSessions = sessions.filter(s => s.subject_id === form.subject_id);
    const sessionNum = subjectSessions.length + 1;

    const { error } = await supabase.from("live_sessions").insert({
      subject_id: form.subject_id,
      host_id: user.id,
      status: "scheduled",
      scheduled_at: scheduledAt,
      duration_minutes: form.duration,
      topic: form.topic,
      topic_ar: form.topic_ar,
      session_number: sessionNum,
      is_recorded: form.is_recorded,
    } as any);

    if (!error) {
      await supabase.from("subjects").update({ next_session_at: scheduledAt } as any).eq("id", form.subject_id);
      toast({ title: t("Class scheduled!", "تم جدولة الحصة!") });
      setShowCreate(false);
      setForm({ subject_id: "", topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true });
      fetchSessions();
    }
  };

  const openClassroom = (s: any) => {
    const sub = subjects.find(sub => sub.id === s.subject_id) || s.subjects;
    setClassroomSubject({
      id: s.subject_id,
      title: sub?.title || "Class",
      title_ar: sub?.title_ar || "",
    });
  };

  const upcoming = sessions.filter(s => s.status === "scheduled" || s.status === "active" || (s.scheduled_at && isFuture(new Date(s.scheduled_at))));
  const past = sessions.filter(s => s.status === "ended" || s.status === "completed" || (s.scheduled_at && isPast(new Date(s.scheduled_at)) && s.status !== "active"));

  // ── Classroom overlay ─────────────────────────────────────────
  if (classroomSubject) {
    return (
      <ClassroomView
        subject={classroomSubject}
        onLeave={() => setClassroomSubject(null)}
      />
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Live Classes", "الفصول المباشرة")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />{t("Schedule Class", "جدولة حصة")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("Schedule New Class", "جدولة حصة جديدة")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("Topic (English)", "الموضوع")}</Label><Input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></div>
              <div><Label>{t("Topic (Arabic)", "الموضوع (عربي)")}</Label><Input dir="rtl" value={form.topic_ar} onChange={e => setForm({ ...form, topic_ar: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Date", "التاريخ")}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><Label>{t("Time", "الوقت")}</Label><Input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
              </div>
              <div><Label>{t("Duration (min)", "المدة (دقائق)")}</Label><Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} /></div>
              <div className="flex items-center justify-between">
                <Label>{t("Record?", "تسجيل؟")}</Label>
                <Switch checked={form.is_recorded} onCheckedChange={v => setForm({ ...form, is_recorded: v })} />
              </div>
              <Button onClick={handleCreate} className="w-full">{t("Schedule", "جدولة")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Upcoming / Active */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />{t("Upcoming Classes", "الحصص القادمة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map(s => {
            const isActive = s.status === "active";
            return (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{(s as any).session_number || "?"}</Badge>
                    <p className="font-medium text-sm">{(s as any).topic || (s as any).subjects?.title || "Class"}</p>
                    {isActive && <Badge className="bg-green-500 text-white animate-pulse">🔴 LIVE</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(s as any).subjects?.title} •{" "}
                    {s.scheduled_at ? format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a") : new Date(s.created_at).toLocaleDateString()}
                    {(s as any).duration_minutes ? ` • ${(s as any).duration_minutes}m` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  className={isActive ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                  onClick={() => openClassroom(s)}
                >
                  <Video className="h-3 w-3 me-1" />
                  {isActive ? t("Join Live", "انضم الآن") : t("Start Class", "ابدأ الحصة")}
                </Button>
              </div>
            );
          })}
          {upcoming.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("No upcoming classes", "لا توجد حصص قادمة")}</p>
          )}
        </CardContent>
      </Card>

      {/* Past */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />{t("Past Classes", "الحصص السابقة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {past.slice(0, 20).map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">#{(s as any).session_number || "?"}</Badge>
                  <p className="font-medium text-sm">{(s as any).topic || (s as any).subjects?.title || "Class"}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(s as any).subjects?.title} •{" "}
                  {s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, yyyy") : ""} •{" "}
                  {s.total_participants || 0} {t("participants", "مشاركين")}
                </p>
              </div>
              <Badge variant="outline">{t("Ended", "انتهت")}</Badge>
            </div>
          ))}
          {past.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("No past classes", "لا توجد حصص سابقة")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherClasses;
