/**
 * MaterialManagerPro.tsx
 * ─────────────────────────────────────────────────────────────────
 * NEW standalone admin page for uploading and managing subject
 * materials. Completely independent — does NOT touch SubjectMaterialsHub,
 * SubjectMaterials, CourseManagement, or any other existing file.
 *
 * Features:
 *  • Lists every subject so admin can pick one
 *  • Upload ANY file type to Supabase "subject-files" bucket
 *  • Real XHR byte-level progress bar
 *  • Instant library update — students see materials immediately
 *  • Full CRUD (view, download, edit title, delete)
 *  • Search + type filter in the library
 *  • Image thumbnail previews
 *  • Drag-and-drop with visual feedback
 *  • Mobile-first, 44px touch targets
 *  • Full TypeScript, no `any` leakage on props
 *  • Error boundaries around storage calls
 *
 * Integration (two lines):
 *   1. App.tsx  → add route:
 *        const MaterialManagerPro = lazy(() => import("./pages/admin/MaterialManagerPro"));
 *        <Route path="/admin/material-manager" element={<MaterialManagerPro />} />
 *
 *   2. DashboardLayout.tsx → add nav link in the admin "Academics" group:
 *        { to: "/admin/material-manager", icon: FolderOpen, label: t("Material Manager","مدير المواد") }
 */

import React, {
  useState, useRef, useCallback, useMemo, useEffect, memo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────
const SB_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const BUCKET = "subject-files";

/** Brand colours — match existing Tahleem green theme */
const B = {
  green:   "#064E3B",
  green2:  "#065F46",
  greenXL: "#ECFDF5",
  greenL:  "#D1FAE5",
  gold:    "#92700A",
  red:     "#DC2626",
  redL:    "#FEF2F2",
  redB:    "#FECACA",
  blue:    "#2563EB",
  blueL:   "#EFF6FF",
  border:  "#E5E7EB",
  bg:      "#F3F4F6",
  card:    "#FFFFFF",
  text:    "#111827",
  sub:     "#6B7280",
  muted:   "#9CA3AF",
};

// ─── Material-type registry ───────────────────────────────────────────────────
type MatType =
  | "PDF" | "Video" | "Audio" | "Image"
  | "Document" | "Link" | "Text";

interface TypeMeta {
  emoji:  string;
  color:  string;
  light:  string;
  border: string;
  accept: string; // file-input accept attr
}

const TYPE_META: Record<MatType, TypeMeta> = {
  PDF:      { emoji:"📄", color:"#DC2626", light:"#FEF2F2", border:"#FCA5A5", accept:".pdf,application/pdf" },
  Video:    { emoji:"🎬", color:"#7C3AED", light:"#F5F3FF", border:"#C4B5FD", accept:"video/*,.mp4,.webm,.mov,.avi,.m4v,.mkv" },
  Audio:    { emoji:"🎵", color:"#0D9488", light:"#F0FDFA", border:"#99F6E4", accept:"audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" },
  Image:    { emoji:"🖼️", color:"#2563EB", light:"#EFF6FF", border:"#BFDBFE", accept:"image/*,.heic,.heif" },
  Document: { emoji:"📝", color:"#D97706", light:"#FFFBEB", border:"#FDE68A", accept:".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv" },
  Link:     { emoji:"🔗", color:"#6B7280", light:"#F9FAFB", border:"#D1D5DB", accept:"" },
  Text:     { emoji:"✏️", color:"#374151", light:"#F9FAFB", border:"#D1D5DB", accept:"" },
};

const ALL_TYPES = Object.keys(TYPE_META) as MatType[];

// ─── Supabase DB row type ─────────────────────────────────────────────────────
interface MaterialRow {
  id:             string;
  subject_id:     string;
  title:          string;
  material_type:  string | null;
  file_url:       string;
  file_type:      string | null;
  file_size:      number | null;
  content:        string | null;
  is_downloadable:boolean | null;
  sort_order:     number | null;
  uploaded_by:    string;
  created_at:     string | null;
  topic:          string | null;
  level:          string | null;
  session_id:     string | null;
}

interface SubjectRow {
  id:       string;
  title:    string;
  title_ar: string | null;
  is_active:boolean | null;
  image_url:string | null;
  level:    string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectType(file: File): MatType {
  const mime = file.type.toLowerCase();
  const ext  = (file.name.split(".").pop() ?? "").toLowerCase();
  if (mime.includes("pdf")   || ext === "pdf")  return "PDF";
  if (mime.includes("video") || ["mp4","webm","mov","avi","m4v","mkv"].includes(ext)) return "Video";
  if (mime.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac","opus"].includes(ext)) return "Audio";
  if (mime.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif","heic","heif"].includes(ext)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","csv"].includes(ext)) return "Document";
  return "PDF";
}

function fmtSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1_024)       return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1_024).toFixed(0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s <    60) return "just now";
  if (s <  3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── XHR upload with real byte-level progress ─────────────────────────────────
function xhrUpload(
  path: string,
  file: File,
  anonKey: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SB_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (ev: ProgressEvent) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 88));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(93);
        resolve();
      } else {
        try {
          const j = JSON.parse(xhr.responseText) as { error?: string; message?: string };
          reject(new Error(j.error ?? j.message ?? "Upload failed"));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    const fd = new FormData();
    fd.append("file", file, file.name);   // Supabase expects field name "file"
    xhr.send(fd);
  });
}

