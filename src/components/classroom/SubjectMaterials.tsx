// src/components/classroom/SubjectMaterials.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared component for managing subject materials (PDFs, videos, audio, images)
// DB columns used (EXACT match with tahleem_full_restore.sql):
//   subject_id, title, title_ar, description, material_type, content,
//   file_url, file_size, level, sort_order, is_downloadable, uploaded_by
//
// Storage bucket: subject-materials (must exist in Supabase Storage)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

import {
  Upload, FileText, Video, Music, Image as ImageIcon,
  Link as LinkIcon, File, Download, Trash2, Edit2, X, Check,
  Plus, Loader2, ExternalLink, FileSpreadsheet, Eye,
  ChevronDown, ChevronUp, Search,
} from "lucide-react";

// ── Theme constants (Tahleem Academy green-gold) ──────────────────────────
const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

// ── Types ──────────────────────────────────────────────────────────────────
type MatType = "PDF" | "Video" | "Audio" | "Image" | "Link" | "Text" | "Document";
type Level   = "beginner" | "intermediate" | "advanced";
const ALL_LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

const MAT_TYPES: MatType[] = ["PDF", "Video", "Audio", "Image", "Link", "Text", "Document"];

const MAT_CFG: Record<MatType, { icon: React.ElementType; bg: string; text: string; border: string; accent: string }> = {
  PDF:      { icon: FileText,        bg: "#FEF2F2", text: "#DC2626", border: "#FECACA", accent: "#DC2626" },
  Video:    { icon: Video,           bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0", accent: "#16A34A" },
  Audio:    { icon: Music,           bg: "#FDF4FF", text: "#9333EA", border: "#E9D5FF", accent: "#9333EA" },
  Image:    { icon: ImageIcon,       bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE", accent: "#2563EB" },
  Link:     { icon: LinkIcon,        bg: "#F0FDFA", text: "#0D9488", border: "#99F6E4", accent: "#0D9488" },
  Text:     { icon: FileText,        bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", accent: "#B45309" },
  Document: { icon: FileSpreadsheet, bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", accent: "#1D4ED8" },
};

const LVL_CFG: Record<Level, { label: string; bg: string; text: string; border: string }> = {
  beginner:     { label: "Beginner",     bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  intermediate: { label: "Intermediate", bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },  advanced:     { label: "Advanced",     bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE" },
};

const ACCEPT: Record<MatType, string> = {
  PDF:      ".pdf,application/pdf",
  Video:    "video/*,.mp4,.webm,.mov,.m4v,.avi",
  Audio:    "audio/*,.mp3,.wav,.m4a,.aac,.ogg",
  Image:    "image/*",
  Document: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods",
  Link: "", Text: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtSize(b?: number | null): string {
  if (!b) return "";
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function autoDetectType(file: File): MatType {
  const t = file.type.toLowerCase();
  const e = (file.name.split(".").pop() || "").toLowerCase();
  if (t.includes("pdf") || e === "pdf")                                         return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","m4v","avi"].includes(e))      return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e))          return "Document";
  return "PDF";
}

/** Parse DB's comma-sep level string → Set<Level> */
function parseLevels(raw?: string | null): Set<Level> {
  if (!raw || raw === "all") return new Set(ALL_LEVELS);
  return new Set(
    raw.split(",").map(s => s.trim()).filter(s => ALL_LEVELS.includes(s as Level)) as Level[]
  );
}

/** Encode Set<Level> → DB string (matches SQL: level TEXT DEFAULT 'beginner') */
function encodeLevels(sel: Set<Level>): string {
  if (sel.size === 0) return "beginner";
  if (sel.size === 3) return "all";
  return [...sel].join(",");
}

async function getSignedUrl(path: string): Promise<string | null> {
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("subject-materials").createSignedUrl(path, 3600);
  return data?.signedUrl || null;}

// ── Input style ────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box", fontFamily: "inherit",
};

// ══════════════════════════════════════════════════════════════════════════
// UPLOAD / EDIT MODAL
// ══════════════════════════════════════════════════════════════════════════
interface ModalProps {
  ed?: any;
  subjectId: string;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}

const MaterialModal = React.memo(({ ed, subjectId, nextSort, onClose, onSaved }: ModalProps) => {
  const { user } = useAuth();

  const [f, setF] = useState({
    title:          ed?.title          || "",
    title_ar:       ed?.title_ar       || "",
    description:    ed?.description    || "",  // ✅ Added: matches SQL schema
    material_type:  (ed?.material_type || "PDF") as MatType,
    content:        ed?.content        || "",
    file_url:       ed?.file_url       || "",
    is_downloadable: ed?.is_downloadable ?? true,
    sort_order:     ed?.sort_order     ?? nextSort,
  });

  const [selectedLevels, setSelectedLevels] = useState<Set<Level>>(
    parseLevels(ed?.level)
  );
  const [file,    setFile]    = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase,   setPhase]   = useState<"idle" | "uploading" | "saving" | "done" | "error">("idle");
  const [pct,     setPct]     = useState(0);
  const [err,     setErr]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const cfg     = MAT_CFG[f.material_type];
  const Icon    = cfg.icon;
  const needFile = !["Link", "Text"].includes(f.material_type);
  const needUrl  = f.material_type === "Link";
  const needText = f.material_type === "Text";  const busy     = phase === "uploading" || phase === "saving";

  const pickFile = useCallback((picked: File) => {
    const detected = autoDetectType(picked);
    setFile(picked);
    setF(prev => ({
      ...prev,
      material_type: detected,
      title: prev.title || picked.name.replace(/\.[^/.]+$/, ""),
    }));
    setErr("");
    if (picked.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setPreview(ev.target?.result as string);
      r.readAsDataURL(picked);
    } else {
      setPreview(null);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null); setPreview(null); setPct(0); setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const toggleLevel = (lv: Level) => {
    setSelectedLevels(prev => {
      const next = new Set(prev);
      next.has(lv) ? next.delete(lv) : next.add(lv);
      return next;
    });
  };

  const doSave = async () => {
    setErr("");
    if (!f.title.trim())                           { setErr("Title is required."); return; }
    if (needFile && !file && !f.file_url.trim())   { setErr("Please choose a file or paste a URL."); return; }
    if (needUrl  && !f.file_url.trim())            { setErr("Please enter a URL."); return; }
    if (needText && !f.content.trim())             { setErr("Content cannot be empty."); return; }

    setPhase("uploading"); setPct(5);

    try {
      let fileUrl  = f.file_url.trim();
      let fileSize = 0;

      if (needFile && file) {
        const ext  = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        setPct(50);        
        // ✅ CORRECT BUCKET NAME: subject-materials (matches our setup)
        const { error: upErr } = await supabase.storage
          .from("subject-materials")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        
        if (upErr) throw new Error("Storage: " + upErr.message);
        fileUrl  = path;
        fileSize = file.size;
      }

      setPct(90); setPhase("saving");

      // ✅ PAYLOAD MATCHES SQL SCHEMA EXACTLY (subject_materials table)
      const payload: any = {
        subject_id:      subjectId,
        title:           f.title.trim(),
        title_ar:        f.title_ar.trim() || null,
        description:     f.description?.trim() || null,  // ✅ Added: exists in SQL
        material_type:   f.material_type,                 // ✅ Correct column (NOT file_type)
        content:         needText ? f.content.trim() : null,
        file_url:        fileUrl || null,
        file_size:       fileSize || null,
        level:           encodeLevels(selectedLevels),    // ✅ Stored as TEXT: "beginner" or "all"
        sort_order:      f.sort_order,
        is_downloadable: f.is_downloadable,
        uploaded_by:     !ed?.id && user ? user.id : undefined,
        // ❌ REMOVED: file_type (does NOT exist in SQL schema)
      };

      const { error: dbErr } = ed?.id
        ? await supabase.from("subject_materials").update(payload).eq("id", ed.id)
        : await supabase.from("subject_materials").insert(payload);

      if (dbErr) throw new Error("Database: " + dbErr.message);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material saved successfully" });
      setTimeout(() => onSaved(), 500);
    } catch (e: any) {
      setPhase("error"); setPct(0);
      setErr(e.message || "Upload failed.");
      toast({ title: "Upload Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,        background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560,
        maxHeight: "92vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #E5E7EB",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "#fff", zIndex: 1, borderRadius: "20px 20px 0 0",
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>
              {ed ? "Edit Material" : "Upload Material"}
            </h2>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
              {ed ? "Update this resource" : "Add a resource to this subject"}
            </p>
          </div>
          <button
            type="button" onClick={onClose} disabled={busy}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#9CA3AF", lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Error banner */}
          {err && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 12 }}>
              {err}
            </div>
          )}

          {/* ── TYPE SELECTOR ──────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
              MATERIAL TYPE
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MAT_TYPES.map(mt => {
                const c   = MAT_CFG[mt];
                const Ic  = c.icon;
                const sel = f.material_type === mt;
                return (
                  <button key={mt} type="button" disabled={busy}                    onClick={() => setF(x => ({ ...x, material_type: mt }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 11px", borderRadius: 20, fontSize: 11, fontWeight: sel ? 800 : 500,
                      border: `2px solid ${sel ? c.border : "#E5E7EB"}`,
                      background: sel ? c.bg : "#fff", color: sel ? c.text : "#6B7280",
                      cursor: "pointer", transition: "all .15s",
                    }}
                  >
                    <Ic size={12} /> {mt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── DRAG & DROP ZONE ────────────────────────────────────── */}
          {needFile && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                FILE
              </label>
              <input
                ref={fileRef}
                id="sm-file-input"
                type="file"
                accept={ACCEPT[f.material_type] || "*/*"}
                disabled={busy}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
                onChange={e => { const fi = e.target.files?.[0]; if (fi) pickFile(fi); }}
              />

              {/* Drop zone */}
              <label
                htmlFor={busy ? undefined : "sm-file-input"}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setIsDragOver(false);
                  const fi = e.dataTransfer.files?.[0]; if (fi) pickFile(fi);
                }}
                style={{
                  display: "block",
                  border: `2px dashed ${isDragOver ? cfg.border : file ? cfg.border : "#D1D5DB"}`,
                  borderRadius: 14,
                  background: isDragOver ? cfg.bg : file ? `${cfg.bg}88` : "#FAFAFA",
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "all .2s",
                  minHeight: file && preview ? "auto" : 130,
                  display: "flex", flexDirection: "column",                  alignItems: "center", justifyContent: "center",
                  padding: 16, textAlign: "center", position: "relative",
                }}
              >
                {preview ? (
                  /* Image preview */
                  <div style={{ width: "100%", position: "relative" }}>
                    <img
                      src={preview} alt="Preview"
                      style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 10, display: "block" }}
                    />
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); clearFile(); }}
                      style={{
                        position: "absolute", top: -8, right: -8,
                        width: 24, height: 24, borderRadius: "50%",
                        background: "#DC2626", color: "#fff", border: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <X size={12} />
                    </button>
                    <p style={{ fontSize: 11, color: "#16A34A", fontWeight: 700, marginTop: 8 }}>
                      ✓ {file?.name} · {fmtSize(file?.size)}
                    </p>
                  </div>
                ) : file ? (
                  /* Non-image file selected */
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 12,
                      background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={24} color={cfg.text} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>{file.name}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{fmtSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); clearFile(); }}
                      style={{ fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Remove file
                    </button>
                  </div>
                ) : (                  /* Empty state */
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#9CA3AF" }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Upload size={22} color={cfg.text} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>
                        Drop your file here, or <span style={{ color: cfg.text }}>browse</span>
                      </p>
                      <p style={{ fontSize: 11, margin: "3px 0 0" }}>
                        {f.material_type === "PDF"   ? "PDF files up to 500 MB" :
                         f.material_type === "Video" ? "MP4, WebM, MOV up to 2 GB" :
                         f.material_type === "Audio" ? "MP3, WAV, M4A up to 100 MB" :
                         f.material_type === "Image" ? "JPG, PNG, GIF, WebP" :
                         "Any document file"}
                      </p>
                    </div>
                  </div>
                )}
              </label>

              {/* URL fallback */}
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>or paste URL</span>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              </div>
              <input
                value={f.file_url} disabled={busy}
                onChange={e => setF(x => ({ ...x, file_url: e.target.value }))}
                placeholder="https://…"
                style={{ ...inp, marginTop: 8 }}
              />
            </div>
          )}

          {/* URL-only mode */}
          {needUrl && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>URL *</label>
              <input
                value={f.file_url} disabled={busy}
                onChange={e => { setF(x => ({ ...x, file_url: e.target.value })); setErr(""); }}
                placeholder="https://…" style={inp}
              />
            </div>          )}

          {/* Text content mode */}
          {needText && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Content *</label>
              <textarea
                value={f.content} disabled={busy} rows={5}
                onChange={e => { setF(x => ({ ...x, content: e.target.value })); setErr(""); }}
                placeholder="Type the text content here…"
                style={{ ...inp, resize: "vertical" }}
              />
            </div>
          )}

          {/* ── TITLES ──────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                TITLE (ENGLISH) *
              </label>
              <input
                value={f.title} disabled={busy}
                onChange={e => { setF(x => ({ ...x, title: e.target.value })); setErr(""); }}
                placeholder="e.g. Week 1 Worksheet" style={inp}
                autoFocus={!file}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                TITLE (ARABIC)
              </label>
              <input
                value={f.title_ar} disabled={busy}
                onChange={e => setF(x => ({ ...x, title_ar: e.target.value }))}
                placeholder="مثال: ورقة الأسبوع الأول"
                dir="rtl" style={{ ...inp, fontFamily: "'Amiri', serif" }}
              />
            </div>
          </div>

          {/* ── DESCRIPTION (matches SQL schema) ─────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
              DESCRIPTION
            </label>
            <textarea
              value={f.description} disabled={busy} rows={2}
              onChange={e => setF(x => ({ ...x, description: e.target.value }))}
              placeholder="Brief description of this material..."              style={{ ...inp, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {/* ── LEVELS ──────────────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
              VISIBLE TO LEVELS
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {ALL_LEVELS.map(lv => {
                const c   = LVL_CFG[lv];
                const sel = selectedLevels.has(lv);
                return (
                  <button
                    key={lv} type="button" disabled={busy}
                    onClick={() => toggleLevel(lv)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", borderRadius: 10, fontSize: 12,
                      border: `2px solid ${sel ? c.border : "#E5E7EB"}`,
                      background: sel ? c.bg : "#fff",
                      cursor: "pointer", textAlign: "left", transition: "all .15s",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${sel ? c.border : "#D1D5DB"}`,
                      background: sel ? c.text : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontWeight: sel ? 800 : 500, color: sel ? c.text : "#374151" }}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedLevels.size === 0 && (
              <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
                Select at least one level
              </p>
            )}
          </div>

          {/* ── OPTIONS ROW ─────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            <div>              <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Allow Download</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Students can download this file</p>
            </div>
            <Switch
              checked={f.is_downloadable}
              onCheckedChange={v => setF(x => ({ ...x, is_downloadable: v }))}
              disabled={busy}
            />
          </div>

          {/* ── PROGRESS ────────────────────────────────────────────── */}
          {phase !== "idle" && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, fontSize: 13,
              background: phase === "done"  ? "#F0FDF4" :
                          phase === "error" ? "#FEF2F2" : "#EFF6FF",
              border: `1px solid ${phase === "done"  ? "#BBF7D0" :
                                   phase === "error" ? "#FECACA" : "#BFDBFE"}`,
              color: phase === "done"  ? "#16A34A" :
                     phase === "error" ? "#DC2626" : "#1D4ED8",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              {phase === "uploading" && <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Uploading… {pct}%</>}
              {phase === "saving"    && <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving to database…</>}
              {phase === "done"      && <>✅ Saved successfully!</>}
              {phase === "error"     && <>❌ Error — check details above</>}
            </div>
          )}

          {/* ── ACTIONS ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button" onClick={onClose} disabled={busy}
              style={{
                flex: 1, padding: "12px", borderRadius: 12,
                border: "1.5px solid #E5E7EB", background: "#fff",
                color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doSave}
              disabled={busy || phase === "done" || !f.title || selectedLevels.size === 0}
              style={{
                flex: 2, padding: "12px", borderRadius: 12, border: "none",
                background: busy || phase === "done" || !f.title || selectedLevels.size === 0
                  ? "#E5E7EB"
                  : `linear-gradient(135deg, ${G}, ${GM})`,                color: busy || phase === "done" || !f.title || selectedLevels.size === 0
                  ? "#9CA3AF" : "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {busy
                ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</>
                : <><Upload size={14} /> {ed ? "Update Material" : "Upload Material"}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MATERIAL CARD
// ══════════════════════════════════════════════════════════════════════════
function MaterialCard({
  m, isPrivileged, onEdit, onDelete,
}: {
  m: any; isPrivileged: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cfg  = MAT_CFG[(m.material_type as MatType) || "PDF"];
  const Icon = cfg.icon;

  const levels    = parseLevels(m.level);
  const isImg     = m.material_type === "Image" || (m.file_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !m.file_url.startsWith("http"));
  const isText    = m.material_type === "Text";
  const isLink    = m.material_type === "Link";
  const [expanded, setExpanded] = useState(false);

  const fetchUrl = async () => {
    if (signedUrl || loading || isLink) return;
    setLoading(true);
    const url = await getSignedUrl(m.file_url);
    setSignedUrl(url);
    setLoading(false);
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 16,      border: `1px solid ${cfg.border}`,
      overflow: "hidden", transition: "box-shadow .18s",
    }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px" }}>

        {/* Icon / Image thumbnail */}
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: cfg.bg, border: `1.5px solid ${cfg.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {isImg && m.file_url?.startsWith("http") ? (
            <img src={m.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Icon size={20} color={cfg.text} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: "0 0 2px", wordBreak: "break-word" }}>
            {m.title}
          </p>
          {m.title_ar && (
            <p style={{ fontSize: 12, color: GOLD, margin: "0 0 4px", direction: "rtl", fontFamily: "'Amiri', serif" }}>
              {m.title_ar}
            </p>
          )}
          {m.description && (
            <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 4px", fontStyle: "italic" }}>
              {m.description}
            </p>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
            }}>
              {m.material_type || "PDF"}
            </span>
            {[...levels].map(lv => (
              <span key={lv} style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: LVL_CFG[lv].bg, color: LVL_CFG[lv].text,
                border: `1px solid ${LVL_CFG[lv].border}`,
              }}>
                {LVL_CFG[lv].label}
              </span>            ))}
            {m.file_size && (
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtSize(m.file_size)}</span>
            )}
            {isText && (
              <button
                type="button" onClick={() => setExpanded(e => !e)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#6B7280", display: "flex", alignItems: "center", gap: 3 }}
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? "Collapse" : "Preview"}
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {/* View/Download */}
          {!isText && (
            <button
              type="button"
              onClick={async () => {
                if (isLink) { window.open(m.file_url, "_blank"); return; }
                await fetchUrl();
                if (signedUrl) window.open(signedUrl, "_blank");
              }}
              style={{
                width: 34, height: 34, borderRadius: 10,
                border: "1px solid #E5E7EB", background: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {loading
                ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite", color: "#9CA3AF" }} />
                : isLink
                  ? <ExternalLink size={14} color="#6B7280" />
                  : m.is_downloadable !== false
                    ? <Download size={14} color={G} />
                    : <Eye size={14} color={G} />
              }
            </button>
          )}

          {/* Admin only: edit / delete */}
          {isPrivileged && (
            <>
              <button
                type="button" onClick={onEdit}
                style={{                  width: 34, height: 34, borderRadius: 10,
                  border: "1px solid #E5E7EB", background: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Edit2 size={14} color={G} />
              </button>
              <button
                type="button" onClick={onDelete}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  border: "1px solid #FEE2E2", background: "#FEF2F2",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 size={14} color="#DC2626" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Text content expanded */}
      {isText && expanded && m.content && (
        <div style={{
          padding: "12px 16px 16px", borderTop: `1px solid ${cfg.border}`,
          background: cfg.bg,
        }}>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
            {m.content}
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
interface SubjectMaterialsProps {
  subjectId: string;
  subjectTitle?: string;
}

export default function SubjectMaterials({ subjectId, subjectTitle }: SubjectMaterialsProps) {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]  = useState<any>(null);
  const [search,    setSearch]   = useState("");
  const [typeFilter, setTypeFilter] = useState<MatType | "all">("all");

  // ── Fetch ────────────────────────────────────────────────────────────
  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["sm-materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true })
        .order("created_at",  { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ── Delete ───────────────────────────────────────────────────────────
  const handleDelete = async (m: any) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    try {
      // Remove from storage if it's a relative path (not a URL)
      if (m.file_url && !m.file_url.startsWith("http")) {
        await supabase.storage.from("subject-materials").remove([m.file_url]);
      }
      const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sm-materials", subjectId] });
      toast({ title: t("Material deleted", "تم حذف المادة") });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────
  const filtered = (materials as any[]).filter(m => {
    const matchSearch = !search ||
      m.title?.toLowerCase().includes(search.toLowerCase()) ||
      m.title_ar?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || m.material_type === typeFilter;
    return matchSearch && matchType;
  });

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (isLoading) {    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 72, borderRadius: 16, background: "#F3F4F6",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ))}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <Search size={13} style={{
            position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: "#9CA3AF",
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("Search materials…", "ابحث في المواد…")}
            style={{ ...inp, paddingLeft: 30 }}
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as any)}
          style={{ ...inp, width: "auto", minWidth: 110 }}
        >
          <option value="all">All Types</option>
          {MAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Upload button — admin/teacher only */}
        {isPrivileged && (
          <button
            type="button"
            onClick={() => { setEditing(null); setShowModal(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,              padding: "9px 16px", borderRadius: 10, border: "none",
              background: `linear-gradient(135deg, ${G}, ${GM})`,
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} />
            {t("Upload", "رفع مادة")}
          </button>
        )}
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      {materials.length > 0 && (
        <div style={{
          display: "flex", gap: 12, padding: "10px 14px",
          borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB",
          fontSize: 12, color: "#6B7280", flexWrap: "wrap",
        }}>
          <span style={{ fontWeight: 700, color: G }}>{materials.length} material{materials.length !== 1 ? "s" : ""}</span>
          {MAT_TYPES.filter(t => (materials as any[]).some(m => m.material_type === t)).map(type => (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: MAT_CFG[type].text }}>●</span>
              {(materials as any[]).filter(m => m.material_type === type).length} {type}
            </span>
          ))}
        </div>
      )}

      {/* ── Materials list ────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          borderRadius: 16, border: "2px dashed #E5E7EB",
          background: "#FAFAFA",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "#F0FDF4", border: "1.5px solid #86EFAC",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <File size={26} color={G} />
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, color: "#374151", margin: "0 0 4px" }}>
            {search || typeFilter !== "all"
              ? t("No matching materials", "لا توجد مواد مطابقة")
              : t("No materials yet", "لا توجد مواد بعد")}
          </p>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>            {isPrivileged && !search && typeFilter === "all"
              ? t("Click 'Upload' to add the first material", "اضغط 'رفع مادة' لإضافة أول مادة")
              : t("Try changing your search or filter", "جرب تغيير البحث أو المرشح")}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(m => (
            <MaterialCard
              key={m.id}
              m={m}
              isPrivileged={isPrivileged}
              onEdit={() => { setEditing(m); setShowModal(true); }}
              onDelete={() => handleDelete(m)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────── */}
      {showModal && (
        <MaterialModal
          ed={editing}
          subjectId={subjectId}
          nextSort={(materials as any[]).length}
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