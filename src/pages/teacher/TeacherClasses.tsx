import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Video, Plus, Users as UsersIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const TeacherClasses = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subject_id: "", title: "", description: "" });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data } = await supabase.from("live_sessions").select("*, subjects(title, title_ar)").in("subject_id", subjectIds).order("created_at", { ascending: false });
        setSessions(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleCreate = async () => {
    if (!form.subject_id || !user) return;
    const { error } = await supabase.from("live_sessions").insert({
      subject_id: form.subject_id,
      host_id: user.id,
      status: "scheduled",
    });
    if (!error) {
      toast({ title: t("Class scheduled!", "تم جدولة الحصة!") });
      setShowCreate(false);
      // Refresh
      const { data } = await supabase.from("live_sessions").select("*, subjects(title, title_ar)").in("subject_id", subjects.map(s => s.id)).order("created_at", { ascending: false });
      setSessions(data || []);
    }
  };

  const upcoming = sessions.filter(s => s.status === "scheduled" || s.status === "active");
  const past = sessions.filter(s => s.status === "ended" || s.status === "completed");

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Live Classes", "الفصول المباشرة")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 me-2" /> {t("Schedule Class", "جدولة حصة")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Schedule New Class", "جدولة حصة جديدة")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">{t("Create", "إنشاء")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("Upcoming Classes", "الحصص القادمة")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">{(s as any).subjects?.title || "Class"}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                <Button size="sm" onClick={() => navigate(`/student/subjects/${s.subject_id}`)}>{t("Join", "انضم")}</Button>
              </div>
            </div>
          ))}
          {upcoming.length === 0 && <p className="text-muted-foreground text-sm">{t("No upcoming classes", "لا توجد حصص قادمة")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("Past Classes", "الحصص السابقة")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {past.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">{(s as any).subjects?.title || "Class"}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()} • {s.total_participants || 0} {t("participants", "مشاركين")}</p>
              </div>
              <Badge variant="outline">{t("Ended", "انتهت")}</Badge>
            </div>
          ))}
          {past.length === 0 && <p className="text-muted-foreground text-sm">{t("No past classes", "لا توجد حصص سابقة")}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherClasses;
