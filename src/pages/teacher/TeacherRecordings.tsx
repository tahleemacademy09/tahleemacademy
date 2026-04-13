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
import { Search, Trash2, Play, Edit, Upload, Mic, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Recordings", "التسجيلات")}</h1>
        <Button onClick={() => setUploadDialog(true)}><Upload className="h-4 w-4 me-2" />{t("Upload", "رفع")}</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search...", "ابحث...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(r => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm truncate">{r.teacher_name || t("Recording", "تسجيل")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{(r as any).subjects?.title || ""}</p>
              <p className="text-xs text-muted-foreground">
                {r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : ""} • {new Date(r.created_at).toLocaleDateString()}
              </p>
              <div className="flex gap-1">
                {r.file_url && <Button size="sm" variant="outline" className="flex-1" onClick={() => window.open(r.file_url, "_blank")}><Play className="h-3 w-3 me-1" /> {t("Play", "تشغيل")}</Button>}
                <Button size="icon" variant="ghost" onClick={() => { setEditRec(r); setEditTitle(r.teacher_name || ""); }}><Edit className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No recordings found", "لم يتم العثور على تسجيلات")}</p>}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editRec} onOpenChange={() => setEditRec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording Title", "تعديل عنوان التسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} /></div>
            <Button onClick={handleEditSave} className="w-full">{t("Save", "حفظ")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Upload Recording", "رفع تسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Subject", "المادة")}</Label>
              <Select value={uploadForm.subject_id} onValueChange={v => setUploadForm({ ...uploadForm, subject_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("Title", "العنوان")}</Label><Input value={uploadForm.teacher_name} onChange={e => setUploadForm({ ...uploadForm, teacher_name: e.target.value })} /></div>
            <div><Label>{t("File", "الملف")}</Label><Input type="file" accept="audio/*,video/*" onChange={e => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })} /></div>
            <Button onClick={handleUpload} className="w-full" disabled={!uploadForm.subject_id || !uploadForm.file}>{t("Upload", "رفع")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherRecordings;