// ─── Shared CSS-in-JS helpers ────────────────────────────────────────────────
const pill = (active: boolean, color: string): React.CSSProperties => ({
  padding:      "6px 12px",
  borderRadius: 20,
  fontSize:     11,
  fontWeight:   700,
  cursor:       "pointer",
  border:       `1.5px solid ${active ? color : B.border}`,
  background:   active ? `${color}18` : B.card,
  color:        active ? color : B.sub,
  transition:   "all .14s",
  whiteSpace:   "nowrap",
});

const card: React.CSSProperties = {
  background:   B.card,
  borderRadius: 16,
  border:       `1.5px solid ${B.border}`,
  boxShadow:    "0 2px 10px rgba(0,0,0,.05)",
};

const labelSt: React.CSSProperties = {
  display:       "block",
  fontSize:      11,
  fontWeight:    800,
  color:         "#374151",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  marginBottom:  8,
};

const inputSt: React.CSSProperties = {
  width:       "100%",
  boxSizing:   "border-box",
  fontFamily:  "inherit",
  padding:     "11px 14px",
  fontSize:    14,
  outline:     "none",
  border:      `1.5px solid ${B.border}`,
  borderRadius: 10,
  background:  "#fff",
  color:       B.text,
};

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Subject Picker
// ═════════════════════════════════════════════════════════════════════════════
interface SubjectPickerProps {
  selected: SubjectRow | null;
  onSelect: (s: SubjectRow) => void;
}

