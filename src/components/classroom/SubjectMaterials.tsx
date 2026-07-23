/*  src/components/classroom/SubjectMaterials.tsx
    Materials panel embedded inside a subject's tabs (admin / teacher / student).

    ─────────────────────────────────────────────────────────────────────────
    Role-aware:
    • Admin / Teacher → MaterialManager: upload/edit/delete files & links for
      this subject (PDF, Video, Audio, Image, Document), set downloadable.
    • Student / Public → MaterialViewer: browse + open/download every
      material uploaded for the subject (no per-material level filter —
      each academic level already has its own subject).

    Backed by the `subject_materials` table (see admin/MaterialsManagement.tsx
    for the original schema this mirrors) and the `subject-materials` storage
    bucket (public read, admin/teacher write via RLS).

    NOTE: this file previously contained a stray copy of SubjectAssignments.tsx
    (same "New Assignment" UI), which is why the Materials tab was showing
    assignment content. Rebuilt from scratch against the real table/bucket.
    ─────────────────────────────────────────────────────────────────────────
*/

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import MaterialsViewer from "./MaterialsViewer";
import {
  FileText, Video, Music, Image as ImageIcon, File as FileIcon,
  Upload, Plus, X, Trash2, Pencil,
  Loader2, FolderOpen, Search,
} from "lucide-react";

/* ── Design tokens (match SubjectAssignments / TeacherDashboard) ─────── */
const G      = "#0f2d1f";
const MG     = "#1a4731";
const GOLD   = "#c9a84c";
const GOLDF  = "#e4c36a";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TXT    = "#0f2d1f";
const TMID   = "#4a7c59";
const TLIT   = "#7a9e88";

const BUCKET = "subject-materials";
const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Image", "Document"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];

const TYPE_CFG: Record<MaterialType, { color: string; bg: string; icon: any }> = {
  PDF:      { color: "#DC2626", bg: "#FEF2F2", icon: FileText },
  Video:    { color: "#16A34A", bg: "#F0FDF4", icon: Video },
  Audio:    { color: "#9333EA", bg: "#FDF4FF", icon: Music },
  Image:    { color: "#2563EB", bg: "#EFF6FF", icon: ImageIcon },
  Document: { color: "#1D4ED8", bg: "#EFF6FF", icon: FileIcon },
};

