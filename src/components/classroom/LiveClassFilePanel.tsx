/**
 * LiveClassFilePanel.tsx — Tahleem Academy
 *
 * Multi-viewer edition:
 *  - Open as many materials as you like simultaneously
 *  - Each viewer is independently minimizable / restorable
 *  - Back button / swipe-back → auto-minimizes the topmost expanded viewer
 *  - Minimized viewers appear as stacked pip chips at the bottom of the screen
 *  - Click a chip to restore that specific viewer
 *  - Opening a file that is already open → focuses / restores it (no duplicate)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import PDFViewer, { prewarmPDF } from "./PDFViewer";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useAuth } from "@/contexts/AuthContext";

/* ── palette ── */
const G    = "#1B4332";
const GOLD = "#C8922A";
const GOLDB= "#FFF8EC";
const BG   = "#F7F4EF";
const SURF = "#FFFFFF";
const BORD = "#DDD8CF";
const MUT  = "#6B7B6E";
const RED  = "#B91C1C";
const REDL = "#FEF2F2";
const TEAL = "#0D9488";
const TEALL= "#F0FDFA";

const BUCKET  = "subject-files";
const MAIN_URL = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";

/* ── types ── */
interface LCFile {
  id:         string;
  subject_id: string;
  file_name:  string;
  file_url:   string;
  file_type:  string | null;
  file_size:  number | null;
  created_at: string | null;
}

interface ViewerEntry {
  id:          string;   // same as LCFile.id
  file:        LCFile;
  resolvedUrl: string | null;
  resolving:   boolean;
  minimized:   boolean;
  /** higher = on top */
  zOrder:      number;
}

type Tab  = "upload" | "link";
type Kind = "PDF" | "Image" | "Video" | "Audio" | "Doc" | "Link" | "File";

/* ── helpers ── */
function getKind(name: string, mime?: string | null): Kind {
  if (mime === "link") return "Link";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m   = (mime ?? "").toLowerCase();
  if (m.includes("pdf")   || ext === "pdf")                                                return "PDF";
  if (m.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(ext)) return "Image";
  if (m.includes("video") || ["mp4","webm","mov","mkv","avi"].includes(ext))               return "Video";
  if (m.includes("audio") || ["mp3","wav","m4a","aac","ogg"].includes(ext))                return "Audio";
  if (["doc","docx","xls","xlsx","ppt","pptx","txt","csv"].includes(ext))                  return "Doc";
  if (/^https?:\/\//i.test(name)) return "Link";
  return "File";
}

const ICONS: Record<Kind, { i: string; c: string; bg: string }> = {
  PDF:   { i: "📄", c: "#B91C1C", bg: "#FEF2F2" },
  Image: { i: "🖼️", c: "#1D4ED8", bg: "#EFF6FF" },
  Video: { i: "🎬", c: "#6D28D9", bg: "#F5F3FF" },
  Audio: { i: "🎵", c: "#0E7490", bg: "#ECFEFF" },
  Doc:   { i: "📝", c: "#B45309", bg: "#FFFBEB" },
  Link:  { i: "🔗", c: TEAL,      bg: TEALL     },
  File:  { i: "📁", c: "#374151", bg: "#F9FAFB" },
};

function fmtBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── URL transformer ── */
function toEmbedUrl(url: string): {
  embedUrl: string;
  embedKind: "youtube" | "gdrive" | "pdf" | "video" | "audio" | "image" | "doc" | "iframe";
} {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, embedKind: "youtube" };
  }
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (gdMatch) {
    return { embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview`, embedKind: "gdrive" };
  }
  const gdMatch2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (gdMatch2) {
    return { embedUrl: `https://drive.google.com/file/d/${gdMatch2[1]}/preview`, embedKind: "gdrive" };
  }
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { embedUrl: url, embedKind: "pdf" };
  if (["mp4","webm","mov","m4v","avi","mkv"].includes(ext))          return { embedUrl: url, embedKind: "video" };
  if (["mp3","wav","m4a","aac","ogg","flac","opus"].includes(ext))   return { embedUrl: url, embedKind: "audio" };
  if (["jpg","jpeg","png","gif","webp","svg","avif"].includes(ext))  return { embedUrl: url, embedKind: "image" };
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","csv","rtf"].includes(ext)) {
    return { embedUrl: `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`, embedKind: "doc" };
  }
  return { embedUrl: url, embedKind: "iframe" };
}

