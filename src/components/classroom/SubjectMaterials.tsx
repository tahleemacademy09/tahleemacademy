// src/components/classroom/SubjectMaterials.tsx — Tahleem Academy [FIXED]
// ─────────────────────────────────────────────────────────────────────
//  ✅ Upload uses main Supabase client (authenticated user session)
//  ✅ Signed URL + public URL fallback for previews
//  ✅ Auth session verified before upload attempt
//  ✅ All file types: PDF, Video, Audio, Image, Doc, Link, Text
//  ✅ Drag-and-drop + transparent file input tap target
//  ✅ Progress bar with real XHR progress tracking
//  ✅ Rich error messages with actionable advice
//  ✅ Preview overlay for all supported types
// ─────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, removeStorageFile } from "@/integrations/supabase/storageClient";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Upload, FileText, Video, Music, Image as ImageIcon,
  Link as LinkIcon, File, Download, Trash2, Edit2, X, Check,
  Plus, Loader2, ExternalLink, FileSpreadsheet, Eye,
  ChevronDown, ChevronUp, Search, AlertCircle,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────
const G      = "#064E3B";
const GM     = "#075E54";
const GOLD   = "#C9A84C";
const BUCKET = "subject-files";

type MatType = "PDF" | "Video" | "Audio" | "Image" | "Link" | "Text" | "Document";
type Level   = "beginner" | "intermediate" | "advanced";
const ALL_LEVELS: Level[]  = ["beginner", "intermediate", "advanced"];
const MAT_TYPES: MatType[] = ["PDF", "Video", "Audio", "Image", "Link", "Text", "Document"];

