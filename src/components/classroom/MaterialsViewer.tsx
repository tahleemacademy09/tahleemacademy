import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  FileText, Video, Music, Link as LinkIcon, Image, Download,
  File, ExternalLink, Play, Eye, X, Loader2
} from "lucide-react";

interface Props { materials: any[]; sessions?: any[]; }

type FileKind = "pdf"|"image"|"video"|"audio"|"youtube"|"link"|"office"|"text"|"other";

/* ── Detect kind ───────────────────────────────────────── */
function detectKind(mat: any): FileKind {
  const url: string  = mat.file_url || "";
  const type: string = (mat.material_type || mat.file_type || "").toLowerCase();
  const rawExt = url.split("?")[0].split(".").pop()?.toLowerCase() || "";

  // Storage path — extract real filename extension
  const filename = url.split("/").pop()?.split("?")[0] || "";
  // UUID-prefixed: "uuid.pdf" → ext = "pdf"
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || rawExt : rawExt;

  if (url.includes("youtube.com") || url.includes("youtu.be"))                    return "youtube";
  if (url.includes("drive.google.com") || url.includes("docs.google.com"))         return "office";
  if (type.includes("video") || ["mp4","webm","ogg","mov","m4v"].includes(ext))    return "video";
  if (type.includes("audio") || ["mp3","wav","ogg","m4a","aac","opus"].includes(ext)) return "audio";
  if (type.includes("pdf") || ext === "pdf")                                        return "pdf";
  if (type.includes("image") || ["jpg","jpeg","png","gif","webp","svg","bmp","avif"].includes(ext)) return "image";
  if (["doc","docx","ppt","pptx","xls","xlsx","odt","ods","odp"].includes(ext))    return "office";
  if (type === "link")                                                               return "link";
  if (type === "text" || mat.content)                                               return "text";
  return "other";
}

/* ── Visual config ─────────────────────────────────────── */
const K: Record<FileKind, { icon: React.ElementType; bg: string; border: string; color: string; label: string }> = {
  pdf:     { icon: FileText,     bg:"#FEF2F2", border:"#FECACA", color:"#DC2626", label:"PDF"      },
  image:   { icon: Image,        bg:"#EFF6FF", border:"#BFDBFE", color:"#2563EB", label:"Image"    },
  video:   { icon: Video,        bg:"#F0FDF4", border:"#BBF7D0", color:"#16A34A", label:"Video"    },
  audio:   { icon: Music,        bg:"#FDF4FF", border:"#E9D5FF", color:"#9333EA", label:"Audio"    },
  youtube: { icon: Play,         bg:"#FFF7ED", border:"#FED7AA", color:"#EA580C", label:"YouTube"  },
  link:    { icon: LinkIcon,     bg:"#F0FDFA", border:"#99F6E4", color:"#0D9488", label:"Link"     },
  office:  { icon: FileText,     bg:"#EFF6FF", border:"#BFDBFE", color:"#1D4ED8", label:"Document" },
  text:    { icon: FileText,     bg:"#FFFBEB", border:"#FDE68A", color:"#B45309", label:"Text"     },
  other:   { icon: File,         bg:"#F9FAFB", border:"#E5E7EB", color:"#6B7280", label:"File"     },
};

const fmtSize = (b?: number) => !b ? "" : b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;

/* ── Resolve URL (handles Supabase storage paths) ──────── */
async function resolveUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;   // already absolute
  // Storage path — get a 1-hour signed URL
  const { data } = await supabase.storage
    .from("subject-files")
    .createSignedUrl(fileUrl, 3600);
  return data?.signedUrl || "";
}


