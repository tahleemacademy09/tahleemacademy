import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase, getSignedUrl, removeStorageFile } from "@/integrations/supabase/storageClient";
import {
  Search, Trash2, Play, Edit, Download, Upload,
  Video, Clock, HardDrive, Calendar, Film,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── brand tokens — matches LiveClassManagement / AcademicCalendar ── */
const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');
  @keyframes rm-up   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes rm-spin { to{transform:rotate(360deg)} }
  .rm-root  { background:#f0ede8; min-height:100vh; font-family:'DM Sans',sans-serif; }
  .rm-card  { background:#fff; border-radius:16px; box-shadow:0 1px 8px rgba(0,0,0,.07); transition:box-shadow .2s; animation:rm-up .25s ease; }
  .rm-card:hover{ box-shadow:0 4px 20px rgba(0,0,0,.11); }
  .rm-btn   { display:inline-flex; align-items:center; gap:6px; border:none; border-radius:10px; padding:9px 16px; font-size:13px; font-weight:800; cursor:pointer; transition:all .15s; font-family:'DM Sans',sans-serif; }
  .rm-btn:active{ transform:scale(.97); }
  .rm-icon-btn{ display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:9px; border:none; background:#f3f4f6; color:#4b5563; cursor:pointer; transition:all .15s; flex-shrink:0; }
  .rm-icon-btn:hover{ background:#e5e7eb; }
  .rm-icon-btn:disabled{ opacity:.5; cursor:default; }
  .rm-section{ font-size:10px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:#9ca3af; margin-bottom:10px; }
  .rm-input{ width:100%; border:1.5px solid #e5e7eb; border-radius:12px; padding:10px 14px 10px 38px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; outline:none; transition:border-color .15s; }
  .rm-input:focus{ border-color:${GOLD}; }
  .rm-select{ border:1.5px solid #e5e7eb !important; border-radius:12px !important; font-size:13px !important; font-family:'DM Sans',sans-serif !important; background:#fff !important; }
  ::-webkit-scrollbar{ width:3px; height:3px; }
  ::-webkit-scrollbar-thumb{ background:#d1d5db; border-radius:99px; }
`;

const VisibilityPill = ({ v }: { v: string }) => {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    private: { bg: "#F3E8FF", color: "#7C3AED", label: "🔒 Private" },
    general: { bg: "#eff6ff", color: "#3b82f6", label: "👥 Class" },
    all:     { bg: "#f0fff4", color: "#22c55e", label: "🌐 All" },
  };
  const c = cfg[v] || cfg.all;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99, background: c.bg, fontSize: 10, fontWeight: 800, color: c.color, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
};

const VisibilityPicker = ({ value, onChange, labels }: { value: string; onChange: (v: any) => void; labels?: Record<string,string> }) => {
  const opts = ([
    { value: "all",     label: labels?.all     || "All",          color: "#22c55e", bg: "#f0fff4" },
    { value: "general", label: labels?.general || "Class Only",   color: "#3b82f6", bg: "#eff6ff" },
    { value: "private", label: labels?.private || "Private Only", color: "#7C3AED", bg: "#F3E8FF" },
  ] as const);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {opts.map(opt => {
        const sel = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            style={{ flex: 1, padding: "9px 4px", borderRadius: 10, cursor: "pointer", border: `2px solid ${sel ? opt.color : "#e5e7eb"}`, background: sel ? opt.bg : "#f9fafb", fontSize: 11, fontWeight: 800, color: sel ? opt.color : "#6b7280", transition: "all .15s" }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

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
    visibility: "all" as "all" | "general" | "private",
  });
  const [editVisibility, setEditVisibility] = useState<"all"|"general"|"private">("all");

  // ── Play state — generate a short-lived signed URL on demand ──────
  const [playingUrl, setPlayingUrl]   = useState<string | null>(null);
  const [playingBusy, setPlayingBusy] = useState<string | null>(null); // recording id

  const fetchData = async () => {
    const [{ data: subs }, { data: recs }] = await Promise.all([
      supabase.from("subjects").select("id, title, title_ar"),
      // Select all recordings; LEFT JOIN subjects so orphaned rows (null subject_id) still appear.
      // Also join live_sessions to recover subject info for session-linked recordings.
      supabase.from("session_recordings")
        .select("*, subjects(title, title_ar), live_sessions(subject_id, subjects(title, title_ar))")
        .order("created_at", { ascending: false }),
    ]);
    setSubjects(subs || []);

    // Normalise: if subject_id is null but we have session data, backfill from session
    const normalised = (recs || []).map((r: any) => {
      if (!r.subject_id && r.live_sessions?.subject_id) {
        return {
          ...r,
          subject_id: r.live_sessions.subject_id,
          subjects:   r.live_sessions.subjects ?? r.subjects,
        };
      }
      return r;
    });
    setRecordings(normalised);
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
    setEditVisibility((rec.visibility as any) || "all");
  };

  const saveEdit = async () => {
    if (!editRec) return;
    await supabase.from("session_recordings").update({
      teacher_name: editForm.teacher_name,
      thumbnail_url: editForm.thumbnail_url,
      visibility: editVisibility,
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
        file_url:        path,
        teacher_name:    uploadForm.teacher_name || "Manual upload",
        file_size:       uploadForm.file.size,
        duration_seconds: 0,
        visibility:      uploadForm.visibility,
      });

      setUploadDialog(false);
      setUploadForm({ subject_id: "", session_id: "", teacher_name: "", file: null, visibility: "all" });
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

  const totalSizeMB = recordings.reduce((sum, r) => sum + (r.file_size || 0), 0) / 1048576;
  const totalMinutes = recordings.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / 60;

  if (loading) return (
    <div className="rm-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ width: 34, height: 34, borderRadius: "50%", border: `3px solid ${G}22`, borderTopColor: G, animation: "rm-spin .7s linear infinite" }} />
    </div>
  );

  return (
    <div className="rm-root">
      <style>{CSS}</style>

      {/* header */}
      <div style={{ background: `linear-gradient(160deg,${G},${GM})`, padding: "40px 20px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c9a84c' fill-opacity='0.05'%3E%3Cpath d='M0 0h26v26H0V0zm26 26h26v26H26V26z'/%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Admin</p>
              <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>{t("Recording Management", "إدارة التسجيلات")}</h1>
              <p style={{ fontSize: 12, color: GOLD, marginTop: 4, fontWeight: 600 }}>
                {recordings.length} {t("recordings", "تسجيل")} · {(totalMinutes / 60).toFixed(1)}h {t("total", "إجمالي")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => setUploadDialog(true)} className="rm-btn" style={{ background: GOLD, color: G }}>
                <Upload style={{ width: 14, height: 14 }} /> {t("Upload", "رفع")}
              </button>
              <button onClick={exportCSV} className="rm-btn" style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)" }}>
                <Download style={{ width: 14, height: 14 }} /> CSV
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { label: t("Recordings", "التسجيلات"), v: recordings.length, c: GOLD, icon: <Film style={{ width: 14, height: 14 }} /> },
              { label: t("Duration", "المدة"),      v: `${Math.round(totalMinutes)}m`, c: "#60a5fa", icon: <Clock style={{ width: 14, height: 14 }} /> },
              { label: t("Storage", "التخزين"),     v: `${totalSizeMB.toFixed(0)}MB`, c: "rgba(255,255,255,.7)", icon: <HardDrive style={{ width: 14, height: 14 }} /> },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "11px 8px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", color: s.c, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* filters */}
      <div style={{ padding: "18px 16px 0", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#9ca3af" }} />
            <input
              className="rm-input"
              placeholder={t("Search by title...", "ابحث بالعنوان...")}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="rm-select" style={{ width: 180, height: 40 }}>
              <SelectValue placeholder={t("All Subjects", "كل المواد")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
              {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* recordings list */}
      <div style={{ padding: "16px 16px 52px", maxWidth: 900, margin: "0 auto" }}>
        <p className="rm-section">{filtered.length} {t("Result(s)", "نتيجة")}</p>

        {filtered.length === 0 ? (
          <div className="rm-card" style={{ padding: 48, textAlign: "center", color: "#9ca3af" }}>
            <Film style={{ width: 34, height: 34, margin: "0 auto 10px", opacity: .5 }} />
            <p style={{ fontSize: 13, fontWeight: 600 }}>{t("No recordings", "لا توجد تسجيلات")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(r => (
              <div key={r.id} className="rm-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${G}14`, color: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Video style={{ width: 19, height: 19 }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                      {r.teacher_name || t("Recording", "تسجيل")}
                    </p>
                    <VisibilityPill v={r.visibility || "all"} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#6b7280", fontWeight: 600 }}>
                    <span style={{ color: G, fontWeight: 700 }}>{(r as any).subjects?.title || t("No subject", "بدون مادة")}</span>
                    {r.duration_seconds ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Clock style={{ width: 11, height: 11 }} />{Math.round(r.duration_seconds / 60)}m</span> : null}
                    {r.file_size ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><HardDrive style={{ width: 11, height: 11 }} />{(r.file_size / 1048576).toFixed(1)}MB</span> : null}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Calendar style={{ width: 11, height: 11 }} />{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {r.file_url && (
                    <button className="rm-icon-btn" onClick={() => handlePlay(r)} disabled={playingBusy === r.id} title={t("Play", "تشغيل")}>
                      {playingBusy === r.id
                        ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "rm-spin .7s linear infinite" }} />
                        : <Play style={{ width: 14, height: 14 }} />}
                    </button>
                  )}
                  <button className="rm-icon-btn" onClick={() => handleEdit(r)} title={t("Edit", "تعديل")}>
                    <Edit style={{ width: 14, height: 14 }} />
                  </button>
                  {r.file_url && (
                    <button className="rm-icon-btn" onClick={() => handleDownload(r)} title={t("Download", "تحميل")}>
                      <Download style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                  <button className="rm-icon-btn" onClick={() => handleDelete(r.id)} title={t("Delete", "حذف")} style={{ color: "#ef4444" }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Inline player dialog ── */}
      <Dialog open={!!playingUrl} onOpenChange={v => !v && setPlayingUrl(null)}>
        <DialogContent className="max-w-3xl p-2" style={{ fontFamily: "'DM Sans',sans-serif", borderRadius: 16 }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Playfair Display',serif", color: G }}>{t("Recording Playback", "تشغيل التسجيل")}</DialogTitle>
          </DialogHeader>
          {playingUrl && (
            <video
              src={playingUrl}
              controls
              autoPlay
              playsInline
              style={{ width: "100%", borderRadius: 12, background: "#000", maxHeight: "70vh" }}
              onError={() => toast({ title: "Video failed to load — trying audio fallback" })}
            >
              {/* Audio fallback */}
              <audio src={playingUrl} controls style={{ width: "100%" }} />
            </video>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editRec} onOpenChange={() => setEditRec(null)}>
        <DialogContent style={{ fontFamily: "'DM Sans',sans-serif", borderRadius: 16 }}>
          <DialogHeader><DialogTitle style={{ fontFamily: "'Playfair Display',serif", color: G }}>{t("Edit Recording", "تعديل التسجيل")}</DialogTitle></DialogHeader>
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
            <div>
              <Label>{t("Who can see this recording?", "من يمكنه رؤية هذا التسجيل؟")}</Label>
              <div style={{ marginTop: 6 }}>
                <VisibilityPicker value={editVisibility} onChange={setEditVisibility} />
              </div>
            </div>
            <button onClick={saveEdit} className="rm-btn" style={{ width: "100%", justifyContent: "center", background: G, color: "#fff", padding: "11px 0" }}>
              {t("Save", "حفظ")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Upload Dialog ── */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent style={{ fontFamily: "'DM Sans',sans-serif", borderRadius: 16 }}>
          <DialogHeader><DialogTitle style={{ fontFamily: "'Playfair Display',serif", color: G }}>{t("Upload Recording", "رفع تسجيل")}</DialogTitle></DialogHeader>
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
            <div>
              <Label>{t("Who can see this recording?", "من يمكنه رؤية هذا التسجيل؟")}</Label>
              <div style={{ marginTop: 6 }}>
                <VisibilityPicker
                  value={uploadForm.visibility}
                  onChange={(v) => setUploadForm({ ...uploadForm, visibility: v })}
                  labels={{ all: "All Students", general: "Class Students", private: "Private Only" }}
                />
              </div>
            </div>
            <button
              onClick={handleUpload}
              className="rm-btn"
              style={{ width: "100%", justifyContent: "center", background: (!uploadForm.subject_id || !uploadForm.file || uploadBusy) ? "#d1d5db" : GOLD, color: G, padding: "11px 0", cursor: (!uploadForm.subject_id || !uploadForm.file || uploadBusy) ? "default" : "pointer" }}
              disabled={!uploadForm.subject_id || !uploadForm.file || uploadBusy}
            >
              {uploadBusy
                ? <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "rm-spin .7s linear infinite" }} />{t("Uploading…", "جاري الرفع…")}</>
                : t("Upload", "رفع")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordingManagement;
