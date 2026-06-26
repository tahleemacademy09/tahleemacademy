/*
  src/pages/teacher/TeacherAnnouncements.tsx — FIXED
  ─────────────────────────────────────────────────────
  Previously wrote to `teacher_announcements` (a dead table with no
  student-facing query, no notification trigger). Now writes to
  `subject_announcements` per-subject so:
    1. Students see it immediately in their learning hub
    2. The DB trigger fires → notify-content-upload → push + Telegram

  Changes:
  • "Target" field is now a required subject selector (must pick a subject)
  • Optional "All my subjects" broadcasts one announcement per subject
  • Reads back from subject_announcements grouped by subject
  • Delete works on subject_announcements
*/

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Trash2, Megaphone, Pin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TeacherAnnouncements = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [subjects, setSubjects]           = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [posting, setPosting]             = useState(false);
  const [showCreate, setShowCreate]       = useState(false);
  const [form, setForm] = useState({
    title:      "",
    content:    "",
    subject_id: "all",   // "all" = broadcast to every subject
    is_pinned:  false,
  });

  // ── Fetch teacher's subjects + all their subject_announcements ────────────
  const fetchData = async () => {
    if (!user) return;

    // Subjects this teacher owns OR is assigned via timetable
    const { data: owned } = await supabase
      .from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
    const { data: ttSlots } = await supabase
      .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
    const ttIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];
    let extra: any[] = [];
    if (ttIds.length > 0) {
      const ownedIds = (owned || []).map((s: any) => s.id);
      const missing  = ttIds.filter((id: string) => !ownedIds.includes(id));
      if (missing.length > 0) {
        const { data: es } = await supabase
          .from("subjects").select("id, title, title_ar").in("id", missing);
        extra = es || [];
      }
    }
    const allSubs = [...(owned || []), ...extra];
    setSubjects(allSubs);

    if (allSubs.length === 0) { setLoading(false); return; }

    // Fetch subject_announcements for all these subjects
    const subIds = allSubs.map((s: any) => s.id);
    const { data: anns } = await supabase
      .from("subject_announcements")
      .select("*")
      .in("subject_id", subIds)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    // Attach subject title for display
    const subMap = Object.fromEntries(allSubs.map((s: any) => [s.id, s]));
    setAnnouncements(
      (anns || []).map((a: any) => ({ ...a, subjectTitle: subMap[a.subject_id]?.title ?? "—" }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  // ── Post ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim() || !user) return;
    setPosting(true);
    try {
      const targets = form.subject_id === "all"
        ? subjects.map((s: any) => s.id)
        : [form.subject_id];

      if (targets.length === 0) {
        toast({ title: t("No subjects found", "لا توجد مواد"), variant: "destructive" });
        return;
      }

      // Insert one row per subject (trigger fires per row → one notif set per subject)
      const rows = targets.map((sid: string) => ({
        subject_id: sid,
        title:      form.title.trim(),
        content:    form.content.trim(),
        is_pinned:  form.is_pinned,
        created_by: user.id,
      }));

      const { error } = await supabase.from("subject_announcements").insert(rows);
      if (error) throw error;

      toast({ title: t("Announcement posted!", "تم نشر الإعلان!") });
      setShowCreate(false);
      setForm({ title: "", content: "", subject_id: "all", is_pinned: false });
      fetchData();
    } catch (e: any) {
      toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await supabase.from("subject_announcements").delete().eq("id", id);
    setAnnouncements(prev => prev.filter((a: any) => a.id !== id));
    toast({ title: t("Deleted", "تم الحذف") });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Announcements", "الإعلانات")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button disabled={subjects.length === 0}>
              <Plus className="h-4 w-4 me-2" /> {t("New Announcement", "إعلان جديد")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Post Announcement", "نشر إعلان")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Title */}
              <div>
                <Label>{t("Title", "العنوان")}</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder={t("Announcement title…", "عنوان الإعلان…")}
                />
              </div>

              {/* Content */}
              <div>
                <Label>{t("Message", "الرسالة")}</Label>
                <Textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={4}
                  placeholder={t("Write your announcement…", "اكتب إعلانك هنا…")}
                />
              </div>

              {/* Subject target */}
              <div>
                <Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All My Subjects", "كل موادي")}</SelectItem>
                    {subjects.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {language === "ar" ? (s.title_ar || s.title) : s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pin */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pin"
                  checked={form.is_pinned}
                  onChange={e => setForm({ ...form, is_pinned: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="pin">{t("Pin this announcement", "تثبيت الإعلان")}</Label>
              </div>

              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={!form.title.trim() || !form.content.trim() || posting}
              >
                {posting
                  ? t("Posting…", "جاري النشر…")
                  : t("Post & Notify Students", "نشر وإشعار الطلاب")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {subjects.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>{t("No subjects assigned to you yet.", "لا توجد مواد مسندة إليك بعد.")}</p>
        </CardContent></Card>
      )}

      {/* Announcement list */}
      <div className="space-y-3">
        {announcements.map((a: any) => (
          <Card key={a.id} className={a.is_pinned ? "border-primary/40" : ""}>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                  <Megaphone className="h-4 w-4 text-primary shrink-0" />
                  <p className="font-semibold text-sm">{a.title}</p>
                  <Badge variant="outline" className="text-xs">{a.subjectTitle}</Badge>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{a.content}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-destructive shrink-0"
                onClick={() => handleDelete(a.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {announcements.length === 0 && subjects.length > 0 && (
          <p className="text-muted-foreground text-center py-8">
            {t("No announcements yet. Post one above!", "لا توجد إعلانات بعد. انشر إعلاناً الآن!")}
          </p>
        )}
      </div>
    </div>
  );
};

export default TeacherAnnouncements;
