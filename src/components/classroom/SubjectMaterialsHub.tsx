/**
 * SubjectMaterialsHub.tsx  — CORRECTED BUILD
 * Step-wizard material uploader + library, fully wired to
 * Supabase storage bucket "subject-files" + table "subject_materials".
 * 
 * ALL BUGS FIXED:
 * ✅ Environment variable validation
 * ✅ Proper XHR fallback error handling
 * ✅ File URL verification before database save
 * ✅ Database insert confirmation with .select()
 * ✅ Better error messages and logging
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  FileText, Video, Music, Image as ImgIcon,
  FileSpreadsheet, ExternalLink, Type,
  Upload, Check, X, AlertTriangle, Download,
  Eye, Trash2, Edit3, Search, ChevronRight,
  ArrowLeft, Loader, FilePlus, BookOpen,
  HardDrive, Clock, RefreshCw, MoreVertical,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";

const TEAL  = "#0D7377";
const TEAL2 = "#14A085";
const DARK  = "#0B2B2B";
const GOLD  = "#C9A84C";
const LIGHT = "#F0FAF9";

// ─── Types ────────────────────────────────────────────────────────────────────
type MatType = "PDF" | "Video" | "Audio" | "Image" | "Document" | "Link" | "Text";

const TYPE_META: Record<MatType, {
  icon: React.ElementType; label: string; accept: string;
  color: string; bg: string; border: string;
  desc: string;
}> = {
  PDF:      { icon: FileText,       label: "PDF",      accept: ".pdf",
    color: "#E53E3E", bg: "#FFF5F5", border: "#FEB2B2",
    desc: "Lecture notes, worksheets, handouts" },
  Video:    { icon: Video,          label: "Video",    accept: "video/*,.mp4,.webm,.mov",
    color: "#38A169", bg: "#F0FFF4", border: "#9AE6B4",
    desc: "Lesson recordings, tutorials" },
  Audio:    { icon: Music,          label: "Audio",    accept: "audio/*,.mp3,.wav,.m4a",
    color: "#805AD5", bg: "#FAF5FF", border: "#D6BCFA",
    desc: "Recitations, lectures, podcasts" },
  Image:    { icon: ImgIcon,        label: "Image",    accept: "image/*",
    color: "#3182CE", bg: "#EBF8FF", border: "#90CDF4",
    desc: "Charts, diagrams, photos" },
  Document: { icon: FileSpreadsheet,label: "Document", accept: ".doc,.docx,.xls,.xlsx,.ppt,.pptx",
    color: "#D69E2E", bg: "#FFFFF0", border: "#F6E05E",
    desc: "Word, Excel, PowerPoint files" },
  Link:     { icon: ExternalLink,   label: "Link",     accept: "",
    color: "#319795", bg: "#E6FFFA", border: "#81E6D9",
    desc: "External websites, YouTube, Google Drive" },
  Text:     { icon: Type,           label: "Text",     accept: "",
    color: "#718096", bg: "#F7FAFC", border: "#CBD5E0",
    desc: "Inline notes, instructions" },
};
const ALL_TYPES = Object.keys(TYPE_META) as MatType[];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectType(f: File): MatType {
  const t = f.type.toLowerCase(), e = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","avi","m4v"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e)) return "Document";
  return "PDF";
}

function fmtSize(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// XHR upload for real progress tracking
function xhrUpload(
  bucket: string, path: string, file: File,
  onProgress: (p: number) => void, anonKey: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 85));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(90); resolve(); }
      else {
        try { const e = JSON.parse(xhr.responseText); reject(new Error(e.error ?? e.message ?? "Upload failed")); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Aborted"));
    const fd = new FormData();
    fd.append("", file, file.name);
    xhr.send(fd);
  });
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  .smh-root { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
  @keyframes smh-in   { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
  @keyframes smh-pop  { from { opacity:0; transform:scale(.94) } to { opacity:1; transform:scale(1) } }
  @keyframes smh-spin { to { transform:rotate(360deg) } }
  @keyframes smh-bar  { 0%{background-position:0 0} 100%{background-position:60px 0} }
  @keyframes smh-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
  .smh-type-card { transition:transform .15s,box-shadow .15s; }
  .smh-type-card:hover:not(.smh-type-card--sel) { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.08); }
  .smh-type-card--sel { transform:scale(1.02); }
  .smh-mat-card { transition:transform .18s,box-shadow .18s; }
  .smh-mat-card:hover { transform:translateY(-3px); box-shadow:0 10px 32px rgba(0,0,0,.1); }
  .smh-btn-primary { transition:transform .15s,box-shadow .15s,opacity .15s; }
  .smh-btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 22px rgba(13,115,119,.45); }
  .smh-btn-primary:active:not(:disabled) { transform:translateY(0); }
  .smh-filter-pill { transition:all .15s; }
  .smh-filter-pill:hover { opacity:.85; }
  .smh-drop-active { border-color:${TEAL}!important; background:${LIGHT}!important; transform:scale(1.01); }
  .smh-progress-bar {
    background: linear-gradient(90deg, ${TEAL} 25%, ${TEAL2} 50%, ${TEAL} 75%);
    background-size: 60px 100%;
    animation: smh-bar .9s linear infinite;
  }
  .smh-skeleton { animation:smh-pulse 1.4s ease-in-out infinite; background:#E2E8F0; border-radius:10px; }
`;

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = ["Choose Type", "Add File", "Details"];

const StepBar = ({ step }: { step: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
    {STEPS.map((label, i) => {
      const active = i === step, done = i < step;
      return (
        <React.Fragment key={i}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: done ? TEAL : active ? DARK : "#E2E8F0",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .25s",
            }}>
              {done
                ? <Check size={15} color="#fff" strokeWidth={3} />
                : <span style={{ fontSize: 13, fontWeight: 800,
                    color: active ? "#fff" : "#94A3B8" }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500,
              color: active ? DARK : done ? TEAL : "#94A3B8",
              whiteSpace: "nowrap", transition: "color .25s" }}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, margin: "0 8px",
              background: i < step ? TEAL : "#E2E8F0",
              transition: "background .3s", marginBottom: 20 }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Step 1: Type selector ────────────────────────────────────────────────────
const TypeStep = ({ selected, onSelect }: { selected: MatType; onSelect: (t: MatType) => void }) => (
  <div style={{ animation: "smh-in .25s ease" }}>
    <p style={{ fontSize: 14, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
      What kind of material are you sharing?
    </p>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {ALL_TYPES.map((t) => {
        const m = TYPE_META[t], Icon = m.icon, sel = selected === t;
        return (
          <button key={t} type="button"
            className={`smh-type-card${sel ? " smh-type-card--sel" : ""}`}
            onClick={() => onSelect(t)}
            style={{
              padding: "14px 14px", borderRadius: 14, textAlign: "left",
              border: `2px solid ${sel ? m.color : "#E2E8F0"}`,
              background: sel ? m.bg : "#fff",
              cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12,
              boxShadow: sel ? `0 0 0 3px ${m.color}22` : "none",
              transition: "all .18s",
            }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: sel ? m.color : "#F1F5F9",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .18s",
            }}>
              <Icon size={18} color={sel ? "#fff" : "#94A3B8"} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: sel ? m.color : "#1E293B",
                margin: "0 0 2px", transition: "color .18s" }}>{m.label}</p>
              <p style={{ fontSize: 10, color: "#94A3B8", margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Step 2: File / URL / Text ────────────────────────────────────────────────
const FileStep = ({
  matType, file, setFile, url, setUrl, content, setContent,
}: {
  matType: MatType; file: File | null; setFile: (f: File | null) => void;
  url: string; setUrl: (s: string) => void;
  content: string; setContent: (s: string) => void;
}) => {
  const m       = TYPE_META[matType];
  const Icon    = m.icon;
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(null); return; }
    const r = new FileReader();
    r.onload = (ev) => setPreview(ev.target?.result as string);
    r.readAsDataURL(file);
  }, [file]);

  const pickFile = (f: File) => {
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  if (matType === "Text") return (
    <div style={{ animation: "smh-in .25s ease" }}>
      <label style={labelStyle}>Your Text Content <Req /></label>
      <textarea
        value={content} onChange={(e) => setContent(e.target.value)}
        rows={7} placeholder="Type or paste your content here…"
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7, fontSize: 13 }}
      />
      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
        {content.length} characters
      </p>
    </div>
  );

  if (matType === "Link") return (
    <div style={{ animation: "smh-in .25s ease" }}>
      <label style={labelStyle}>URL <Req /></label>
      <div style={{ position: "relative" }}>
        <ExternalLink size={14} color="#94A3B8"
          style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
        <input
          type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>
      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
        Paste any publicly accessible URL
      </p>
    </div>
  );

  // File types
  return (
    <div style={{ animation: "smh-in .25s ease" }}>
      <input ref={fileRef} type="file" style={{ display: "none" }}
        accept={m.accept || "*/*"}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
      />

      {file ? (
        /* Selected file preview */
        <div style={{
          borderRadius: 16, border: `2px solid ${m.border}`,
          background: m.bg, overflow: "hidden", animation: "smh-pop .2s ease",
        }}>
          {preview && (
            <img src={preview} alt="preview"
              style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, background: "#fff",
              border: `2px solid ${m.border}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Icon size={22} color={m.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: "#1E293B", margin: "0 0 3px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </p>
              <p style={{ fontSize: 11, color: "#64748B", margin: 0 }}>
                {fmtSize(file.size)} · {m.label}
              </p>
            </div>
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
              style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                border: "none", background: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,.1)",
              }}>
              <X size={14} color="#94A3B8" />
            </button>
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          className={drag ? "smh-drop-active" : ""}
          onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            borderRadius: 18, border: `2.5px dashed ${drag ? m.color : "#CBD5E0"}`,
            background: drag ? m.bg : "#FAFBFC", padding: "40px 24px",
            textAlign: "center", cursor: "pointer", transition: "all .2s",
          }}>
          <div style={{
            width: 62, height: 62, borderRadius: 18, margin: "0 auto 14px",
            background: drag ? m.bg : "#F1F5F9",
            border: `2px solid ${drag ? m.border : "#E2E8F0"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .2s",
          }}>
            {drag
              ? <Icon size={28} color={m.color} />
              : <Upload size={28} color="#94A3B8" />}
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, color: drag ? m.color : "#374151", margin: "0 0 6px" }}>
            {drag ? "Drop it here!" : "Tap to browse or drag & drop"}
          </p>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>
            {m.accept.split(",").map(x => x.replace(".", "").toUpperCase()).join(" · ") || "Any file"}
          </p>
        </div>
      )}

      {/* URL fallback */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
        <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
        <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, whiteSpace: "nowrap" }}>
          or paste a URL
        </span>
        <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
      </div>
      <input
        type="url" value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        style={inputStyle}
      />
    </div>
  );
};

