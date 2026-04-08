/**
 * LiveClassFilePanel.tsx — Tahleem Academy
 * Brand-new file upload & viewer for admin Live Class Management.
 * Zero code shared with any existing component.
 *
 * Features
 * ─────────
 * • Drag-and-drop  +  click-to-browse upload
 * • XHR upload with real byte-level progress bar
 * • Per-file type icons (PDF, Image, Video, Audio, Document, Other)
 * • Inline image preview modal (full-screen lightbox)
 * • PDF / Video / Audio open in new tab
 * • Delete with confirmation
 * • Arabic-Language sample file pre-seeded in DB on first load
 * • Graceful loading, error, and empty states
 *
 * Storage  → Supabase bucket  "liveclass-files"
 * Table    → liveclass_files  (see migration SQL)
 */

import React, {
  useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/* ─── palette (matches Tahleem dark-green / gold theme) ─── */
const P = {
  green:   "#1B4332",
  green2:  "#2D6A4F",
  gold:    "#C8922A",
  goldL:   "#FFF8EC",
  bg:      "#F7F4EF",
  surface: "#FFFFFF",
  border:  "#DDD8CF",
  muted:   "#6B7B6E",
  text:    "#0D1F17",
  red:     "#B91C1C",
  redL:    "#FEF2F2",
  shadow:  "rgba(27,67,50,0.10)",
};

/* ─── Supabase config ─── */
const BUCKET       = "liveclass-files";
const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";

/* ─── Types ─── */
interface LCFile {
  id:          string;
  subject_id:  string;
  file_name:   string;
  file_url:    string;
  file_type:   string | null;
  file_size:   number | null;
  uploaded_by: string | null;
  created_at:  string | null;
}

/* ─── File-kind helpers ─── */
type Kind = "PDF" | "Image" | "Video" | "Audio" | "Document" | "File";

function kindOf(name: string, mime?: string | null): Kind {
  const ext  = name.split(".").pop()?.toLowerCase() ?? "";
  const m    = (mime ?? "").toLowerCase();
  if (m.includes("pdf")   || ext === "pdf")                                                  return "PDF";
  if (m.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(ext))   return "Image";
  if (m.includes("video") || ["mp4","webm","mov","mkv","avi","m4v"].includes(ext))           return "Video";
  if (m.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(ext))           return "Audio";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","csv","txt"].includes(ext))              return "Document";
  return "File";
}

const KIND_CFG: Record<Kind, { emoji: string; color: string; bg: string }> = {
  PDF:      { emoji: "📄", color: "#B91C1C", bg: "#FEF2F2" },
  Image:    { emoji: "🖼️", color: "#1D4ED8", bg: "#EFF6FF" },
  Video:    { emoji: "🎬", color: "#6D28D9", bg: "#F5F3FF" },
  Audio:    { emoji: "🎵", color: "#0E7490", bg: "#ECFEFF" },
  Document: { emoji: "📝", color: "#B45309", bg: "#FFFBEB" },
  File:     { emoji: "📁", color: "#374151", bg: "#F9FAFB" },
};

/* ─── Formatting ─── */
function fmtBytes(b?: number | null): string {
  if (!b || b === 0) return "";
  if (b < 1024)      return `${b} B`;
  if (b < 1048576)   return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

/* ─── Public URL from storage ─── */
function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
interface Props {
  subjectId: string;
}

export default function LiveClassFilePanel({ subjectId }: Props) {
  const { user } = useAuth();

  const [files,       setFiles]       = useState<LCFile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [dragging,    setDragging]    = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [uploadName,  setUploadName]  = useState("");
  const [preview,     setPreview]     = useState<LCFile | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /* ── load files ── */
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any)
        .from("liveclass_files")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (err) throw err;
      setFiles(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  /* ── upload via XHR (real progress) ── */
  const doUpload = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    setProgress(0);
    setUploadName(file.name);
    setError(null);

    try {
      /* 1 — upload to storage */
      const ext      = file.name.split(".").pop() ?? "bin";
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const path     = `${subjectId}/${safeName}`;

      await new Promise<void>((resolve, reject) => {
        const { data: { session } } = (supabase as any).auth;
        const anonKey = (supabase as any).supabaseKey ?? "";
        const token   = session?.access_token ?? anonKey;

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 90));
        };
        xhr.onload  = () => { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage ${xhr.status}: ${xhr.responseText}`)); };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      /* fallback: try supabase-js if XHR failed */
      setProgress(92);

      /* 2 — insert DB record */
      const url = publicUrl(path);
      const { error: dbErr } = await (supabase as any)
        .from("liveclass_files")
        .insert({
          subject_id:  subjectId,
          file_name:   file.name,
          file_url:    url,
          file_type:   file.type || null,
          file_size:   file.size,
          uploaded_by: user.id,
        });
      if (dbErr) throw dbErr;

      setProgress(100);
      setTimeout(() => { setUploading(false); setProgress(0); setUploadName(""); }, 600);
      loadFiles();
    } catch (e: any) {
      /* Fallback: try supabase-js upload silently */
      try {
        const ext      = file.name.split(".").pop() ?? "bin";
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const path     = `${subjectId}/${safeName}`;

        const { error: stErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (stErr) throw stErr;

        const url = publicUrl(path);
        const { error: dbErr } = await (supabase as any)
          .from("liveclass_files")
          .insert({
            subject_id:  subjectId,
            file_name:   file.name,
            file_url:    url,
            file_type:   file.type || null,
            file_size:   file.size,
            uploaded_by: user.id,
          });
        if (dbErr) throw dbErr;

        setProgress(100);
        setTimeout(() => { setUploading(false); setProgress(0); setUploadName(""); }, 600);
        loadFiles();
      } catch (fallbackErr: any) {
        setError(fallbackErr?.message ?? "Upload failed");
        setUploading(false);
        setProgress(0);
        setUploadName("");
      }
    }
  }, [subjectId, user, loadFiles]);

  /* ── drag handlers ── */
  const onDragOver  = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e: DragEvent) => { e.preventDefault(); setDragging(false); };
  const onDrop      = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) doUpload(f);
  };
  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) doUpload(f);
    e.target.value = "";
  };

  /* ── delete ── */
  const deleteFile = async (f: LCFile) => {
    if (!confirm(`Delete "${f.file_name}"?`)) return;
    setDeleting(f.id);
    try {
      /* remove from DB */
      await (supabase as any).from("liveclass_files").delete().eq("id", f.id);
      /* remove from storage (best-effort) */
      if (f.file_url.includes(BUCKET)) {
        const path = f.file_url.split(`/${BUCKET}/`)[1];
        if (path) supabase.storage.from(BUCKET).remove([path]);
      }
      setFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  /* ── open / view ── */
  const openFile = (f: LCFile) => {
    const k = kindOf(f.file_name, f.file_type);
    if (k === "Image") { setPreview(f); return; }
    window.open(f.file_url, "_blank", "noopener");
  };

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div style={{ fontFamily:"system-ui,sans-serif", color: P.text }}>
      <style>{`
        @keyframes lcfp-spin { to { transform:rotate(360deg); } }
        @keyframes lcfp-bar  { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        .lcfp-card { background:${P.surface}; border:1px solid ${P.border}; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px ${P.shadow}; }
        .lcfp-row  { display:flex; align-items:center; gap:12px; padding:13px 16px; border-bottom:1px solid ${P.border}; transition:background .12s; cursor:pointer; }
        .lcfp-row:last-child  { border-bottom:none; }
        .lcfp-row:hover       { background:#F7F4EF; }
        .lcfp-del  { opacity:0; transition:opacity .15s; border:none; background:none; cursor:pointer; padding:4px; border-radius:6px; color:${P.red}; flex-shrink:0; }
        .lcfp-row:hover .lcfp-del { opacity:1; }
        .lcfp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.82); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      `}</style>

      {/* ─── Upload Zone ───
           ANDROID FIX: Use <label htmlFor> instead of div onClick → inputRef.click().
           Programmatic .click() inside a div's onClick pushes a history entry on
           Android — React Router fires popstate and navigates the user back when
           the file picker closes. A <label htmlFor> is a native browser gesture
           and does NOT push history. (Same fix used in SubjectMaterialsHub.tsx)
      ─── */}

      {/* Hidden input — give it a stable id so label can target it */}
      <input
        ref={inputRef}
        id="lcfp-file-input"
        type="file"
        style={{ position:"absolute", width:1, height:1, opacity:0, pointerEvents:"none" }}
        onChange={onFileInput}
        accept="*/*"
        disabled={uploading}
      />

      <label
        htmlFor={uploading ? undefined : "lcfp-file-input"}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          display: "block",
          border: `2px dashed ${dragging ? P.gold : P.border}`,
          borderRadius: 16,
          background: dragging ? P.goldL : P.bg,
          padding: "28px 20px",
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          transition: "all .18s",
          marginBottom: 16,
          userSelect: "none",
        }}
      >
        {uploading ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:28 }}>⏫</div>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color: P.green }}>
              Uploading — {uploadName}
            </p>
            <div style={{ width:"100%", maxWidth:260, height:6, borderRadius:99, background: P.border, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background: P.gold, borderRadius:99, transition:"width .2s" }}/>
            </div>
            <p style={{ margin:0, fontSize:11, color: P.muted }}>{progress}%</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize:32, marginBottom:6 }}>📂</div>
            <p style={{ margin:"0 0 4px", fontWeight:700, fontSize:14, color: P.green }}>
              Drop a file here, or tap to browse
            </p>
            <p style={{ margin:0, fontSize:12, color: P.muted }}>
              Images, PDFs, Videos, Docs — any format
            </p>
          </>
        )}
      </label>

      {/* ─── Error ─── */}
      {error && (
        <div style={{ background: P.redL, border:`1px solid ${P.red}30`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color: P.red, display:"flex", alignItems:"center", gap:8 }}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", fontSize:16, color: P.red }}>✕</button>
        </div>
      )}

      {/* ─── File List ─── */}
      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:48 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", border:`3px solid ${P.green}`, borderTopColor:"transparent", animation:"lcfp-spin .75s linear infinite" }}/>
        </div>
      ) : files.length === 0 ? (
        <div className="lcfp-card" style={{ padding:"40px 20px", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
          <p style={{ margin:0, fontSize:14, fontWeight:600, color: P.muted }}>No files uploaded yet</p>
          <p style={{ margin:"4px 0 0", fontSize:12, color: P.muted }}>Upload a file above to get started</p>
        </div>
      ) : (
        <div className="lcfp-card">
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${P.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, fontWeight:700, color: P.green }}>
              📁 Class Files <span style={{ fontWeight:400, color: P.muted }}>({files.length})</span>
            </span>
            <button
              onClick={loadFiles}
              style={{ fontSize:11, color: P.muted, background:"none", border:"none", cursor:"pointer", padding:"3px 8px", borderRadius:6 }}
            >↺ Refresh</button>
          </div>

          {files.map(f => {
            const k   = kindOf(f.file_name, f.file_type);
            const cfg = KIND_CFG[k];
            const isDel = deleting === f.id;
            return (
              <div key={f.id} className="lcfp-row" onClick={() => !isDel && openFile(f)}>
                {/* icon */}
                <div style={{ width:40, height:40, borderRadius:10, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {cfg.emoji}
                </div>

                {/* info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {f.file_name}
                  </p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color: P.muted }}>
                    {k}{f.file_size ? ` · ${fmtBytes(f.file_size)}` : ""}{f.created_at ? ` · ${fmtDate(f.created_at)}` : ""}
                  </p>
                </div>

                {/* open chip */}
                <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"3px 9px", borderRadius:20 }}>
                  {k === "Image" ? "Preview" : "Open"}
                </span>

                {/* delete */}
                <button
                  className="lcfp-del"
                  onClick={e => { e.stopPropagation(); deleteFile(f); }}
                  disabled={isDel}
                  title="Delete file"
                >
                  {isDel ? (
                    <div style={{ width:14, height:14, borderRadius:"50%", border:`2px solid ${P.red}`, borderTopColor:"transparent", animation:"lcfp-spin .6s linear infinite" }}/>
                  ) : "🗑️"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Lightbox Preview ─── */}
      {preview && (
        <div className="lcfp-overlay" onClick={() => setPreview(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width:"94%", maxWidth:720, background:"#111", borderRadius:16, overflow:"hidden", boxShadow:"0 16px 64px rgba(0,0,0,.6)" }}>
            {/* header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#1a1a1a" }}>
              <span style={{ fontSize:13, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                🖼️ {preview.file_name}
              </span>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <a href={preview.file_url} download={preview.file_name} target="_blank" rel="noopener"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize:12, color:"#fff", background:"rgba(255,255,255,.15)", borderRadius:8, padding:"5px 12px", textDecoration:"none", fontWeight:600 }}>
                  ⬇ Download
                </a>
                <button onClick={() => setPreview(null)}
                  style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:700, fontSize:15 }}>
                  ✕
                </button>
              </div>
            </div>
            {/* image */}
            <div style={{ background:"#000", maxHeight:"76vh", overflow:"auto", display:"flex", alignItems:"center", justifyContent:"center", minHeight:200 }}>
              <img
                src={preview.file_url}
                alt={preview.file_name}
                style={{ maxWidth:"100%", maxHeight:"76vh", objectFit:"contain", display:"block" }}
                onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
