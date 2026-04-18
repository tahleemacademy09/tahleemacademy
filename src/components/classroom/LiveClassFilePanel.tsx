/**
 * LiveClassFilePanel.tsx \u2014 Tahleem Academy
 *
 * Changes in this version:
 *  - "Upload File" tab (existing) + "Add Link" tab (new)
 *  - All files AND links open in an in-page floating overlay \u2014 NEVER a new tab
 *  - Smart viewer: YouTube embed, Google Drive preview, PDF iframe, video/audio/image
 *    native players, Office Docs via Google Docs Viewer, generic iframe w/ fallback
 *  - Students stay on the ClassroomView page at all times
 *  - MINIMIZABLE VIEWER: shrinks to a floating bottom bar so you can browse the
 *    file list while keeping a file "open". Click another file to navigate to it.
 *  - NAVIGATION HISTORY: back/forward arrows cycle through all opened files in
 *    the current session.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useAuth } from "@/contexts/AuthContext";

/* \u2500\u2500 palette \u2500\u2500 */
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

const BUCKET = "liveclass-files";
const SB_URL = import.meta.env.VITE_STORAGE_SUPABASE_URL || "https://ovgsleayannsxifhiraw.supabase.co";

/* \u2500\u2500 types \u2500\u2500 */
interface LCFile {
  id:         string;
  subject_id: string;
  file_name:  string;
  file_url:   string;
  file_type:  string | null;
  file_size:  number | null;
  created_at: string | null;
}

type Tab  = "upload" | "link";
type Kind = "PDF" | "Image" | "Video" | "Audio" | "Doc" | "Link" | "File";

/* \u2500\u2500 helpers \u2500\u2500 */
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
  PDF:   { i: "\ud83d\udcc4", c: "#B91C1C", bg: "#FEF2F2" },
  Image: { i: "\ud83d\uddbc\ufe0f", c: "#1D4ED8", bg: "#EFF6FF" },
  Video: { i: "\ud83c\udfac", c: "#6D28D9", bg: "#F5F3FF" },
  Audio: { i: "\ud83c\udfb5", c: "#0E7490", bg: "#ECFEFF" },
  Doc:   { i: "\ud83d\udcdd", c: "#B45309", bg: "#FFFBEB" },
  Link:  { i: "\ud83d\udd17", c: TEAL,      bg: TEALL     },
  File:  { i: "\ud83d\udcc1", c: "#374151", bg: "#F9FAFB" },
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

/* \u2500\u2500 URL transformer: raw URL \u2192 best embeddable URL \u2500\u2500 */
function toEmbedUrl(url: string): {
  embedUrl: string;
  embedKind: "youtube" | "gdrive" | "pdf" | "video" | "audio" | "image" | "doc" | "iframe";
} {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, embedKind: "youtube" };
  }

  // Google Drive  /file/d/ID/view  \u2192  /file/d/ID/preview
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

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   IN-PAGE VIEWER \u2014 MINIMIZABLE
   When minimized: compact floating bar at the bottom of the screen.
   When expanded: full overlay as before.
   Supports back/forward navigation through opened-files history.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
interface FileViewerProps {
  file:       LCFile;
  minimized:  boolean;
  canGoBack:  boolean;
  canGoFwd:   boolean;
  totalOpen:  number;
  currentIdx: number;
  onClose:    () => void;
  onMinimize: () => void;
  onRestore:  () => void;
  onBack:     () => void;
  onForward:  () => void;
}