const SubjectPicker = memo(({ selected, onSelect }: SubjectPickerProps) => {
  const [search, setSearch] = useState("");

  const { data: subjects = [], isLoading } = useQuery<SubjectRow[]>({
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

  const filtered = useMemo(
    () => subjects.filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.title_ar ?? "").includes(search)
    ),
    [subjects, search],
  );

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>📂</span>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: B.text, margin: 0 }}>
            Select Subject
          </h3>
          <p style={{ fontSize: 11, color: B.muted, margin: 0 }}>
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} available
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{
          position: "absolute", left: 11, top: "50%",
          transform: "translateY(-50%)", fontSize: 14, color: B.muted,
          pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subjects…"
          style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
        />
      </div>

      {/* Subject grid */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              height: 70, borderRadius: 12, background: "#F0F0F0",
              animation: "mmp-pulse 1.4s infinite",
              animationDelay: `${i * 100}ms`,
            }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: "20px 0" }}>
          No subjects found
        </p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 4,
        }}>
          {filtered.map(s => {
            const active = selected?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s)}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          10,
                  padding:      "11px 13px",
                  borderRadius: 12,
                  border:       `2px solid ${active ? B.green : B.border}`,
                  background:   active ? B.greenXL : "#FAFAFA",
                  cursor:       "pointer",
                  textAlign:    "left",
                  transition:   "all .14s",
                  boxShadow:    active ? `0 0 0 3px ${B.green}22` : "none",
                }}
              >
                {/* Subject thumbnail / icon */}
                <div style={{
                  width:          36,
                  height:         36,
                  borderRadius:   9,
                  flexShrink:     0,
                  background:     s.image_url ? `url(${s.image_url}) center/cover` : B.greenL,
                  border:         `1.5px solid ${B.border}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       18,
                  overflow:       "hidden",
                }}>
                  {!s.image_url && "📖"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: 700, fontSize: 12, color: active ? B.green : B.text,
                    margin: "0 0 2px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{s.title}</p>
                  {s.level && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 20,
                      background: s.level === "beginner" ? "#F0FDF4"
                        : s.level === "intermediate" ? "#EFF6FF" : "#FDF4FF",
                      color: s.level === "beginner" ? "#166534"
                        : s.level === "intermediate" ? "#1E40AF" : "#6B21A8",
                    }}>{s.level}</span>
                  )}
                </div>
                {active && <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>}
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
// SUB-COMPONENT: Upload Form
// ═════════════════════════════════════════════════════════════════════════════
type UploadPhase = "idle" | "uploading" | "saving" | "done" | "error";

interface UploadFormProps {
  subjectId:        string;
  existingCount:    number;
  onUploadComplete: () => void;
}

const UploadForm = memo(({ subjectId, existingCount, onUploadComplete }: UploadFormProps) => {
  const { user } = useAuth();

  // Form state
  const [title,       setTitle]       = useState("");
  const [matType,     setMatType]     = useState<MatType>("PDF");
  const [fileUrl,     setFileUrl]     = useState("");
  const [textContent, setTextContent] = useState("");
  const [downloadable,setDownloadable]= useState(true);
  const [file,        setFile]        = useState<File | null>(null);
  const [thumbUrl,    setThumbUrl]    = useState<string | null>(null);

  // Upload phase
  const [phase,   setPhase]   = useState<UploadPhase>("idle");
  const [pct,     setPct]     = useState(0);
  const [errMsg,  setErrMsg]  = useState("");
  const [dragOver,setDragOver]= useState(false);

  const dragCount = useRef(0);
  const fileRef   = useRef<HTMLInputElement>(null);

  const busy     = phase === "uploading" || phase === "saving";
  const needFile = matType !== "Link" && matType !== "Text";
  const T        = TYPE_META[matType];

  // ── Pick a file ────────────────────────────────────────────────────────────
  const pickFile = useCallback((f: File) => {
    const detected = detectType(f);
    setFile(f);
    setMatType(detected);
    setTitle(prev => prev.trim() || f.name.replace(/\.[^/.]+$/, ""));
    setErrMsg("");
    setThumbUrl(null);

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setThumbUrl(ev.target?.result as string);
      reader.readAsDataURL(f);
    }
  }, []);

  const clearFile = () => {
    setFile(null);
    setThumbUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const resetForm = useCallback(() => {
    setTitle(""); setMatType("PDF"); setFileUrl("");
    setTextContent(""); setDownloadable(true);
    clearFile();
    setPct(0); setPhase("idle"); setErrMsg("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current += 1;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current -= 1;
    if (dragCount.current <= 0) { dragCount.current = 0; setDragOver(false); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setErrMsg("");

    // Validate
    if (!title.trim())                              { setErrMsg("Title is required"); return; }
    if (needFile && !file && !fileUrl.trim())       { setErrMsg("Select a file or paste a URL"); return; }
    if (matType === "Link" && !fileUrl.trim())      { setErrMsg("Enter a URL"); return; }
    if (matType === "Text" && !textContent.trim())  { setErrMsg("Content cannot be empty"); return; }
    if (!user)                                      { setErrMsg("You must be signed in"); return; }

    setPhase("uploading"); setPct(5);

    try {
      let resolvedUrl = fileUrl.trim();
      let resolvedType = "";
      let resolvedSize = 0;

      // ── File upload ──────────────────────────────────────────────────────
      if (needFile && file) {
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        const key  = (supabase as Record<string, unknown>)["supabaseKey"] as string ?? "";

        // Try XHR first (real progress), fall back to Supabase SDK
        try {
          await xhrUpload(path, file, key, setPct);
        } catch (xhrErr) {
          console.warn("[MaterialManagerPro] XHR failed, falling back to SDK:", xhrErr);
          setPct(40);
          const { error: storErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { cacheControl: "3600", upsert: false });
          if (storErr) throw new Error(`Storage: ${storErr.message}`);
          setPct(90);
        }

        resolvedUrl  = path;
        resolvedType = file.type;
        resolvedSize = file.size;
      }

      // ── Database insert ──────────────────────────────────────────────────
      setPct(96); setPhase("saving");

      const row: Partial<MaterialRow> = {
        subject_id:      subjectId,
        title:           title.trim(),
        material_type:   matType,
        file_url:        resolvedUrl || "_text_",
        content:         matType === "Text" ? textContent.trim() : null,
        is_downloadable: downloadable,
        sort_order:      existingCount,
        uploaded_by:     user.id,
      };
      if (resolvedType) row.file_type = resolvedType;
      if (resolvedSize) row.file_size = resolvedSize;

      const { error: dbErr } = await supabase
        .from("subject_materials")
        .insert(row as MaterialRow);

      if (dbErr) throw new Error(`Database: ${dbErr.message}`);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material uploaded and live for students!" });
      setTimeout(() => { onUploadComplete(); resetForm(); }, 700);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setPhase("error");
      setPct(0);
      setErrMsg(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    }
  };

  // ── Progress bar colours ──────────────────────────────────────────────────
  const barColor =
    phase === "done"    ? "#16A34A" :
    phase === "saving"  ? B.gold    : B.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {errMsg && (
        <div style={{
          display: "flex", gap: 10, padding: "12px 14px",
          background: B.redL, border: `1.5px solid ${B.redB}`,
          borderRadius: 11, alignItems: "flex-start",
          animation: "mmp-pop .2s ease",
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 13, color: "#991B1B", flex: 1, fontWeight: 600 }}>
            {errMsg}
          </p>
          <button
            type="button"
            onClick={() => setErrMsg("")}
            aria-label="Dismiss error"
            style={{ background: "none", border: "none", cursor: "pointer", color: B.muted, fontSize: 16 }}
          >✕</button>
        </div>
      )}

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <div>
        <label style={labelSt}>
          Title <span style={{ color: B.red }}>*</span>
        </label>
        <input
          value={title}
          disabled={busy}
          autoFocus
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Week 4 Tajweed Notes"
          style={{
            ...inputSt,
            borderColor: !title && errMsg ? B.redB : B.border,
          }}
        />
      </div>

      {/* ── Type selector ────────────────────────────────────────────────── */}
      <div>
        <label style={labelSt}>File Type</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {ALL_TYPES.map(mt => {
            const tm  = TYPE_META[mt];
            const sel = matType === mt;
            return (
              <button
                key={mt}
                type="button"
                disabled={busy}
                onClick={() => { if (!busy) setMatType(mt); }}
                style={{
                  display:        "flex",
                  flexDirection:  "column",
                  alignItems:     "center",
                  gap:            6,
                  padding:        "12px 4px",
                  borderRadius:   13,
                  border:         `2px solid ${sel ? tm.color : "#E9E9E9"}`,
                  background:     sel ? tm.light : "#FAFAFA",
                  cursor:         busy ? "not-allowed" : "pointer",
                  transition:     "all .14s",
                  opacity:        busy ? 0.55 : 1,
                  boxShadow:      sel ? `0 0 0 3px ${tm.color}22` : "none",
                  minHeight:      64, // 44px+ touch target
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{tm.emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: sel ? 800 : 500,
                  color:    sel ? tm.color : B.muted,
                }}>{mt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── File / URL zone ─────────────────────────────────────────────── */}
      {needFile && (
        <div>
          <label style={labelSt}>File</label>

          {/* Hidden input — accepts any file */}
          <input
            ref={fileRef}
            type="file"
            accept="*/*"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />

          {file ? (
            /* ── Selected file card ── */
            <div style={{
              borderRadius: 14, border: `2px solid ${T.border}`,
              background: T.light, overflow: "hidden",
              animation: "mmp-pop .2s ease",
            }}>
              {thumbUrl && (
                <img
                  src={thumbUrl}
                  alt="Preview"
                  style={{ width: "100%", maxHeight: 150, objectFit: "cover", display: "block" }}
                />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                  fontSize: 24, background: "#fff", border: `1.5px solid ${T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{T.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: 700, fontSize: 13, color: B.text,
                    margin: "0 0 4px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{file.name}</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: "2px 8px",
                      borderRadius: 20, background: `${T.color}18`, color: T.color,
                    }}>{matType}</span>
                    <span style={{ fontSize: 11, color: B.muted }}>{fmtSize(file.size)}</span>
                  </div>
                </div>
                {!busy && (
                  <button
                    type="button"
                    onClick={clearFile}
                    aria-label="Remove file"
                    style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      border: `1.5px solid ${T.border}`, background: "#fff",
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", color: B.muted, fontSize: 14,
                    }}
                  >✕</button>
                )}
              </div>
            </div>
          ) : (
            /* ── Drop zone ── */
            <div
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => !busy && fileRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload file area"
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
              style={{
                padding:      "36px 20px",
                borderRadius: 18,
                textAlign:    "center",
                cursor:       busy ? "not-allowed" : "pointer",
                border:       `2.5px dashed ${dragOver ? B.green : "#CFCFCF"}`,
                background:   dragOver
                  ? `linear-gradient(135deg, ${B.greenXL}, ${B.greenL})`
                  : "#FAFAFA",
                transform:    dragOver ? "scale(1.025)" : "scale(1)",
                boxShadow:    dragOver ? `0 0 0 6px ${B.green}18` : "none",
                transition:   "all .2s ease",
              }}
            >
              <div style={{
                width: 68, height: 68, borderRadius: 20,
                margin: "0 auto 16px", fontSize: 30,
                background: dragOver ? T.light : "#F0F0F0",
                border: `2px solid ${dragOver ? T.border : "#E0E0E0"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .2s",
              }}>
                {dragOver ? T.emoji : "📂"}
              </div>
              <p style={{
                fontWeight: 900, fontSize: 16, margin: "0 0 6px",
                color: dragOver ? B.green : B.text, transition: "color .2s",
              }}>
                {dragOver ? "Drop it here! 🎯" : "Tap to browse or drag any file"}
              </p>
              <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>
                Any file type — PDF, Word, Video, Audio, Image, and more
              </p>
            </div>
          )}

          {/* URL fallback */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px" }}>
            <div style={{ flex: 1, height: 1, background: B.border }} />
            <span style={{ fontSize: 11, color: B.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
              or paste a URL
            </span>
            <div style={{ flex: 1, height: 1, background: B.border }} />
          </div>
          <input
            value={fileUrl}
            disabled={busy}
            onChange={e => setFileUrl(e.target.value)}
            placeholder="https://…"
            style={inputSt}
          />
        </div>
      )}

      {/* ── Link URL ─────────────────────────────────────────────────────── */}
      {matType === "Link" && (
        <div>
          <label style={labelSt}>URL <span style={{ color: B.red }}>*</span></label>
          <input
            value={fileUrl}
            disabled={busy}
            onChange={e => { setFileUrl(e.target.value); setErrMsg(""); }}
            placeholder="https://…"
            style={inputSt}
          />
        </div>
      )}

      {/* ── Text content ─────────────────────────────────────────────────── */}
      {matType === "Text" && (
        <div>
          <label style={labelSt}>Content <span style={{ color: B.red }}>*</span></label>
          <textarea
            value={textContent}
            disabled={busy}
            rows={5}
            onChange={e => { setTextContent(e.target.value); setErrMsg(""); }}
            placeholder="Write your text content here…"
            style={{ ...inputSt, resize: "vertical" }}
          />
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {(phase === "uploading" || phase === "saving" || phase === "done") && (
        <div style={{
          padding:      "14px 16px",
          borderRadius: 13,
          background:   "#F0FDF4",
          border:       "1.5px solid #BBF7D0",
          animation:    "mmp-pop .2s ease",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 9,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
              {phase === "uploading" ? "Uploading file…"
               : phase === "saving"  ? "Saving to database…"
               : "Upload complete ✓"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: barColor }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 10, background: "#D1FAE5", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${pct}%`,
              background: `linear-gradient(90deg, ${barColor}, ${barColor}99)`,
              transition: "width .35s ease",
            }} />
          </div>
          {phase === "uploading" && file && (
            <p style={{ fontSize: 11, color: B.muted, margin: "5px 0 0" }}>
              {fmtSize(Math.round(pct / 100 * file.size))} / {fmtSize(file.size)} transferred
            </p>
          )}
        </div>
      )}

      {/* ── Download toggle ───────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Toggle download permission"
        onClick={() => !busy && setDownloadable(v => !v)}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !busy) setDownloadable(v => !v); }}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "13px 16px",
          borderRadius:   13,
          cursor:         busy ? "not-allowed" : "pointer",
          background:     downloadable ? B.greenXL : B.bg,
          border:         `1.5px solid ${downloadable ? "#86EFAC" : B.border}`,
          transition:     "all .2s",
          opacity:        busy ? 0.6 : 1,
          minHeight:      44,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, fontSize: 20,
            background: downloadable ? B.greenL : "#E9E9E9",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {downloadable ? "⬇️" : "👁️"}
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: B.text, margin: 0 }}>
              {downloadable ? "Download allowed" : "View only"}
            </p>
            <p style={{ fontSize: 11, color: B.muted, margin: "2px 0 0" }}>
              {downloadable ? "Students can save this file" : "Students can only view it"}
            </p>
          </div>
        </div>
        {/* Toggle pill */}
        <div style={{
          width: 46, height: 26, borderRadius: 99, flexShrink: 0,
          background: downloadable ? B.green : "#CBD5E1",
          position: "relative", transition: "background .2s",
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 99, background: "#fff",
            position: "absolute", top: 3, left: downloadable ? 23 : 3,
            transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
          }} />
        </div>
      </div>

      {/* ── Submit button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy || phase === "done"}
        style={{
          width:          "100%",
          padding:        "16px",
          borderRadius:   14,
          border:         "none",
          background:     busy || phase === "done"
            ? "#E5E7EB"
            : `linear-gradient(135deg, ${B.green} 0%, ${B.green2} 100%)`,
          color:          busy || phase === "done" ? B.muted : "#fff",
          fontWeight:     900,
          fontSize:       15,
          letterSpacing:  ".03em",
          cursor:         busy || phase === "done" ? "not-allowed" : "pointer",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            10,
          boxShadow:      busy || phase === "done" ? "none" : `0 6px 24px ${B.green}44`,
          transition:     "all .2s",
          minHeight:      52, // large touch target
        }}
      >
        <span style={{
          display: "inline-flex", fontSize: 18,
          animation: busy ? "mmp-spin .7s linear infinite" : "none",
        }}>
          {phase === "done"      ? "✅"
           : phase === "error"   ? "🔄"
           : busy                ? "⟳"
           : "⬆"}
        </span>
        {phase === "uploading" ? `Uploading ${pct}%…`
         : phase === "saving"  ? "Saving…"
         : phase === "done"    ? "Uploaded!"
         : phase === "error"   ? "Retry Upload"
         : "Upload Material"}
      </button>
    </div>
  );
});
UploadForm.displayName = "UploadForm";

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Material Card (library item)
// ═════════════════════════════════════════════════════════════════════════════
interface MaterialCardProps {
  material: MaterialRow;
  index:    number;
  onEdit:   (m: MaterialRow) => void;
  onDelete: (m: MaterialRow) => void;
}

const MaterialCard = memo(({ material: m, index, onEdit, onDelete }: MaterialCardProps) => {
  const T = TYPE_META[(m.material_type as MatType) ?? "PDF"];
  const [imgSrc,  setImgSrc]  = useState<string | null>(null);
  const [menuOpen,setMenuOpen]= useState(false);

  // Resolve signed URL for Image thumbnails
  useEffect(() => {
    if (m.material_type !== "Image" || !m.file_url) return;
    if (m.file_url.startsWith("http")) { setImgSrc(m.file_url); return; }
    supabase.storage.from(BUCKET).createSignedUrl(m.file_url, 3600)
      .then(({ data }) => { if (data?.signedUrl) setImgSrc(data.signedUrl); });
  }, [m.file_url, m.material_type]);

  const openFile = async () => {
    if (!m.file_url) return;
    if (m.file_url.startsWith("http")) { window.open(m.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const downloadFile = async () => {
    let url = m.file_url ?? "";
    const safe = ["_text_", "link", "placeholder", "text-content"];
    if (!url.startsWith("http") && !safe.includes(url)) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(url, 3600);
      url = data?.signedUrl ?? url;
    }
    const a = document.createElement("a");
    a.href = url; a.download = m.title; a.click();
  };

  const hasFileUrl = !!m.file_url && !["_text_","link","placeholder","text-content"].includes(m.file_url);

  return (
    <div
      className="mmp-card"
      style={{
        background:    "#fff",
        borderRadius:  16,
        border:        `1.5px solid ${T.border}`,
        overflow:      "hidden",
        animation:     "mmp-slidein .3s ease both",
        animationDelay:`${index * 50}ms`,
        position:      "relative",
      }}
    >
      {/* Colour accent bar */}
      <div style={{ height: 3, background: T.color }} />

      {/* Image thumbnail */}
      {m.material_type === "Image" && imgSrc && (
        <div style={{ height: 110, overflow: "hidden", background: T.light }}>
          <img
            src={imgSrc}
            alt={m.title}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setImgSrc(null)}
          />
        </div>
      )}

      <div style={{ padding: "14px 16px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, fontSize: 22,
            background: T.light, border: `1.5px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {T.emoji}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: 700, fontSize: 13, color: B.text,
              margin: "0 0 4px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{m.title}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                background: `${T.color}18`, color: T.color,
              }}>{m.material_type}</span>
              {(m.file_size ?? 0) > 0 && (
                <span style={{ fontSize: 10, color: B.muted }}>{fmtSize(m.file_size)}</span>
              )}
              <span style={{ fontSize: 10, color: B.muted }}>{timeAgo(m.created_at)}</span>
            </div>
          </div>

          {/* Context menu */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              aria-label="More options"
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1.5px solid ${B.border}`, background: "#fff",
                cursor: "pointer", fontSize: 16, color: B.muted,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >⋮</button>

            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                style={{
                  position: "absolute", right: 0, top: 34, zIndex: 50, minWidth: 145,
                  background: "#fff", borderRadius: 12,
                  border: `1.5px solid ${B.border}`,
                  boxShadow: "0 10px 32px rgba(0,0,0,.14)",
                  padding: 6, animation: "mmp-pop .15s ease",
                }}
              >
                {hasFileUrl && (
                  <CtxItem emoji="👁" color={B.sub}
                    onClick={() => { openFile(); setMenuOpen(false); }}>
                    View
                  </CtxItem>
                )}
                {m.is_downloadable && hasFileUrl && (
                  <CtxItem emoji="⬇" color="#0D9488"
                    onClick={() => { downloadFile(); setMenuOpen(false); }}>
                    Download
                  </CtxItem>
                )}
                <CtxItem emoji="✏️" color={B.green}
                  onClick={() => { onEdit(m); setMenuOpen(false); }}>
                  Edit
                </CtxItem>
                <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
                <CtxItem emoji="🗑" color={B.red}
                  onClick={() => { onDelete(m); setMenuOpen(false); }}>
                  Delete
                </CtxItem>
              </div>
            )}
          </div>
        </div>

        {/* Text content preview */}
        {m.content && (
          <p style={{
            fontSize: 11, color: B.sub, margin: "0 0 8px", lineHeight: 1.5,
            padding: "8px 10px", background: B.bg, borderRadius: 8,
            border: `1px solid ${B.border}`,
            display: "-webkit-box" as React.CSSProperties["display"],
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
            overflow: "hidden",
          }}>
            {m.content}
          </p>
        )}

        {m.is_downloadable && (
          <span style={{ fontSize: 10, color: B.green, fontWeight: 700 }}>
            ⬇ Downloadable
          </span>
        )}
      </div>
    </div>
  );
});
MaterialCard.displayName = "MaterialCard";