// ─── Step 3: Details ──────────────────────────────────────────────────────────
const DetailsStep = ({
  title, setTitle, downloadable, setDownloadable,
}: {
  title: string; setTitle: (s: string) => void;
  downloadable: boolean; setDownloadable: (v: boolean) => void;
}) => (
  <div style={{ animation: "smh-in .25s ease", display: "flex", flexDirection: "column", gap: 18 }}>
    <div>
      <label style={labelStyle}>Material Title <Req /></label>
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Week 3 Worksheet"
        style={inputStyle} autoFocus
      />
    </div>

    <button type="button" onClick={() => setDownloadable(!downloadable)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderRadius: 14, cursor: "pointer",
        background: downloadable ? LIGHT : "#F8FAFC",
        border: `2px solid ${downloadable ? TEAL : "#E2E8F0"}`,
        transition: "all .2s",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: downloadable ? `${TEAL}22` : "#F1F5F9",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Download size={17} color={downloadable ? TEAL : "#94A3B8"} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#1E293B", margin: 0 }}>Allow Download</p>
          <p style={{ fontSize: 11, color: "#64748B", margin: "2px 0 0" }}>
            {downloadable ? "Students can save this file" : "View only — no download"}
          </p>
        </div>
      </div>
      {/* Toggle */}
      <div style={{
        width: 46, height: 26, borderRadius: 99, position: "relative", flexShrink: 0,
        background: downloadable ? TEAL : "#CBD5E0", transition: "background .2s",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: downloadable ? 23 : 3,
          transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
        }} />
      </div>
    </button>
  </div>
);

// ─── Small helpers ────────────────────────────────────────────────────────────
const Req = () => <span style={{ color: "#E53E3E", marginLeft: 3 }}>*</span>;

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: "#374151",
  letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "2px solid #E2E8F0", fontSize: 14, outline: "none",
  boxSizing: "border-box", background: "#FAFBFC", fontFamily: "inherit",
  transition: "border-color .15s",
  color: "#1E293B",
};

