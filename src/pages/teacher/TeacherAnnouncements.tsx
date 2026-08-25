/*
  src/pages/teacher/TeacherAnnouncements.tsx — FIXED + modernized
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

  Visual pass: replaced the plain default header/Card/Button look with the
  app's emerald/gold design system — responsive header (no more button
  overflowing off-screen on mobile), icon badge, rounded cards with soft
  shadows, and a proper empty state.
*/

import { useEffect, useState } from "react";
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
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-premium sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Megaphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">{t("Announcements", "الإعلانات")}</h1>
              <p className="text-xs text-muted-foreground">{t("Post updates to your subjects", "انشر تحديثات لموادك")}</p>
            </div>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button disabled={subjects.length === 0} className="w-full gap-2 rounded-xl shadow-sm sm:w-auto">
                <Plus className="h-4 w-4" /> {t("New Announcement", "إعلان جديد")}
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>{t("Post Announcement", "نشر إعلان")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <Label>{t("Title", "العنوان")}</Label>
                  <Input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder={t("Announcement title…", "عنوان الإعلان…")}
                  />
                </div>

                {/* Content */}
                <div className="space-y-1.5">
                  <Label>{t("Message", "الرسالة")}</Label>
                  <Textarea
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    rows={4}
                    placeholder={t("Write your announcement…", "اكتب إعلانك هنا…")}
                  />
                </div>

                {/* Subject target */}
                <div className="space-y-1.5">
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
                <label htmlFor="pin" className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                  <input
                    type="checkbox"
                    id="pin"
                    checked={form.is_pinned}
                    onChange={e => setForm({ ...form, is_pinned: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="pin" className="cursor-pointer">{t("Pin this announcement", "تثبيت الإعلان")}</Label>
                </label>

                <Button
                  className="w-full rounded-xl"
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
          <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground shadow-sm">
            <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{t("No subjects assigned to you yet.", "لا توجد مواد مسندة إليك بعد.")}</p>
          </div>
        )}

        {/* Announcement list */}
        <div className="space-y-3">
          {announcements.map((a: any) => (
            <div
              key={a.id}
              className={
                "flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-premium " +
                (a.is_pinned ? "border-secondary/50 bg-secondary/5" : "border-border")
              }
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {a.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-secondary" />}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Megaphone className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <Badge variant="outline" className="rounded-full text-xs font-medium">{a.subjectTitle}</Badge>
                </div>
                <p className="whitespace-pre-line pl-9 text-sm text-muted-foreground">{a.content}</p>
                <p className="pl-9 text-xs text-muted-foreground/70">
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
              <Button
                size="icon" variant="ghost"
                className="h-8 w-8 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDelete(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {announcements.length === 0 && subjects.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center shadow-sm">
              <Megaphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">
                {t("No announcements yet. Post one above!", "لا توجد إعلانات بعد. انشر إعلاناً الآن!")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherAnnouncements;
