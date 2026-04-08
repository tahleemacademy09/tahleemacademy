/**
 * MaterialManagerPro.tsx
 * ────────────────────────────────────────────────────────────────────
 * Admin page at /admin/material-manager
 * • Shows all subjects as selectable cards
 * • Upload any file to Supabase "subject-files" bucket
 * • Library with search, type filter, view, download, delete
 * • Instantly visible to students (invalidates all relevant queries)
 *
 * Critical fixes vs previous version:
 *   ✅ useQuery returns { data } not { subjectsData } — subjects now render
 *   ✅ Uses session.access_token (not anon key) for authenticated uploads
 *   ✅ Adds apikey header required by Supabase Storage REST API
 *   ✅ Stores storage PATH in file_url (not public URL) — signed URLs work
 *   ✅ AuthContext exposes `loading` not `isLoading`
 *   ✅ Title input with auto-fill from filename
 *   ✅ Subject search + material search + type filter
 *   ✅ Debug panel removed — clean production UI
 *   ✅ MaterialUploaderNew import removed (file uses bad supabase path)
 */

import React, {
  useState, useRef, useCallback, useMemo, useEffect, memo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Supabase Config ──────────────────────────────────────────────────────────
const SUPABASE_URL  = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? "";
const BUCKET        = "subject-files";

// ─── Brand colours (match existing Tahleem theme) ─────────────────────────────
const G  = "#064E3B";
const G2 = "#065F46";
const GL = "#ECFDF5";
const GM = "#D1FAE5";

const RED    = "#DC2626";
const REDL   = "#FEF2F2";
const BORDER = "#E5E7EB";
const BG     = "#F3F4F6";
const CARD   = "#FFFFFF";
const TEXT   = "#111827";
const MUTED  = "#9CA3AF";
const SUB    = "#6B7280";

// ─── Material type registry ───────────────────────────────────────────────────
type MatType = "PDF"|"Video"|"Audio"|"Image"|"Document"|"Link"|"Text";

const TM: Record<MatType,{ emoji:string; color:string; light:string; border:string }> = {
  PDF:      { emoji:"📄", color:"#DC2626", light:"#FEF2F2", border:"#FCA5A5" },
  Video:    { emoji:"🎬", color:"#7C3AED", light:"#F5F3FF", border:"#C4B5FD" },
  Audio:    { emoji:"🎵", color:"#0D9488", light:"#F0FDFA", border:"#99F6E4" },
  Image:    { emoji:"🖼️", color:"#2563EB", light:"#EFF6FF", border:"#BFDBFE" },
  Document: { emoji:"📝", color:"#D97706", light:"#FFFBEB", border:"#FDE68A" },
  Link:     { emoji:"🔗", color:"#6B7280", light:"#F9FAFB", border:"#D1D5DB" },
  Text:     { emoji:"✏️", color:"#374151", light:"#F9FAFB", border:"#D1D5DB" },
};

const ALL_TYPES = Object.keys(TM) as MatType[];

// ─── DB row types ─────────────────────────────────────────────────────────────
interface SubjectRow {
  id:        string;
  title:     string;
  title_ar:  string | null;
  is_active: boolean | null;
  image_url: string | null;
  level:     string | null;
}

interface MaterialRow {
  id:             string;
  subject_id:     string;
  title:          string;
  material_type:  string | null;
  file_url:       string;       // stores storage PATH, not public URL
  file_type:      string | null;
  file_size:      number | null;
  content:        string | null;
  is_downloadable:boolean | null;
  sort_order:     number | null;
  uploaded_by:    string;
  created_at:     string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectType(file: File): MatType {
  const t = file.type.toLowerCase();
  const e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (t.includes("pdf")   || e === "pdf")                                        return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","avi","m4v","mkv"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif","heic"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","csv"].includes(e))    return "Document";
  return "PDF";
}

function fmtSize(b?: number | null): string {
  if (!b) return "";
  if (b < 1_024)       return `${b} B`;
  if (b < 1_048_576)   return `${(b / 1_024).toFixed(0)} KB`;
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_073_741_824).toFixed(2)} GB`;
}

function ago(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Resolves a storage path or URL into a usable signed URL
async function resolveUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;          // already a URL
  if (["_text_","link","text-content"].includes(fileUrl)) return "";
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(fileUrl, 3600);
  return data?.signedUrl ?? "";
}

// ─── XHR upload with real byte-level progress ─────────────────────────────────
// Supabase Storage REST API requires BOTH Authorization Bearer AND apikey header
function xhrUpload(
  path: string, file: File, accessToken: string,
  onPct: (n: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);           // ← required by Supabase
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onPct(Math.round(ev.loaded / ev.total * 88));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onPct(93); resolve();
      } else {
        try {
          const j = JSON.parse(xhr.responseText) as { error?: string; message?: string };
          reject(new Error(j.error ?? j.message ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      }
    };
    xhr.onerror  = () => reject(new Error("Network error"));
    xhr.onabort  = () => reject(new Error("Upload aborted"));

    const fd = new FormData();
    fd.append("file", file, file.name);     // Supabase expects field name "file"
    xhr.send(fd);
  });
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const cardSt: React.CSSProperties = {
  background: CARD, borderRadius: 16,
  border: `1.5px solid ${BORDER}`,
  boxShadow: "0 2px 10px rgba(0,0,0,.05)",
};

const inputSt: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  padding: "11px 14px", fontSize: 14, outline: "none",
  border: `1.5px solid ${BORDER}`, borderRadius: 10,
  background: "#fff", color: TEXT,
};

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 800, color: "#374151",
  textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8,
};

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD MODAL
// ═════════════════════════════════════════════════════════════════════════════
type Phase = "idle" | "uploading" | "saving" | "done" | "error";

interface UploadModalProps {
  subject: SubjectRow;
  count:   number;
  onClose: () => void;
  onDone:  () => void;
}

const UploadModal = memo(({ subject, count, onClose, onDone }: UploadModalProps) => {
  const { user, session } = useAuth();           // ← use `session` for access_token

  const [title,  setTitle]  = useState("");
  const [file,   setFile]   = useState<File | null>(null);
  const [thumb,  setThumb]  = useState<string | null>(null);
  const [pct,    setPct]    = useState(0);
  const [phase,  setPhase]  = useState<Phase>("idle");
  const [err,    setErr]    = useState("");
  const [drag,   setDrag]   = useState(false);
  const dragCnt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // ── Android file-picker guard ────────────────────────────────────────────
  // On Android (Chrome/Kiwi), opening the file picker fires window "blur".
  // When the user returns after picking, the browser fires a synthetic click
  // that lands on the backdrop and incorrectly closes the modal.
  // We track whether the file picker is open and block backdrop dismissal.
  const filePickerOpen = useRef(false);

  useEffect(() => {
    const onWindowBlur = () => {
      // Window lost focus = file picker (or another dialog) just opened
      filePickerOpen.current = true;
    };
    const onWindowFocus = () => {
      // Window regained focus = user returned from file picker.
      // Delay the reset so the onChange fires before we allow backdrop clicks.
      setTimeout(() => { filePickerOpen.current = false; }, 800);
    };
    window.addEventListener("blur",  onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur",  onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  const busy = phase === "uploading" || phase === "saving";

  const pickFile = useCallback((f: File) => {
    setFile(f);
    setTitle(prev => prev.trim() || f.name.replace(/\.[^/.]+$/, ""));
    setErr("");
    setThumb(null);
    if (f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setThumb(ev.target?.result as string);
      r.readAsDataURL(f);
    }
  }, []);

  const clearFile = () => {
    setFile(null); setThumb(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDE = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDrag(true); };
  const onDL = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current--;
    if (dragCnt.current <= 0) { dragCnt.current = 0; setDrag(false); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current = 0; setDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) pickFile(f);
  };

  const upload = async () => {
    setErr("");
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!file)         { setErr("Please select a file"); return; }
    if (!user)         { setErr("You must be signed in"); return; }
    if (!session?.access_token) { setErr("Session expired — please sign in again"); return; }

    setPhase("uploading"); setPct(5);
    try {
      const ext  = file.name.split(".").pop() ?? "bin";
      const path = `${subject.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const mtype = detectType(file);

      // Try XHR (real progress), fall back to SDK
      try {
        await xhrUpload(path, file, session.access_token, setPct);
      } catch {
        setPct(40);
        const { error: storErr } = await supabase.storage
          .from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
        if (storErr) throw new Error(`Storage: ${storErr.message}`);
        setPct(90);
      }

      setPct(96); setPhase("saving");

      // ✅ Store PATH (not public URL) so signed URLs work correctly
      const { error: dbErr } = await supabase.from("subject_materials").insert({
        subject_id:      subject.id,
        title:           title.trim(),
        material_type:   mtype,
        file_url:        path,              // ← storage path, not full URL
        file_type:       file.type,
        file_size:       file.size,
        is_downloadable: true,
        sort_order:      count,
        uploaded_by:     user.id,
      });
      if (dbErr) throw new Error(`Database: ${dbErr.message}`);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material uploaded successfully!" });
      setTimeout(() => onDone(), 700);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setPhase("error"); setPct(0); setErr(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    }
  };

  const barColor = phase === "done" ? "#16A34A" : phase === "saving" ? "#B8860B" : G;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={e => {
        // Guard: ignore backdrop clicks while file picker is open (Android bug)
        if (e.target === e.currentTarget && !busy && !filePickerOpen.current) onClose();
      }}
    >
      <div style={{
        background: "#fff", borderRadius: "22px 22px 0 0",
        width: "100%", maxWidth: 520,
        maxHeight: "92vh", overflowY: "auto",
        animation: "mmp-up .22s ease",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg,${G},${G2})`,
          padding: "18px 20px", borderRadius: "22px 22px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 2,
        }}>
          <div>
            <h3 style={{ color: "#fff", fontWeight: 900, fontSize: 17, margin: 0 }}>
              📤 Upload Material
            </h3>
            <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "3px 0 0" }}>
              {subject.title}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            style={{
              background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)",
              borderRadius: 9, width: 34, height: 34, cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 16,
            }}>✕</button>
        </div>

        <div style={{ padding: "22px 20px 36px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Error */}
          {err && (
            <div style={{
              display: "flex", gap: 10, padding: "12px 14px",
              background: REDL, border: `1.5px solid #FCA5A5`,
              borderRadius: 11, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <p style={{ margin: 0, fontSize: 13, color: "#991B1B", flex: 1, fontWeight: 600 }}>{err}</p>
              <button onClick={() => setErr("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 16 }}>✕</button>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={labelSt}>Title <span style={{ color: RED }}>*</span></label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Week 4 Tajweed Notes"
              disabled={busy} autoFocus
              style={{ ...inputSt, borderColor: !title && err ? "#FCA5A5" : BORDER }}
            />
          </div>

          {/* File zone */}
          <div>
            <label style={labelSt}>File <span style={{ color: RED }}>*</span></label>
            <input ref={fileRef} id="mmp-file-input" type="file" accept="*/*"
              style={{ position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />

            {file ? (
              <div style={{
                borderRadius: 14, border: `2px solid ${GM}`,
                background: GL, overflow: "hidden",
              }}>
                {thumb && (
                  <img src={thumb} alt="" style={{ width: "100%", maxHeight: 140, objectFit: "cover", display: "block" }} />
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{TM[detectType(file)].emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: TEXT, margin: "0 0 3px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                    <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{fmtSize(file.size)}</p>
                  </div>
                  {!busy && (
                    <button onClick={clearFile}
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1.5px solid ${GM}`,
                        background: "#fff", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 14 }}>✕</button>
                  )}
                </div>
              </div>
            ) : (
              <label htmlFor={busy ? undefined : "mmp-file-input"}
                onDragEnter={onDE} onDragLeave={onDL}
                onDragOver={e => e.preventDefault()} onDrop={onDrop}
                onClick={() => { if (!busy) filePickerOpen.current = true; }}
                style={{
                  display:"block", padding: "36px 20px", borderRadius: 18, textAlign: "center",
                  cursor: busy ? "not-allowed" : "pointer",
                  border: `2.5px dashed ${drag ? G : "#CFCFCF"}`,
                  background: drag ? `linear-gradient(135deg,${GL},${GM})` : BG,
                  transform: drag ? "scale(1.02)" : "scale(1)",
                  boxShadow: drag ? `0 0 0 5px ${G}18` : "none",
                  transition: "all .2s ease",
                }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 18, margin: "0 auto 16px",
                  background: drag ? GM : "#E5E7EB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, transition: "all .2s",
                }}>{drag ? "🎯" : "📂"}</div>
                <p style={{ fontWeight: 900, fontSize: 16, margin: "0 0 6px",
                  color: drag ? G : TEXT, transition: "color .2s" }}>
                  {drag ? "Drop it here!" : "Tap to browse or drag any file"}
                </p>
                <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
                  PDF · Word · Video · Audio · Image — any file type accepted
                </p>
              </label>
            )}
          </div>

          {/* Progress */}
          {phase !== "idle" && phase !== "error" && (
            <div style={{
              padding: "13px 16px", borderRadius: 12,
              background: "#F0FDF4", border: "1px solid #BBF7D0",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                  {phase === "uploading" ? "Uploading file…"
                    : phase === "saving" ? "Saving to database…"
                    : "Upload complete ✓"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: barColor }}>{pct}%</span>
              </div>
              <div style={{ height: 10, background: "#D1FAE5", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99, width: `${pct}%`,
                  background: `linear-gradient(90deg,${barColor},${barColor}99)`,
                  transition: "width .35s ease",
                }} />
              </div>
              {phase === "uploading" && file && (
                <p style={{ fontSize: 11, color: MUTED, margin: "5px 0 0" }}>
                  {fmtSize(Math.round(pct / 100 * file.size))} / {fmtSize(file.size)}
                </p>
              )}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={onClose} disabled={busy}
              style={{
                flex: 1, padding: "14px", borderRadius: 12,
                border: `1.5px solid ${BORDER}`, background: "#fff", color: TEXT,
                fontWeight: 700, fontSize: 15, cursor: busy ? "not-allowed" : "pointer",
              }}>
              Cancel
            </button>
            <button type="button" onClick={upload}
              disabled={busy || !file || phase === "done"}
              style={{
                flex: 2, padding: "14px", borderRadius: 12, border: "none",
                background: busy || !file || phase === "done"
                  ? "#E5E7EB"
                  : `linear-gradient(135deg,${G},${G2})`,
                color: busy || !file || phase === "done" ? MUTED : "#fff",
                fontWeight: 900, fontSize: 15,
                cursor: busy || !file || phase === "done" ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: busy || !file || phase === "done" ? "none" : `0 6px 20px ${G}44`,
                transition: "all .2s",
              }}>
              <span style={{ animation: busy ? "mmp-spin .7s linear infinite" : "none", display: "inline-flex" }}>
                {phase === "done" ? "✅" : phase === "error" ? "🔄" : busy ? "⟳" : "⬆"}
              </span>
              {phase === "uploading" ? `Uploading ${pct}%…`
                : phase === "saving" ? "Saving…"
                : phase === "done"   ? "Done!"
                : phase === "error"  ? "Retry"
                : "Upload Material"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
UploadModal.displayName = "UploadModal";

// ═════════════════════════════════════════════════════════════════════════════
// MATERIAL CARD
// ═════════════════════════════════════════════════════════════════════════════
interface MatCardProps {
  mat:      MaterialRow;
  idx:      number;
  onDelete: (m: MaterialRow) => void;
}

const MatCard = memo(({ mat, idx, onDelete }: MatCardProps) => {
  const t = TM[(mat.material_type as MatType) ?? "PDF"];
  const [imgSrc,  setImgSrc]  = useState<string | null>(null);
  const [menuOpen,setMenuOpen]= useState(false);

  // Resolve thumbnail for images
  useEffect(() => {
    if (mat.material_type !== "Image" || !mat.file_url) return;
    resolveUrl(mat.file_url).then(url => { if (url) setImgSrc(url); });
  }, [mat.file_url, mat.material_type]);

  const openFile = async () => {
    const url = await resolveUrl(mat.file_url);
    if (url) window.open(url, "_blank");
  };

  const downloadFile = async () => {
    const url = await resolveUrl(mat.file_url);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = mat.title; a.click();
  };

  const hasFile = !!mat.file_url && !["_text_","link","text-content"].includes(mat.file_url);

  return (
    <div className="mmp-card" style={{
      ...cardSt, overflow: "hidden",
      animation: `mmp-in .28s ease both`,
      animationDelay: `${idx * 50}ms`,
    }}>
      <div style={{ height: 3, background: t.color }} />
      {mat.material_type === "Image" && imgSrc && (
        <div style={{ height: 110, overflow: "hidden", background: t.light }}>
          <img src={imgSrc} alt={mat.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setImgSrc(null)} />
        </div>
      )}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, fontSize: 22,
            background: t.light, border: `1.5px solid ${t.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{t.emoji}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: 700, fontSize: 13, color: TEXT, margin: "0 0 4px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{mat.title}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                background: `${t.color}18`, color: t.color,
              }}>{mat.material_type}</span>
              {(mat.file_size ?? 0) > 0 && (
                <span style={{ fontSize: 10, color: MUTED }}>{fmtSize(mat.file_size)}</span>
              )}
              <span style={{ fontSize: 10, color: MUTED }}>{ago(mat.created_at)}</span>
            </div>
          </div>

          {/* Context menu */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" aria-label="Options"
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1.5px solid ${BORDER}`, background: "#fff",
                cursor: "pointer", fontSize: 16, color: MUTED,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>⋮</button>

            {menuOpen && (
              <div onMouseLeave={() => setMenuOpen(false)} style={{
                position: "absolute", right: 0, top: 34, zIndex: 50, minWidth: 145,
                background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`,
                boxShadow: "0 10px 32px rgba(0,0,0,.14)",
                padding: 6, animation: "mmp-pop .15s ease",
              }}>
                {hasFile && (
                  <MenuItem emoji="👁" color={SUB}
                    onClick={() => { openFile(); setMenuOpen(false); }}>View</MenuItem>
                )}
                {hasFile && mat.is_downloadable && (
                  <MenuItem emoji="⬇" color="#0D9488"
                    onClick={() => { downloadFile(); setMenuOpen(false); }}>Download</MenuItem>
                )}
                <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
                <MenuItem emoji="🗑" color={RED}
                  onClick={() => { onDelete(mat); setMenuOpen(false); }}>Delete</MenuItem>
              </div>
            )}
          </div>
        </div>

        {mat.content && (
          <p style={{
            fontSize: 11, color: SUB, margin: "10px 0 0", lineHeight: 1.5,
            padding: "8px 10px", background: BG, borderRadius: 8,
            border: `1px solid ${BORDER}`,
            display: "-webkit-box" as React.CSSProperties["display"],
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
            overflow: "hidden",
          }}>{mat.content}</p>
        )}
        {mat.is_downloadable && hasFile && (
          <span style={{ fontSize: 10, color: G, fontWeight: 700, display: "block", marginTop: 8 }}>
            ⬇ Downloadable
          </span>
        )}
      </div>
    </div>
  );
});
MatCard.displayName = "MatCard";

function MenuItem({ emoji, color, onClick, children }: {
  emoji: string; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "9px 10px", borderRadius: 8, border: "none",
      background: "none", cursor: "pointer", fontSize: 12,
      fontWeight: 600, color, textAlign: "left", minHeight: 36,
    }}><span>{emoji}</span>{children}</button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECT PICKER
// ═════════════════════════════════════════════════════════════════════════════
interface SubjectPickerProps {
  selected: SubjectRow | null;
  onSelect: (s: SubjectRow) => void;
}

const SubjectPicker = memo(({ selected, onSelect }: SubjectPickerProps) => {
  const [search, setSearch] = useState("");

  // ✅ FIX: destructure `data` not `subjectsData` — this was the #1 bug
  const { data: subjects = [], isLoading, error, refetch } = useQuery<SubjectRow[]>({
    queryKey: ["mmp-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, title_ar, is_active, image_url, level")
        .order("title");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() =>
    subjects.filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.title_ar ?? "").includes(search)
    ), [subjects, search]);

  if (isLoading) {
    return (
      <div style={{ ...cardSt, padding: 24 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, color: TEXT, margin: "0 0 20px" }}>📚 Choose a Subject</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              height: 72, borderRadius: 12, background: BG,
              animation: "mmp-pulse 1.4s infinite", animationDelay: `${i*120}ms`,
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardSt, padding: 24 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, color: TEXT, margin: "0 0 16px" }}>📚 Choose a Subject</h3>
        <div style={{
          background: REDL, border: `1.5px solid #FCA5A5`,
          borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <p style={{ fontWeight: 800, color: RED, margin: "0 0 6px" }}>Failed to load subjects</p>
          <p style={{ fontSize: 12, color: RED, margin: "0 0 12px", fontFamily: "monospace" }}>
            {(error as Error).message}
          </p>
          <button onClick={() => refetch()} style={{
            padding: "9px 18px", borderRadius: 8, border: "none",
            background: RED, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}>🔄 Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cardSt, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: TEXT, margin: 0 }}>📚 Choose a Subject</h3>
          <p style={{ fontSize: 12, color: MUTED, margin: "3px 0 0" }}>
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} available
          </p>
        </div>
        <button onClick={() => refetch()} title="Refresh"
          style={{
            width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${BORDER}`,
            background: "#fff", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🔄</button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <span style={{
          position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
          fontSize: 14, color: MUTED, pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search subjects…"
          style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
        />
      </div>

      {/* Subject list */}
      {filtered.length === 0 ? (
        <div style={{
          background: GL, border: `2px dashed ${GM}`,
          borderRadius: 14, padding: "32px 20px", textAlign: "center",
        }}>
          <p style={{ fontSize: 36, marginBottom: 10 }}>📭</p>
          <p style={{ fontWeight: 800, color: TEXT, margin: "0 0 6px" }}>
            {search ? "No matches found" : "No subjects yet"}
          </p>
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
            {search
              ? "Try a different search term"
              : "Create subjects first in Courses & Subjects"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, maxHeight: 400, overflowY: "auto" }}>
          {filtered.map(s => {
            const active = selected?.id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => onSelect(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 13,
                  padding: "14px 16px", borderRadius: 13, width: "100%",
                  border: `2px solid ${active ? G : BORDER}`,
                  background: active ? GL : "#FAFAFA",
                  cursor: "pointer", textAlign: "left", transition: "all .14s",
                  boxShadow: active ? `0 0 0 3px ${G}22` : "none",
                }}>
                {/* Thumbnail */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: s.image_url ? `url(${s.image_url}) center/cover` : GL,
                  border: `1.5px solid ${BORDER}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, overflow: "hidden",
                }}>
                  {!s.image_url && "📖"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: 700, fontSize: 14, color: active ? G : TEXT,
                    margin: "0 0 3px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{s.title}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {s.title_ar && (
                      <span style={{ fontSize: 11, color: SUB, direction: "rtl" }}>{s.title_ar}</span>
                    )}
                    {s.level && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px",
                        borderRadius: 20, background: GM, color: G,
                      }}>{s.level}</span>
                    )}
                    {s.is_active === false && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px",
                        borderRadius: 20, background: REDL, color: RED,
                      }}>Inactive</span>
                    )}
                  </div>
                </div>
                {active && <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
SubjectPicker.displayName = "SubjectPicker";

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function MaterialManagerPro() {
  const qc = useQueryClient();
  // ✅ FIX: AuthContext exposes `loading` not `isLoading`
  const { user, session, loading: authLoading } = useAuth();

  const [selectedSubject, setSelectedSubject] = useState<SubjectRow | null>(null);
  const [showUpload,       setShowUpload]       = useState(false);
  const [search,           setSearch]           = useState("");
  const [typeFilter,       setTypeFilter]       = useState<MatType | "All">("All");

  // ── Fetch materials for selected subject ────────────────────────────────────
  const { data: materials = [], isLoading: mLoading, error: mError, refetch: mRefetch } =
    useQuery<MaterialRow[]>({
      queryKey: ["mmp-materials", selectedSubject?.id],
      enabled:  !!selectedSubject,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("subject_materials")
          .select("*")
          .eq("subject_id", selectedSubject!.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as MaterialRow[];
      },
    });

  // ── Invalidate all caches students might be watching ───────────────────────
  const invalidateAll = useCallback(() => {
    if (!selectedSubject) return;
    const id = selectedSubject.id;
    qc.invalidateQueries({ queryKey: ["mmp-materials",         id] });
    qc.invalidateQueries({ queryKey: ["smh",                   id] });
    qc.invalidateQueries({ queryKey: ["subject-materials-all", id] });
    qc.invalidateQueries({ queryKey: ["adm-materials",         id] });
    qc.invalidateQueries({ queryKey: ["materials",             id] });
  }, [qc, selectedSubject]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    const safe = ["_text_", "link", "text-content"];
    if (m.file_url && !m.file_url.startsWith("http") && !safe.includes(m.file_url)) {
      await supabase.storage.from(BUCKET).remove([m.file_url]);
    }
    const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑 Deleted" });
    invalidateAll();
  }, [invalidateAll]);

  // ── Filtered + counted ─────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    materials.filter(m =>
      (typeFilter === "All" || m.material_type === typeFilter) &&
      (!search || m.title.toLowerCase().includes(search.toLowerCase()))
    ), [materials, typeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    materials.forEach(m => {
      if (m.material_type) c[m.material_type] = (c[m.material_type] ?? 0) + 1;
    });
    return c;
  }, [materials]);

  return (
    <>
      <style>{`
        @keyframes mmp-in  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes mmp-up  { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes mmp-pop { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
        @keyframes mmp-spin{ to{transform:rotate(360deg)} }
        @keyframes mmp-pulse{ 0%,100%{opacity:1} 50%{opacity:.35} }
        .mmp-card{ transition:transform .18s ease,box-shadow .18s ease; }
        .mmp-card:hover{ transform:translateY(-3px); box-shadow:0 10px 28px rgba(0,0,0,.09)!important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: BG, fontFamily: "system-ui,sans-serif", paddingBottom: 40 }}>

        {/* ── HEADER ───────────────────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(135deg,${G} 0%,${G2} 100%)`,
          padding: "22px 20px", marginBottom: 22,
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 15, fontSize: 24,
                  background: "rgba(255,255,255,.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>📚</div>
                <div>
                  <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>
                    Material Manager
                  </h1>
                  <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "3px 0 0" }}>
                    {authLoading ? "Checking login…"
                      : user ? `Signed in as ${user.email}`
                      : "⚠️ Not signed in"}
                  </p>
                </div>
              </div>

              {selectedSubject && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setShowUpload(true)} style={{
                    padding: "9px 18px", borderRadius: 11,
                    border: "1.5px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.2)", color: "#fff",
                    fontWeight: 800, fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>⬆ Upload Material</button>
                  <button type="button"
                    onClick={() => { setSelectedSubject(null); setSearch(""); setTypeFilter("All"); }}
                    style={{
                      padding: "9px 16px", borderRadius: 11,
                      border: "1.5px solid rgba(255,255,255,.25)",
                      background: "rgba(255,255,255,.12)", color: "#fff",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>🔄 Change Subject</button>
                </div>
              )}
            </div>

            {/* Breadcrumb */}
            {selectedSubject && (
              <div style={{
                marginTop: 14, padding: "10px 14px",
                background: "rgba(255,255,255,.1)", borderRadius: 10,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,.7)" }}>Subject:</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{selectedSubject.title}</span>
                {selectedSubject.title_ar && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,.6)", direction: "rtl" }}>
                    · {selectedSubject.title_ar}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                  {materials.length} material{materials.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>

          {/* ── NO USER WARNING ──────────────────────────────────────────── */}
          {!authLoading && !user && (
            <div style={{
              background: REDL, border: `1.5px solid #FCA5A5`,
              borderRadius: 14, padding: 20, marginBottom: 20,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
              <div>
                <p style={{ fontWeight: 800, color: RED, margin: "0 0 4px" }}>
                  Authentication Required
                </p>
                <p style={{ fontSize: 13, color: RED, margin: 0 }}>
                  You must be signed in as an admin to upload materials.
                </p>
              </div>
            </div>
          )}

          {/* ── TYPE STAT CHIPS (shown after subject selected) ───────────── */}
          {selectedSubject && Object.keys(counts).length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))",
              gap: 10, marginBottom: 20,
            }}>
              {(Object.keys(counts) as MatType[]).map(t => {
                const tm = TM[t]; const active = typeFilter === t;
                return (
                  <div key={t}
                    onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                    style={{
                      background: active ? tm.light : CARD,
                      border: `1.5px solid ${active ? tm.color : tm.border}`,
                      borderRadius: 13, padding: "12px 14px",
                      cursor: "pointer", transition: "all .14s",
                      boxShadow: active ? `0 0 0 3px ${tm.color}33` : "none",
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 5 }}>{tm.emoji}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: active ? tm.color : TEXT, lineHeight: 1 }}>
                      {counts[t]}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: active ? tm.color : MUTED, marginTop: 3 }}>
                      {t}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── MAIN LAYOUT ──────────────────────────────────────────────── */}
          {!selectedSubject ? (
            <SubjectPicker selected={selectedSubject} onSelect={s => {
              setSelectedSubject(s);
              setSearch(""); setTypeFilter("All");
            }} />
          ) : (
            <>
              {/* Search + filter + upload button row */}
              <div style={{
                ...cardSt, padding: "12px 14px", marginBottom: 16,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <span style={{
                      position: "absolute", left: 11, top: "50%",
                      transform: "translateY(-50%)", fontSize: 14,
                      color: MUTED, pointerEvents: "none",
                    }}>🔍</span>
                    <input
                      value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search materials…"
                      style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
                    />
                  </div>
                  <button type="button" onClick={() => setShowUpload(true)}
                    style={{
                      padding: "11px 18px", borderRadius: 10, border: "none",
                      background: `linear-gradient(135deg,${G},${G2})`,
                      color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
                      boxShadow: `0 4px 14px ${G}44`,
                    }}>⬆ Upload</button>
                </div>

                {/* Filter chips */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setTypeFilter("All")}
                    style={{
                      padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${typeFilter === "All" ? G : BORDER}`,
                      background: typeFilter === "All" ? GL : "#fff",
                      color: typeFilter === "All" ? G : SUB, cursor: "pointer",
                    }}>All ({materials.length})</button>
                  {(Object.keys(counts) as MatType[]).map(t => (
                    <button key={t} type="button"
                      onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                      style={{
                        padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${typeFilter === t ? TM[t].color : TM[t].border}`,
                        background: typeFilter === t ? TM[t].light : "#fff",
                        color: typeFilter === t ? TM[t].color : SUB, cursor: "pointer",
                      }}>
                      {TM[t].emoji} {t} ({counts[t]})
                    </button>
                  ))}
                </div>
              </div>

              {/* Materials grid */}
              {mError ? (
                <div style={{ ...cardSt, padding: 24, background: REDL, border: `1.5px solid #FCA5A5` }}>
                  <p style={{ fontWeight: 800, color: RED, margin: "0 0 8px" }}>Failed to load materials</p>
                  <p style={{ fontSize: 12, color: RED, margin: "0 0 12px" }}>
                    {(mError as Error).message}
                  </p>
                  <button onClick={() => mRefetch()} style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: RED, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>🔄 Retry</button>
                </div>
              ) : mLoading ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{
                      height: 110, borderRadius: 16, background: "#F0F0F0",
                      animation: "mmp-pulse 1.4s infinite",
                      animationDelay: `${i * 100}ms`,
                    }} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ ...cardSt, padding: "52px 24px", textAlign: "center", border: `2px dashed ${BORDER}` }}>
                  <p style={{ fontSize: 40, marginBottom: 16 }}>📭</p>
                  <p style={{ fontWeight: 800, color: TEXT, margin: "0 0 6px", fontSize: 15 }}>
                    {search || typeFilter !== "All" ? "No matches found" : "No materials yet"}
                  </p>
                  <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px" }}>
                    {search || typeFilter !== "All"
                      ? "Try a different search or clear the filter"
                      : "Upload your first material using the button above"}
                  </p>
                  {!search && typeFilter === "All" && (
                    <button type="button" onClick={() => setShowUpload(true)}
                      style={{
                        padding: "12px 24px", borderRadius: 12, border: "none",
                        background: `linear-gradient(135deg,${G},${G2})`,
                        color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 8,
                        boxShadow: `0 6px 20px ${G}44`,
                      }}>⬆ Upload First Material</button>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                  {filtered.map((m, i) => (
                    <MatCard key={m.id} mat={m} idx={i} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && selectedSubject && (
        <UploadModal
          subject={selectedSubject}
          count={materials.length}
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); invalidateAll(); }}
        />
      )}
    </>
  );
}