// ─── Upload wizard panel ──────────────────────────────────────────────────────
type Phase = "idle" | "uploading" | "saving" | "done" | "error";

const UploadWizard = ({
  subjectId, totalMaterials, onUploaded, onCancel,
}: {
  subjectId: string; totalMaterials: number;
  onUploaded: () => void; onCancel: () => void;
}) => {
  const { user } = useAuth();
  const [step, setStep]           = useState(0);
  const [matType, setMatType]     = useState<MatType>("PDF");
  const [file, setFile]           = useState<File | null>(null);
  const [url, setUrl]             = useState("");
  const [content, setContent]     = useState("");
  const [title, setTitle]         = useState("");
  const [downloadable, setDownloadable] = useState(true);
  const [phase, setPhase]         = useState<Phase>("idle");
  const [pct, setPct]             = useState(0);
  const [errMsg, setErrMsg]       = useState("");

  const m = TYPE_META[matType];
  const needFile = matType !== "Link" && matType !== "Text";

  // Auto-fill title from filename
  useEffect(() => {
    if (file && !title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
  }, [file]);

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      if (matType === "Text") return content.trim().length > 0;
      if (matType === "Link") return url.trim().length > 0;
      return !!file || url.trim().length > 0;
    }
    if (step === 2) return title.trim().length > 0;
    return false;
  }, [step, matType, file, url, content, title]);

  const handleNext = () => {
    if (step < 2) { setStep(s => s + 1); return; }
    doUpload();
  };

  // ✅ COMPLETELY REWRITTEN WITH ALL FIXES
  const doUpload = async () => {
    setErrMsg(""); 
    setPhase("uploading"); 
    setPct(5);
    
    try {
      let fileUrl = url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;

        // ✅ FIX #1: Properly read environment variable (Vercel-compatible)
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        // ✅ FIX #2: Validate anonKey exists before attempting upload
        if (!anonKey) {
          throw new Error(
            "Supabase configuration is missing. Please ensure VITE_SUPABASE_ANON_KEY is set in environment variables."
          );
        }

        let uploadSuccess = false;

        // Try XHR upload first (for better progress tracking)
        try {
          await xhrUpload("subject-files", path, file, setPct, anonKey);
          uploadSuccess = true;
          fileUrl = path;
          console.log("✅ XHR upload successful:", path);
        } catch (xhrError: any) {
          console.warn("⚠️ XHR upload failed, attempting fallback:", xhrError.message);
          
          // ✅ FIX #3: Proper fallback with better error handling
          setPct(45);
          const { error: storageError, data: storageData } = await supabase.storage
            .from("subject-files")
            .upload(path, file, { cacheControl: "3600", upsert: false });
          
          if (storageError) {
            throw new Error(`Storage upload failed: ${storageError.message}`);
          }
          
          uploadSuccess = true;
          fileUrl = path;
          setPct(88);
          console.log("✅ Fallback upload successful:", path);
        }

        // ✅ FIX #4: Validate file URL was actually set
        if (!uploadSuccess || !fileUrl) {
          throw new Error("File upload completed but URL could not be retrieved. Please try again.");
        }

        fileType = file.type;
        fileSize = file.size;
      }

      // ✅ FIX #5: Validate required fields before saving to database
      if (!title.trim()) {
        throw new Error("Material title is required");
      }

      if (needFile && !fileUrl) {
        throw new Error(`File must be uploaded for ${matType} material type`);
      }

      setPct(95); 
      setPhase("saving");

      const payload: Record<string, unknown> = {
        subject_id:      subjectId,
        title:           title.trim(),
        material_type:   matType,
        file_url:        fileUrl || null,  // ✅ Use null instead of "placeholder"
        content:         matType === "Text" ? content.trim() : null,
        is_downloadable: downloadable,
        sort_order:      totalMaterials,
        uploaded_by:     user?.id ?? "",
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      };

      console.log("📝 Saving to database:", payload);

      // ✅ FIX #6: Use .select() to confirm database insert was successful
      const { error: dbErr, data: dbData } = await supabase
        .from("subject_materials")
        .insert(payload as any)
        .select();
      
      if (dbErr) {
        throw new Error(`Database error: ${dbErr.message}`);
      }

      // ✅ FIX #7: Validate that data was actually inserted
      if (!dbData || dbData.length === 0) {
        throw new Error("Material was not saved to database. Please try again.");
      }

      console.log("✅ Material saved successfully:", dbData[0]);

      setPct(100); 
      setPhase("done");
      toast({ title: "✅ Material uploaded successfully!" });
      setTimeout(() => { onUploaded(); }, 1200);

    } catch (e: any) {
      setPhase("error"); 
      setPct(0);
      const errorMsg = e.message ?? "Upload failed. Please try again.";
      setErrMsg(errorMsg);
      console.error("❌ Upload error:", e);
      toast({ 
        title: "❌ Upload failed", 
        description: errorMsg, 
        variant: "destructive" 
      });
    }
  };

  const busy = phase === "uploading" || phase === "saving";
  const barLabel = phase === "uploading" ? `Uploading… ${pct}%`
    : phase === "saving" ? "Saving to database…"
    : phase === "done"   ? "Complete!"
    : "";

  return (
    <div style={{
      background: "#fff", borderRadius: 22,
      boxShadow: "0 8px 48px rgba(0,0,0,.1)",
      border: "1px solid #E2E8F0",
      overflow: "hidden", animation: "smh-pop .25s ease",
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${DARK} 0%, #183030 100%)`,
        padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "rgba(255,255,255,.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FilePlus size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: 0 }}>
            Upload New Material
          </h3>
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 11, margin: "2px 0 0" }}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>
        <button type="button" onClick={onCancel}
          style={{
            width: 32, height: 32, borderRadius: 9, border: "none",
            background: "rgba(255,255,255,.12)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <X size={15} color="rgba(255,255,255,.7)" />
        </button>
      </div>

      <div style={{ padding: "24px 24px 20px" }}>
        <StepBar step={step} />

        {/* Error banner */}
        {errMsg && (
          <div style={{
            display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12,
            background: "#FFF5F5", border: "1.5px solid #FEB2B2",
            marginBottom: 20, animation: "smh-pop .2s ease",
          }}>
            <AlertTriangle size={15} color="#E53E3E" style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: "#C53030", fontWeight: 600, margin: 0, flex: 1 }}>
              {errMsg}
            </p>
            <button type="button" onClick={() => { setErrMsg(""); setPhase("idle"); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <X size={13} color="#94A3B8" />
            </button>
          </div>
        )}

        {/* Step content */}
        {step === 0 && <TypeStep selected={matType} onSelect={(t) => { setMatType(t); setFile(null); setUrl(""); setContent(""); }} />}
        {step === 1 && (
          <FileStep
            matType={matType} file={file} setFile={setFile}
            url={url} setUrl={setUrl} content={content} setContent={setContent}
          />
        )}
        {step === 2 && (
          <DetailsStep
            title={title} setTitle={setTitle}
            downloadable={downloadable} setDownloadable={setDownloadable}
          />
        )}

        {/* Progress bar */}
        {(phase === "uploading" || phase === "saving" || phase === "done") && (
          <div style={{
            marginTop: 18, padding: "14px 16px", borderRadius: 14,
            background: "#F0FAF9", border: "1px solid #B2DFDB",
            animation: "smh-pop .2s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#065F46" }}>{barLabel}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: TEAL }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: "#B2DFDB", borderRadius: 99, overflow: "hidden" }}>
              <div
                className={phase === "uploading" ? "smh-progress-bar" : ""}
                style={{
                  height: "100%", borderRadius: 99, width: `${pct}%`,
                  background: phase === "done" ? "#38A169" : phase === "saving" ? GOLD : TEAL,
                  transition: "width .35s ease",
                  backgroundSize: phase === "uploading" ? "60px 100%" : undefined,
                }} />
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {step > 0 && phase === "idle" && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              style={{
                padding: "12px 18px", borderRadius: 12,
                border: "2px solid #E2E8F0", background: "#fff",
                fontWeight: 700, fontSize: 14, color: "#64748B",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
              }}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <button type="button"
            className="smh-btn-primary"
            onClick={handleNext}
            disabled={!canProceed || busy || phase === "done"}
            style={{
              flex: 1, padding: "13px", borderRadius: 12, border: "none",
              background: !canProceed || busy || phase === "done"
                ? "#E2E8F0"
                : `linear-gradient(135deg, ${TEAL} 0%, ${TEAL2} 100%)`,
              color: !canProceed || busy || phase === "done" ? "#94A3B8" : "#fff",
              fontWeight: 800, fontSize: 14, cursor: !canProceed || busy || phase === "done" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              letterSpacing: ".02em",
              boxShadow: !canProceed || busy || phase === "done" ? "none" : `0 4px 20px ${TEAL}44`,
            }}>
            {phase === "uploading" && <><span style={{ animation: "smh-spin .8s linear infinite", display: "flex" }}><Loader size={16} /></span> Uploading {pct}%…</>}
            {phase === "saving"    && <><span style={{ animation: "smh-spin .8s linear infinite", display: "flex" }}><Loader size={16} /></span> Saving…</>}
            {phase === "done"      && <><Check size={16} /> Done!</>}
            {phase === "error"     && <><RefreshCw size={16} /> Retry</>}
            {phase === "idle" && step < 2 && <>Continue <ChevronRight size={16} /></>}
            {phase === "idle" && step === 2 && <><Upload size={16} /> Upload Material</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Material card ────────────────────────────────────────────────────────────
const EditModal = React.memo(({
  mat, onClose, onSaved,
}: { mat: any; onClose: () => void; onSaved: () => void }) => {
  const [title, setTitle]       = useState(mat.title ?? "");
  const [downloadable, setDl]   = useState(mat.is_downloadable ?? true);
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("subject_materials")
      .update({ title: title.trim(), is_downloadable: downloadable })
      .eq("id", mat.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ Saved" });
    onSaved();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(4px)",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 22, width: "100%", maxWidth: 400, padding: 26,
        boxShadow: "0 32px 80px rgba(0,0,0,.25)", animation: "smh-pop .2s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", margin: 0 }}>Edit Material</h3>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={inputStyle} />
          </div>
          <button type="button" onClick={() => setDl(v => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 15px", borderRadius: 13, cursor: "pointer",
              background: downloadable ? LIGHT : "#F8FAFC",
              border: `2px solid ${downloadable ? TEAL : "#E2E8F0"}`,
              transition: "all .18s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
              <Download size={15} color={downloadable ? TEAL : "#94A3B8"} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Allow Download</p>
                <p style={{ fontSize: 11, color: "#94A3B8", margin: "1px 0 0" }}>
                  {downloadable ? "Students can save this file" : "View only"}
                </p>
              </div>
            </div>
            <div style={{
              width: 42, height: 24, borderRadius: 99, position: "relative", flexShrink: 0,
              background: downloadable ? TEAL : "#CBD5E0", transition: "background .2s",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: downloadable ? 21 : 3,
                transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)",
              }} />
            </div>
          </button>
          <button type="button" onClick={save} disabled={saving || !title.trim()}
            style={{
              padding: "13px", borderRadius: 12, border: "none",
              background: saving || !title.trim() ? "#E2E8F0" : `linear-gradient(135deg, ${TEAL}, ${TEAL2})`,
              color: saving || !title.trim() ? "#94A3B8" : "#fff",
              fontWeight: 800, fontSize: 14, cursor: saving || !title.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {saving ? "Saving…" : <><Check size={15} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
});

const MatCard = React.memo(({
  mat, idx, onEdit, onDelete,
}: { mat: any; idx: number; onEdit: (m: any) => void; onDelete: (m: any) => void }) => {
  const meta  = TYPE_META[(mat.material_type as MatType) ?? "PDF"];
  const Icon  = meta.icon;
  const [menu, setMenu] = useState(false);

  const openFile = async () => {
    if (!mat.file_url) return;
    if (mat.file_url.startsWith("http")) { window.open(mat.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(mat.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const downloadFile = async () => {
    let url = mat.file_url;
    if (!url?.startsWith("http")) {
      const { data } = await supabase.storage.from("subject-files").createSignedUrl(mat.file_url, 3600);
      url = data?.signedUrl ?? url;
    }
    const a = document.createElement("a"); a.href = url; a.download = mat.title; a.click();
  };

  return (
    <div className="smh-mat-card" style={{
      background: "#fff", borderRadius: 16,
      border: `1.5px solid ${meta.border}`,
      overflow: "hidden",
      animation: `smh-in .3s ease both`,
      animationDelay: `${idx * 50}ms`,
    }}>
      {/* type stripe */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}66)` }} />

      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: meta.bg, border: `1.5px solid ${meta.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={20} color={meta.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: 700, fontSize: 13, color: "#1E293B", margin: "0 0 5px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{mat.title}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
              }}>{mat.material_type}</span>
              {mat.file_size && (
                <span style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
                  <HardDrive size={9} />{fmtSize(mat.file_size)}
                </span>
              )}
              {mat.created_at && (
                <span style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} />{timeAgo(mat.created_at)}
                </span>
              )}
            </div>
          </div>

          {/* menu */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" onClick={() => setMenu(v => !v)}
              style={{
                width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E2E8F0",
                background: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <MoreVertical size={14} color="#94A3B8" />
            </button>
            {menu && (
              <div style={{
                position: "absolute", right: 0, top: 36,
                background: "#fff", borderRadius: 13, border: "1.5px solid #E2E8F0",
                padding: "6px", zIndex: 50,
                boxShadow: "0 10px 36px rgba(0,0,0,.12)", minWidth: 150,
                animation: "smh-pop .15s ease",
              }} onMouseLeave={() => setMenu(false)}>
                {mat.file_url && mat.file_url !== "placeholder" && (
                  <button type="button" onClick={() => { openFile(); setMenu(false); }}
                    style={menuBtn("#475569")}><Eye size={13} /> View</button>
                )}
                {mat.is_downloadable && mat.file_url && mat.file_url !== "placeholder" && (
                  <button type="button" onClick={() => { downloadFile(); setMenu(false); }}
                    style={menuBtn(TEAL)}><Download size={13} /> Download</button>
                )}
                <button type="button" onClick={() => { onEdit(mat); setMenu(false); }}
                  style={menuBtn(DARK)}><Edit3 size={13} /> Edit</button>
                <div style={{ height: 1, background: "#F1F5F9", margin: "4px 0" }} />
                <button type="button" onClick={() => { onDelete(mat); setMenu(false); }}
                  style={menuBtn("#E53E3E")}><Trash2 size={13} /> Delete</button>
              </div>
            )}
          </div>
        </div>

        {mat.content && (
          <p style={{
            fontSize: 11, color: "#64748B", margin: "10px 0 0", lineHeight: 1.55,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
            overflow: "hidden", padding: "8px 10px",
            background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0",
          }}>{mat.content}</p>
        )}
      </div>
    </div>
  );
});

function menuBtn(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    padding: "8px 11px", borderRadius: 9, border: "none", background: "none",
    cursor: "pointer", fontSize: 12, fontWeight: 600, color, textAlign: "left",
  };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function SubjectMaterialsHub({
  subjectId, subjectTitle,
}: { subjectId: string; subjectTitle?: string }) {
  const qc = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<MatType | "All">("All");
  const [editMat, setEditMat]       = useState<any>(null);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["hub-materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!subjectId,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["hub-materials", subjectId] });
    qc.invalidateQueries({ queryKey: ["adm-materials", subjectId] });
    qc.invalidateQueries({ queryKey: ["materials", subjectId] });
  }, [qc, subjectId]);

  const deleteMaterial = useCallback(async (mat: any) => {
    if (!confirm(`Delete "${mat.title}"?`)) return;
    if (mat.file_url && !mat.file_url.startsWith("http") && mat.file_url !== "placeholder")
      await supabase.storage.from("subject-files").remove([mat.file_url]);
    const { error } = await supabase.from("subject_materials").delete().eq("id", mat.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "🗑 Deleted" });
    invalidate();
  }, [invalidate]);

  const filtered = useMemo(() => materials.filter((m: any) => {
    const matchType   = typeFilter === "All" || m.material_type === typeFilter;
    const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }), [materials, search, typeFilter]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    materials.forEach((m: any) => { c[m.material_type] = (c[m.material_type] ?? 0) + 1; });
    return c;
  }, [materials]);

  return (
    <>
      <style>{CSS}</style>
      <div className="smh-root">

        {/* ── TOP BAR ── */}
        <div style={{
          background: `linear-gradient(135deg, ${DARK} 0%, #183030 100%)`,
          borderRadius: 20, padding: "20px 22px", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14,
              background: "rgba(255,255,255,.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <BookOpen size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ color: "#fff", fontWeight: 900, fontSize: 17, margin: 0 }}>
                {subjectTitle ? `${subjectTitle} — ` : ""}Materials
              </h2>
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 12, margin: "3px 0 0" }}>
                {materials.length} resource{materials.length !== 1 ? "s" : ""} uploaded
              </p>
            </div>
          </div>

          <button type="button" onClick={() => setShowWizard(true)}
            className="smh-btn-primary"
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "11px 18px",
              borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${TEAL}, ${TEAL2})`,
              color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
              boxShadow: `0 4px 18px ${TEAL}66`,
            }}>
            <FilePlus size={15} /> Add Material
          </button>
        </div>

        {/* ── UPLOAD WIZARD (modal) ── */}
        {showWizard && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, overflowY: "auto",
          }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowWizard(false); }}>
            <div style={{ width: "100%", maxWidth: 540, margin: "auto" }}>
              <UploadWizard
                subjectId={subjectId}
                totalMaterials={materials.length}
                onUploaded={() => { setShowWizard(false); invalidate(); }}
                onCancel={() => setShowWizard(false)}
              />
            </div>
          </div>
        )}

        {/* ── TYPE STAT CHIPS ── */}
        {Object.keys(typeCounts).length > 0 && (
          <div style={{
            display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap",
          }}>
            {(Object.keys(typeCounts) as MatType[]).map((t) => {
              const m = TYPE_META[t], Icon = m.icon, sel = typeFilter === t;
              return (
                <button key={t} type="button" className="smh-filter-pill"
                  onClick={() => setTypeFilter(sel ? "All" : t)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 99,
                    border: `1.5px solid ${sel ? m.color : m.border}`,
                    background: sel ? m.bg : "#fff",
                    color: sel ? m.color : "#64748B",
                    fontWeight: 700, fontSize: 11, cursor: "pointer",
                    boxShadow: sel ? `0 2px 10px ${m.color}22` : "none",
                  }}>
                  <Icon size={12} /> {t} ({typeCounts[t]})
                </button>
              );
            })}
            {typeFilter !== "All" && (
              <button type="button" className="smh-filter-pill"
                onClick={() => setTypeFilter("All")}
                style={{
                  padding: "7px 14px", borderRadius: 99,
                  border: "1.5px solid #E2E8F0", background: "#fff",
                  color: "#64748B", fontWeight: 700, fontSize: 11, cursor: "pointer",
                }}>
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* ── SEARCH ── */}
        <div style={{
          position: "relative", marginBottom: 18,
        }}>
          <Search size={14} color="#94A3B8"
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            style={{ ...inputStyle, paddingLeft: 38, paddingTop: 11, paddingBottom: 11 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none