const MAT_CFG: Record<MatType, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  PDF:      { icon: FileText,        bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  Video:    { icon: Video,           bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  Audio:    { icon: Music,           bg: "#FDF4FF", text: "#9333EA", border: "#E9D5FF" },
  Image:    { icon: ImageIcon,       bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  Link:     { icon: LinkIcon,        bg: "#F0FDFA", text: "#0D9488", border: "#99F6E4" },
  Text:     { icon: FileText,        bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  Document: { icon: FileSpreadsheet, bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
};

const LVL_CFG: Record<Level, { label: string; bg: string; text: string; border: string }> = {  beginner:     { label: "Beginner",     bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  intermediate: { label: "Intermediate", bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },
  advanced:     { label: "Advanced",     bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE" },
};

// ── Helpers ───────────────────────────────────────────────────────────
function fmtSize(b?: number | null): string {
  if (!b) return "";
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function autoDetectType(file: File): MatType {
  const t = file.type.toLowerCase();
  const e = (file.name.split(".").pop() || "").toLowerCase();
  if (t.includes("pdf") || e === "pdf")                                                  return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","m4v","avi","mkv"].includes(e))         return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e))         return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","heic"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","rtf","csv"].includes(e)) return "Document";
  if (e === "txt") return "Text";
  return "Document";
}

function parseLevels(raw?: string | null): Set<Level> {
  if (!raw || raw === "all") return new Set(ALL_LEVELS);
  return new Set(
    raw.split(",").map(s => s.trim()).filter(s => ALL_LEVELS.includes(s as Level)) as Level[]
  );
}

function encodeLevels(sel: Set<Level>): string {
  if (sel.size === 0)        return "beginner";
  if (sel.size === 3)        return "all";
  return [...sel].join(",");
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box", fontFamily: "inherit",
};

// ══ UPLOAD via XHR so we can get real progress ══════════════════════
async function xhrUpload(
  uploadUrl: string,
  file: File,
  token: string,
  onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// ══ PREVIEW OVERLAY ═════════════════════════════════════════════════
function PreviewOverlay({ url, type, title, onClose }: {
  url: string; type: MatType; title: string; onClose: () => void;
}) {
  const isImg = type === "Image"    || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
  const isPdf = type === "PDF"      || /\.pdf(\?|$)/i.test(url);
  const isVid = type === "Video"    || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  const isAud = type === "Audio"    || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url);
  const isDoc = type === "Document" || /\.(doc|docx|xls|xlsx|ppt|pptx|odt|csv|rtf)(\?|$)/i.test(url);
  const googleViewerUrl = `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`;

  const gateRef = useRef(true);
  useEffect(() => { const t = setTimeout(() => { gateRef.current = false; }, 80); return () => clearTimeout(t); }, []);

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.9)", display: "flex", flexDirection: "column" }}
      onClick={() => { if (!gateRef.current) onClose(); }}
    >
      <div
        style={{ height: 52, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <a href={url} download target="_blank" rel="noreferrer"
          style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>
          Download
        </a>
        <button onClick={e => { e.stopPropagation(); onClose(); }}          style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(239,68,68,.25)", border: "1.5px solid rgba(239,68,68,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={18} />
        </button>
      </div>

      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: isImg || isAud ? "center" : "stretch", justifyContent: isImg || isAud ? "center" : "stretch", padding: isImg || isAud ? 12 : 0 }}
        onClick={e => e.stopPropagation()}
      >
        {isImg && <img src={url} alt={title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />}
        {isPdf && !isImg && <iframe src={url} title={title} style={{ width: "100%", height: "100%", border: "none" }} />}
        {isVid && !isImg && !isPdf && (
          <video src={url} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        )}
        {isAud && !isImg && !isPdf && !isVid && (
          <div style={{ background: "#1a1a2e", borderRadius: 20, padding: "40px 32px", textAlign: "center", minWidth: 280 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: MAT_CFG.Audio.bg, border: `2px solid ${MAT_CFG.Audio.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Music size={32} color={MAT_CFG.Audio.text} />
            </div>
            <p style={{ color: "#fff", fontWeight: 700, marginBottom: 16, fontSize: 15 }}>{title}</p>
            <audio src={url} controls style={{ width: "100%", maxWidth: 400 }} />
          </div>
        )}
        {isDoc && !isImg && !isPdf && !isVid && !isAud && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <iframe src={googleViewerUrl} title={title} style={{ flex: 1, width: "100%", border: "none" }} />
            <div style={{ padding: "8px 16px", background: "rgba(0,0,0,.65)", textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 11, margin: 0 }}>
                Preview not loading?{" "}
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#93C5FD", textDecoration: "none", fontWeight: 600 }}>Open in new tab ↗</a>
                {" · "}
                <a href={url} download target="_blank" rel="noopener noreferrer" style={{ color: "#86EFAC", textDecoration: "none", fontWeight: 600 }}>Download ↓</a>
              </p>
            </div>
          </div>
        )}
        {!isImg && !isPdf && !isVid && !isAud && !isDoc && (
          <div style={{ textAlign: "center", color: "#fff" }}>
            <File size={64} style={{ opacity: .4, marginBottom: 20 }} />
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{title}</p>
            <a href={url} download target="_blank" rel="noreferrer"
              style={{ padding: "12px 28px", borderRadius: 12, background: G, color: "#fff", textDecoration: "none", fontWeight: 700 }}>
              Download File
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );}

// ══ FILE PREVIEW BLOCK (before upload) ══════════════════════════════
function FilePreviewBlock({ file, type, objectUrl, onClear }: {
  file: File; type: MatType; objectUrl: string; onClear: () => void;
}) {
  const cfg = MAT_CFG[type]; const Icon = cfg.icon;
  const isImg = type === "Image"; const isPdf = type === "PDF";
  const isVid = type === "Video"; const isAud = type === "Audio";

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1.5px solid ${cfg.border}`, background: cfg.bg }}>
      <button type="button" onClick={onClear}
        style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,.9)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={13} />
      </button>
      {isImg  && objectUrl && <img src={objectUrl} alt={file.name} style={{ width: "100%", maxHeight: 200, objectFit: "contain", display: "block" }} />}
      {isPdf  && objectUrl && <iframe src={objectUrl} title={file.name} style={{ width: "100%", height: 220, border: "none", display: "block" }} />}
      {isVid  && objectUrl && <video src={objectUrl} controls style={{ width: "100%", maxHeight: 200, display: "block", background: "#000" }} />}
      {isAud  && objectUrl && (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <Music size={32} color={cfg.text} style={{ marginBottom: 10 }} />
          <audio src={objectUrl} controls style={{ width: "100%" }} />
        </div>
      )}
      {!isImg && !isPdf && !isVid && !isAud && (
        <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fff", border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={22} color={cfg.text} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, wordBreak: "break-all" }}>{file.name}</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{fmtSize(file.size)}</p>
          </div>
        </div>
      )}
      <div style={{ padding: "6px 12px", background: "rgba(0,0,0,.05)", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: cfg.text, fontWeight: 700 }}>✓ Ready to upload</span>
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtSize(file.size)}</span>
      </div>
    </div>
  );
}

// ══ UPLOAD / EDIT MODAL ═════════════════════════════════════════════
interface ModalProps {
  ed?: any; subjectId: string; nextSort: number;
  onClose: () => void; onSaved: () => void;
}
const MaterialModal = React.memo(({ ed, subjectId, nextSort, onClose, onSaved }: ModalProps) => {
  const { user } = useAuth();

  const [f, setF] = useState({
    title:           ed?.title           || "",
    title_ar:        ed?.title_ar        || "",
    description:     ed?.description     || "",
    material_type:   (ed?.material_type  || "PDF") as MatType,
    content:         ed?.content         || "",
    file_url:        ed?.file_url        || "",
    is_downloadable: ed?.is_downloadable ?? true,
    sort_order:      ed?.sort_order      ?? nextSort,
  });

  const [selectedLevels, setSelectedLevels] = useState<Set<Level>>(parseLevels(ed?.level));
  const [file,       setFile]       = useState<File | null>(null);
  const [objectUrl,  setObjectUrl]  = useState<string>("");
  const [phase,      setPhase]      = useState<"idle"|"uploading"|"saving"|"done"|"error">("idle");
  const [pct,        setPct]        = useState(0);
  const [err,        setErr]        = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef       = useRef<HTMLInputElement>(null);
  const pickerOpenRef = useRef(false);

  const cfg      = MAT_CFG[f.material_type];
  const needFile = !["Link", "Text"].includes(f.material_type);
  const needUrl  = f.material_type === "Link";
  const needText = f.material_type === "Text";
  const busy     = phase === "uploading" || phase === "saving";

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  // Android back-nav guard
  useEffect(() => {
    window.history.pushState({ smModalGuard: true }, "");
    const handlePopState = () => {
      window.history.pushState({ smModalGuard: true }, "");
      if (pickerOpenRef.current) pickerOpenRef.current = false;
      else onClose();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.smModalGuard) window.history.replaceState(null, "");
    };
  }, [onClose]);

  const pickFile = useCallback((picked: File) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const blobUrl = URL.createObjectURL(picked);    setObjectUrl(blobUrl);
    setFile(picked);
    setF(prev => ({
      ...prev,
      material_type: autoDetectType(picked),
      title: prev.title || picked.name.replace(/\.[^/.]+$/, ""),
    }));
    setErr("");
  }, [objectUrl]);

  const clearFile = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(""); setFile(null); setPct(0); setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }, [objectUrl]);

  const toggleLevel = (lv: Level) => {
    setSelectedLevels(prev => { const next = new Set(prev); next.has(lv) ? next.delete(lv) : next.add(lv); return next; });
  };

  const doSave = async () => {
    setErr("");
    if (!f.title.trim())                         { setErr("Title is required."); return; }
    if (needFile && !file && !f.file_url.trim()) { setErr("Please choose a file or paste a URL."); return; }
    if (needUrl  && !f.file_url.trim())          { setErr("Please enter a URL."); return; }
    if (needText && !f.content.trim())           { setErr("Content cannot be empty."); return; }
    if (selectedLevels.size === 0)               { setErr("Select at least one level."); return; }

    // ── Verify user is signed in before touching storage ────────────
    const {  { session } } = await supabase.auth.getSession();
    if (!session) {
      setErr("You must be signed in to upload files. Please refresh and log in again.");
      return;
    }

    setPhase("uploading"); setPct(5);

    try {
      let fileUrl  = needText ? "" : f.file_url.trim();
      let fileSize = 0;

      if (needFile && file) {
        const rawExt   = file.name.split(".").pop()?.toLowerCase() || "bin";
        const safeExt  = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin";
        const uploadPath = `materials/${subjectId}/${crypto.randomUUID()}.${safeExt}`;

        setPct(20);

        // ── Use the MAIN supabase client directly for upload ─────────
        // This uses the authenticated user's JWT session, which means        // the storage RLS policy (auth.role() = 'authenticated') is met.
        const { data: upData, error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(uploadPath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });

        if (upErr) {
          const msg = upErr.message || "";
          throw new Error(
            msg.includes("row-level security") || msg.includes("policy") || (upErr as any).status === 403
              ? `Storage permission denied.\n\nFix: Go to Supabase Dashboard → Storage → subject-files → Policies and add:\n• INSERT policy for authenticated users\n• SELECT policy for public (or authenticated)\n\nError: ${msg}`
              : msg.includes("already exists")
              ? "A file with this name already exists. Try again (a new unique name will be generated)."
              : msg.includes("Payload too large") || msg.includes("413")
              ? "File is too large. Contact support to increase the storage limit."
              : msg.includes("Invalid API key") || (upErr as any).status === 401
              ? "Invalid API key. Check that VITE_SUPABASE_PUBLISHABLE_KEY is set correctly in your environment variables."
              : msg.includes("Bucket not found") || (upErr as any).status === 404
              ? `Bucket 'subject-files' not found in your Supabase project.\n\nFix: Go to Supabase Dashboard → Storage → New bucket → name it 'subject-files' and enable public access.`
              : `Upload failed: ${msg}`
          );
        }

        fileUrl  = upData?.path || uploadPath;
        fileSize = file.size;
        setPct(85);
      }

      setPhase("saving"); setPct(92);

      const payload: any = {
        subject_id:      subjectId,
        title:           f.title.trim(),
        title_ar:        f.title_ar.trim()     || null,
        description:     f.description?.trim() || null,
        material_type:   f.material_type,
        content:         needText ? f.content.trim() : null,
        file_url:        fileUrl,
        file_size:       fileSize || null,
        level:           encodeLevels(selectedLevels),
        sort_order:      f.sort_order,
        is_downloadable: f.is_downloadable,
        ...(!ed?.id && user ? { uploaded_by: user.id } : {}),
      };

      const { error: dbErr } = ed?.id
        ? await supabase.from("subject_materials").update(payload).eq("id", ed.id)        : await supabase.from("subject_materials").insert(payload);

      if (dbErr) {
        // If DB insert fails but file was already uploaded, try to clean up
        if (needFile && file) {
          try { await supabase.storage.from(BUCKET).remove([payload.file_url]); } catch {}
        }
        throw new Error(`Database error: ${dbErr.message}`);
      }

      setPct(100); setPhase("done");
      toast({ title: "✅ Material saved successfully" });
      setTimeout(() => onSaved(), 600);

    } catch (e: any) {
      setPhase("error"); setPct(0);
      setErr(e.message || "Upload failed.");
      toast({ title: "Upload Error", description: e.message?.split("\n")[0], variant: "destructive" });
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.65)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (busy) return; if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, maxHeight: "94vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1, borderRadius: "20px 20px 0 0" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>
              {ed ? "Edit Material" : "Upload Material"}
            </h2>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
              PDF, Word, Excel, PowerPoint, Video, Audio, Images & more
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(239,68,68,.1)", border: "1.5px solid rgba(239,68,68,.3)", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} color="#DC2626" />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Error banner */}
          {err && (            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 12, whiteSpace: "pre-line", display: "flex", gap: 8 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{err}</span>
            </div>
          )}

          {/* Type selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8, letterSpacing: .5 }}>MATERIAL TYPE</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MAT_TYPES.map(mt => {
                const c = MAT_CFG[mt]; const Ic = c.icon; const sel = f.material_type === mt;
                return (
                  <button key={mt} type="button" disabled={busy}
                    onClick={() => { setF(x => ({ ...x, material_type: mt })); clearFile(); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, fontSize: 11, fontWeight: sel ? 800 : 500, border: `2px solid ${sel ? c.border : "#E5E7EB"}`, background: sel ? c.bg : "#fff", color: sel ? c.text : "#6B7280", cursor: "pointer", transition: "all .15s" }}>
                    <Ic size={12} /> {mt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* File drop zone */}
          {needFile && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8, letterSpacing: .5 }}>FILE</label>
              {file ? (
                <FilePreviewBlock file={file} type={f.material_type} objectUrl={objectUrl} onClear={clearFile} />
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const fi = e.dataTransfer.files?.[0]; if (fi) pickFile(fi); }}
                  style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${isDragOver ? cfg.border : "#D1D5DB"}`, borderRadius: 14, background: isDragOver ? cfg.bg : "#FAFAFA", padding: "32px 20px", textAlign: "center", transition: "all .2s" }}
                >
                  <div style={{ pointerEvents: "none" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Upload size={24} color={cfg.text} />
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: "0 0 4px" }}>Tap to choose a file, or drop here</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                      {f.material_type === "PDF"      ? "PDF files" :
                       f.material_type === "Video"    ? "MP4, WebM, MOV, AVI" :
                       f.material_type === "Audio"    ? "MP3, WAV, M4A, AAC" :
                       f.material_type === "Image"    ? "JPG, PNG, GIF, WebP, SVG, HEIC" :
                       f.material_type === "Document" ? "Word, Excel, PowerPoint, ODT, CSV, RTF" :
                       "Any file type"}
                    </p>
                  </div>                  {/* Transparent full-zone input — accept all file types to avoid Android document-picker back-nav bug */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="*/*"
                    disabled={busy}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0, padding: 0 }}
                    onClick={() => { pickerOpenRef.current = true; }}
                    onChange={e => {
                      pickerOpenRef.current = false;
                      const fi = e.target.files?.[0];
                      if (fi) pickFile(fi);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  />
                </div>
              )}

              {/* URL fallback */}
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>or paste a direct URL</span>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              </div>
              <input
                value={f.file_url} disabled={busy || !!file}
                onChange={e => setF(x => ({ ...x, file_url: e.target.value }))}
                placeholder="https://…"
                style={{ ...inp, marginTop: 8, opacity: file ? .4 : 1 }}
              />
            </div>
          )}

          {/* Link URL */}
          {needUrl && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>URL *</label>
              <input value={f.file_url} disabled={busy} onChange={e => { setF(x => ({ ...x, file_url: e.target.value })); setErr(""); }} placeholder="https://…" style={inp} />
            </div>
          )}

          {/* Text content */}
          {needText && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Content *</label>
              <textarea value={f.content} disabled={busy} rows={5} onChange={e => { setF(x => ({ ...x, content: e.target.value })); setErr(""); }} placeholder="Type the text content here…" style={{ ...inp, resize: "vertical" }} />
            </div>
          )}

          {/* Titles */}          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>TITLE (ENGLISH) *</label>
              <input value={f.title} disabled={busy} onChange={e => { setF(x => ({ ...x, title: e.target.value })); setErr(""); }} placeholder="e.g. Week 1 Worksheet" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>TITLE (ARABIC)</label>
              <input value={f.title_ar} disabled={busy} onChange={e => setF(x => ({ ...x, title_ar: e.target.value }))} placeholder="مثال: ورقة الأسبوع الأول" dir="rtl" style={{ ...inp, fontFamily: "'Amiri', serif" }} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>DESCRIPTION</label>
            <textarea value={f.description} disabled={busy} rows={2} onChange={e => setF(x => ({ ...x, description: e.target.value }))} placeholder="Brief description…" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Levels */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8, letterSpacing: .5 }}>VISIBLE TO LEVELS</label>
            <div style={{ display: "flex", gap: 8 }}>
              {ALL_LEVELS.map(lv => {
                const c = LVL_CFG[lv]; const sel = selectedLevels.has(lv);
                return (
                  <button key={lv} type="button" disabled={busy} onClick={() => toggleLevel(lv)}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, fontSize: 12, border: `2px solid ${sel ? c.border : "#E5E7EB"}`, background: sel ? c.bg : "#fff", cursor: "pointer", textAlign: "left", transition: "all .15s" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${sel ? c.border : "#D1D5DB"}`, background: sel ? c.text : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontWeight: sel ? 800 : 500, color: sel ? c.text : "#374151" }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedLevels.size === 0 && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>Select at least one level</p>}
          </div>

          {/* Options */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Allow Download</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Students can download this file</p>
            </div>
            <Switch checked={f.is_downloadable} onCheckedChange={v => setF(x => ({ ...x, is_downloadable: v }))} disabled={busy} />
          </div>

          {/* Progress */}
          {phase !== "idle" && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, fontSize: 13,              background: phase === "done" ? "#F0FDF4" : phase === "error" ? "#FEF2F2" : "#EFF6FF",
              border: `1px solid ${phase === "done" ? "#BBF7D0" : phase === "error" ? "#FECACA" : "#BFDBFE"}`,
              color: phase === "done" ? "#16A34A" : phase === "error" ? "#DC2626" : "#1D4ED8",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              {(phase === "uploading" || phase === "saving") && (
                <>
                  <Loader2 size={14} style={{ animation: "spin .8s linear infinite", flexShrink: 0 }} />
                  <span style={{ flexShrink: 0 }}>{phase === "uploading" ? `Uploading… ${pct}%` : "Saving to database…"}</span>
                  {phase === "uploading" && (
                    <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#BFDBFE", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#1D4ED8", borderRadius: 4, transition: "width .4s" }} />
                    </div>
                  )}
                </>
              )}
              {phase === "done"  && <>✅ Saved successfully!</>}
              {phase === "error" && <>❌ Error — see message above</>}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} disabled={busy}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={doSave}
              disabled={busy || phase === "done" || !f.title || selectedLevels.size === 0}
              style={{
                flex: 2, padding: "12px", borderRadius: 12, border: "none",
                background: busy || phase === "done" || !f.title || selectedLevels.size === 0 ? "#E5E7EB" : `linear-gradient(135deg, ${G}, ${GM})`,
                color: busy || phase === "done" || !f.title || selectedLevels.size === 0 ? "#9CA3AF" : "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {busy
                ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</>
                : <><Upload size={14} /> {ed ? "Update Material" : "Upload Material"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ══ MATERIAL CARD ════════════════════════════════════════════════════
function MaterialCard({ m, isPrivileged, onEdit, onDelete }: {
  m: any; isPrivileged: boolean; onEdit: () => void; onDelete: () => void;
}) {  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [previewErr,  setPreviewErr]  = useState("");

  const cfg  = MAT_CFG[(m.material_type as MatType) || "PDF"];
  const Icon = cfg.icon;
  const levels = parseLevels(m.level);
  const isText = m.material_type === "Text";
  const isLink = m.material_type === "Link";

  const resolveUrl = async (): Promise<string | null> => {
    if (resolvedUrl) return resolvedUrl;
    if (isLink) return m.file_url;
    setLoading(true); setPreviewErr("");
    try {
      const url = await getSignedUrl(m.file_url);
      if (url) { setResolvedUrl(url); return url; }
      setPreviewErr("Could not load file — check storage policies.");
      return null;
    } catch (e: any) {
      setPreviewErr("Preview failed: " + (e?.message || "Unknown error"));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (isLink) { window.open(m.file_url, "_blank"); return; }
    if (isText) { setExpanded(e => !e); return; }
    const url = await resolveUrl();
    if (url) setPreviewOpen(true);
  };

  const handleDownload = async () => {
    const url = await resolveUrl();
    if (url) window.open(url, "_blank");
  };

  return (
    <>
      <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${cfg.border}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px" }}>

          {/* Icon */}
          <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {m.material_type === "Image" && m.file_url?.startsWith("http")
              ? <img src={m.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />              : <Icon size={20} color={cfg.text} />}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: "0 0 2px", wordBreak: "break-word" }}>{m.title}</p>
            {m.title_ar && <p style={{ fontSize: 12, color: GOLD, margin: "0 0 4px", direction: "rtl", fontFamily: "'Amiri', serif" }}>{m.title_ar}</p>}
            {m.description && <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 6px", fontStyle: "italic" }}>{m.description}</p>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                {m.material_type || "PDF"}
              </span>
              {[...levels].map(lv => (
                <span key={lv} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: LVL_CFG[lv].bg, color: LVL_CFG[lv].text, border: `1px solid ${LVL_CFG[lv].border}` }}>
                  {LVL_CFG[lv].label}
                </span>
              ))}
              {m.file_size && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtSize(m.file_size)}</span>}
              {previewErr && <span style={{ fontSize: 10, color: "#DC2626" }}>⚠ {previewErr}</span>}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
            {!isText && (
              <button type="button" onClick={e => { e.stopPropagation(); handlePreview(); }} title={previewErr || "Preview"} disabled={loading}
                style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${previewErr ? "#FECACA" : cfg.border}`, background: previewErr ? "#FEF2F2" : cfg.bg, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading ? .7 : 1 }}>
                {loading ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite", color: "#9CA3AF" }} /> : previewErr ? <span style={{ fontSize: 14 }}>⚠</span> : <Eye size={14} color={cfg.text} />}
              </button>
            )}
            {!isLink && !isText && m.is_downloadable !== false && (
              <button type="button" onClick={handleDownload} title="Download"
                style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Download size={14} color={G} />
              </button>
            )}
            {isLink && (
              <button type="button" onClick={() => window.open(m.file_url, "_blank")} title="Open link"
                style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ExternalLink size={14} color={G} />
              </button>
            )}
            {isText && (
              <button type="button" onClick={() => setExpanded(e => !e)}
                style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {expanded ? <ChevronUp size={14} color={G} /> : <Eye size={14} color={G} />}
              </button>
            )}
            {isPrivileged && (
              <>                <button type="button" onClick={onEdit}
                  style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Edit2 size={14} color={G} />
                </button>
                <button type="button" onClick={onDelete}
                  style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={14} color="#DC2626" />
                </button>
              </>
            )}
          </div>
        </div>

        {isText && expanded && m.content && (
          <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${cfg.border}`, background: cfg.bg }}>
            <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
          </div>
        )}
      </div>

      {previewOpen && resolvedUrl && (
        <PreviewOverlay url={resolvedUrl} type={m.material_type as MatType} title={m.title} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}

// ══ MAIN COMPONENT ═══════════════════════════════════════════════════
interface SubjectMaterialsProps { subjectId: string; subjectTitle?: string; }

export default function SubjectMaterials({ subjectId, subjectTitle }: SubjectMaterialsProps) {
  const { hasRole } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState<any>(null);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState<MatType | "all">("all");

  const {  materials = [], isLoading } = useQuery({
    queryKey: ["sm-materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true })
        .order("created_at",  { ascending: false });      if (error) throw error;
      return data || [];
    },
  });

  const handleDelete = async (m: any) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    try {
      if (m.file_url && !m.file_url.startsWith("http")) {
        await removeStorageFile(m.file_url);
      }
      const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sm-materials", subjectId] });
      toast({ title: t("Material deleted", "تم حذف المادة") });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const filtered = (materials as any[]).filter(m => {
    const matchSearch = !search || m.title?.toLowerCase().includes(search.toLowerCase()) || m.title_ar?.toLowerCase().includes(search.toLowerCase());
    const matchType   = typeFilter === "all" || m.material_type === typeFilter;
    return matchSearch && matchType;
  });

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 16, background: "#F3F4F6", animation: "pulse 1.5s ease-in-out infinite" }} />)}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Search materials…", "ابحث في المواد…")} style={{ ...inp, paddingLeft: 30 }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ ...inp, width: "auto", minWidth: 120 }}>
          <option value="all">All Types</option>
          {MAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {isPrivileged && (
          <button type="button" onClick={() => { setEditing(null); setShowModal(true); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${G}, ${GM})`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>            <Plus size={14} /> {t("Upload", "رفع مادة")}
          </button>
        )}
      </div>

      {/* Stats */}
      {materials.length > 0 && (
        <div style={{ display: "flex", gap: 12, padding: "10px 14px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 12, color: "#6B7280", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: G }}>{materials.length} material{materials.length !== 1 ? "s" : ""}</span>
          {MAT_TYPES.filter(t => (materials as any[]).some(m => m.material_type === t)).map(type => (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: MAT_CFG[type].text }}>●</span>
              {(materials as any[]).filter(m => m.material_type === type).length} {type}
            </span>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", borderRadius: 16, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#F0FDF4", border: "1.5px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <File size={26} color={G} />
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, color: "#374151", margin: "0 0 4px" }}>
            {search || typeFilter !== "all" ? t("No matching materials", "لا توجد مواد مطابقة") : t("No materials yet", "لا توجد مواد بعد")}
          </p>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            {isPrivileged && !search && typeFilter === "all"
              ? t("Click 'Upload' to add PDF, Word, Excel, Video, Audio, Images and more", "اضغط 'رفع مادة' لإضافة مواد")
              : t("Try changing your search or filter", "جرب تغيير البحث أو المرشح")}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(m => (
            <MaterialCard
              key={m.id} m={m} isPrivileged={isPrivileged}
              onEdit={() => { setEditing(m); setShowModal(true); }}
              onDelete={() => handleDelete(m)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <MaterialModal
          ed={editing}
          subjectId={subjectId}          nextSort={(materials as any[]).length}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["sm-materials", subjectId] });
          }}
        />
      )}
    </div>
  );
}