/* ════════════════════════════════════════════════════════════
   SINGLE FILE VIEWER — one instance per open material
   zIndex stacking is controlled by the parent (higher = on top)
════════════════════════════════════════════════════════════ */
interface FileViewerProps {
  entry:      ViewerEntry;
  baseZ:      number;   // 99000 + zOrder * 10
  onClose:    (id: string) => void;
  onMinimize: (id: string) => void;
  onFocus:    (id: string) => void;  // bring to front
}

function FileViewer({ entry, baseZ, onClose, onMinimize, onFocus }: FileViewerProps) {
  const { file, resolvedUrl, resolving, minimized } = entry;
  const [iframeBlocked,   setIframeBlocked]   = useState(false);
  const [loaderVisible,   setLoaderVisible]   = useState(true);
  const [showDriveHelper, setShowDriveHelper] = useState(false);

  const url  = resolvedUrl || file.file_url;
  const kind = getKind(file.file_name, file.file_type);

  let embedKind: ReturnType<typeof toEmbedUrl>["embedKind"] = "iframe";
  let embedUrl  = url;

  if (kind === "Link") {
    const r = toEmbedUrl(url);
    embedUrl  = r.embedUrl;
    embedKind = r.embedKind;
  } else if (kind === "PDF")   { embedKind = "pdf"; }
  else if (kind === "Image")   { embedKind = "image"; }
  else if (kind === "Video")   { embedKind = "video"; }
  else if (kind === "Audio")   { embedKind = "audio"; }
  else if (kind === "Doc") {
    embedUrl  = `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`;
    embedKind = "doc";
  }

  const isGdrive = embedKind === "gdrive";

  useEffect(() => {
    setIframeBlocked(false);
    setLoaderVisible(true);
    setShowDriveHelper(false);
  }, [file.id]);

  useEffect(() => {
    if (!isGdrive || loaderVisible || minimized) return;
    const t = setTimeout(() => setShowDriveHelper(true), 4000);
    return () => clearTimeout(t);
  }, [isGdrive, loaderVisible, minimized]);

  // Minimized viewers don't lock body scroll; only the topmost expanded one does
  useEffect(() => {
    if (!minimized) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [minimized]);

  /* ── MINIMIZED: rendered as a chip — the PIP bar renders them all ── */
  if (minimized) return null;   // pip bar handled separately below

  /* ── EXPANDED OVERLAY ── */
  const cfg = ICONS[kind];

  const renderGdrive = () => (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#1a2e24", borderBottom: "1px solid #2d4a36", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20 }}>📁</span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>Google Drive</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ background: GOLD, color: "#fff", borderRadius: 10, padding: "8px 18px", textDecoration: "none", fontWeight: 700, fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          Open in Drive ↗
        </a>
      </div>
      {showDriveHelper && (
        <div style={{ background: "#2d1f08", borderBottom: "1px solid #78350f40", padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#fcd34d" }}>Seeing a blank screen?</p>
            <p style={{ margin: 0, fontSize: 12, color: "#d97706", lineHeight: 1.4 }}>
              The file must be set to <strong>"Anyone with the link can view"</strong> in Google Drive for preview to work here.
            </p>
          </div>
          <button onClick={() => setShowDriveHelper(false)} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 16, flexShrink: 0, padding: 0 }}>✕</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loaderVisible && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1a14", zIndex: 1, gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #ffffff20", borderTopColor: GOLD, animation: "lcfp-spin .7s linear infinite" }} />
            <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Loading Google Drive preview…</p>
          </div>
        )}
        <iframe key={embedUrl} src={embedUrl} title={file.file_name}
          style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen onLoad={() => setLoaderVisible(false)} onError={() => { setLoaderVisible(false); setIframeBlocked(true); }} />
        {iframeBlocked && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1a14", padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Preview blocked</p>
            <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>Drive's security policy prevents embedding here.</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ background: GOLD, color: "#fff", borderRadius: 10, padding: "10px 24px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
              Open in Drive ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    if (embedKind === "image") return (
      <div style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 0 }}>
        <img src={embedUrl} alt={file.file_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
    if (embedKind === "audio") return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "#0f1a14" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎵</div>
          <p style={{ color: "#fff", marginBottom: 20, fontSize: 15, fontWeight: 600 }}>{file.file_name}</p>
          <audio src={embedUrl} controls autoPlay style={{ width: "100%", maxWidth: 400 }} />
        </div>
      </div>
    );
    if (embedKind === "video") return (
      <div style={{ flex: 1, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
        <video src={embedUrl} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
      </div>
    );
    if (embedKind === "gdrive") return renderGdrive();
    if (embedKind === "pdf") return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <PDFViewer url={embedUrl} bg="#0f1a14" />
      </div>
    );
    if (iframeBlocked) return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1a14", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Can't display this website here</p>
        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>The site's security policy prevents embedding.</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ background: GOLD, color: "#fff", borderRadius: 10, padding: "10px 24px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Open in new tab ↗
        </a>
      </div>
    );
    return (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loaderVisible && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1a14", zIndex: 1, pointerEvents: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #ffffff20", borderTopColor: GOLD, animation: "lcfp-spin .7s linear infinite" }} />
          </div>
        )}
        <iframe key={embedUrl} src={embedUrl} title={file.file_name}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen onLoad={() => setLoaderVisible(false)} onError={() => setIframeBlocked(true)} />
      </div>
    );
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: baseZ, background: "rgba(0,0,0,.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={() => onMinimize(entry.id)}
    >
      <div
        onClick={e => { e.stopPropagation(); onFocus(entry.id); }}
        style={{ width: "100%", maxWidth: 920, height: "min(92vh, 700px)", background: "#111827", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,.7)" }}
      >
        {/* Resolving overlay */}
        {resolving && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "#111827", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 16 }}>
            <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,.15)", borderTopColor: GOLD, borderRadius: "50%", animation: "lcfp-spin .8s linear infinite" }} />
            <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Opening {file.file_name}…</p>
          </div>
        )}
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#1f2937", borderBottom: "1px solid #374151", flexShrink: 0 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.i}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.file_name}
          </span>
          {kind !== "Link" && (
            <a href={url} download={file.file_name} target="_blank" rel="noopener"
              style={{ fontSize: 12, color: "#d1d5db", background: "#374151", borderRadius: 8, padding: "5px 12px", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}>
              ⬇ Download
            </a>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#d1d5db", background: "#374151", borderRadius: 8, padding: "5px 12px", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}>
            ↗ New tab
          </a>
          <button onClick={() => onMinimize(entry.id)} title="Minimize"
            style={{ background: GOLD, border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
            ⬇ Min
          </button>
          <button onClick={() => onClose(entry.id)}
            style={{ background: "#374151", border: "none", color: "#d1d5db", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            ✕
          </button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {renderContent()}
        </div>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
        Tap outside or ⬇ Min to minimize • open multiple materials at once
      </p>
    </div>,
    document.body
  );
}

/* ════════════════════════════════════════════════════════════
   PIP BAR — shows chips for all minimized viewers
════════════════════════════════════════════════════════════ */
interface PipBarProps {
  entries:   ViewerEntry[];
  onRestore: (id: string) => void;
  onClose:   (id: string) => void;
}

function PipBar({ entries, onRestore, onClose }: PipBarProps) {
  const minimized = entries.filter(e => e.minimized);
  if (minimized.length === 0) return null;

  return createPortal(
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 199999,
      background: "#1f2937",
      borderTop: `3px solid ${GOLD}`,
      boxShadow: "0 -4px 24px rgba(0,0,0,.5)",
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 12px",
      overflowX: "auto",
      fontFamily: "system-ui,sans-serif",
    }}>
      <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0, marginRight: 4 }}>
        📎 {minimized.length} minimized
      </span>
      {minimized.map(e => {
        const kind = getKind(e.file.file_name, e.file.file_type);
        const cfg  = ICONS[kind];
        return (
          <div key={e.id} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#374151", borderRadius: 10,
            padding: "6px 10px", flexShrink: 0, cursor: "pointer",
            border: `1px solid ${GOLD}50`,
            maxWidth: 220,
          }}
            onClick={() => onRestore(e.id)}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.i}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {e.file.file_name}
            </span>
            <button
              onClick={ev => { ev.stopPropagation(); onClose(e.id); }}
              style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}>
              ✕
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function LiveClassFilePanel({ subjectId }: { subjectId: string }) {
  const { user } = useAuth();

  const [tab,        setTab]        = useState<Tab>("upload");
  const [files,      setFiles]      = useState<LCFile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [pct,        setPct]        = useState(0);
  const [upName,     setUpName]     = useState("");
  const [delId,      setDelId]      = useState<string | null>(null);

  const [linkUrl,    setLinkUrl]    = useState("");
  const [linkLabel,  setLinkLabel]  = useState("");
  const [addingLink, setAddingLink] = useState(false);

  /* ── Multi-viewer state ── */
  const [viewers,  setViewers]  = useState<ViewerEntry[]>([]);
  const zCounter = useRef(0);

  const expandedViewers  = viewers.filter(v => !v.minimized);
  const minimizedViewers = viewers.filter(v => v.minimized);
  const anyExpanded      = expandedViewers.length > 0;
  const anyMinimized     = minimizedViewers.length > 0;
  // IDs of files currently open in any viewer
  const openFileIds = new Set(viewers.map(v => v.id));

  /* ── Back button / swipe → minimize topmost expanded viewer ── */
  useEffect(() => {
    if (!anyExpanded) return;

    const handler = (e: PopStateEvent) => {
      // Re-push the state so navigation doesn't leave the page
      window.history.pushState(null, "", window.location.href);
      // Minimize the viewer with the highest zOrder
      setViewers(prev => {
        const expanded = prev.filter(v => !v.minimized);
        if (expanded.length === 0) return prev;
        const topmost = expanded.reduce((a, b) => a.zOrder > b.zOrder ? a : b);
        return prev.map(v => v.id === topmost.id ? { ...v, minimized: true } : v);
      });
    };

    // Push a sentinel state so popstate fires on back/swipe
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [anyExpanded]);

  /* ── Resolve URL ── */
  const resolveViewerUrl = useCallback(async (rawUrl: string): Promise<string> => {
    if (!rawUrl) return rawUrl;
    const isSupabaseStorage = rawUrl.includes(".supabase.co/storage");
    if (!isSupabaseStorage) return rawUrl;
    const match = rawUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^/?]+)\/(.+?)(\?.*)?$/);
    if (!match) return rawUrl;
    const [, bucketName, storagePath] = match;
    const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    if (pub?.publicUrl) {
      try {
        const r = await fetch(pub.publicUrl, { method: "HEAD", signal: AbortSignal.timeout(4000) });
        if (r.ok || r.status === 304) return pub.publicUrl;
      } catch { /* fall through */ }
    }
    try {
      const { data: signed } = await supabase.storage.from(bucketName).createSignedUrl(storagePath, 604800);
      if (signed?.signedUrl) return signed.signedUrl;
    } catch { /* fall through */ }
    return rawUrl;
  }, []);

  const dragCnt = useRef(0);

  /* ── fetch ── */
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("liveclass_files")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setFiles(data ?? []);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (!files.length) return;
    const pdfs = files.filter(f => (f.file_url || "").toLowerCase().split("?")[0].endsWith(".pdf"));
    const timers = pdfs.map((f, i) => setTimeout(async () => {
      const resolved = await resolveViewerUrl(f.file_url);
      prewarmPDF(resolved);
    }, i * 600));
    return () => timers.forEach(clearTimeout);
  }, [files, resolveViewerUrl]);

  /* ── open / focus ── */
  const openFile = useCallback(async (f: LCFile) => {
    // If already open, just restore + bring to front
    setViewers(prev => {
      const existing = prev.find(v => v.id === f.id);
      if (existing) {
        zCounter.current++;
        const z = zCounter.current;
        return prev.map(v => v.id === f.id ? { ...v, minimized: false, zOrder: z } : v);
      }
      return prev;
    });

    // Check if it was already open (before setState resolves)
    const alreadyOpen = viewers.some(v => v.id === f.id);
    if (alreadyOpen) return;

    // New viewer
    zCounter.current++;
    const z = zCounter.current;
    const newEntry: ViewerEntry = {
      id: f.id, file: f, resolvedUrl: null, resolving: true, minimized: false, zOrder: z,
    };
    setViewers(prev => [...prev, newEntry]);

    const resolved = await resolveViewerUrl(f.file_url);
    setViewers(prev => prev.map(v => v.id === f.id ? { ...v, resolvedUrl: resolved, resolving: false } : v));
  }, [viewers, resolveViewerUrl]);

  const closeViewer = useCallback((id: string) => {
    setViewers(prev => prev.filter(v => v.id !== id));
  }, []);

  const minimizeViewer = useCallback((id: string) => {
    setViewers(prev => prev.map(v => v.id === id ? { ...v, minimized: true } : v));
  }, []);

  const restoreViewer = useCallback((id: string) => {
    zCounter.current++;
    const z = zCounter.current;
    setViewers(prev => prev.map(v => v.id === id ? { ...v, minimized: false, zOrder: z } : v));
  }, []);

  const focusViewer = useCallback((id: string) => {
    zCounter.current++;
    const z = zCounter.current;
    setViewers(prev => prev.map(v => v.id === id ? { ...v, zOrder: z } : v));
  }, []);

  /* ── upload ── */
  const upload = useCallback(async (file: File) => {
    if (!user) { setErr("Not signed in"); return; }
    setUploading(true); setPct(0); setUpName(file.name); setErr(null);
    try {
      const slug = `liveclass/${subjectId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${file.name.split(".").pop() || "bin"}`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      if (!token) throw new Error("Not authenticated — please log in again.");
      await new Promise<void>((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${MAIN_URL}/storage/v1/object/${BUCKET}/${slug}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable) setPct(Math.round(ev.loaded / ev.total * 85));
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? res() : rej(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
        xhr.onerror = () => rej(new Error("Network error during upload"));
        xhr.send(file);
      });
      setPct(90);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(slug);
      const fileUrl = pub?.publicUrl ?? `${MAIN_URL}/storage/v1/object/public/${BUCKET}/${slug}`;
      const { error: dbErr } = await (supabase as any).from("liveclass_files").insert({
        subject_id: subjectId, file_name: file.name, file_url: fileUrl,
        file_type: file.type || null, file_size: file.size, uploaded_by: user.id,
      });
      if (dbErr) throw dbErr;
      setPct(100);
      await fetchFiles();
      setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 600);
    } catch (e: any) {
      try {
        const slug2 = `liveclass/${subjectId}/${Date.now()}.${file.name.split(".").pop() || "bin"}`;
        const { error: stErr } = await storageSupabase.storage.from(BUCKET).upload(slug2, file, { upsert: true, contentType: file.type });
        if (stErr) throw stErr;
        const { data: pub2 } = supabase.storage.from(BUCKET).getPublicUrl(slug2);
        const url2 = pub2?.publicUrl ?? `${MAIN_URL}/storage/v1/object/public/${BUCKET}/${slug2}`;
        await (supabase as any).from("liveclass_files").insert({
          subject_id: subjectId, file_name: file.name, file_url: url2,
          file_type: file.type || null, file_size: file.size, uploaded_by: user.id,
        });
        setPct(100);
        await fetchFiles();
        setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 600);
      } catch (e2: any) {
        setErr(e2?.message ?? "Upload failed — check your connection and try again.");
        setUploading(false); setPct(0); setUpName("");
      }
    }
  }, [subjectId, user, fetchFiles]);

  /* ── save link ── */
  const saveLink = useCallback(async () => {
    if (!user) { setErr("Not signed in"); return; }
    const trimUrl = linkUrl.trim();
    if (!trimUrl) { setErr("Please enter a URL"); return; }
    if (!/^https?:\/\//i.test(trimUrl)) { setErr("URL must start with http:// or https://"); return; }
    setAddingLink(true); setErr(null);
    const label = linkLabel.trim() || trimUrl;
    try {
      const { error: dbErr } = await (supabase as any).from("liveclass_files").insert({
        subject_id: subjectId, file_name: label, file_url: trimUrl, file_type: "link", file_size: null, uploaded_by: user.id,
      });
      if (dbErr) throw dbErr;
      setLinkUrl(""); setLinkLabel("");
      await fetchFiles();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save link");
    } finally {
      setAddingLink(false);
    }
  }, [subjectId, user, linkUrl, linkLabel, fetchFiles]);

  /* ── drag ── */
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current--; if (dragCnt.current <= 0) { dragCnt.current = 0; setDragging(false); } };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current = 0; setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !uploading) upload(f);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f && !uploading) upload(f);
  };

  /* ── delete ── */
  const deleteFile = async (f: LCFile) => {
    if (!confirm(`Delete "${f.file_name}"?`)) return;
    setDelId(f.id);
    await (supabase as any).from("liveclass_files").delete().eq("id", f.id);
    if (f.file_type !== "link") {
      const match = f.file_url.match(/\/storage\/v1\/object\/(?:public\/)?([^/?]+)\/(.+?)(\?.*)?$/);
      if (match) {
        const [, bucketName, storagePath] = match;
        storageSupabase.storage.from(bucketName).remove([storagePath]).catch(() => {});
      }
    }
    closeViewer(f.id);
    setFiles(prev => prev.filter(x => x.id !== f.id));
    setDelId(null);
  };

  /* ── open-count badge ── */
  const openCount = viewers.length;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <>
      <style>{`
        @keyframes lcfp-spin { to { transform:rotate(360deg); } }
        .lcfp-file-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid ${BORD}; transition:background .12s; cursor:pointer; }
        .lcfp-file-row:last-child { border-bottom:none; }
        .lcfp-file-row:hover { background:${BG}; }
        .lcfp-file-row.lcfp-open { background:${GOLDB}; border-left:3px solid ${GOLD}; }
        .lcfp-del-btn { opacity:0; border:none; background:none; cursor:pointer; padding:5px; border-radius:6px; color:${RED}; flex-shrink:0; font-size:16px; }
        .lcfp-file-row:hover .lcfp-del-btn { opacity:1; }
        .lcfp-tab { flex:1; padding:8px 12px; border:none; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; }
        .lcfp-input { width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid ${BORD}; border-radius:10px; font-size:13px; outline:none; background:${SURF}; color:#111; font-family:inherit; }
        .lcfp-input:focus { border-color:${G}; box-shadow:0 0 0 3px ${G}18; }
      `}</style>

      <div style={{ fontFamily: "system-ui,sans-serif", paddingBottom: anyMinimized ? 72 : 0 }}>

        {/* ── open-count banner ── */}
        {openCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1B433215", border: `1px solid ${G}30`, borderRadius: 12, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: G }}>
            <span style={{ fontWeight: 700 }}>📂 {openCount} material{openCount > 1 ? "s" : ""} open</span>
            <span style={{ color: MUT }}>· tap any to switch, or open more simultaneously</span>
            {expandedViewers.length === 0 && minimizedViewers.length > 0 && (
              <span style={{ marginLeft: "auto", color: GOLD, fontWeight: 600 }}>all minimized ↓</span>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 6, background: BG, borderRadius: 12, padding: 4, marginBottom: 16 }}>
          <button className="lcfp-tab" onClick={() => setTab("upload")}
            style={{ background: tab === "upload" ? SURF : "transparent", color: tab === "upload" ? G : MUT, boxShadow: tab === "upload" ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>
            📂 Upload File
          </button>
          <button className="lcfp-tab" onClick={() => setTab("link")}
            style={{ background: tab === "link" ? SURF : "transparent", color: tab === "link" ? G : MUT, boxShadow: tab === "link" ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>
            🔗 Add Link
          </button>
        </div>

        {/* ── Upload tab ── */}
        {tab === "upload" && (
          <div
            onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
            style={{ position: "relative", border: `2px dashed ${dragging ? GOLD : BORD}`, borderRadius: 16, background: dragging ? GOLDB : BG, padding: "28px 20px", textAlign: "center", transition: "all .18s", marginBottom: 16, userSelect: "none", overflow: "hidden" }}
          >
            {uploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
                <div style={{ fontSize: 28 }}>⏫</div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: G }}>Uploading {upName}</p>
                <div style={{ width: "100%", maxWidth: 260, height: 6, borderRadius: 99, background: BORD, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: GOLD, borderRadius: 99, transition: "width .25s" }} />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: MUT }}>{pct}%</p>
              </div>
            ) : (
              <div style={{ pointerEvents: "none" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: G }}>Tap to choose a file, or drag and drop</p>
                <p style={{ margin: 0, fontSize: 12, color: MUT }}>Images · PDFs · Videos · Documents — any format</p>
              </div>
            )}
            {!uploading && (
              <input type="file" accept="*/*" onChange={onPick}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0, padding: 0 }} />
            )}
          </div>
        )}

        {/* ── Link tab ── */}
        {tab === "link" && (
          <div style={{ background: BG, border: `1px solid ${BORD}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: MUT }}>
              Paste any URL — YouTube, Google Drive, PDF link, website…
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>URL *</label>
                <input className="lcfp-input" type="url" placeholder="https://..."
                  value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveLink()} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>
                  Label <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span>
                </label>
                <input className="lcfp-input" type="text" placeholder="e.g. Today's slides, Surah Al-Baqarah video…"
                  value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveLink()} />
              </div>
              <button onClick={saveLink} disabled={addingLink || !linkUrl.trim()}
                style={{ background: linkUrl.trim() ? G : BORD, color: linkUrl.trim() ? "#fff" : MUT, border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: linkUrl.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .15s" }}>
                {addingLink
                  ? <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #ffffff40", borderTopColor: "#fff", animation: "lcfp-spin .6s linear infinite" }} /> Saving…</>
                  : "🔗 Add Link"}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {err && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: REDL, border: `1px solid ${RED}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: RED }}>
            ⚠️ {err}
            <button onClick={() => setErr(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: RED, fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── Resource list ── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "lcfp-spin .7s linear infinite" }} />
          </div>
        ) : files.length === 0 ? (
          <div style={{ background: SURF, border: `1px solid ${BORD}`, borderRadius: 14, padding: "36px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📭</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: MUT }}>Nothing here yet</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUT }}>Upload a file or add a link above</p>
          </div>
        ) : (
          <div style={{ background: SURF, border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: G }}>
                Class Resources <span style={{ color: MUT, fontWeight: 400 }}>({files.length})</span>
              </span>
              <button onClick={fetchFiles} style={{ fontSize: 12, color: MUT, background: "none", border: "none", cursor: "pointer" }}>
                ↺ Refresh
              </button>
            </div>

            {files.map(f => {
              const k       = getKind(f.file_name, f.file_type);
              const cfg     = ICONS[k];
              const isOpen  = openFileIds.has(f.id);
              const viewer  = viewers.find(v => v.id === f.id);
              const isMinimized = viewer?.minimized ?? false;
              return (
                <div
                  key={f.id}
                  className={`lcfp-file-row${isOpen ? " lcfp-open" : ""}`}
                  onClick={() => delId !== f.id && openFile(f)}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {cfg.i}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isOpen ? GOLD : "inherit" }}>
                      {f.file_name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: MUT }}>
                      {k === "Link" ? "🔗 Link" : k}
                      {f.file_size ? ` · ${fmtBytes(f.file_size)}` : ""}
                      {f.created_at ? ` · ${fmtDate(f.created_at)}` : ""}
                      {isOpen && !isMinimized ? " · ▶ Viewing" : ""}
                      {isOpen && isMinimized ? " · ⬇ Minimized" : ""}
                    </p>
                  </div>

                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: isOpen ? GOLD : cfg.c, background: isOpen ? GOLDB : cfg.bg, padding: "3px 9px", borderRadius: 20, border: isOpen ? `1px solid ${GOLD}60` : "none" }}>
                    {isOpen && !isMinimized ? "Viewing" : isOpen && isMinimized ? "⬇ Min" : k === "Image" ? "Preview" : k === "Link" ? "View" : "Open"}
                  </span>

                  <button className="lcfp-del-btn" disabled={delId === f.id}
                    onClick={e => { e.stopPropagation(); deleteFile(f); }} title="Delete">
                    {delId === f.id
                      ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${RED}`, borderTopColor: "transparent", animation: "lcfp-spin .6s linear infinite" }} />
                      : "🗑️"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── All expanded viewers (stacked by zOrder) ── */}
      {viewers.map(entry => (
        <FileViewer
          key={entry.id}
          entry={entry}
          baseZ={99000 + entry.zOrder * 10}
          onClose={closeViewer}
          onMinimize={minimizeViewer}
          onFocus={focusViewer}
        />
      ))}

      {/* ── PIP chips for minimized viewers ── */}
      <PipBar
        entries={viewers}
        onRestore={restoreViewer}
        onClose={closeViewer}
      />
    </>
  );
}
