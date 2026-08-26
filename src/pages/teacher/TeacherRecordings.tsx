import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { Search, Trash2, Play, Edit, Upload, Mic, Headphones } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GOLD = "#c9a84c";

const TeacherRecordings = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editRec, setEditRec] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadForm, setUploadForm] = useState({ subject_id: "", teacher_name: "", file: null as File | null });

  const fetchData = async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
    setSubjects(subs || []);
    const subjectIds = (subs || []).map(s => s.id);
    if (subjectIds.length > 0) {
      const { data } = await supabase.from("session_recordings").select("*, subjects(title, title_ar)").in("subject_id", subjectIds).order("created_at", { ascending: false });
      setRecordings(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const filtered = recordings.filter(r => {
    if (subjectFilter !== "all" && r.subject_id !== subjectFilter) return false;
    if (search && !(r.teacher_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this recording?", "حذف هذا التسجيل؟"))) return;
    await supabase.from("session_recordings").delete().eq("id", id);
    setRecordings(prev => prev.filter(r => r.id !== id));
    toast({ title: t("Recording deleted", "تم حذف التسجيل") });
  };

  const handleEditSave = async () => {
    if (!editRec) return;
    await supabase.from("session_recordings").update({ teacher_name: editTitle }).eq("id", editRec.id);
    setRecordings(prev => prev.map(r => r.id === editRec.id ? { ...r, teacher_name: editTitle } : r));
    setEditRec(null);
    toast({ title: t("Updated", "تم التحديث") });
  };

  const handleUpload = async () => {
    if (!uploadForm.subject_id || !uploadForm.file || !user) return;
    const path = `recordings/${uploadForm.subject_id}/${crypto.randomUUID()}-${uploadForm.file.name}`;
    const { error: uploadErr } = await storageSupabase.storage.from("subject-files").upload(path, uploadForm.file);
    if (uploadErr) { toast({ title: t("Upload failed", "فشل الرفع"), variant: "destructive" }); return; }
    const { data: { publicUrl } } = storageSupabase.storage.from("subject-files").getPublicUrl(path);

    const { data: sess } = await supabase.from("live_sessions").insert({
      subject_id: uploadForm.subject_id, host_id: user.id, status: "ended",
    }).select("id").single();

    await supabase.from("session_recordings").insert({
      session_id: sess?.id || "", subject_id: uploadForm.subject_id,
      file_url: publicUrl, teacher_name: uploadForm.teacher_name, file_size: uploadForm.file.size,
    });

    setUploadDialog(false);
    setUploadForm({ subject_id: "", teacher_name: "", file: null });
    fetchData();
    toast({ title: t("Recording uploaded", "تم رفع التسجيل") });
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <Headphones className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{t("Recordings", "التسجيلات")}</h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Manage your class recordings", "إدارة تسجيلات صفوفك")}</p>
              </div>
            </div>
            <button onClick={() => setUploadDialog(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 sm:gap-2 sm:px-6 sm:text-sm"
              style={{ background: GOLD, color: "#064E3B" }}>
              <Upload className="h-4 w-4" />{t("Upload", "رفع")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="h-11 w-48 rounded-lg"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
              {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder={t("Search...", "ابحث...")} value={search} onChange={e => setSearch(e.target.value)} className="h-11 rounded-lg ps-9" />
          </div>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(r => (
            <Card key={r.id} className="overflow-hidden rounded-2xl border-slate-200 shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                    <Mic className="h-4 w-4 text-emerald-700" />
                  </div>
                  <p className="truncate text-sm font-bold text-slate-800">{r.teacher_name || t("Recording", "تسجيل")}</p>
                </div>
                <p className="text-xs text-slate-500">{(r as any).subjects?.title || ""}</p>
                <p className="text-xs text-slate-400">
                  {r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : ""} • {new Date(r.created_at).toLocaleDateString()}
                </p>
                <div className="flex gap-1.5 pt-1">
                  {r.file_url && (
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => window.open(r.file_url, "_blank")}>
                      <Play className="me-1 h-3 w-3" /> {t("Play", "تشغيل")}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setEditRec(r); setEditTitle(r.teacher_name || ""); }}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center shadow-sm">
              <Headphones className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">{t("No recordings found", "لم يتم العثور على تسجيلات")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editRec} onOpenChange={() => setEditRec(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{t("Edit Recording Title", "تعديل عنوان التسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Title", "العنوان")}</Label><Input className="h-11 rounded-lg" value={editTitle} onChange={e => setEditTitle(e.target.value)} /></div>
            <button onClick={handleEditSave} className="w-full rounded-xl py-3 text-sm font-black text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95" style={{ background: "#064E3B" }}>{t("Save", "حفظ")}</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{t("Upload Recording", "رفع تسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Subject", "المادة")}</Label>
              <Select value={uploadForm.subject_id} onValueChange={v => setUploadForm({ ...uploadForm, subject_id: v })}>
                <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("Title", "العنوان")}</Label><Input className="h-11 rounded-lg" value={uploadForm.teacher_name} onChange={e => setUploadForm({ ...uploadForm, teacher_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-sm font-bold text-slate-700">{t("File", "الملف")}</Label><Input type="file" accept="audio/*,video/*" className="rounded-lg" onChange={e => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })} /></div>
            <button
              onClick={handleUpload}
              disabled={!uploadForm.subject_id || !uploadForm.file}
              className={cn(
                "flex w-full items-center justify-center rounded-xl py-3 text-sm font-black shadow-lg transition-all active:scale-95",
                (!uploadForm.subject_id || !uploadForm.file) ? "cursor-not-allowed bg-slate-200 text-slate-400" : "cursor-pointer text-white hover:-translate-y-0.5 hover:shadow-xl"
              )}
              style={{ background: (!uploadForm.subject_id || !uploadForm.file) ? undefined : "#064E3B" }}
            >
              {t("Upload", "رفع")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherRecordings;
