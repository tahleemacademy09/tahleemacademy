import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase, getSignedUrl, removeStorageFile } from "@/integrations/supabase/storageClient";
import { Search, Trash2, Play, Edit, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const RecordingManagement = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [recordings, setRecordings]       = useState<any[]>([]);
  const [subjects, setSubjects]           = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch]               = useState("");
  const [loading, setLoading]             = useState(true);
  const [editRec, setEditRec]             = useState<any>(null);
  const [editForm, setEditForm]           = useState({ teacher_name: "", thumbnail_url: "" });
  const [uploadDialog, setUploadDialog]   = useState(false);
  const [uploadBusy, setUploadBusy]       = useState(false);
  const [uploadForm, setUploadForm]       = useState({
    subject_id: "", session_id: "", teacher_name: "", file: null as File | null,
  });

  // ── Play state — generate a short-lived signed URL on demand ──────
  const [playingUrl, setPlayingUrl]   = useState<string | null>(null);
  const [playingBusy, setPlayingBusy] = useState<string | null>(null); // recording id

  const fetchData = async () => {
    const [{ data: subs }, { data: recs }] = await Promise.all([
      supabase.from("subjects").select("id, title, title_ar"),
      supabase.from("session_recordings")
        .select("*, subjects(title, title_ar)")
        .order("created_at", { ascending: false }),
    ]);
    setSubjects(subs || []);
    setRecordings(recs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = recordings.filter(r => {
    if (subjectFilter !== "all" && r.subject_id !== subjectFilter) return false;
    if (search && !(r.teacher_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ── Delete — removes storage file then DB row ─────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this recording?", "حذف هذا التسجيل؟"))) return;

    const rec = recordings.find(r => r.id === id);

    // Remove storage file (silently ignore if already gone)
    if (rec?.file_url) {
      await removeStorageFile(rec.file_url).catch(err =>
        console.warn("[RecordingManagement] storage remove failed:", err?.message)
      );
    }

    await supabase.from("session_recordings").delete().eq("id", id);
    setRecordings(prev => prev.filter(r => r.id !== id));
    toast({ title: t("Recording deleted", "تم حذف التسجيل") });
  };

  // ── Play — generate a 2-hour signed URL then open in new tab ──────
  const handlePlay = async (rec: any) => {
    if (!rec.file_url) {
      toast({ title: "No file attached to this recording", variant: "destructive" });
      return;
    }
    setPlayingBusy(rec.id);
    try {
      const url = await getSignedUrl(rec.file_url, 7200);
      if (!url) throw new Error("Could not generate playback URL — check storage configuration.");
      setPlayingUrl(url);
    } catch (err: any) {
      toast({ title: "Playback failed", description: err.message, variant: "destructive" });
    } finally {
      setPlayingBusy(null);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────
  const handleEdit = (rec: any) => {
    setEditRec(rec);
    setEditForm({ teacher_name: rec.teacher_name || "", thumbnail_url: rec.thumbnail_url || "" });
  };

  const saveEdit = async () => {
    if (!editRec) return;
    await supabase.from("session_recordings").update({
      teacher_name: editForm.teacher_name,
      thumbnail_url: editForm.thumbnail_url,
    }).eq("id", editRec.id);
    setRecordings(prev => prev.map(r => r.id === editRec.id ? { ...r, ...editForm } : r));
    setEditRec(null);
    toast({ title: t("Recording updated", "تم تحديث التسجيل") });
  };

  // ── Manual upload — always uses "recordings" bucket, stores PATH ──
  const handleUpload = async () => {
    if (!uploadForm.subject_id || !uploadForm.file) return;
    setUploadBusy(true);

    try {
      // Consistent path format: recordings/{subjectId}/{uuid}-{filename}
      const path = `recordings/${uploadForm.subject_id}/${crypto.randomUUID()}-${uploadForm.file.name}`;

      const { error: uploadErr } = await storageSupabase.storage
        .from("recordings")
        .upload(path, uploadForm.file, { upsert: false });

      if (uploadErr) {
        toast({ title: t("Upload failed", "فشل الرفع"), description: uploadErr.message, variant: "destructive" });
        return;
      }

      // Resolve or create a session ID for the recording row
      let sessionId = uploadForm.session_id || null;
      if (!sessionId) {
        const { data: sess } = await supabase
          .from("live_sessions")
          .insert({
            subject_id: uploadForm.subject_id,
            host_id: (await supabase.auth.getUser()).data.user?.id || "",
            status: "ended",
          })
          .select("id")
          .single();
        sessionId = sess?.id || null;
      }

      // Insert DB row — store the STORAGE PATH, NOT a public URL
      await supabase.from("session_recordings").insert({
        session_id:      sessionId,
        subject_id:      uploadForm.subject_id,
        file_url:        path,                      // ← storage path, not full URL
        teacher_name:    uploadForm.teacher_name || "Manual upload",
        file_size:       uploadForm.file.size,
        duration_seconds: 0,                        // admin can edit after
      });

      setUploadDialog(false);
      setUploadForm({ subject_id: "", session_id: "", teacher_name: "", file: null });
      fetchData();
      toast({ title: t("Recording uploaded", "تم رفع التسجيل") });
    } finally {
      setUploadBusy(false);
    }
  };

  // ── Download — generates a signed URL then triggers download ──────
  const handleDownload = async (rec: any) => {
    if (!rec.file_url) return;
    const url = await getSignedUrl(rec.file_url, 3600);
    if (!url) { toast({ title: "Could not generate download link", variant: "destructive" }); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-${rec.id}`;
    a.click();
  };

  // ── CSV export ────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Title", "Subject", "Duration (min)", "Size (MB)", "Date"].join(",")];
    filtered.forEach(r => {
      rows.push([
        r.teacher_name || "Recording",
        (r as any).subjects?.title || "",
        r.duration_seconds ? Math.round(r.duration_seconds / 60).toString() : "",
        r.file_size ? (r.file_size / 1048576).toFixed(1) : "",
        new Date(r.created_at).toLocaleDateString(),
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "recordings.csv";
    a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Recording Management", "إدارة التسجيلات")}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setUploadDialog(true)}>
            <Upload className="h-4 w-4 me-2" />{t("Upload", "رفع")}
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 me-2" />{t("Export CSV", "تصدير CSV")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("All Subjects", "كل المواد")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("Search by title...", "ابحث بالعنوان...")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
      </div>

      {/* Inline player dialog */}
      <Dialog open={!!playingUrl} onOpenChange={v => !v && setPlayingUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader>
            <DialogTitle>{t("Recording Playback", "تشغيل التسجيل")}</DialogTitle>
          </DialogHeader>
          {playingUrl && (
            <video
              src={playingUrl}
              controls
              autoPlay
              playsInline
              style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: "70vh" }}
              onError={() => toast({ title: "Video failed to load — trying audio fallback" })}
            >
              {/* Audio fallback */}
              <audio src={playingUrl} controls style={{ width: "100%" }} />
            </video>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title", "العنوان")}</TableHead>
                <TableHead>{t("Subject", "المادة")}</TableHead>
                <TableHead>{t("Duration", "المدة")}</TableHead>
                <TableHead>{t("Size", "الحجم")}</TableHead>
                <TableHead>{t("Date", "التاريخ")}</TableHead>
                <TableHead>{t("Actions", "الإجراءات")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.teacher_name || t("Recording", "تسجيل")}</TableCell>
                  <TableCell>{(r as any).subjects?.title || "-"}</TableCell>
                  <TableCell>{r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : "-"}</TableCell>
                  <TableCell>{r.file_size ? `${(r.file_size / 1048576).toFixed(1)} MB` : "-"}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.file_url && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePlay(r)}
                          disabled={playingBusy === r.id}
                          title={t("Play", "تشغيل")}
                        >
                          {playingBusy === r.id
                            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            : <Play className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(r)} title={t("Edit", "تعديل")}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      {r.file_url && (
                        <Button size="icon" variant="ghost" onClick={() => handleDownload(r)} title={t("Download", "تحميل")}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)} title={t("Delete", "حذف")}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t("No recordings", "لا توجد تسجيلات")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editRec} onOpenChange={() => setEditRec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording", "تعديل التسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Title / Teacher Name", "العنوان / اسم المعلم")}</Label>
              <Input
                value={editForm.teacher_name}
                onChange={e => setEditForm({ ...editForm, teacher_name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Thumbnail URL", "رابط الصورة المصغرة")}</Label>
              <Input
                value={editForm.thumbnail_url}
                onChange={e => setEditForm({ ...editForm, thumbnail_url: e.target.value })}
              />
            </div>
            <Button onClick={saveEdit} className="w-full">{t("Save", "حفظ")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Upload Recording", "رفع تسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Subject", "المادة")} *</Label>
              <Select value={uploadForm.subject_id} onValueChange={v => setUploadForm({ ...uploadForm, subject_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("Select subject", "اختر المادة")} /></SelectTrigger>
                <SelectContent>
                  {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Title / Teacher Name", "العنوان / اسم المعلم")}</Label>
              <Input
                value={uploadForm.teacher_name}
                onChange={e => setUploadForm({ ...uploadForm, teacher_name: e.target.value })}
                placeholder={t("e.g. Arabic Writing — Week 3", "مثال: الكتابة العربية — الأسبوع 3")}
              />
            </div>
            <div>
              <Label>{t("Recording File", "ملف التسجيل")} *</Label>
              <Input
                type="file"
                accept="audio/*,video/*"
                onChange={e => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("Accepted: audio and video files (webm, mp4, mp3, ogg, wav)", "يُقبل: ملفات الصوت والفيديو")}
              </p>
            </div>
            <Button
              onClick={handleUpload}
              className="w-full"
              disabled={!uploadForm.subject_id || !uploadForm.file || uploadBusy}
            >
              {uploadBusy
                ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent me-2" />{t("Uploading…", "جاري الرفع…")}</>
                : t("Upload", "رفع")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordingManagement;