const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${BORDER}`,
  borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
};

const fmtSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function detectType(file: File): MaterialType {
  const mime = file.type.toLowerCase();
  const ext  = file.name.split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") return "PDF";
  if (mime.startsWith("video/") || ["mp4","webm","mov","avi","m4v","mkv"].includes(ext)) return "Video";
  if (mime.startsWith("audio/") || ["mp3","wav","ogg","m4a","aac","flac","opus"].includes(ext)) return "Audio";
  if (mime.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","heic"].includes(ext)) return "Image";
  return "Document";
}

/* ═══════════════════════════════════════════════════════════════
   Entry point — branches by role
   ═══════════════════════════════════════════════════════════════ */
export default function SubjectMaterials({ subjectId, subjectTitle }: { subjectId?: string; subjectTitle?: string }) {
  const { hasRole } = useAuth();
  const isStaff = hasRole("admin") || hasRole("teacher");
  return isStaff
    ? <MaterialManager subjectId={subjectId} />
    : <MaterialViewer subjectId={subjectId} />;
}

/* ═══════════════════════════════════════════════════════════════
   STAFF VIEW — upload, edit, delete
   ═══════════════════════════════════════════════════════════════ */
const emptyForm = {
  title: "", title_ar: "", description: "",
  material_type: "Document" as MaterialType,
  is_downloadable: true,
};

function MaterialManager({ subjectId }: { subjectId?: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<any | null>(null);
  const [deleting, setDeleting]   = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback]   = useState<{ type: "success" | "error" | ""; message: string }>({ type: "", message: "" });
  const [form, setForm]           = useState({ ...emptyForm });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!subjectId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("subject_materials").select("*")
      .eq("subject_id", subjectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setMaterials(data || []);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setSelectedFile(null);
    setEditing(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openEdit = (m: any) => {
    setEditing(m);
    setForm({
      title: m.title || "", title_ar: m.title_ar || "", description: m.description || "",
      material_type: (m.material_type as MaterialType) || "Document",
      is_downloadable: m.is_downloadable ?? true,
    });
    setSelectedFile(null);
    setShowForm(true);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setForm(f => ({ ...f, material_type: detectType(file), title: f.title || file.name.replace(/\.[^.]+$/, "") }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !user || !form.title.trim()) return;
    setUploading(true);
    setFeedback({ type: "", message: "" });
    try {
      let file_url = editing?.file_url || null;
      let file_size = editing?.file_size || null;

      if (selectedFile) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `materials/${subjectId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, selectedFile, {
          cacheControl: "3600", upsert: false,
          contentType: selectedFile.type || "application/octet-stream",
        });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        file_url = path;
        file_size = selectedFile.size;
      }

      if (!file_url && !editing) throw new Error(t("Please choose a file to upload", "الرجاء اختيار ملف"));

      const payload = {
        subject_id: subjectId,
        title: form.title.trim(),
        title_ar: form.title_ar.trim() || null,
        description: form.description.trim() || null,
        material_type: form.material_type,
        file_url,
        file_size,
        is_downloadable: form.is_downloadable,
        uploaded_by: user.id,
        sort_order: editing?.sort_order ?? materials.length,
      };

      const { error } = editing
        ? await supabase.from("subject_materials").update(payload).eq("id", editing.id)
        : await supabase.from("subject_materials").insert([payload]);
      if (error) throw error;

      setFeedback({ type: "success", message: editing ? t("Material updated!", "تم التحديث!") : t("Material uploaded!", "تم الرفع!") });
      await load();
      resetForm();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || String(err) });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      if (deleting.file_url && !deleting.file_url.startsWith("http")) {
        await supabase.storage.from(BUCKET).remove([deleting.file_url]);
      }
      await supabase.from("subject_materials").delete().eq("id", deleting.id);
      await load();
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  };

  const filtered = materials.filter(m =>
    !search.trim() || (m.title || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "50px 0" }}>
        <Loader2 className="animate-spin" size={26} color={GOLD} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
          <Search size={14} color={TLIT} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("Search materials...", "بحث في المواد...")}
            style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 11, border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 11, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          <Plus size={15} /> {t("New Material", "مادة جديدة")}
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "42px 20px" }}>
          <FolderOpen size={34} color={TLIT} style={{ opacity: .4, margin: "0 auto 10px" }} />
          <p style={{ fontWeight: 800, fontSize: 15, color: TXT, margin: "0 0 4px" }}>{t("No materials yet", "لا توجد مواد بعد")}</p>
          <p style={{ fontSize: 13, color: TMID, margin: 0 }}>{t("Upload the first one for this subject.", "ارفع أول مادة لهذه المادة الدراسية.")}</p>
        </div>
      )}

      {/* List — single column, mobile-first */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(m => {
          const cfg = TYPE_CFG[(m.material_type as MaterialType) || "Document"] || TYPE_CFG.Document;
          const Icon = cfg.icon;
          return (
            <div key={m.id} style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} color={cfg.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: "1px 8px" }}>{m.material_type}</span>
                  {m.file_size && <span style={{ fontSize: 10, color: TLIT }}>· {fmtSize(m.file_size)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <IconBtn onClick={() => openEdit(m)} title={t("Edit", "تعديل")}>
                  <Pencil size={15} color={TMID} />
                </IconBtn>
                <IconBtn onClick={() => setDeleting(m)} title={t("Delete", "حذف")}>
                  <Trash2 size={15} color="#DC2626" />
                </IconBtn>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview & Download — same in-app viewer used for students in the
          classroom, so admins can open/download every file type without
          leaving the page (PDF, video, audio, image, YouTube, Office docs,
          plain text, links, or any other file). */}
      {filtered.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: TLIT, margin: "4px 0 8px" }}>
            {t("Preview & Download", "معاينة وتحميل")}
          </p>
          <MaterialsViewer materials={filtered} />
        </div>
      )}

      {/* Upload / edit sheet */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={resetForm}>
          <div style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "18px 18px 26px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: TXT }}>{editing ? t("Edit Material", "تعديل المادة") : t("New Material", "مادة جديدة")}</span>
              <button onClick={resetForm} style={{ border: "none", background: "#F3F4F6", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}><X size={15} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={fieldLabel}>{t("Title", "العنوان")}
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={fieldInput} />
              </label>
              <label style={fieldLabel}>{t("Title (Arabic)", "العنوان بالعربية")}
                <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))} style={fieldInput} dir="rtl" />
              </label>
              <label style={fieldLabel}>{t("Description", "الوصف")}
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...fieldInput, resize: "vertical" as const }} />
              </label>

              <label style={fieldLabel}>{t("Type", "النوع")}
                <select value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value as MaterialType }))} style={fieldInput}>
                  {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TXT }}>
                <input type="checkbox" checked={form.is_downloadable} onChange={e => setForm(f => ({ ...f, is_downloadable: e.target.checked }))} />
                {t("Students can download this file", "يمكن للطلاب تحميل هذا الملف")}
              </label>

              <div>
                <input ref={fileInputRef} type="file" onChange={onFileChange} style={{ display: "none" }} id="material-file-input" />
                <label htmlFor="material-file-input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px", borderRadius: 12, border: `1.5px dashed ${BORDER}`, cursor: "pointer", fontSize: 13, color: TMID }}>
                  <Upload size={16} color={GOLD} />
                  {selectedFile ? selectedFile.name : editing?.file_url ? t("Replace file (optional)", "استبدال الملف (اختياري)") : t("Choose a file", "اختر ملفاً")}
                </label>
              </div>

              {feedback.message && (
                <div style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12.5, background: feedback.type === "error" ? "#FEF2F2" : "#F0FDF4", color: feedback.type === "error" ? "#DC2626" : "#16A34A" }}>
                  {feedback.message}
                </div>
              )}

              <button type="submit" disabled={uploading}
                style={{ padding: "12px", borderRadius: 12, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 14, cursor: uploading ? "default" : "pointer", opacity: uploading ? .7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {uploading ? <Loader2 className="animate-spin" size={16} /> : null}
                {uploading ? t("Saving...", "جارٍ الحفظ...") : editing ? t("Save Changes", "حفظ التغييرات") : t("Upload Material", "رفع المادة")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !deleteBusy && setDeleting(null)}>
          <div style={{ ...card, width: "100%", maxWidth: 360, padding: 20 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 800, fontSize: 15, color: TXT, margin: "0 0 6px" }}>{t("Delete this material?", "حذف هذه المادة؟")}</p>
            <p style={{ fontSize: 13, color: TMID, margin: "0 0 16px" }}>{deleting.title}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleting(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t("Cancel", "إلغاء")}</button>
              <button onClick={confirmDelete} disabled={deleteBusy} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {deleteBusy ? "..." : t("Delete", "حذف")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 700, color: TMID };
const fieldInput: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box" as const, width: "100%" };

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STUDENT / PUBLIC VIEW — same in-app viewer used in the classroom,
   so students can open or download every file type right here
   (PDF, video, audio, image, YouTube, Office docs, text, links, etc.)
   ═══════════════════════════════════════════════════════════════ */
function MaterialViewer({ subjectId }: { subjectId?: string }) {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!subjectId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("subject_materials").select("*")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setMaterials(data || []);
      setLoading(false);
    })();
  }, [subjectId]);

  // No level filter — each academic level has its own subject, so every
  // material uploaded to this subject is visible to every enrolled student.

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "50px 0" }}>
        <Loader2 className="animate-spin" size={26} color={GOLD} />
      </div>
    );
  }

  return <MaterialsViewer materials={materials} />;
}
