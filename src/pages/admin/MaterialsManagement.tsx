import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
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
  CheckCircle2, AlertCircle,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Image", "Document"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];

const BUCKET = "subject-materials";

// ── Level display helper ───────────────────────────────────────────────────


const LEVEL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  all:          { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  beginner:     { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  intermediate: { bg: "#FFFBEB", color: "#B7791F", border: "#F6D860" },
  advanced:     { bg: "#F5F0FF", color: "#6B46C1", border: "#D6BCFA" },
};

// ── File type config ───────────────────────────────────────────────────────
const TYPE_CFG: Record<MaterialType, { color: string; bg: string; border: string }> = {
  PDF:      { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  Video:    { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  Audio:    { color: "#9333EA", bg: "#FDF4FF", border: "#E9D5FF" },
  Image:    { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  Document: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
};

// ── Extract storage path from a Supabase public/signed URL ─────────────────
function extractStoragePath(url: string): string | null {
  try {
    // Matches both /object/public/<bucket>/<path> and /object/sign/<bucket>/<path>
    const match = url.match(/\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Resolve a viewable URL (signed URL with 1-hour TTL) ───────────────────
async function resolvePreviewUrl(storedUrl: string): Promise<string> {
  if (!storedUrl) return "";

  // If it's already a blob URL (local preview), return as-is
  if (storedUrl.startsWith("blob:")) return storedUrl;

  const path = extractStoragePath(storedUrl);
  if (!path) {
    // Not a recognisable Supabase storage URL — try using it directly
    return storedUrl;
  }

  // Create a 3600-second signed URL for reliable preview access
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    // Fall back to public URL
    return storedUrl;
  }
  return data.signedUrl;
}

// ── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ material, onClose }: { material: any; onClose: () => void }) {
  const storedUrl: string = material.file_url || "";
  const type = (material.material_type || "Document") as MaterialType;
  const cfg = TYPE_CFG[type] || TYPE_CFG.Document;

  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [urlError, setUrlError] = useState(false);
  // Fallback: show Google Docs Viewer when PDF iframe fails
  const [useDriveViewer, setUseDriveViewer] = useState(false);

  const isImg = type === "Image";
  const isPdf = type === "PDF";
  const isVid = type === "Video";
  const isAud = type === "Audio";
  const isDoc = type === "Document";

  // Resolve signed URL on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setUrlError(false);
    setUseDriveViewer(false);
    resolvePreviewUrl(storedUrl).then((url) => {
      if (!cancelled) {
        setResolvedUrl(url);
        setLoadingUrl(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setResolvedUrl(storedUrl);
        setLoadingUrl(false);
        setUrlError(true);
      }
    });
    return () => { cancelled = true; };
  }, [storedUrl]);

  const googleViewerUrl = (isPdf || isDoc) && resolvedUrl
    ? `https://docs.google.com/gviewer?url=${encodeURIComponent(resolvedUrl)}&embedded=true`
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
          {type === "PDF"      && <FileText   size={16} color={cfg.color} />}
          {type === "Video"    && <Video      size={16} color={cfg.color} />}
          {type === "Audio"    && <AudioLines size={16} color={cfg.color} />}
          {type === "Image"    && <ImageIcon  size={16} color={cfg.color} />}
          {type === "Document" && <FileText   size={16} color={cfg.color} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {material.title}
          </p>
          <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, margin: 0 }}>{type}</p>
        </div>

        {/* Toggle Google Docs Viewer for PDF */}
        {isPdf && resolvedUrl && (
          <button
            onClick={() => setUseDriveViewer((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              background: useDriveViewer ? "rgba(37,99,235,.4)" : "rgba(255,255,255,.1)",
              color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
            }}
            title="Switch between direct preview and Google Docs viewer"
          >
            {useDriveViewer ? "Direct" : "Alt Viewer"}
          </button>
        )}

        {/* Download link */}
        {material.is_downloadable !== false && resolvedUrl && (
          <a
            href={resolvedUrl}
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
        {resolvedUrl && (
          <a
            href={resolvedUrl}
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
        {/* Loading signed URL */}
        {loadingUrl && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.6)" }}>
            <Loader2 size={40} style={{ marginBottom: 12, animation: "spin 1s linear infinite" }} />
            <p>Preparing preview…</p>
          </div>
        )}

        {!loadingUrl && !resolvedUrl && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)" }}>
            <File size={48} style={{ marginBottom: 12 }} />
            <p>No file URL available</p>
          </div>
        )}

        {!loadingUrl && resolvedUrl && isImg && (
          <img
            src={resolvedUrl}
            alt={material.title}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        )}

        {!loadingUrl && resolvedUrl && isPdf && !useDriveViewer && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Try <object> first — better browser support than <iframe> for PDFs */}
            <object
              data={resolvedUrl}
              type="application/pdf"
              style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            >
              {/* Fallback if <object> fails */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "rgba(255,255,255,.6)", padding: 32 }}>
                <FileText size={48} color="#DC2626" />
                <p style={{ margin: 0, fontWeight: 600 }}>PDF can't be displayed inline.</p>
                <div style={{ display: "flex", gap: 12 }}>
                  <a href={resolvedUrl} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 20px", borderRadius: 8, background: "#DC2626", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
                    Open in New Tab
                  </a>
                  <button onClick={() => setUseDriveViewer(true)}
                    style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,.15)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                    Try Alt Viewer
                  </button>
                </div>
              </div>
            </object>
          </div>
        )}

        {!loadingUrl && resolvedUrl && isPdf && useDriveViewer && googleViewerUrl && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <iframe
              src={googleViewerUrl}
              title={material.title}
              style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            />
            <div style={{ padding: "6px 16px", background: "rgba(0,0,0,.5)", textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, margin: 0 }}>
                Viewing via Google Docs.{" "}
                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#93C5FD", textDecoration: "none" }}>
                  Open directly ↗
                </a>
              </p>
            </div>
          </div>
        )}

        {!loadingUrl && resolvedUrl && isVid && (
          <video
            src={resolvedUrl}
            controls
            autoPlay
            playsInline
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, background: "#000" }}
          />
        )}

        {!loadingUrl && resolvedUrl && isAud && (
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
            <audio src={resolvedUrl} controls style={{ width: "100%" }} />
          </div>
        )}

        {!loadingUrl && resolvedUrl && isDoc && googleViewerUrl && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <iframe
              src={googleViewerUrl}
              title={material.title}
              style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            />
            <div style={{ padding: "8px 16px", background: "rgba(0,0,0,.5)", textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, margin: 0 }}>
                If the document doesn't load,{" "}
                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#93C5FD", textDecoration: "none" }}>
                  open it in a new tab ↗
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Form file preview (single file, before upload) ─────────────────────────
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

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1.5px solid ${cfg.border}`, background: cfg.bg }}>
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
        <object data={objectUrl} type="application/pdf" style={{ width: "100%", height: 240, border: "none", display: "block" }}>
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <FileText size={32} color={cfg.color} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: cfg.color, fontWeight: 600, margin: 0 }}>{file.name}</p>
          </div>
        </object>
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
      {!isImg && !isPdf && !isVid && !isAud && (
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
      <div style={{ padding: "6px 12px", background: "rgba(0,0,0,.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: cfg.color, fontWeight: 700 }}>✓ Ready to upload</span>
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>
          {file.size < 1048576 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1048576).toFixed(1)} MB`}
        </span>
      </div>
    </div>
  );
}