/* ── PDF.js viewer — renders PDF as canvas, works on all mobile browsers ── */
function PDFJsViewer({ url }: { url: string }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages]   = useState(0);
  const [page,     setPage]       = useState(1);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState("");
  const pdfDocRef  = useRef<any>(null);
  const renderTask = useRef<any>(null);

  const CDNBASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

  const loadPdfJs = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
      const s = document.createElement("script");
      s.src = `${CDNBASE}/pdf.min.js`;
      s.onload = () => {
        const lib = (window as any).pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = `${CDNBASE}/pdf.worker.min.js`;
        resolve(lib);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }, []);

  const renderPage = useCallback(async (pdfDoc: any, pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (renderTask.current) { try { renderTask.current.cancel(); } catch(_) {} }
    const pg  = await pdfDoc.getPage(pageNum);
    const vp  = pg.getViewport({ scale: window.devicePixelRatio > 1 ? 1.8 : 1.4 });
    canvas.height = vp.height;
    canvas.width  = vp.width;
    canvas.style.width  = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d")!;
    renderTask.current = pg.render({ canvasContext: ctx, viewport: vp });
    try { await renderTask.current.promise; } catch(_) {}
  }, []);

  useEffect(() => {
    if (!url) return;
    setLoading(true); setError(""); setPage(1);
    loadPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(async (doc: any) => {
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        await renderPage(doc, 1);
        setLoading(false);
      })
      .catch((e: any) => {
        setError("Could not load PDF — " + (e?.message || "unknown error"));
        setLoading(false);
      });
  }, [url, loadPdfJs, renderPage]);

  useEffect(() => {
    if (pdfDocRef.current && !loading) renderPage(pdfDocRef.current, page);
  }, [page, loading, renderPage]);

  return (
    <div style={{ background:"#525659", minHeight:"70vh", display:"flex", flexDirection:"column" }}>
      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:"8px 16px", background:"#3d4043", flexShrink:0 }}>
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => Math.max(1, p-1))}
          style={{ width:32, height:32, borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.1)", color:"#fff", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", opacity: page<=1 ? 0.4 : 1 }}>
          ‹
        </button>
        <span style={{ color:"#fff", fontSize:13, fontWeight:600, minWidth:80, textAlign:"center" }}>
          {loading ? "Loading…" : `${page} / ${numPages}`}
        </span>
        <button
          disabled={page >= numPages}
          onClick={() => setPage(p => Math.min(numPages, p+1))}
          style={{ width:32, height:32, borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.1)", color:"#fff", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", opacity: page>=numPages ? 0.4 : 1 }}>
          ›
        </button>
      </div>

      {/* Canvas area */}
      <div style={{ flex:1, overflow:"auto", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:8 }}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:64, color:"#fff" }}>
            <div style={{ width:36, height:36, border:"3px solid rgba(255,255,255,.2)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
            <span style={{ fontSize:13, opacity:.7 }}>Rendering PDF…</span>
          </div>
        )}
        {error && (
          <div style={{ textAlign:"center", padding:48, color:"#fff" }}>
            <p style={{ fontSize:13, opacity:.8, marginBottom:16 }}>{error}</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 20px", borderRadius:10, background:"rgba(255,255,255,.15)", color:"#fff", textDecoration:"none", fontSize:13, fontWeight:600 }}>
              Open in browser ↗
            </a>
          </div>
        )}
        {!error && (
          <canvas ref={canvasRef} style={{ maxWidth:"100%", boxShadow:"0 4px 24px rgba(0,0,0,.5)", display: loading ? "none" : "block" }} />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   INLINE FILE VIEWER (shown inside Dialog)
════════════════════════════════════════════════════════ */
function FileViewer({ mat, kind, onClose }: { mat: any; kind: FileKind; onClose: () => void }) {
  const [url,     setUrl]     = useState("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    resolveUrl(mat.file_url || "")
      .then(u => { setUrl(u); setLoading(false); })
      .catch(() => { setError("Could not load file."); setLoading(false); });
  }, [mat.file_url]);

  const ytEmbed = (u: string) => {
    const m = u.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : u;
  };
  const officeEmbed = (u: string) =>
    u.includes("docs.google.com") || u.includes("drive.google.com")
      ? u.replace("/view", "/preview")
      : `https://docs.google.com/gviewer?url=${encodeURIComponent(u)}&embedded=true`;

  const cfg = K[kind];
  const Icon = cfg.icon;

  return (
    <div style={{ display:"flex", flexDirection:"column", maxHeight:"92vh" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <Icon size={18} style={{ color:cfg.color }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mat.title}</p>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
            <span style={{ fontSize:11, fontWeight:600, padding:"1px 7px", borderRadius:20, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
            {mat.file_size && <span style={{ fontSize:11, color:"#9ca3af" }}>{fmtSize(mat.file_size)}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {url && mat.is_downloadable !== false && (
            <a href={url} download target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" style={{ borderRadius:10, fontSize:12 }}>
                <Download size={13} style={{ marginRight:4 }} /> Download
              </Button>
            </a>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} style={{ width:32, height:32, borderRadius:8 }}>
            <X size={16} />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex:1, overflow:"auto", background:"#f9fafb" }}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:48 }}>
            <Loader2 size={32} style={{ color:"#064E3B", animation:"spin .8s linear infinite" }} />
            <p style={{ fontSize:13, color:"#6b7280" }}>Loading…</p>
          </div>
        )}
        {error && (
          <div style={{ textAlign:"center", padding:48 }}>
            <p style={{ fontSize:13, color:"#dc2626", marginBottom:12 }}>{error}</p>
            {mat.file_url && (
              <a href={url||mat.file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline"><ExternalLink size={14} style={{ marginRight:6 }} /> Open in new tab</Button>
              </a>
            )}
          </div>
        )}
        {!loading && !error && url && (
          <>
            {kind === "pdf" && (
              <PDFJsViewer url={url} />
            )}
            {kind === "image" && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:16, minHeight:300 }}>
                <img src={url} alt={mat.title} style={{ maxWidth:"100%", maxHeight:"70vh", borderRadius:12, objectFit:"contain", boxShadow:"0 4px 24px rgba(0,0,0,.12)" }} />
              </div>
            )}
            {kind === "video" && (
              <video src={url} controls autoPlay playsInline style={{ width:"100%", maxHeight:"72vh", display:"block", background:"#000" }} />
            )}
            {kind === "audio" && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, gap:20 }}>
                <div style={{ width:80, height:80, borderRadius:"50%", background:"#F3E8FF", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Music size={36} style={{ color:"#9333EA" }} />
                </div>
                <p style={{ fontSize:14, fontWeight:600, color:"#374151" }}>{mat.title}</p>
                <audio src={url} controls style={{ width:"100%", maxWidth:400 }} />
              </div>
            )}
            {kind === "youtube" && (
              <div style={{ position:"relative", paddingBottom:"56.25%", height:0 }}>
                <iframe src={ytEmbed(url)} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }}
                  allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={mat.title} />
              </div>
            )}
            {kind === "office" && (
              <iframe
                src={officeEmbed(url)}
                style={{ width:"100%", height:"75vh", border:"none", display:"block" }}
                title={mat.title}
              />
            )}
            {kind === "text" && (
              <div style={{ padding:24, maxWidth:720, margin:"0 auto" }}>
                <div style={{ background:"#fff", borderRadius:14, padding:24, border:"1px solid #e5e7eb", fontSize:14, lineHeight:1.8, color:"#374151", whiteSpace:"pre-wrap" }}>
                  {mat.content || "No content."}
                </div>
              </div>
            )}
            {kind === "link" && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:48, gap:16 }}>
                <div style={{ width:64, height:64, borderRadius:16, background:"#F0FDFA", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <LinkIcon size={28} style={{ color:"#0D9488" }} />
                </div>
                <p style={{ fontSize:13, color:"#6b7280", wordBreak:"break-all", maxWidth:400, textAlign:"center" }}>{url}</p>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button style={{ borderRadius:12, gap:8 }}><ExternalLink size={15} /> Open Link</Button>
                </a>
              </div>
            )}
            {kind === "other" && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:48, gap:16 }}>
                <div style={{ width:64, height:64, borderRadius:16, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <File size={28} style={{ color:"#6B7280" }} />
                </div>
                <p style={{ fontSize:13, color:"#6b7280" }}>Preview not available for this file type.</p>
                <a href={url} download target="_blank" rel="noopener noreferrer">
                  <Button style={{ borderRadius:12, gap:8 }}><Download size={15} /> Download File</Button>
                </a>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════ */
const MaterialsViewer = ({ materials, sessions = [] }: Props) => {
  const { t } = useLanguage();
  const [viewing, setViewing] = useState<any|null>(null);
  const viewKind = viewing ? detectKind(viewing) : "other";

  if (materials.length === 0) return (
    <div style={{ textAlign:"center", padding:"64px 24px" }}>
      <div style={{ width:64, height:64, borderRadius:20, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
        <FileText size={28} style={{ color:"#D1D5DB" }} />
      </div>
      <p style={{ fontWeight:600, color:"#9CA3AF", margin:0 }}>{t("No materials yet", "لا توجد مواد بعد")}</p>
      <p style={{ fontSize:12, color:"#D1D5DB", marginTop:4 }}>{t("Your teacher will upload files here.", "سيرفع المعلم الملفات هنا.")}</p>
    </div>
  );

  /* Group by session */
  const sessioned   = materials.filter((m: any) =>  m.session_id);
  const unsessioned = materials.filter((m: any) => !m.session_id);

  const renderCard = (mat: any) => {
    const kind = detectKind(mat);
    const cfg  = K[kind];
    const Icon = cfg.icon;
    const session = mat.session_id ? sessions.find((s: any) => s.id === mat.session_id) : null;
    const canOpen = !!(mat.file_url || mat.content);

    return (
      <div key={mat.id}
        onClick={() => canOpen && setViewing(mat)}
        style={{
          display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
          borderRadius:14, border:`1.5px solid ${cfg.border}`,
          background:cfg.bg, cursor: canOpen ? "pointer" : "default",
          transition:"all .15s", boxShadow:"0 1px 4px rgba(0,0,0,.04)",
        }}
        onMouseEnter={e => { if(canOpen) (e.currentTarget as HTMLElement).style.boxShadow="0 4px 16px rgba(0,0,0,.1)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow="0 1px 4px rgba(0,0,0,.04)"; }}>

        {/* Icon */}
        <div style={{ width:44, height:44, borderRadius:12, background:`${cfg.color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <Icon size={20} style={{ color:cfg.color }} />
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14, color:"#111827", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {mat.title}
          </p>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:600, padding:"1px 8px", borderRadius:20, background:`${cfg.color}15`, color:cfg.color }}>
              {cfg.label}
            </span>
            {mat.file_size && <span style={{ fontSize:11, color:"#9CA3AF" }}>{fmtSize(mat.file_size)}</span>}
            {session && <span style={{ fontSize:11, color:"#9CA3AF" }}>Session #{(session as any).session_number}</span>}
            {mat.created_at && <span style={{ fontSize:11, color:"#D1D5DB" }}>{new Date(mat.created_at).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Open button */}
        {canOpen && (
          <div style={{ display:"flex", alignItems:"center", gap:6, shrink:0 } as any}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:700, color:cfg.color, padding:"6px 12px", borderRadius:20, background:`${cfg.color}12`, border:`1px solid ${cfg.color}30` }}>
              <Eye size={13} /> Open
            </div>
          </div>
        )}
      </div>
    );
  };

  /* Group sessions */
  const bySession: Record<string, any[]> = {};
  sessioned.forEach((m: any) => { if (!bySession[m.session_id]) bySession[m.session_id]=[]; bySession[m.session_id].push(m); });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* General materials */}
      {unsessioned.length > 0 && (
        <div>
          {sessioned.length > 0 && (
            <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#9CA3AF", marginBottom:10 }}>
              General
            </p>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{unsessioned.map(renderCard)}</div>
        </div>
      )}

      {/* Session-grouped */}
      {Object.entries(bySession).map(([sid, mats]) => {
        const sess = sessions.find((s: any) => s.id === sid);
        return (
          <div key={sid}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#9CA3AF", marginBottom:10 }}>
              Session #{(sess as any)?.session_number || "?"}{(sess as any)?.topic ? ` — ${(sess as any).topic}` : ""}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{mats.map(renderCard)}</div>
          </div>
        );
      })}

      {/* Viewer modal */}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent style={{ maxWidth:"92vw", width:"860px", padding:0, borderRadius:20, overflow:"hidden" }}>
          {viewing && <FileViewer mat={viewing} kind={viewKind} onClose={() => setViewing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsViewer;