/** Tiny context-menu button */
function CtxItem({ emoji, color, onClick, children }: {
  emoji:    string;
  color:    string;
  onClick:  () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        8,
        width:      "100%",
        padding:    "9px 10px",
        borderRadius: 8,
        border:     "none",
        background: "none",
        cursor:     "pointer",
        fontSize:   12,
        fontWeight: 600,
        color,
        textAlign:  "left",
        minHeight:  36,
      }}
    >
      <span>{emoji}</span> {children}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Edit Modal
// ═════════════════════════════════════════════════════════════════════════════
interface EditModalProps {
  material: MaterialRow;
  onClose:  () => void;
  onSaved:  () => void;
}

const EditModal = memo(({ material, onClose, onSaved }: EditModalProps) => {
  const [title, setTitle] = useState(material.title);
  const [dl,    setDl]    = useState(material.is_downloadable ?? true);
  const [busy,  setBusy]  = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("subject_materials")
      .update({ title: title.trim(), is_downloadable: dl })
      .eq("id", material.id);
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Updated" });
    onSaved();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 400,
        padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,.2)",
        animation: "mmp-pop .2s ease",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 20,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: B.text, margin: 0 }}>
            Edit Material
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: B.muted, fontSize: 18 }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelSt}>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              style={inputSt}
            />
          </div>

          <div
            onClick={() => setDl(v => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setDl(v => !v); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              background: dl ? B.greenXL : B.bg,
              border: `1.5px solid ${dl ? "#86EFAC" : B.border}`,
              transition: "all .2s", minHeight: 44,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: B.text }}>
              {dl ? "⬇ Download allowed" : "👁 View only"}
            </span>
            <div style={{
              width: 42, height: 24, borderRadius: 99,
              background: dl ? B.green : "#CBD5E1",
              position: "relative", transition: "background .2s",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 99, background: "#fff",
                position: "absolute", top: 3, left: dl ? 21 : 3,
                transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }} />
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={busy || !title.trim()}
            style={{
              padding: "13px", borderRadius: 12, border: "none",
              background: busy || !title.trim() ? "#E5E7EB"
                : `linear-gradient(135deg, ${B.green}, ${B.green2})`,
              color: busy || !title.trim() ? B.muted : "#fff",
              fontWeight: 800, fontSize: 14,
              cursor: busy || !title.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              minHeight: 48,
            }}
          >
            {busy ? "Saving…" : "✓ Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
});
EditModal.displayName = "EditModal";

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE EXPORT — MaterialManagerPro
// ═════════════════════════════════════════════════════════════════════════════
export default function MaterialManagerPro() {
  const qc = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedSubject, setSelectedSubject] = useState<SubjectRow | null>(null);
  const [search,           setSearch]          = useState("");
  const [typeFilter,       setTypeFilter]      = useState<MatType | "All">("All");
  const [editTarget,       setEditTarget]      = useState<MaterialRow | null>(null);
  const [showUpload,       setShowUpload]      = useState(true);
  const [showPicker,       setShowPicker]      = useState(true); // mobile: collapsible subject panel

  // ── Fetch materials for selected subject ────────────────────────────────────
  const { data: materials = [], isLoading: matsLoading } = useQuery<MaterialRow[]>({
    queryKey: ["mmp-materials", selectedSubject?.id],
    enabled:  !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", selectedSubject!.id)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ── Invalidate all relevant query keys so students see new materials ────────
  const invalidateAll = useCallback(() => {
    if (!selectedSubject) return;
    const id = selectedSubject.id;
    // Our own cache
    qc.invalidateQueries({ queryKey: ["mmp-materials", id] });
    // SubjectMaterialsHub cache
    qc.invalidateQueries({ queryKey: ["smh", id] });
    // SubjectView student cache
    qc.invalidateQueries({ queryKey: ["subject-materials-all", id] });
    // CourseManagement cache
    qc.invalidateQueries({ queryKey: ["adm-materials", id] });
    // SubjectMaterials (classroom) cache
    qc.invalidateQueries({ queryKey: ["materials", id] });
  }, [qc, selectedSubject]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.title}"?`)) return;

    const safeUrls = ["_text_", "link", "placeholder", "text-content"];
    if (m.file_url && !m.file_url.startsWith("http") && !safeUrls.includes(m.file_url)) {
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

  // ── Filtered materials ─────────────────────────────────────────────────────
  const filtered = useMemo(
    () => materials.filter(m =>
      (typeFilter === "All" || m.material_type === typeFilter) &&
      (!search || m.title.toLowerCase().includes(search.toLowerCase()))
    ),
    [materials, typeFilter, search],
  );

  // ── Type counts for filter chips ──────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    materials.forEach(m => {
      if (m.material_type) c[m.material_type] = (c[m.material_type] ?? 0) + 1;
    });
    return c;
  }, [materials]);

  return (
    <>
      <style>{`
        @keyframes mmp-pop{
          from{opacity:0;transform:scale(.93)}
          to  {opacity:1;transform:scale(1)}
        }
        @keyframes mmp-slidein{
          from{opacity:0;transform:translateY(16px)}
          to  {opacity:1;transform:translateY(0)}
        }
        @keyframes mmp-spin{
          to{transform:rotate(360deg)}
        }
        @keyframes mmp-pulse{
          0%,100%{opacity:1}
          50%{opacity:.35}
        }
        .mmp-card{
          transition:transform .18s ease, box-shadow .18s ease;
        }
        .mmp-card:hover{
          transform:translateY(-3px);
          box-shadow:0 10px 30px rgba(0,0,0,.09)!important;
        }
        .mmp-pill:hover{
          filter:brightness(.95);
        }
      `}</style>

      <div style={{
        minHeight:   "100vh",
        background:  B.bg,
        fontFamily:  "system-ui, sans-serif",
        padding:     "0 0 40px",
      }}>

        {/* ════ TOP BANNER ════════════════════════════════════════════════ */}
        <div style={{
          background:    `linear-gradient(135deg, ${B.green} 0%, ${B.green2} 100%)`,
          padding:       "22px 20px",
          marginBottom:  24,
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              flexWrap:       "wrap",
              gap:            12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width:          52,
                  height:         52,
                  borderRadius:   16,
                  background:     "rgba(255,255,255,.15)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       26,
                }}>📚</div>
                <div>
                  <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>
                    Material Manager Pro
                  </h1>
                  <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "3px 0 0" }}>
                    {selectedSubject
                      ? `Uploading to: ${selectedSubject.title}`
                      : "Select a subject to get started"}
                  </p>
                </div>
              </div>

              {selectedSubject && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowUpload(v => !v)}
                    style={{
                      padding:        "9px 16px",
                      borderRadius:   11,
                      border:         "1.5px solid rgba(255,255,255,.3)",
                      background:     "rgba(255,255,255,.15)",
                      backdropFilter: "blur(4px)",
                      color:          "#fff",
                      fontWeight:     700,
                      fontSize:       13,
                      cursor:         "pointer",
                      display:        "flex",
                      alignItems:     "center",
                      gap:            6,
                    }}
                  >
                    {showUpload ? "📋 Library only" : "⬆ Show Upload"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedSubject(null); setShowPicker(true); }}
                    style={{
                      padding:    "9px 16px",
                      borderRadius: 11,
                      border:     "1.5px solid rgba(255,255,255,.3)",
                      background: "rgba(255,255,255,.12)",
                      color:      "#fff",
                      fontWeight: 700,
                      fontSize:   13,
                      cursor:     "pointer",
                    }}
                  >
                    🔄 Change Subject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>

          {/* ════ SUBJECT PICKER (shown when no subject selected) ════════ */}
          {!selectedSubject ? (
            <div style={{ maxWidth: 700, margin: "0 auto", animation: "mmp-pop .25s ease" }}>
              <SubjectPicker selected={selectedSubject} onSelect={s => {
                setSelectedSubject(s);
                setShowPicker(false);
                setSearch("");
                setTypeFilter("All");
              }} />
            </div>
          ) : (
            <>
              {/* ════ TYPE STAT CHIPS ══════════════════════════════════════ */}
              {Object.keys(typeCounts).length > 0 && (
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                  gap:                 10,
                  marginBottom:        20,
                }}>
                  {(Object.keys(typeCounts) as MatType[]).map(t => {
                    const tm     = TYPE_META[t];
                    const active = typeFilter === t;
                    return (
                      <div
                        key={t}
                        role="button"
                        tabIndex={0}
                        onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                        onKeyDown={e => { if (e.key === "Enter") setTypeFilter(typeFilter === t ? "All" : t); }}
                        style={{
                          background:   active ? tm.light  : "#fff",
                          border:       `1.5px solid ${active ? tm.color : tm.border}`,
                          borderRadius: 13,
                          padding:      "12px 14px",
                          cursor:       "pointer",
                          boxShadow:    active ? `0 0 0 3px ${tm.color}33` : "none",
                          transition:   "all .15s",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 5 }}>{tm.emoji}</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: active ? tm.color : B.text, lineHeight: 1 }}>
                          {typeCounts[t]}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: active ? tm.color : B.muted, marginTop: 3 }}>
                          {t}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ════ MAIN SPLIT LAYOUT ════════════════════════════════════ */}
              <div style={{
                display:             "grid",
                gridTemplateColumns: showUpload ? "minmax(0,1fr) minmax(0,1fr)" : "1fr",
                gap:                 20,
                alignItems:          "start",
              }}>

                {/* ── UPLOAD PANEL ── */}
                {showUpload && (
                  <div style={{
                    ...card,
                    padding:   24,
                    animation: "mmp-pop .25s ease",
                  }}>
                    <div style={{
                      display:       "flex",
                      alignItems:    "center",
                      gap:           10,
                      marginBottom:  22,
                      paddingBottom: 16,
                      borderBottom:  `1px solid ${B.border}`,
                    }}>
                      <div style={{
                        width:          38, height: 38, borderRadius: 11,
                        background:     B.greenXL, fontSize: 20,
                        display:        "flex", alignItems: "center", justifyContent: "center",
                      }}>⬆</div>
                      <div>
                        <h2 style={{ fontWeight: 800, fontSize: 15, color: B.text, margin: 0 }}>
                          Upload Material
                        </h2>
                        <p style={{ fontSize: 11, color: B.muted, margin: 0 }}>
                          Any file type · {selectedSubject.title}
                        </p>
                      </div>
                    </div>

                    <UploadForm
                      subjectId={selectedSubject.id}
                      existingCount={materials.length}
                      onUploadComplete={invalidateAll}
                    />
                  </div>
                )}

                {/* ── LIBRARY ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Search + filter bar */}
                  <div style={{
                    ...card,
                    padding: "13px 14px",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <span style={{
                          position: "absolute", left: 11, top: "50%",
                          transform: "translateY(-50%)", fontSize: 14,
                          color: B.muted, pointerEvents: "none",
                        }}>🔍</span>
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search materials…"
                          style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
                        />
                      </div>
                      <span style={{
                        fontSize:     11,
                        color:        B.muted,
                        whiteSpace:   "nowrap",
                        padding:      "0 4px",
                      }}>
                        {filtered.length} / {materials.length}
                      </span>
                    </div>

                    {/* Filter chips */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="mmp-pill"
                        onClick={() => setTypeFilter("All")}
                        style={pill(typeFilter === "All", B.green)}
                      >
                        All ({materials.length})
                      </button>
                      {(Object.keys(typeCounts) as MatType[]).map(t => (
                        <button
                          key={t}
                          type="button"
                          className="mmp-pill"
                          onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                          style={pill(typeFilter === t, TYPE_META[t].color)}
                        >
                          {TYPE_META[t].emoji} {t} ({typeCounts[t]})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Material cards */}
                  {matsLoading ? (
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: showUpload ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                      gap:                 12,
                    }}>
                      {[1,2,3].map(i => (
                        <div key={i} style={{
                          height:         110,
                          borderRadius:   16,
                          background:     "#F0F0F0",
                          animation:      "mmp-pulse 1.4s infinite",
                          animationDelay: `${i * 100}ms`,
                        }} />
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{
                      ...card,
                      padding:   "52px 24px",
                      textAlign: "center",
                      border:    `2px dashed ${B.border}`,
                      animation: "mmp-pop .3s ease",
                    }}>
                      <div style={{
                        width:          68, height: 68, borderRadius: 20,
                        margin:         "0 auto 18px", fontSize: 32,
                        background:     B.greenXL,
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                      }}>📭</div>
                      <p style={{ fontWeight: 800, color: B.text, margin: "0 0 6px", fontSize: 15 }}>
                        {search || typeFilter !== "All" ? "No matches found" : "No materials yet"}
                      </p>
                      <p style={{ fontSize: 13, color: B.muted, margin: 0 }}>
                        {search || typeFilter !== "All"
                          ? "Try a different search or filter"
                          : "Upload your first file using the panel"}
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: showUpload ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                      gap:                 12,
                    }}>
                      {filtered.map((m, i) => (
                        <MaterialCard
                          key={m.id}
                          material={m}
                          index={i}
                          onEdit={setEditTarget}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ════ EDIT MODAL ═══════════════════════════════════════════════════ */}
      {editTarget && (
        <EditModal
          material={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); invalidateAll(); }}
        />
      )}
    </>
  );
}