// ── Batch queue item type ──────────────────────────────────────────────────
interface QueueItem {
  id: string;
  file: File;
  objectUrl: string;
  materialType: MaterialType;
  title: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

// ── Batch upload file row ──────────────────────────────────────────────────
function BatchFileRow({
  item, onRemove, onTitleChange,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
}) {
  const cfg = TYPE_CFG[item.materialType] || TYPE_CFG.Document;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 10,
      border: `1.5px solid ${cfg.border}`, background: cfg.bg,
      opacity: item.status === "done" ? 0.7 : 1,
    }}>
      {/* Status icon */}
      <div style={{ flexShrink: 0 }}>
        {item.status === "pending" && (
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText size={16} color={cfg.color} />
          </div>
        )}
        {item.status === "uploading" && <Loader2 size={22} color={cfg.color} style={{ animation: "spin 1s linear infinite" }} />}
        {item.status === "done"      && <CheckCircle2 size={22} color="#16A34A" />}
        {item.status === "error"     && <AlertCircle  size={22} color="#DC2626" />}
      </div>

      {/* Title input */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Input
          value={item.title}
          onChange={(e) => onTitleChange(item.id, e.target.value)}
          placeholder="Material title…"
          disabled={item.status !== "pending"}
          style={{ fontSize: 13, height: 34 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: cfg.color, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#fff", border: `1px solid ${cfg.border}` }}>
            {item.materialType}
          </span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>
            {item.file.size < 1048576 ? `${(item.file.size / 1024).toFixed(0)} KB` : `${(item.file.size / 1048576).toFixed(1)} MB`}
          </span>
          {item.status === "error" && <span style={{ fontSize: 10, color: "#DC2626" }}>{item.error}</span>}
        </div>
      </div>

      {/* Remove */}
      {item.status === "pending" && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,.1)", border: "1px solid #FECACA", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MaterialsManagement() {
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = ["all", ...academicLevels.map(l => l.slug)];
  const LEVEL_LABELS = Object.fromEntries([
    ["all", "All Levels"],
    ...academicLevels.map(l => [l.slug, l.name_en]),
  ]);
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
    level: "all" as Level,
    sort_order: 0,
    is_downloadable: true,
    session_id: null as string | null,
  });

  // Single-file state (used when only 1 file is chosen)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>("");

  // Multi-file queue (used when 2+ files are chosen)
  const [fileQueue, setFileQueue] = useState<QueueItem[]>([]);
  const isBatchMode = fileQueue.length > 0;

  const [feedback, setFeedback] = useState<{ type: "success" | "error" | ""; message: string }>({
    type: "", message: "",
  });

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      fileQueue.forEach((q) => URL.revokeObjectURL(q.objectUrl));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length === 1) {
      // Single file — use the detailed form flow
      clearBatchQueue();
      processFile(files[0]);
    } else {
      // Multiple files — switch to batch mode
      clearFile();
      processBatch(files);
    }
    // Reset input so re-selecting the same files fires onChange again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    if (files.length === 1) {
      clearBatchQueue();
      processFile(files[0]);
    } else {
      clearFile();
      processBatch(files);
    }
  };

  const processFile = (file: File) => {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setFeedback({ type: "error", message: `File too large (max 50 MB). Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.` });
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const detected = getMaterialType(file);
    setSelectedFile(file);
    setFormData((prev) => ({
      ...prev,
      file_size: file.size,
      material_type: detected,
      title: prev.title || file.name.replace(/\.[^.]+$/, ""), // auto-fill title if empty
    }));
    setObjectUrl(URL.createObjectURL(file));
    setFeedback({ type: "", message: "" });
  };

  const processBatch = (files: File[]) => {
    const MAX = 50 * 1024 * 1024;
    const items: QueueItem[] = [];
    const oversized: string[] = [];

    for (const file of files) {
      if (file.size > MAX) {
        oversized.push(file.name);
        continue;
      }
      items.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        objectUrl: URL.createObjectURL(file),
        materialType: getMaterialType(file),
        title: file.name.replace(/\.[^.]+$/, ""),
        status: "pending",
      });
    }

    if (oversized.length) {
      setFeedback({ type: "error", message: `Skipped (>50 MB): ${oversized.join(", ")}` });
    }
    setFileQueue(items);
  };

  const clearFile = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl("");
    setSelectedFile(null);
    setFormData((prev) => ({ ...prev, file_size: 0 }));
  };

  const clearBatchQueue = () => {
    fileQueue.forEach((q) => URL.revokeObjectURL(q.objectUrl));
    setFileQueue([]);
  };

  const resetForm = () => {
    clearFile();
    clearBatchQueue();
    setFormData({
      title: "", title_ar: "", description: "",
      material_type: "PDF", content: "", file_url: "", file_size: 0,
      level: "all", sort_order: 0, is_downloadable: true, session_id: null,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // ── Upload single file to Supabase storage ────────────────────────────
  const uploadFileToStorage = async (file: File): Promise<string> => {
    const fileExt  = file.name.split(".").pop() || "bin";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `materials/${subjectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return publicUrl;
  };

  // ── Submit single material form ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !user) return;

    setUploading(true);
    setFeedback({ type: "", message: "" });

    try {
      let finalFileUrl = formData.file_url;
      if (selectedFile) finalFileUrl = await uploadFileToStorage(selectedFile);

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

  // ── Batch upload all queued files ──────────────────────────────────────
  const handleBatchUpload = async () => {
    if (!subjectId || !user) return;
    const pending = fileQueue.filter((q) => q.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);
    setFeedback({ type: "", message: "" });

    let successCount = 0;
    let errorCount   = 0;

    for (const item of pending) {
      // Mark as uploading
      setFileQueue((prev) =>
        prev.map((q) => q.id === item.id ? { ...q, status: "uploading" } : q)
      );

      try {
        const fileUrl = await uploadFileToStorage(item.file);

        const { error } = await supabase.from("subject_materials").insert([{
          subject_id:      subjectId,
          title:           item.title || item.file.name.replace(/\.[^.]+$/, ""),
          title_ar:        null,
          description:     null,
          material_type:   item.materialType,
          content:         null,
          file_url:        fileUrl,
          file_size:       item.file.size,
          level:           formData.level,
          sort_order:      formData.sort_order,
          is_downloadable: formData.is_downloadable,
          uploaded_by:     user.id,
          session_id:      formData.session_id,
        }]);

        if (error) throw error;

        setFileQueue((prev) =>
          prev.map((q) => q.id === item.id ? { ...q, status: "done" } : q)
        );
        successCount++;
      } catch (err: any) {
        setFileQueue((prev) =>
          prev.map((q) => q.id === item.id ? { ...q, status: "error", error: err.message } : q)
        );
        errorCount++;
      }
    }

    await fetchMaterials();
    setUploading(false);

    if (errorCount === 0) {
      setFeedback({ type: "success", message: `${successCount} file${successCount > 1 ? "s" : ""} uploaded successfully!` });
      // Auto-close after short delay if all succeeded
      setTimeout(() => resetForm(), 1200);
    } else {
      setFeedback({ type: "error", message: `${successCount} uploaded, ${errorCount} failed. Fix errors and retry.` });
    }
  };

  const handleEdit = (material: any) => {
    // Normalize level: comma-separated multi-values → "all"; null/empty → "all"
    let normalizedLevel: Level = "all";
    const rawLevel = material.level || "";
    if (rawLevel === "all" || rawLevel === "") {
      normalizedLevel = "all";
    } else if (rawLevel.includes(",")) {
      // Multi-level comma string from SubjectMaterials checkboxes — treat as "all"
      normalizedLevel = "all";
    } else if (LEVELS.includes(rawLevel as Level)) {
      normalizedLevel = rawLevel as Level;
    }

    setFormData({
      title:           material.title           || "",
      title_ar:        material.title_ar        || "",
      description:     material.description     || "",
      material_type:   material.material_type   || "PDF",
      content:         material.content         || "",
      file_url:        material.file_url        || "",
      file_size:       material.file_size       || 0,
      level:           normalizedLevel,
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
            <CardTitle>
              {editingId ? "Edit Material" : isBatchMode ? `Batch Upload (${fileQueue.length} files)` : "Upload New Material"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">

            {/* ── Batch mode ── */}
            {isBatchMode ? (
              <div className="space-y-3">
                {/* Batch queue */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {fileQueue.map((item) => (
                    <BatchFileRow
                      key={item.id}
                      item={item}
                      onRemove={(id) => {
                        const q = fileQueue.find((f) => f.id === id);
                        if (q) URL.revokeObjectURL(q.objectUrl);
                        setFileQueue((prev) => prev.filter((f) => f.id !== id));
                      }}
                      onTitleChange={(id, title) =>
                        setFileQueue((prev) => prev.map((f) => f.id === id ? { ...f, title } : f))
                      }
                    />
                  ))}
                </div>

                {/* Shared settings for batch */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Level (all files)</Label>
                    <Select
                      value={formData.level}
                      onValueChange={(val: any) => setFormData((p) => ({ ...p, level: val }))}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((lvl) => (
                          <SelectItem key={lvl} value={lvl}>
                            {LEVEL_LABELS[lvl] || lvl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Sort Order (start)</Label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={formData.sort_order}
                      onChange={(e) => setFormData((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                      min={0}
                    />
                  </div>
                  <div className="flex items-end pb-1 gap-2">
                    <Switch
                      id="batch-downloadable"
                      checked={formData.is_downloadable}
                      onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_downloadable: checked }))}
                    />
                    <Label htmlFor="batch-downloadable" className="text-sm">Allow download</Label>
                  </div>
                </div>

                {/* Add more files */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 8,
                    border: "1.5px dashed #D1D5DB", background: "transparent",
                    cursor: "pointer", fontSize: 13, color: "#6B7280", fontWeight: 500,
                  }}
                >
                  + Add more files
                </button>

                {/* Batch actions */}
                <div className="flex gap-3 justify-end pt-1">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                  <Button
                    type="button"
                    disabled={uploading || fileQueue.filter((q) => q.status === "pending").length === 0}
                    onClick={handleBatchUpload}
                  >
                    {uploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Upload {fileQueue.filter((q) => q.status === "pending").length} Files</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Single file / edit form ── */
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* ── File Upload Zone ── */}
                <div className="space-y-2">
                  <Label>File Upload</Label>

                  {/* Hidden input — multiple allowed */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="application/pdf,image/*,video/*,audio/*,.pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a,.aac,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.csv,.rtf,.txt"
                    onChange={handleFileChange}
                  />

                  {selectedFile ? (
                    <FormFilePreview
                      file={selectedFile}
                      materialType={formData.material_type}
                      objectUrl={objectUrl}
                      onClear={clearFile}
                    />
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <div className="flex flex-col items-center text-muted-foreground">
                        <Upload className="h-10 w-10 mb-2 opacity-50" />
                        <p className="font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs mt-1">PDF · Video · Audio · Image · Word · Excel · PowerPoint (max 50 MB)</p>
                        <p className="text-xs mt-1 text-emerald-600 font-medium">Select multiple files at once for batch upload</p>
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
                            {LEVEL_LABELS[lvl] || lvl}
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
            )}
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
                      <span
                        className="px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: (LEVEL_COLORS[m.level] || LEVEL_COLORS.all).bg,
                          color:      (LEVEL_COLORS[m.level] || LEVEL_COLORS.all).color,
                          border:     `1px solid ${(LEVEL_COLORS[m.level] || LEVEL_COLORS.all).border}`,
                        }}
                      >
                        {LEVEL_LABELS[m.level] || m.level}
                      </span>
                      {m.file_size > 0 && (
                        <span>• {formatFileSize(m.file_size)}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    {/* Preview button — always show if file_url exists */}
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
                    {/* Download */}
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

      {/* Inline Preview Modal */}
      {previewingMaterial && (
        <PreviewModal
          material={previewingMaterial}
          onClose={() => setPreviewingMaterial(null)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