function FileViewer({
  file, minimized,
  canGoBack, canGoFwd, totalOpen, currentIdx,
  onClose, onMinimize, onRestore, onBack, onForward,
}: FileViewerProps) {
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);

  const url  = file.file_url;
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

  // Reset loader whenever the file changes
  useEffect(() => {
    setIframeBlocked(false);
    setLoaderVisible(true);
  }, [file.id]);

  // Lock body scroll only when expanded
  useEffect(() => {
    if (!minimized) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [minimized]);

  /* \u2500\u2500 MINIMIZED: floating bottom bar \u2500\u2500 */
  if (minimized) {
    const cfg = ICONS[kind];
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99999,
        background: "#1f2937",
        borderTop: `3px solid ${GOLD}`,
        boxShadow: "0 -4px 24px rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        fontFamily: "system-ui,sans-serif",
      }}>
        {/* File icon + name */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: cfg.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          {cfg.i}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700,
            color: "#f3f4f6",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {file.file_name}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
            Minimized \u00b7 tap to restore
            {totalOpen > 1 ? ` \u00b7 ${currentIdx + 1}/${totalOpen} open` : ""}
          </p>
        </div>

        {/* Back / forward if multiple files opened */}
        {totalOpen > 1 && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              onClick={onBack}
              disabled={!canGoBack}
              title="Previous file"
              style={{
                background: canGoBack ? "#374151" : "#1f2937",
                border: "none", color: canGoBack ? "#d1d5db" : "#4b5563",
                borderRadius: 8, width: 32, height: 32,
                cursor: canGoBack ? "pointer" : "default",
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              \u2039
            </button>
            <button
              onClick={onForward}
              disabled={!canGoFwd}
              title="Next file"
              style={{
                background: canGoFwd ? "#374151" : "#1f2937",
                border: "none", color: canGoFwd ? "#d1d5db" : "#4b5563",
                borderRadius: 8, width: 32, height: 32,
                cursor: canGoFwd ? "pointer" : "default",
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              \u203a
            </button>
          </div>
        )}

        {/* Restore */}
        <button
          onClick={onRestore}
          style={{
            background: GOLD, border: "none", color: "#fff",
            borderRadius: 8, padding: "6px 14px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}>
          \u2b06 Restore
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            background: "#374151", border: "none", color: "#d1d5db",
            borderRadius: 8, width: 32, height: 32,
            cursor: "pointer", fontSize: 18, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
          \u2715
        </button>
      </div>
    );
  }

  /* \u2500\u2500 EXPANDED: full overlay \u2500\u2500 */
  const renderContent = () => {
    if (embedKind === "image") {
      return (
        <div style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 0 }}>
          <img
            src={embedUrl}
            alt={file.file_name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      );
    }

    if (embedKind === "audio") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "#0f1a14" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>\ud83c\udfb5</div>
            <p style={{ color: "#fff", marginBottom: 20, fontSize: 15, fontWeight: 600 }}>{file.file_name}</p>
            <audio src={embedUrl} controls autoPlay style={{ width: "100%", maxWidth: 400 }} />
          </div>
        </div>
      );
    }

    if (embedKind === "video") {
      return (
        <div style={{ flex: 1, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
          <video src={embedUrl} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
        </div>
      );
    }

    /* iframe-based: youtube, gdrive, pdf, doc, iframe */
    if (iframeBlocked) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1a14", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>\ud83d\udd12</div>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Can't display this website here</p>
          <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>The site's security policy prevents embedding.</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ background: GOLD, color: "#fff", borderRadius: 10, padding: "10px 24px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Open in new tab \u2197
          </a>
        </div>
      );
    }

    return (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loaderVisible && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1a14", zIndex: 1, pointerEvents: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #ffffff20", borderTopColor: GOLD, animation: "lcfp-spin .7s linear infinite" }} />
          </div>
        )}
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={file.file_name}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => setLoaderVisible(false)}
          onError={() => setIframeBlocked(true)}
        />
      </div>
    );
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={onMinimize}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 920, height: "min(90vh, 680px)", background: "#111827", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,.6)" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#1f2937", borderBottom: "1px solid #374151", flexShrink: 0 }}>

          {/* Back/Forward navigation */}
          {totalOpen > 1 && (
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              <button
                onClick={onBack}
                disabled={!canGoBack}
                title="Previous file"
                style={{
                  background: canGoBack ? "#374151" : "transparent",
                  border: "none", color: canGoBack ? "#d1d5db" : "#4b5563",
                  borderRadius: 6, width: 28, height: 28,
                  cursor: canGoBack ? "pointer" : "default",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                \u2039
              </button>
              <button
                onClick={onForward}
                disabled={!canGoFwd}
                title="Next file"
                style={{
                  background: canGoFwd ? "#374151" : "transparent",
                  border: "none", color: canGoFwd ? "#d1d5db" : "#4b5563",
                  borderRadius: 6, width: 28, height: 28,
                  cursor: canGoFwd ? "pointer" : "default",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                \u203a
              </button>
              <span style={{ fontSize: 11, color: "#6b7280", alignSelf: "center", marginLeft: 2, flexShrink: 0 }}>
                {currentIdx + 1}/{totalOpen}
              </span>
            </div>
          )}

          {/* File icon + name */}
          <span style={{ fontSize: 16, flexShrink: 0 }}>{ICONS[kind].i}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.file_name}
          </span>

          {/* Action buttons */}
          {kind !== "Link" && (
            <a href={url} download={file.file_name} target="_blank" rel="noopener"
              style={{ fontSize: 12, color: "#d1d5db", background: "#374151", borderRadius: 8, padding: "5px 12px", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}>
              \u2b07 Download
            </a>
          )}

          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#d1d5db", background: "#374151", borderRadius: 8, padding: "5px 12px", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}>
            \u2197 New tab
          </a>

          {/* Minimize */}
          <button
            onClick={onMinimize}
            title="Minimize \u2014 keep file open while browsing the list"
            style={{ background: GOLD, border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
            \u2b07 Min
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            style={{ background: "#374151", border: "none", color: "#d1d5db", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            \u2715
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {renderContent()}
        </div>
      </div>

      {/* Hint text under the card */}
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "rgba(255,255,255,.45)", textAlign: "center" }}>
        Tap outside or press \u2b07 Min to minimize and browse files freely
      </p>
    </div>
  );
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
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

  /* \u2500\u2500 Viewer navigation state \u2500\u2500 */
  // openedFiles: ordered list of files opened this session (navigation history)
  // openIdx:     which one is currently displayed
  // minimized:   is the viewer shrunk to the bottom bar
  const [openedFiles, setOpenedFiles] = useState<LCFile[]>([]);
  const [openIdx,     setOpenIdx]     = useState<number>(-1);
  const [minimized,   setMinimized]   = useState(false);

  const currentFile = openIdx >= 0 ? openedFiles[openIdx] : null;

  const dragCnt = useRef(0);

  /* \u2500\u2500 fetch \u2500\u2500 */
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

  /* \u2500\u2500 open file \u2014 builds a navigation history \u2500\u2500 */
  const openFile = useCallback((f: LCFile) => {
    setMinimized(false);

    setOpenedFiles(prev => {
      // If the file is already in the list at a position after the current one, navigate there.
      // Otherwise truncate forward history and append, just like a browser.
      const existingIdx = prev.findIndex(x => x.id === f.id);
      if (existingIdx >= 0) {
        setOpenIdx(existingIdx);
        return prev;
      }
      // Truncate anything forward of current position and push new file
      const next = [...prev.slice(0, openIdx + 1), f];
      setOpenIdx(next.length - 1);
      return next;
    });
  }, [openIdx]);

  const goBack    = useCallback(() => { setOpenIdx(i => i - 1); setMinimized(false); }, []);
  const goForward = useCallback(() => { setOpenIdx(i => i + 1); setMinimized(false); }, []);

  const closeViewer = useCallback(() => {
    setOpenedFiles([]);
    setOpenIdx(-1);
    setMinimized(false);
  }, []);

  /* \u2500\u2500 upload file \u2500\u2500 */
  const upload = useCallback(async (file: File) => {
    if (!user) { setErr("Not signed in"); return; }
    setUploading(true); setPct(0); setUpName(file.name); setErr(null);

    try {
      const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${file.name.split(".").pop() || "bin"}`;
      const path = `${subjectId}/${slug}`;

      await new Promise<void>((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SB_URL}/storage/v1/object/${BUCKET}/${path}`);
        const raw   = (supabase as any);
        const token = raw?.auth?._session?.access_token ?? raw?.supabaseKey ?? "";
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable) setPct(Math.round(ev.loaded / ev.total * 85));
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? res() : rej(new Error(`Storage error ${xhr.status}`));
        xhr.onerror = () => rej(new Error("Network error"));
        xhr.send(file);
      });

      setPct(90);
      const fileUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      const { error: dbErr } = await (supabase as any)
        .from("liveclass_files")
        .insert({ subject_id: subjectId, file_name: file.name, file_url: fileUrl, file_type: file.type || null, file_size: file.size, uploaded_by: user.id });
      if (dbErr) throw dbErr;
      setPct(100);
      await fetchFiles();
      setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 500);
    } catch (e: any) {
      try {
        const slug2 = `${Date.now()}.${file.name.split(".").pop() || "bin"}`;
        const path2 = `${subjectId}/${slug2}`;
        const { error: stErr } = await storageSupabase.storage.from(BUCKET).upload(path2, file, { upsert: true });
        if (stErr) throw stErr;
        const url2 = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path2}`;
        await (supabase as any).from("liveclass_files").insert({ subject_id: subjectId, file_name: file.name, file_url: url2, file_type: file.type || null, file_size: file.size, uploaded_by: user.id });
        setPct(100);
        await fetchFiles();
        setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 500);
      } catch (e2: any) {
        setErr(e2?.message ?? "Upload failed");
        setUploading(false); setPct(0); setUpName("");
      }
    }
  }, [subjectId, user, fetchFiles]);

  /* \u2500\u2500 save link \u2500\u2500 */
  const saveLink = useCallback(async () => {
    if (!user) { setErr("Not signed in"); return; }
    const trimUrl = linkUrl.trim();
    if (!trimUrl) { setErr("Please enter a URL"); return; }
    if (!/^https?:\/\//i.test(trimUrl)) { setErr("URL must start with http:// or https://"); return; }

    setAddingLink(true); setErr(null);
    const label = linkLabel.trim() || trimUrl;

    try {
      const { error: dbErr } = await (supabase as any)
        .from("liveclass_files")
        .insert({ subject_id: subjectId, file_name: label, file_url: trimUrl, file_type: "link", file_size: null, uploaded_by: user.id });
      if (dbErr) throw dbErr;
      setLinkUrl("");
      setLinkLabel("");
      await fetchFiles();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save link");
    } finally {
      setAddingLink(false);
    }
  }, [subjectId, user, linkUrl, linkLabel, fetchFiles]);

  /* \u2500\u2500 drag \u2500\u2500 */
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current--; if (dragCnt.current <= 0) { dragCnt.current = 0; setDragging(false