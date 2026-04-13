import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload, FileText, Video, AudioLines, Image as ImageIcon,
  Loader2, Trash2, Edit, Plus, X, Eye, Download, ExternalLink, File,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Image", "Document"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];
type Level = (typeof LEVELS)[number];

// ── File type config ───────────────────────────────────────────────────────
const TYPE_CFG: Record<MaterialType, { color: string; bg: string; border: string }> = {
  PDF:      { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  Video:    { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  Audio:    { color: "#9333EA", bg: "#FDF4FF", border: "#E9D5FF" },
  Image:    { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  Document: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
};

// ── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ material, onClose }: { material: any; onClose: () => void }) {
  const url: string = material.file_url || "";
  const type = (material.material_type || "Document") as MaterialType;
  const cfg = TYPE_CFG[type] || TYPE_CFG.Document;

  const isImg = type === "Image";
  const isPdf = type === "PDF";
  const isVid = type === "Video";
  const isAud = type === "Audio";
  const isDoc = type === "Document";

  // Google Docs Viewer — works with public Supabase URLs
  const googleViewerUrl = isDoc && url
    ? `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`
    : "";

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.88)", display: "flex", flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          height: 56, flexShrink: 0,
          background: "rgba(0,0,0,.7)", borderBottom: "1px solid rgba(255,255,255,.1)",
          display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          {type === "PDF"      && <FileText  size={16} color={cfg.color} />}
          {type === "Video"    && <Video     size={16} color={cfg.color} />}
          {type === "Audio"    && <AudioLines size={16} color={cfg.color} />}
          {type === "Image"    && <ImageIcon size={16} color={cfg.color} />}
          {type === "Document" && <FileText  size={16} color={cfg.color} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {material.title}
          </p>
          <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, margin: 0 }}>{type}</p>
        </div>

        {/* Download link */}
        {material.is_downloadable !== false && url && (
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(255,255,255,.15)", color: "#fff",
              textDecoration: "none", fontSize: 12, fontWeight: 600,
            }}
          >
            <Download size={12} /> Download
          </a>
        )}

        {/* Open in new tab */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              background: "rgba(255,255,255,.1)", color: "#fff",
              textDecoration: "none", fontSize: 12, fontWeight: 600,
            }}
          >
            <ExternalLink size={12} />
          </a>
        )}

        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(239,68,68,.25)", border: "1.5px solid rgba(239,68,68,.5)",
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Content ── */}
      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: isAud ? 24 : 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {!url && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)" }}>
            <File size={48} style={{ marginBottom: 12 }} />
            <p>No file URL available</p>
          </div>
        )}

        {url && isImg && (
          <img
            src={url}
            alt={material.title}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        )}

        {url && isPdf && (
          <iframe
            src={url}
            title={material.title}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          />
        )}

        {url && isVid && (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, background: "#000" }}
          />
        )}

        {url && isAud && (
          <div
            style={{
              background: "#1a1a2e", borderRadius: 20,
              padding: "40px 40px", textAlign: "center", minWidth: 300, maxWidth: 480,
            }}
          >
            <div
              style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
                background: TYPE_CFG.Audio.bg, border: `2px solid ${TYPE_CFG.Audio.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <AudioLines size={36} color={TYPE_CFG.Audio.color} />
            </div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 20 }}>
              {material.title}
            </p>
            <audio src={url} controls style={{ width: "100%" }} />
          </div>
        )}

        {url && isDoc && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <iframe
              src={googleViewerUrl}
              title={material.title}
              style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            />
            {/* Fallback notice */}
            <div style={{ padding: "8px 16px", background: "rgba(0,0,0,.5)", textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, margin: 0 }}>
                If the document doesn't load,{" "}
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#93C5FD", textDecoration: "none" }}>
                  open it in a new tab ↗
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form file preview (before upload) ─────────────────────────────────────
function FormFilePreview({
  file, materialType, objectUrl, onClear,
}: {
  file: File; materialType: MaterialType; objectUrl: string; onClear: () => void;
}) {
  const cfg = TYPE_CFG[materialType] || TYPE_CFG.Document;
  const isImg = materialType === "Image";
  const isPdf = materialType === "PDF";
  const isVid = materialType === "Video";
  const isAud = materialType === "Audio";
  const isDoc = materialType === "Document";

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1.5px solid ${cfg.border}`, background: cfg.bg }}>
      {/* Remove button */}
      <button
        type="button"
        onClick={onClear}
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(239,68,68,.9)", border: "none", color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,.3)",
        }}
      >
        <X size={13} />
      </button>

      {isImg && objectUrl && (
        <img src={objectUrl} alt={file.name} style={{ width: "100%", maxHeight: 200, objectFit: "contain", display: "block" }} />
      )}
      {isPdf && objectUrl && (
        <iframe src={objectUrl} title={file.name} style={{ width: "100%", height: 240, border: "none", display: "block" }} />
      )}
      {isVid && objectUrl && (
        <video src={objectUrl} controls style={{ width: "100%", maxHeight: 200, display: "block", background: "#000" }} />
      )}
      {isAud && objectUrl && (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <AudioLines size={32} color={cfg.color} style={{ marginBottom: 10 }} />
          <audio src={objectUrl} controls style={{ width: "100%", maxWidth: 360 }} />
        </div>
      )}
      {isDoc && (
        <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fff", border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={22} color={cfg.color} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, wordBreak: "break-all" }}>{file.name}</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
              {file.size < 1048576 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1048576).toFixed(1)} MB`}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "6px 12px", background: "rgba(0,0,0,.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: cfg.color, fontWeight: 700 }}>✓ Ready to upload</span>
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>
          {file.size < 1048576 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1048576).toFixed(1)} MB`}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MaterialsManagement() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewingMaterial, setPreviewingMaterial] = useState<any | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    title_ar: "",
    description: "",
    material_type: "PDF" as MaterialType,
    content: "",
    file_url: "",
    file_size: 0,
    level: "beginner" as Level,
    sort_order: 0,
    is_downloadable: true,
    session_id: null as string | null,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>("");   // blob URL for pre-upload preview
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | ""; message: string }>({
    type: "", message: "",
  });

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [objectUrl]);

  // ── Fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (subjectId) fetchMaterials();
  }, [subjectId]);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setMaterials(data || []);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── File type detection ───────────────────────────────────────────────
  const getMaterialType = (file: File): MaterialType => {
    const mime = file.type.toLowerCase();
    const ext  = file.name.split(".").pop()?.toLowerCase() || "";
    if (mime.includes("pdf") || ext === "pdf")                                                      return "PDF";
    if (mime.startsWith("video/") || ["mp4","webm","mov","avi","m4v","mkv"].includes(ext))          return "Video";
    if (mime.startsWith("audio/") || ["mp3","wav","ogg","m4a","aac","flac","opus"].includes(ext))   return "Audio";
    if (mime.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","heic"].includes(ext))  return "Image";
    return "Document";
  };

  // ── File handlers ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setFeedback({
        type: "error",
        message: `File too large. Maximum size is 50 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }

    // Revoke previous blob URL
    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const detected = getMaterialType(file);
    setSelectedFile(file);
    setFormData((prev) => ({ ...prev, file_size: file.size, material_type: detected }));

    // Create blob URL for ALL previewable types
    const blob = URL.createObjectURL(file);
    setObjectUrl(blob);
    setFeedback({ type: "", message: "" });
  };

  const clearFile = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl("");
    setSelectedFile(null);
    setFormData((prev) => ({ ...prev, file_size: 0 }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    clearFile();
    setFormData({
      title: "", title_ar: "", description: "",
      material_type: "PDF", content: "", file_url: "", file_size: 0,
      level: "beginner", sort_order: 0, is_downloadable: true, session_id: null,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // ── Upload / Save ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !user) return;

    setUploading(true);
    setFeedback({ type: "", message: "" });

    try {
      let finalFileUrl = formData.file_url;

      if (selectedFile) {
        const fileExt  = selectedFile.name.split(".").pop() || "bin";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `materials/${subjectId}/${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from("subject-materials")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: selectedFile.type || "application/octet-stream",
          });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage
          .from("subject-materials")
          .getPublicUrl(filePath);

        finalFileUrl = publicUrl;
      }

      const materialData = {
        subject_id:      subjectId,
        title:           formData.title,
        title_ar:        formData.title_ar    || null,
        description:     formData.description || null,
        material_type:   formData.material_type,
        content:         formData.content     || null,
        file_url:        finalFileUrl,
        file_size:       formData.file_size   || null,
        level:           formData.level,
        sort_order:      formData.sort_order,
        is_downloadable: formData.is_downloadable,
        uploaded_by:     user.id,
        session_id:      formData.session_id,
      };

      let error;
      if (editingId) {
        ({ error } = await supabase.from("subject_materials").update(materialData).eq("id", editingId));
      } else {
        ({ error } = await supabase.from("subject_materials").insert([materialData]));
      }

      if (error) throw error;

      setFeedback({ type: "success", message: editingId ? "Material updated!" : "Material uploaded successfully!" });
      await fetchMaterials();
      resetForm();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: any) => {
    setFormData({
      title:           material.title           || "",
      title_ar:        material.title_ar        || "",
      description:     material.description     || "",
      material_type:   material.material_type   || "PDF",
      content:         material.content         || "",
      file_url:        material.file_url        || "",
      file_size:       material.file_size       || 0,
      level:           material.level           || "beginner",
      sort_order:      material.sort_order      ?? 0,
      is_downloadable: material.is_downloadable ?? true,
      session_id:      material.session_id      || null,
    });
    setEditingId(material.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this material?")) return;
    try {
      const { error } = await supabase.from("subject_materials").delete().eq("id", id);
      if (error) throw error;
      await fetchMaterials();
      setFeedback({ type: "success", message: "Material deleted." });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const getIcon = (type: MaterialType, size = 24) => {
    const color = TYPE_CFG[type]?.color || "#6B7280";
    switch (type) {
      case "PDF":      return <FileText   size={size} color={color} />;
      case "Video":    return <Video      size={size} color={color} />;
      case "Audio":    return <AudioLines size={size} color={color} />;
      case "Image":    return <ImageIcon  size={size} color={color} />;
      default:         return <FileText   size={size} color={color} />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Subject Materials</h1>
          <p className="text-muted-foreground">Manage resources for this subject</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Material
        </Button>
      </div>

      {/* Feedback */}
      {feedback.message && (
        <div className={`p-3 rounded-md flex items-center gap-2 ${
          feedback.type === "success"
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          {feedback.message}
          <button
            type="button"
            className="ml-auto"
            onClick={() => setFeedback({ type: "", message: "" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Upload / Edit Form */}
      {showForm && (
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-muted/50 border-b">
            <CardTitle>{editingId ? "Edit Material" : "Upload New Material"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* ── File Upload Zone ── */}
              <div className="space-y-2">
                <Label>File Upload</Label>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*,video/*,audio/*,.pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a,.aac,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.csv,.rtf,.txt"
                  onChange={handleFileChange}
                />

                {/* Show preview if file selected */}
                {selectedFile ? (
                  <FormFilePreview
                    file={selectedFile}
                    materialType={formData.material_type}
                    objectUrl={objectUrl}
                    onClear={clearFile}
                  />
                ) : (
                  /* Drop zone */
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center text-muted-foreground">
                      <Upload className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-medium">Click to upload or drag and drop</p>
                      <p className="text-xs mt-1">
                        PDF · Video · Audio · Image · Word · Excel · PowerPoint (max 50 MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Titles ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (English) *</Label>
                  <Input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title (Arabic)</Label>
                  <Input
                    value={formData.title_ar}
                    onChange={(e) => setFormData({ ...formData, title_ar: e.target.value })}
                    dir="rtl"
                  />
                </div>
              </div>

              {/* ── Description ── */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* ── Type & Level ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.material_type}
                    onValueChange={(val: any) => setFormData({ ...formData, material_type: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select
                    value={formData.level}
                    onValueChange={(val: any) => setFormData({ ...formData, level: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Sort Order ── */}
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  min={0}
                />
              </div>

              {/* ── Downloadable ── */}
              <div className="flex items-center gap-2">
                <Switch
                  id="downloadable"
                  checked={formData.is_downloadable}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_downloadable: checked })
                  }
                />
                <Label htmlFor="downloadable">Allow students to download</Label>
              </div>

              {/* ── Actions ── */}
              <div className="flex gap-3 pt-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading || !formData.title}>
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> {editingId ? "Update" : "Upload"}</>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Materials List */}
      <div className="grid gap-3">
        {materials.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 rounded-lg">
            <p className="text-muted-foreground">No materials uploaded yet.</p>
          </div>
        ) : (
          materials.map((m) => {
            const cfg = TYPE_CFG[m.material_type as MaterialType] || TYPE_CFG.Document;
            return (
              <Card
                key={m.id}
                className="hover:shadow-md transition"
                style={{ borderColor: cfg.border }}
              >
                <CardContent className="p-4 flex gap-4 items-center">
                  {/* Thumbnail / Icon */}
                  <div
                    className="h-14 w-14 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
                  >
                    {m.material_type === "Image" && m.file_url ? (
                      <img
                        src={m.file_url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // If image fails (e.g. private bucket), fallback to icon
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement!.appendChild(
                            Object.assign(document.createElement("div"), {
                              innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
                            })
                          );
                        }}
                      />
                    ) : (
                      getIcon(m.material_type as MaterialType, 24)
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{m.title}</h3>
                    {m.title_ar && (
                      <p className="text-sm text-muted-foreground truncate" dir="rtl">
                        {m.title_ar}
                      </p>
                    )}
                    <div className="flex gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                      >
                        {m.material_type}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary">
                        {m.level}
                      </span>
                      {m.file_size > 0 && (
                        <span>• {formatFileSize(m.file_size)}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    {/* ── Preview button (inline modal) ── */}
                    {m.file_url && (
                      <Button
                        size="icon"
                        variant="outline"
                        title="Preview"
                        onClick={() => setPreviewingMaterial(m)}
                        style={{ borderColor: cfg.border, color: cfg.color }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {/* ── Download ── */}
                    {m.file_url && m.is_downloadable !== false && (
                      <Button size="icon" variant="outline" title="Download" asChild>
                        <a href={m.file_url} download target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button size="icon" variant="outline" onClick={() => handleEdit(m)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDelete(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ── Inline Preview Modal ── */}
      {previewingMaterial && (
        <PreviewModal
          material={previewingMaterial}
          onClose={() => setPreviewingMaterial(null)}
        />
      )}
    </div>
  );
}
