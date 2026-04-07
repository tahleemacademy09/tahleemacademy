/*
  SubjectMaterials.tsx — Enhanced upload dialog + material list
  Supports: PDF · Video · Audio · Image · Document · Link · Text
  Fixed: ref-based file input (no label/Dialog conflict), full column set,
         URL mode, allow-download toggle, upload progress, proper error display.
*/
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import MaterialsViewer from "@/components/classroom/MaterialsViewer";
import {
  Upload, Loader2, X, FileText, Video, Music,
  Image as ImageIcon, Link as LinkIcon, File, AlignLeft,
  Download, ToggleLeft, ToggleRight, Plus, AlertCircle,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */
const G  = "#064E3B";
const GM = "#065F46";

type MatType = "PDF" | "Video" | "Audio" | "Image" | "Document" | "Link" | "Text";

const TYPE_CONFIG: Record<MatType, {
  icon: any; bg: string; border: string; color: string; accept: string; label: string; labelAr: string;
}> = {
  PDF:      { icon: FileText,   bg: "#FEF2F2", border: "#FECACA", color: "#DC2626", accept: ".pdf",                                           label: "PDF",      labelAr: "PDF"      },
  Video:    { icon: Video,      bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A", accept: "video/*,.mp4,.webm,.mov",                        label: "Video",    labelAr: "فيديو"    },
  Audio:    { icon: Music,      bg: "#FDF4FF", border: "#E9D5FF", color: "#9333EA", accept: "audio/*,.mp3,.wav,.m4a,.aac",                    label: "Audio",    labelAr: "صوت"      },
  Image:    { icon: ImageIcon,  bg: "#EFF6FF", border: "#BFDBFE", color: "#2563EB", accept: "image/*",                                        label: "Image",    labelAr: "صورة"     },
  Document: { icon: File,       bg: "#FFFBEB", border: "#FDE68A", color: "#D97706", accept: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp", label: "Document", labelAr: "مستند"    },
  Link:     { icon: LinkIcon,   bg: "#F0FDFA", border: "#99F6E4", color: "#0D9488", accept: "",                                                label: "Link",     labelAr: "رابط"     },
  Text:     { icon: AlignLeft,  bg: "#F9FAFB", border: "#E5E7EB", color: "#374151", accept: ".txt,.md",                                        label: "Text",     labelAr: "نص"       },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as MatType[];

/* ── Helpers ────────────────────────────────────────── */
const fmtSize = (b: number) =>
  b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

function detectType(f: File): MatType {
  const t = f.type.toLowerCase();
  const e = f.name.split(".").pop()?.toLowerCase() || "";
  if (t.includes("pdf") || e === "pdf")                                          return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","m4v"].includes(e))             return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg"].includes(e))        return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx"].includes(e))                      return "Document";
  return "PDF";
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
const SubjectMaterials = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* dialog state */
  const [open,        setOpen]        = useState(false);
  const [title,       setTitle]       = useState("");
  const [matType,     setMatType]     = useState<MatType>("PDF");
  const [file,        setFile]        = useState<File | null>(null);
  const [url,         setUrl]         = useState("");
  const [textContent, setTextContent] = useState("");
  const [allowDl,     setAllowDl]     = useState(true);
  const [dragOver,    setDragOver]    = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [fieldErr,    setFieldErr]    = useState("");

  const cfg       = TYPE_CONFIG[matType];
  const Icon      = cfg.icon;
  const needsFile = matType !== "Link" && matType !== "Text";
  const needsUrl  = matType === "Link";
  const needsText = matType === "Text";

  /* ── queries ── */
  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-light", subjectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("class_sessions")
        .select("id, session_number, topic")
        .eq("subject_id", subjectId)
        .order("session_number");
      return data || [];
    },
  });

  /* ── upload mutation ── */
  const uploadMutation = useMutation({
    mutationFn: async () => {
      setFieldErr("");
      if (!title.trim())                       throw new Error("Title is required.");
      if (needsFile && !file && !url.trim())   throw new Error("Please select a file or paste a URL.");
      if (needsUrl  && !url.trim())            throw new Error("Please enter a valid URL.");
      if (needsText && !textContent.trim())    throw new Error("Text content cannot be empty.");
      if (!user)                               throw new Error("You must be logged in.");

      let fileUrl  = url.trim();
      let fileType = "";
      let fileSize = 0;

      if (needsFile && file) {
        const ext  = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        setUploadPct(15);

        const { error: storageErr } = await supabase.storage
          .from("subject-files")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (storageErr) throw new Error(`Storage: ${storageErr.message}`);

        setUploadPct(80);
        fileUrl  = path;
        fileType = file.type;
        fileSize = file.size;
      }

      setUploadPct(90);
      const { error: dbErr } = await supabase.from("subject_materials").insert({
        subject_id:      subjectId,
        title:           title.trim(),
        material_type:   matType,
        file_url:        fileUrl || null,
        content:         needsText ? textContent.trim() : null,
        is_downloadable: allowDl,
        sort_order:      (materials as any[]).length,
        uploaded_by:     user.id,
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      });

      if (dbErr) throw new Error(`Database: ${dbErr.message}`);
      setUploadPct(100);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", subjectId] });
      qc.invalidateQueries({ queryKey: ["subject-materials-all", subjectId] });
      closeDialog();
      toast({ title: t("Material uploaded!", "تم رفع المادة بنجاح!") });
    },
    onError: (e: any) => {
      setUploadPct(0);
      setFieldErr(e.message || "Upload failed. Please try again.");
    },
  });

  /* ── helpers ── */
  const handleFilePicked = (f: File) => {
    setFile(f);
    setMatType(detectType(f));
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    setFieldErr("");
  };

  const closeDialog = () => {
    setOpen(false);
    setTitle(""); setFile(null); setUrl(""); setTextContent("");
    setMatType("PDF"); setAllowDl(true); setDragOver(false);
    setUploadPct(0); setFieldErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onTypeChange = (tp: MatType) => {
    setMatType(tp); setFile(null); setFieldErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── loading skeleton ── */
  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 64, background: "#F3F4F6", borderRadius: 16, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div>
      <style>{`
        @keyframes fadeSlide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes matSpin { to{transform:rotate(360deg)} }
        .sm-type-btn { transition:all .15s ease; }
        .sm-type-btn:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.1); }
        .sm-zone { transition:all .15s ease; }
        .sm-zone:hover { border-color:#064E3B !important; background:#F0FDF4 !important; }
        .sm-input:focus { border-color:#064E3B !important; outline:none !important; }
        .sm-submit:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); box-shadow:0 6px 20px rgba(6,78,59,.4) !important; }
        .sm-submit { transition:all .2s ease; }
      `}</style>

      {/* ── Upload trigger ── */}
      {isPrivileged && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${G}, ${GM})`,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,78,59,.3)",
            }}
          >
            <Plus size={16} />
            {t("Upload Material", "رفع مادة")}
          </button>
        </div>
      )}

      {/* ── Material list ── */}
      <MaterialsViewer materials={materials as any[]} sessions={sessions as any[]} />

      {/* ══════════════════════════════════════════════════
          UPLOAD DIALOG
      ══════════════════════════════════════════════════ */}
      <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent style={{
          maxWidth: 520, borderRadius: 24, padding: 0,
          maxHeight: "94vh", overflowY: "auto",
          border: "none", boxShadow: "0 24px 80px rgba(0,0,0,.2)",
        }}>

          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${G}, ${GM})`,
            padding: "22px 24px", borderRadius: "24px 24px 0 0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: "rgba(255,255,255,.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Upload size={22} color="#fff" />
              </div>
              <div>
                <h2 style={{ color: "#fff", fontWeight: 800, fontSize: 18, margin: 0, letterSpacing: "-.3px" }}>
                  {t("Upload Material", "رفع مادة تعليمية")}
                </h2>
                <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "2px 0 0" }}>
                  {t("Add files, links or text for students", "أضف ملفات أو روابط للطلاب")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              style={{
                width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.12)", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 22 }}>

            {/* ── Error banner ── */}
            {fieldErr && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "13px 15px", borderRadius: 12,
                background: "#FEF2F2", border: "1.5px solid #FECACA",
                animation: "fadeSlide .2s ease",
              }}>
                <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: "#B91C1C", margin: 0, fontWeight: 600 }}>{fieldErr}</p>
              </div>
            )}

            {/* ── Type selector ── */}
            <div>
              <p style={{
                fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10,
                textTransform: "uppercase", letterSpacing: "1px",
              }}>
                {t("Material Type", "نوع المادة")}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {ALL_TYPES.map(tp => {
                  const c   = TYPE_CONFIG[tp];
                  const Ic  = c.icon;
                  const sel = matType === tp;
                  return (
                    <button
                      key={tp}
                      type="button"
                      className="sm-type-btn"
                      onClick={() => onTypeChange(tp)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 7, padding: "11px 6px", borderRadius: 14,
                        border: `2px solid ${sel ? c.color : "#EBEBEB"}`,
                        background: sel ? c.bg : "#FAFAFA",
                        cursor: "pointer",
                        boxShadow: sel ? `0 2px 12px ${c.color}28` : "none",
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: sel ? c.color : "#E5E7EB",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all .15s",
                      }}>
                        <Ic size={17} color={sel ? "#fff" : "#9CA3AF"} />
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: sel ? 700 : 500,
                        color: sel ? c.color : "#9CA3AF", lineHeight: 1,
                      }}>
                        {t(c.label, c.labelAr)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Title ── */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                {t("Title", "العنوان")} <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                className="sm-input"
                value={title}
                onChange={e => { setTitle(e.target.value); if (fieldErr) setFieldErr(""); }}
                placeholder={t("e.g. Week 1 Worksheet", "مثال: ورقة عمل الأسبوع الأول")}
                autoFocus
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 12,
                  border: `1.5px solid ${!title && fieldErr ? "#FCA5A5" : "#E5E7EB"}`,
                  fontSize: 14, boxSizing: "border-box",
                  background: "#fff", color: "#111",
                  transition: "border-color .15s",
                }}
              />
            </div>

            {/* ── File drop zone ── */}
            {needsFile && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                  {t("File", "الملف")} <span style={{ color: "#9CA3AF", fontWeight: 400 }}>
                    {t("(or paste URL below)", "(أو الصق رابطًا أدناه)")}
                  </span>
                </label>

                {/* hidden input — safe pattern for Radix dialogs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={cfg.accept || "*/*"}
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); }}
                />

                {file ? (
                  /* selected state */
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 16px", borderRadius: 14,
                    background: cfg.bg, border: `2px solid ${cfg.border}`,
                    animation: "fadeSlide .2s ease",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 11,
                      background: "#fff", border: `1.5px solid ${cfg.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon size={22} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontWeight: 700, fontSize: 13, color: "#111", margin: "0 0 3px",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {file.name}
                      </p>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                        {fmtSize(file.size)} &nbsp;·&nbsp; {matType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      style={{
                        background: "#fff", border: `1px solid ${cfg.border}`,
                        borderRadius: 8, cursor: "pointer", padding: 6,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <X size={14} color={cfg.color} />
                    </button>
                  </div>
                ) : (
                  /* drop zone */
                  <div
                    className="sm-zone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleFilePicked(f);
                    }}
                    style={{
                      padding: "30px 20px", borderRadius: 16, cursor: "pointer",
                      border: `2px dashed ${dragOver ? G : "#D1D5DB"}`,
                      background: dragOver ? "#F0FDF4" : "#FAFAFA",
                      textAlign: "center",
                    }}
                  >
                    <div style={{
                      width: 54, height: 54, borderRadius: 14, margin: "0 auto 14px",
                      background: cfg.bg, border: `2px solid ${cfg.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={26} color={cfg.color} />
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#374151", margin: "0 0 5px" }}>
                      {t("Drop file here or tap to browse", "اسحب الملف أو انقر للاختيار")}
                    </p>
                    <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                      {matType === "PDF"      && "PDF files"}
                      {matType === "Video"    && "MP4, WebM, MOV"}
                      {matType === "Audio"    && "MP3, WAV, M4A, AAC"}
                      {matType === "Image"    && "JPG, PNG, GIF, WebP, SVG"}
                      {matType === "Document" && "Word, Excel, PowerPoint, ODF"}
                    </p>
                  </div>
                )}

                {/* divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
                    {t("or paste a URL", "أو الصق رابطًا")}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                </div>
                <input
                  className="sm-input"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 12,
                    border: "1.5px solid #E5E7EB", fontSize: 14,
                    boxSizing: "border-box", background: "#fff", color: "#111",
                    transition: "border-color .15s",
                  }}
                />
              </div>
            )}

            {/* ── Link mode ── */}
            {needsUrl && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                  URL <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  className="sm-input"
                  value={url}
                  onChange={e => { setUrl(e.target.value); if (fieldErr) setFieldErr(""); }}
                  placeholder="https://..."
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 12,
                    border: "1.5px solid #E5E7EB", fontSize: 14,
                    boxSizing: "border-box", background: "#fff", color: "#111",
                  }}
                />
              </div>
            )}

            {/* ── Text mode ── */}
            {needsText && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                  {t("Content", "المحتوى")} <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <textarea
                  className="sm-input"
                  rows={6}
                  value={textContent}
                  onChange={e => { setTextContent(e.target.value); if (fieldErr) setFieldErr(""); }}
                  placeholder={t("Type your text content here…", "اكتب المحتوى هنا…")}
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 12,
                    border: "1.5px solid #E5E7EB", fontSize: 14,
                    boxSizing: "border-box", resize: "vertical",
                    background: "#fff", color: "#111", fontFamily: "inherit",
                  }}
                />
              </div>
            )}

            {/* ── Allow download ── */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderRadius: 14,
              background: allowDl ? "#F0FDF4" : "#F9FAFB",
              border: `1.5px solid ${allowDl ? "#A7F3D0" : "#E5E7EB"}`,
              transition: "all .2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: allowDl ? "#D1FAE5" : "#F3F4F6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .2s",
                }}>
                  <Download size={17} color={allowDl ? G : "#9CA3AF"} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>
                    {t("Allow Download", "السماح بالتنزيل")}
                  </p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                    {allowDl
                      ? t("Students can save this file", "يمكن للطلاب تنزيل الملف")
                      : t("View only — no download", "مشاهدة فقط")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllowDl(v => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                {allowDl
                  ? <ToggleRight size={34} color={G} />
                  : <ToggleLeft  size={34} color="#CBD5E1" />}
              </button>
            </div>

            {/* ── Progress bar ── */}
            {uploadMutation.isPending && uploadPct > 0 && (
              <div style={{ animation: "fadeSlide .2s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>
                    {t("Uploading…", "جاري الرفع…")}
                  </span>
                  <span style={{ fontSize: 12, color: G, fontWeight: 800 }}>{uploadPct}%</span>
                </div>
                <div style={{ height: 7, background: "#E5E7EB", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    background: `linear-gradient(90deg, ${G}, #10B981)`,
                    width: `${uploadPct}%`, transition: "width .5s ease",
                  }} />
                </div>
              </div>
            )}

            {/* ── Submit ── */}
            <button
              type="button"
              className="sm-submit"
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending}
              style={{
                width: "100%", padding: "15px", borderRadius: 14, border: "none",
                background: uploadMutation.isPending
                  ? "#E5E7EB"
                  : `linear-gradient(135deg, ${G}, ${GM})`,
                color: uploadMutation.isPending ? "#9CA3AF" : "#fff",
                fontWeight: 800, fontSize: 15, cursor: uploadMutation.isPending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: uploadMutation.isPending ? "none" : "0 4px 16px rgba(6,78,59,.3)",
              }}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 size={18} style={{ animation: "matSpin .8s linear infinite" }} />
                  {t("Uploading…", "جاري الرفع…")}
                </>
              ) : (
                <>
                  <Upload size={18} />
                  {t("Upload Material", "رفع المادة")}
                </>
              )}
            </button>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubjectMaterials;
