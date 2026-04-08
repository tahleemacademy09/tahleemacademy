/**
 * MaterialManagerPro.tsx  —  Tahleem Academy
 * Written from scratch. Zero code shared with previous version.
 *
 * Architecture:
 *  - Three views: SUBJECTS → LIBRARY → UPLOAD SHEET
 *  - File input triggered programmatically (never via <label>) to avoid
 *    Android backdrop-dismiss race condition
 *  - document.visibilitychange guards picker state (more reliable than blur/focus)
 *  - Upload via XHR with real byte-level progress, supabase-js SDK as fallback
 *  - No full-screen dismissable backdrop during file selection
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────
const BUCKET       = "subject-files";
const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? "";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "#F7F4EF",
  surface: "#FFFFFF",
  green:   "#1B4332",
  green2:  "#2D6A4F",
  greenXL: "#D8F3DC",
  gold:    "#C8922A",
  goldL:   "#FFF8EC",
  text:    "#0D1F17",
  muted:   "#6B7B6E",
  border:  "#DDD8CF",
  red:     "#B91C1C",
  redL:    "#FEF2F2",
  shadow:  "rgba(27,67,50,0.12)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type View = "subjects" | "library";

interface Subject {
  id:        string;
  title:     string;
  title_ar:  string | null;
  level:     string | null;
  image_url: string | null;
}

interface Material {
  id:              string;
  subject_id:      string;
  title:           string;
  material_type:   string | null;
  file_url:        string;
  file_type:       string | null;
  file_size:       number | null;
  is_downloadable: boolean | null;
  created_at:      string | null;
  uploaded_by:     string;
}

// ─── File type detection ──────────────────────────────────────────────────────
function detectKind(file: File): string {
  const mime = file.type.toLowerCase();
  const ext  = (file.name.split(".").pop() ?? "").toLowerCase();
  if (mime.includes("pdf")   || ext === "pdf")                                               return "PDF";
  if (mime.includes("video") || ["mp4","webm","mov","mkv","avi","m4v"].includes(ext))        return "Video";
  if (mime.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(ext))        return "Audio";
  if (mime.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif","heic"].includes(ext)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","csv"].includes(ext))                    return "Document";
  return "File";
}

const KIND_META: Record<string, { icon: string; color: string; bg: string }> = {
  PDF:      { icon: "📄", color: "#B91C1C", bg: "#FEF2F2" },
  Video:    { icon: "🎬", color: "#6D28D9", bg: "#F5F3FF" },
  Audio:    { icon: "🎵", color: "#0E7490", bg: "#ECFEFF" },
  Image:    { icon: "🖼️", color: "#1D4ED8", bg: "#EFF6FF" },
  Document: { icon: "📝", color: "#B45309", bg: "#FFFBEB" },
  File:     { icon: "📁", color: "#374151", bg: "#F9FAFB" },
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function humanSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function buildSignedUrl(path: string): Promise<string> {
  if (!path || path.startsWith("http")) return path;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}

// ─── XHR upload with byte-level progress ─────────────────────────────────────
function xhrUpload(
  storagePath: string,
  file: File,
  accessToken: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 85));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(90); resolve();
      } else {
        try {
          const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          reject(new Error(j.message ?? j.error ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload was aborted"));
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════════

function Spinner({ size = 20, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "tm-spin 0.75s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EmptyState({ icon, title, sub, btnLabel, onBtn }: {
  icon: string; title: string; sub: string;
  btnLabel?: string; onBtn?: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", animation: "tm-in .3s ease both" }}>
      <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
      <p style={{
        fontWeight: 800, fontSize: 17, color: C.text, margin: "0 0 8px",
        fontFamily: "'Libre Baskerville', Georgia, serif",
      }}>{title}</p>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px", lineHeight: 1.6 }}>{sub}</p>
      {btnLabel && onBtn && (
        <button onClick={onBtn} style={{
          padding: "12px 28px", borderRadius: 50, border: "none",
          background: C.green, color: "#fff", fontWeight: 700,
          fontSize: 14, cursor: "pointer",
        }}>{btnLabel}</button>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD SHEET
// Bottom drawer — NOT a full-screen dismissable overlay.
// File input is triggered programmatically only (never via <label>)
// to prevent Android's "return-from-picker" synthetic click from closing
// the modal. Picker state is tracked via document.visibilitychange.
// ═════════════════════════════════════════════════════════════════════════════
type UploadStage = "pick" | "confirm" | "uploading" | "done" | "failed";

interface UploadSheetProps {
  subject:       Subject;
  materialCount: number;
  onClose:       () => void;
  onSuccess:     () => void;
}

function UploadSheet({ subject, materialCount, onClose, onSuccess }: UploadSheetProps) {
  const { user, session } = useAuth();

  const [stage,   setStage]   = useState<UploadStage>("pick");
  const [file,    setFile]    = useState<File | null>(null);
  const [title,   setTitle]   = useState("");
  const [pct,     setPct]     = useState(0);
  const [errMsg,  setErrMsg]  = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const inputRef    = useRef<HTMLInputElement>(null);
  // Guard: true while native file-picker dialog is open.
  // Prevents the backdrop click fired on Android when returning from picker.
  const pickerGuard = useRef(false);

  const busy = stage === "uploading";

  // ── Picker guard via visibilitychange + window blur/focus (belt & braces) ──
  useEffect(() => {
    const lock   = () => { pickerGuard.current = true; };
    const unlock = () => { setTimeout(() => { pickerGuard.current = false; }, 700); };

    const onVis = () => { if (document.hidden) lock(); else unlock(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur",  lock);
    window.addEventListener("focus", unlock);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur",  lock);
      window.removeEventListener("focus", unlock);
    };
  }, []);

  // Trigger native file picker programmatically
  const openPicker = useCallback(() => {
    if (busy) return;
    pickerGuard.current = true;        // lock BEFORE opening picker
    inputRef.current?.click();
  }, [busy]);

  // Handle file selection from native picker
  const onFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    pickerGuard.current = false;       // unlock immediately on success
    const chosen = e.target.files?.[0];
    if (!chosen) return;

    setFile(chosen);
    setTitle(chosen.name.replace(/\.[^/.]+$/, ""));
    setErrMsg("");
    setPreview(null);

    if (chosen.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(chosen);
    }

    setStage("confirm");
    e.target.value = "";   // allow re-selection of same file
  }, []);

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setTitle("");
    setErrMsg("");
    setStage("pick");
  };

  const doUpload = async () => {
    if (!file || !title.trim()) {
      setErrMsg("Please enter a title before uploading.");
      return;
    }
    if (!user || !session?.access_token) {
      setErrMsg("Session expired — please sign in again.");
      return;
    }

    setStage("uploading");
    setPct(5);
    setErrMsg("");

    try {
      const ext  = file.name.split(".").pop() ?? "bin";
      const path = `${subject.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const kind = detectKind(file);

      // Storage upload — XHR first for real progress, SDK as fallback
      try {
        await xhrUpload(path, file, session.access_token, setPct);
      } catch {
        setPct(45);
        const { error: storErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (storErr) throw new Error(`Storage: ${storErr.message}`);
        setPct(88);
      }

      setPct(94);

      const { error: dbErr } = await supabase
        .from("subject_materials")
        .insert({
          subject_id:      subject.id,
          title:           title.trim(),
          material_type:   kind,
          file_url:        path,         // store path, not public URL — signed URLs work
          file_type:       file.type,
          file_size:       file.size,
          is_downloadable: true,
          sort_order:      materialCount,
          uploaded_by:     user.id,
        });
      if (dbErr) throw new Error(`Database: ${dbErr.message}`);

      setPct(100);
      setStage("done");
      toast({ title: "✅ Uploaded successfully!" });
      setTimeout(() => onSuccess(), 900);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStage("failed");
      setErrMsg(msg);
      setPct(0);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    }
  };

  const meta = file ? KIND_META[detectKind(file)] ?? KIND_META.File : null;

  return (
    <>
      {/* Scrim — does NOT dismiss sheet while picker may be open */}
      <div
        onClick={() => { if (!busy && !pickerGuard.current) onClose(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 80,
          background: "rgba(13,31,23,.52)",
          backdropFilter: "blur(3px)",
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
        background: C.surface,
        borderRadius: "22px 22px 0 0",
        maxHeight: "92dvh",
        overflowY: "auto",
        boxShadow: `0 -12px 48px ${C.shadow}`,
        animation: "tm-rise .3s cubic-bezier(.22,.68,0,1.2) both",
      }}>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0" }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{
          padding: "16px 22px 18px",
          borderBottom: `1.5px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{
              margin: 0, fontWeight: 900, fontSize: 18, color: C.text,
              fontFamily: "'Libre Baskerville', Georgia, serif",
            }}>
              {stage === "done" ? "🎉 Upload Complete" : "📤 Upload Material"}
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: C.muted }}>
              {subject.title}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} style={{
            width: 36, height: 36, borderRadius: 10,
            border: `1.5px solid ${C.border}`, background: C.surface,
            cursor: busy ? "not-allowed" : "pointer", fontSize: 16,
            color: C.muted, opacity: busy ? 0.4 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 22px 40px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Hidden file input — triggered ONLY via openPicker(), never by <label> */}
          <input
            ref={inputRef}
            type="file"
            accept="*/*"
            onChange={onFileSelected}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />

          {/* ─── STAGE: PICK ─────────────────────────────────────────────── */}
          {stage === "pick" && (
            <div style={{
              border: `2.5px dashed ${C.border}`,
              borderRadius: 20,
              padding: "52px 24px",
              textAlign: "center",
              background: C.bg,
            }}>
              <div style={{
                width: 76, height: 76, borderRadius: 20,
                background: `linear-gradient(135deg, ${C.green}, ${C.green2})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, margin: "0 auto 20px",
                boxShadow: `0 8px 24px ${C.shadow}`,
              }}>📂</div>
              <p style={{
                fontWeight: 900, fontSize: 18, color: C.text, margin: "0 0 8px",
                fontFamily: "'Libre Baskerville', Georgia, serif",
              }}>Choose a File</p>
              <p style={{ fontSize: 13, color: C.muted, margin: "0 0 28px", lineHeight: 1.6 }}>
                PDF · Word · Video · Audio · Image<br />Any format accepted
              </p>
              <button
                onClick={openPicker}
                style={{
                  padding: "14px 40px", borderRadius: 50, border: "none",
                  background: `linear-gradient(135deg, ${C.green}, ${C.green2})`,
                  color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: "pointer", letterSpacing: ".02em",
                  boxShadow: `0 6px 22px ${C.shadow}`,
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}>
                📁 Browse Files
              </button>
            </div>
          )}

          {/* ─── STAGE: CONFIRM / FAILED ─────────────────────────────────── */}
          {(stage === "confirm" || stage === "failed") && file && meta && (
            <>
              {/* File card */}
              <div style={{
                border: `2px solid ${C.greenXL}`,
                borderRadius: 16, overflow: "hidden",
                background: "#F0FBF4",
                animation: "tm-in .22s ease both",
              }}>
                {preview && (
                  <img src={preview} alt="preview" style={{
                    width: "100%", maxHeight: 160, objectFit: "cover", display: "block",
                  }} />
                )}
                <div style={{
                  padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                    background: meta.bg, fontSize: 24,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1.5px solid ${meta.color}30`,
                  }}>{meta.icon}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontWeight: 700, fontSize: 13, color: C.text,
                      margin: "0 0 4px", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{file.name}</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "2px 8px",
                        borderRadius: 20, background: meta.bg, color: meta.color,
                      }}>{detectKind(file)}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        {humanSize(file.size)}
                      </span>
                    </div>
                  </div>

                  <button onClick={clearFile} style={{
                    width: 30, height: 30, borderRadius: 8,
                    border: `1.5px solid ${C.border}`,
                    background: C.surface, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: C.muted, fontSize: 14,
                  }}>✕</button>
                </div>
              </div>

              {/* Title field */}
              <div>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 800,
                  color: C.green, textTransform: "uppercase",
                  letterSpacing: ".08em", marginBottom: 8,
                }}>
                  Title <span style={{ color: C.red }}>*</span>
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Week 4 Tajweed Notes"
                  autoFocus
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "13px 16px", fontSize: 15,
                    border: `2px solid ${title.trim() ? C.green : C.border}`,
                    borderRadius: 12, outline: "none",
                    background: C.surface, color: C.text,
                    fontFamily: "inherit",
                    transition: "border-color .15s",
                  }}
                />
              </div>

              {/* Error message */}
              {errMsg && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: C.redL, border: `1.5px solid #FECACA`,
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                  <p style={{ margin: 0, fontSize: 13, color: C.red, fontWeight: 600, flex: 1 }}>
                    {errMsg}
                  </p>
                </div>
              )}

              {/* Action row */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={clearFile} style={{
                  flex: 1, padding: "14px", borderRadius: 12,
                  border: `2px solid ${C.border}`, background: C.surface,
                  color: C.text, fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}>← Change</button>

                <button
                  onClick={doUpload}
                  disabled={!title.trim()}
                  style={{
                    flex: 2, padding: "14px", borderRadius: 12, border: "none",
                    background: title.trim()
                      ? `linear-gradient(135deg, ${C.green}, ${C.green2})`
                      : C.border,
                    color: title.trim() ? "#fff" : C.muted,
                    fontWeight: 900, fontSize: 15,
                    cursor: title.trim() ? "pointer" : "not-allowed",
                    boxShadow: title.trim() ? `0 6px 20px ${C.shadow}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all .2s",
                  }}>
                  ⬆ Upload Now
                </button>
              </div>
            </>
          )}

          {/* ─── STAGE: UPLOADING ────────────────────────────────────────── */}
          {stage === "uploading" && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 20, padding: "32px 0",
            }}>
              <Spinner size={52} color={C.green} />
              <div style={{ textAlign: "center" }}>
                <p style={{
                  fontWeight: 800, fontSize: 17, color: C.text, margin: "0 0 6px",
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                }}>
                  {pct < 90 ? "Uploading…" : "Saving to library…"}
                </p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                  {file && pct < 90
                    ? `${humanSize(Math.round(pct / 100 * file.size))} of ${humanSize(file.size)}`
                    : "Almost done…"}
                </p>
              </div>
              <div style={{ width: "100%", maxWidth: 320 }}>
                <div style={{
                  height: 8, background: C.greenXL, borderRadius: 99, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${C.green}, ${C.gold})`,
                    transition: "width .4s ease",
                  }} />
                </div>
                <p style={{
                  textAlign: "center", marginTop: 8,
                  fontSize: 13, fontWeight: 800, color: C.green,
                }}>{pct}%</p>
              </div>
            </div>
          )}

          {/* ─── STAGE: DONE ─────────────────────────────────────────────── */}
          {stage === "done" && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 16, padding: "32px 0",
              animation: "tm-in .3s ease both",
            }}>
              <div style={{
                width: 76, height: 76, borderRadius: 20,
                background: C.greenXL,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 38,
              }}>✅</div>
              <p style={{
                fontWeight: 900, fontSize: 18, color: C.green, margin: 0,
                fontFamily: "'Libre Baskerville', Georgia, serif",
              }}>Material Uploaded!</p>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, textAlign: "center" }}>
                Now visible to students in this subject.
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MATERIAL ROW
// ═════════════════════════════════════════════════════════════════════════════
function MatRow({ mat, onDelete, index }: {
  mat: Material; onDelete: () => void; index: number;
}) {
  const meta = KIND_META[mat.material_type ?? "File"] ?? KIND_META.File;
  const [menu, setMenu] = useState(false);

  const openFile = async () => {
    const url = await buildSignedUrl(mat.file_url);
    if (url) window.open(url, "_blank");
  };

  const downloadFile = async () => {
    const url = await buildSignedUrl(mat.file_url);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = mat.title; a.click();
  };

  return (
    <div style={{
      background: C.surface, border: `1.5px solid ${C.border}`,
      borderRadius: 14, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 13,
      animation: `tm-in .22s ease ${index * 40}ms both`,
      position: "relative",
    }}>
      {/* Color accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 12, bottom: 12,
        width: 3, borderRadius: "0 3px 3px 0",
        background: meta.color,
      }} />

      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: meta.bg, fontSize: 22,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${meta.color}22`,
      }}>{meta.icon}</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontWeight: 700, fontSize: 13, color: C.text, margin: "0 0 4px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{mat.title}</p>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
            background: meta.bg, color: meta.color,
          }}>{mat.material_type}</span>
          {mat.file_size && (
            <span style={{ fontSize: 11, color: C.muted }}>{humanSize(mat.file_size)}</span>
          )}
          <span style={{ fontSize: 11, color: C.muted }}>{timeAgo(mat.created_at)}</span>
        </div>
      </div>

      {/* Context menu */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button onClick={() => setMenu(v => !v)} style={{
          width: 32, height: 32, borderRadius: 8,
          border: `1.5px solid ${C.border}`, background: C.surface,
          cursor: "pointer", fontSize: 18, color: C.muted,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>⋮</button>

        {menu && (
          <div onMouseLeave={() => setMenu(false)} style={{
            position: "absolute", right: 0, top: 36, zIndex: 60,
            background: C.surface, border: `1.5px solid ${C.border}`,
            borderRadius: 12, padding: 6, minWidth: 150,
            boxShadow: `0 12px 36px ${C.shadow}`,
            animation: "tm-pop .15s ease",
          }}>
            <MenuBtn label="👁  View"     onClick={() => { openFile();     setMenu(false); }} />
            {mat.is_downloadable && (
              <MenuBtn label="⬇  Download" onClick={() => { downloadFile(); setMenu(false); }} />
            )}
            <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
            <MenuBtn label="🗑  Delete" color={C.red}
              onClick={() => { onDelete(); setMenu(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuBtn({ label, onClick, color = C.text }: {
  label: string; onClick: () => void; color?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset", display: "block", width: "100%", boxSizing: "border-box",
        padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        color, cursor: "pointer", background: hov ? C.bg : "transparent",
        transition: "background .12s",
      }}>{label}</button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LIBRARY VIEW
// ═════════════════════════════════════════════════════════════════════════════
function LibraryView({ subject, onBack, onUpload }: {
  subject: Subject; onBack: () => void; onUpload: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: mats = [], isLoading, error, refetch } = useQuery<Material[]>({
    queryKey: ["tm-materials", subject.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subject.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

  const filtered = useMemo(() =>
    mats.filter(m => m.title.toLowerCase().includes(search.toLowerCase())),
    [mats, search]);

  const handleDelete = async (mat: Material) => {
    if (!confirm(`Delete "${mat.title}"?`)) return;
    if (mat.file_url && !mat.file_url.startsWith("http")) {
      await supabase.storage.from(BUCKET).remove([mat.file_url]);
    }
    const { error } = await supabase
      .from("subject_materials").delete().eq("id", mat.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑 Deleted" });
    qc.invalidateQueries({ queryKey: ["tm-materials", subject.id] });
  };

  return (
    <div>
      {/* Sticky sub-header */}
      <div style={{
        padding: "18px 20px 14px",
        borderBottom: `1.5px solid ${C.border}`,
        background: C.bg,
        position: "sticky", top: 72, zIndex: 9,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            all: "unset", cursor: "pointer", fontSize: 22,
            color: C.green, lineHeight: 1, flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: 900, fontSize: 16, color: C.text, margin: 0,
              fontFamily: "'Libre Baskerville', Georgia, serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{subject.title}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>
              {isLoading ? "Loading…" : `${mats.length} material${mats.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={onUpload} style={{
            padding: "10px 18px", borderRadius: 50, border: "none",
            background: `linear-gradient(135deg, ${C.green}, ${C.green2})`,
            color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            boxShadow: `0 4px 14px ${C.shadow}`,
          }}>
            ⬆ Upload
          </button>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 12, top: "50%",
            transform: "translateY(-50%)", fontSize: 14,
            color: C.muted, pointerEvents: "none",
          }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search materials…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px 10px 34px", fontSize: 13,
              border: `1.5px solid ${C.border}`, borderRadius: 10,
              background: C.surface, color: C.text,
              fontFamily: "inherit", outline: "none",
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner size={40} />
          </div>
        )}
        {error && !isLoading && (
          <div style={{
            padding: 20, borderRadius: 14, background: C.redL,
            border: `1.5px solid #FECACA`, textAlign: "center",
          }}>
            <p style={{ fontWeight: 700, color: C.red, margin: "0 0 12px" }}>
              Failed to load materials
            </p>
            <button onClick={() => refetch()} style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: C.red, color: "#fff", fontWeight: 700,
              fontSize: 12, cursor: "pointer",
            }}>🔄 Retry</button>
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon={search ? "🔍" : "📭"}
            title={search ? "No matches found" : "No materials yet"}
            sub={search ? "Try a different search term"
              : "Upload your first material for this subject"}
            btnLabel={!search ? "⬆ Upload Now" : undefined}
            onBtn={!search ? onUpload : undefined}
          />
        )}
        {!isLoading && !error && filtered.map((m, i) => (
          <MatRow key={m.id} mat={m} index={i} onDelete={() => handleDelete(m)} />
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECTS VIEW
// ═════════════════════════════════════════════════════════════════════════════
function SubjectsView({ onSelect }: { onSelect: (s: Subject) => void }) {
  const [search, setSearch] = useState("");

  const { data: subjects = [], isLoading, error, refetch } = useQuery<Subject[]>({
    queryKey: ["tm-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, title_ar, level, image_url")
        .order("title");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() =>
    subjects.filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.title_ar ?? "").includes(search)
    ), [subjects, search]);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 12, top: "50%",
          transform: "translateY(-50%)", fontSize: 14,
          color: C.muted, pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search subjects…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "11px 12px 11px 34px", fontSize: 13,
            border: `1.5px solid ${C.border}`, borderRadius: 10,
            background: C.surface, color: C.text,
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {isLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={40} />
        </div>
      )}
      {error && !isLoading && (
        <div style={{
          padding: 20, borderRadius: 14, background: C.redL,
          border: `1.5px solid #FECACA`, textAlign: "center",
        }}>
          <p style={{ fontWeight: 700, color: C.red, margin: "0 0 12px" }}>
            Failed to load subjects
          </p>
          <button onClick={() => refetch()} style={{
            padding: "8px 18px", borderRadius: 8, border: "none",
            background: C.red, color: "#fff", fontWeight: 700,
            fontSize: 12, cursor: "pointer",
          }}>🔄 Retry</button>
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={search ? "🔍" : "📚"}
          title={search ? "No matches" : "No subjects yet"}
          sub={search ? "Try a different search" : "Create subjects first in Courses & Subjects"}
        />
      )}
      {!isLoading && !error && filtered.map((s, i) => (
        <SubjectBtn key={s.id} subject={s} index={i} onClick={() => onSelect(s)} />
      ))}
    </div>
  );
}

function SubjectBtn({ subject, index, onClick }: {
  subject: Subject; index: number; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset", display: "block", cursor: "pointer", width: "100%",
        boxSizing: "border-box",
        background: hov ? C.greenXL : C.surface,
        border: `2px solid ${hov ? C.green : C.border}`,
        borderRadius: 16, padding: "16px 18px",
        transition: "all .18s ease",
        boxShadow: hov ? `0 6px 22px ${C.shadow}` : "none",
        transform: hov ? "translateY(-2px)" : "none",
        animation: `tm-in .22s ease ${index * 50}ms both`,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: subject.image_url
            ? `url(${subject.image_url}) center/cover`
            : `linear-gradient(135deg, ${C.green}, ${C.green2})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: "#fff", border: `1.5px solid ${C.border}`,
        }}>
          {!subject.image_url && "📖"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontWeight: 800, fontSize: 15, color: C.text, margin: "0 0 4px",
            fontFamily: "'Libre Baskerville', Georgia, serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{subject.title}</p>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {subject.title_ar && (
              <span style={{ fontSize: 12, color: C.muted, direction: "rtl" }}>
                {subject.title_ar}
              </span>
            )}
            {subject.level && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 8px",
                borderRadius: 20, background: C.goldL, color: C.gold,
              }}>{subject.level}</span>
            )}
          </div>
        </div>
        <span style={{ color: C.muted, fontSize: 20, flexShrink: 0 }}>›</span>
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT — MaterialManagerPro
// ═════════════════════════════════════════════════════════════════════════════
export default function MaterialManagerPro() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();

  const [view,          setView]          = useState<View>("subjects");
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [showUpload,    setShowUpload]    = useState(false);

  const { data: matCountData = [] } = useQuery<{ id: string }[]>({
    queryKey: ["tm-mat-count", activeSubject?.id],
    enabled: !!activeSubject,
    queryFn: async () => {
      const { data } = await supabase
        .from("subject_materials")
        .select("id")
        .eq("subject_id", activeSubject!.id);
      return data ?? [];
    },
  });

  const invalidateAll = useCallback(() => {
    if (!activeSubject) return;
    const id = activeSubject.id;
    ["tm-materials","tm-mat-count","smh","subject-materials-all","adm-materials","materials"]
      .forEach(k => qc.invalidateQueries({ queryKey: [k, id] }));
  }, [qc, activeSubject]);

  const selectSubject = (s: Subject) => {
    setActiveSubject(s);
    setView("library");
  };

  const goBack = () => {
    setView("subjects");
    setActiveSubject(null);
    setShowUpload(false);
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    invalidateAll();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=DM+Sans:wght@400;600;700;800;900&display=swap');
        @keyframes tm-in   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tm-rise { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes tm-pop  { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
        @keyframes tm-spin { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        paddingBottom: 60,
      }}>

        {/* ── TOP BAR ────────────────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(150deg, ${C.green} 0%, ${C.green2} 100%)`,
          padding: "20px 20px 0",
          position: "sticky", top: 0, zIndex: 20,
          boxShadow: `0 2px 16px ${C.shadow}`,
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>

            {/* Brand row */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: 14, paddingBottom: 18,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                background: "rgba(255,255,255,.18)",
                display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 22,
              }}>📚</div>
              <div style={{ flex: 1 }}>
                <h1 style={{
                  margin: 0, fontWeight: 900, fontSize: 19, color: "#fff",
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                }}>Material Manager</h1>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                  {authLoading ? "Checking session…"
                    : user ? user.email
                    : "⚠️ Not signed in"}
                </p>
              </div>
            </div>

            {/* Tab strip */}
            <div style={{ display: "flex", gap: 2 }}>
              <TabBtn
                label="📚 Subjects"
                active={view === "subjects"}
                onClick={goBack}
              />
              {activeSubject && (
                <TabBtn
                  label={`📂 ${activeSubject.title}`}
                  active={view === "library"}
                  onClick={() => {}}
                  maxWidth={180}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── AUTH WARNING ────────────────────────────────────────────────── */}
        {!authLoading && !user && (
          <div style={{
            maxWidth: 720, margin: "20px auto", padding: "0 20px",
          }}>
            <div style={{
              padding: 18, borderRadius: 14, background: C.redL,
              border: `1.5px solid #FECACA`,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
              <div>
                <p style={{ fontWeight: 800, color: C.red, margin: "0 0 4px" }}>
                  Sign in Required
                </p>
                <p style={{ fontSize: 13, color: C.red, margin: 0 }}>
                  You must be signed in as an admin to manage materials.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── VIEWS ──────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {view === "subjects" && (
            <SubjectsView onSelect={selectSubject} />
          )}
          {view === "library" && activeSubject && (
            <LibraryView
              subject={activeSubject}
              onBack={goBack}
              onUpload={() => setShowUpload(true)}
            />
          )}
        </div>
      </div>

      {/* ── UPLOAD SHEET ───────────────────────────────────────────────── */}
      {showUpload && activeSubject && (
        <UploadSheet
          subject={activeSubject}
          materialCount={matCountData.length}
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </>
  );
}

function TabBtn({ label, active, onClick, maxWidth }: {
  label: string; active: boolean; onClick: () => void; maxWidth?: number;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", border: "none",
      borderRadius: "8px 8px 0 0",
      background: active ? C.bg : "transparent",
      color: active ? C.green : "rgba(255,255,255,.72)",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      transition: "all .15s", fontFamily: "'DM Sans', system-ui, sans-serif",
      maxWidth: maxWidth ?? "none", overflow: "hidden",
      textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}
