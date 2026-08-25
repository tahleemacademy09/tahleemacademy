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

  Visual pass: rebuilt on the app's ESTABLISHED modern pattern (same as
  ExamEditor.tsx) — sticky dark-green gradient header with gold action
  button, rounded-2xl cards with gradient CardHeaders, instead of the
  old plain default header/Card/Button that overflowed on mobile.
*/

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
import { Plus, Trash2, Megaphone, Pin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GOLD = "#c9a84c";

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header — same pattern as ExamEditor.tsx ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <Megaphone className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">
                  {t("Announcements", "الإعلانات")}
                </h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">
                  {t("Post updates to your subjects", "انشر تحديثات لموادك")}
                </p>
              </div>
            </div>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <button
                  disabled={subjects.length === 0}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all active:scale-95 sm:gap-2 sm:px-6 sm:text-sm",
                    subjects.length === 0 ? "cursor-not-allowed bg-white/20 text-white/60" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl"
                  )}
                  style={{ background: subjects.length === 0 ? undefined : GOLD, color: subjects.length === 0 ? undefined : "#064E3B" }}
                >
                  <Plus className="h-4 w-4" /> {t("New Announcement", "إعلان جديد")}
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>{t("Post Announcement", "نشر إعلان")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">{t("Title", "العنوان")}</Label>
                    <Input
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder={t("Announcement title…", "عنوان الإعلان…")}
                      className="h-11 rounded-lg"
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">{t("Message", "الرسالة")}</Label>
                    <Textarea
                      value={form.content}
                      onChange={e => setForm({ ...form, content: e.target.value })}
                      rows={4}
                      placeholder={t("Write your announcement…", "اكتب إعلانك هنا…")}
                      className="rounded-lg"
                    />
                  </div>

                  {/* Subject target */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-slate-700">{t("Subject", "المادة")}</Label>
                    <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
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
                  <label htmlFor="pin" className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-2.5 transition-colors hover:border-slate-300">
                    <input
                      type="checkbox"
                      id="pin"
                      checked={form.is_pinned}
                      onChange={e => setForm({ ...form, is_pinned: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="pin" className="cursor-pointer text-sm font-bold text-slate-700">{t("Pin this announcement", "تثبيت الإعلان")}</Label>
                  </label>

                  <button
                    onClick={handleCreate}
                    disabled={!form.title.trim() || !form.content.trim() || posting}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl border-0 py-3 text-sm font-black shadow-lg transition-all active:scale-95",
                      (!form.title.trim() || !form.content.trim() || posting) ? "cursor-not-allowed bg-slate-200 text-slate-400" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl"
                    )}
                    style={{ background: (!form.title.trim() || !form.content.trim() || posting) ? undefined : "#064E3B", color: (!form.title.trim() || !form.content.trim() || posting) ? undefined : "#fff" }}
                  >
                    {posting
                      ? t("Posting…", "جاري النشر…")
                      : t("Post & Notify Students", "نشر وإشعار الطلاب")}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-4xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">

        {subjects.length === 0 && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="py-12 text-center text-slate-400">
              <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">{t("No subjects assigned to you yet.", "لا توجد مواد مسندة إليك بعد.")}</p>
            </CardContent>
          </Card>
        )}

        {/* Announcement list */}
        {(announcements.length > 0 || subjects.length > 0) && (
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-6 sm:py-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Megaphone className="h-4 w-4 text-emerald-700 sm:h-5 sm:w-5" />
                {t("All Announcements", "جميع الإعلانات")}
                {announcements.length > 0 && (
                  <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{announcements.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-6">
              {announcements.map((a: any) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border-2 p-3.5 transition-colors sm:p-4",
                    a.is_pinned ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                      <p className="text-sm font-bold text-slate-800">{a.title}</p>
                      <Badge variant="outline" className="rounded-full text-xs font-medium">{a.subjectTitle}</Badge>
                    </div>
                    <p className="whitespace-pre-line text-sm text-slate-500">{a.content}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 shrink-0 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => handleDelete(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {announcements.length === 0 && subjects.length > 0 && (
                <div className="py-10 text-center text-slate-400">
                  <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm">
                    {t("No announcements yet. Post one above!", "لا توجد إعلانات بعد. انشر إعلاناً الآن!")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TeacherAnnouncements;
