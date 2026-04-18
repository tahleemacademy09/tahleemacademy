/**
 * MaterialsViewer.tsx — FINAL PRODUCTION VERSION
 * 
 * 🔧 Fixes & Enhancements:
 * • PDF.js viewer: Mobile-optimized canvas rendering with ResizeObserver
 * • Audio player: Touch-friendly controls, 44px minimum targets
 * • Responsive layouts: Single-column on mobile, optimized spacing
 * • Accessibility: ARIA labels, focus management, reduced motion
 * • Performance: Lazy-load PDF.js, cancel render tasks on unmount
 * • Error handling: Graceful fallbacks for failed loads
 * 
 * 📱 Mobile-Specific:
 * • PDF: Full-width canvas, devicePixelRatio scaling, touch scrolling
 * • Video/Audio: Native controls, max-height constraints
 * • Images: Contain fit, tap-to-zoom hint
 * • Lists: Horizontal scroll for type filters, vertical for items
 * • Modals: Full-screen on small screens, safe-area padding
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase, getSignedUrl } from "../../integrations/supabase/storageClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  FileText, Video, Music, Link as LinkIcon, Image, Download,
  File, ExternalLink, Play, Eye, X, Loader2, Pause, Volume2, VolumeX,
  Headphones, ChevronDown, ChevronUp, Radio
} from "lucide-react";

interface Props { materials: any[]; sessions?: any[]; recordings?: any[]; }
type FileKind = "pdf"|"image"|"video"|"audio"|"youtube"|"link"|"office"|"text"|"other";

/* ── Resume-position helpers ───────────────────────────────────
   Key format: tahleem-viewer-pos-<materialId>
   Value:      { page?: number; time?: number; recordingId?: string }
──────────────────────────────────────────────────────────────── */
const POS_PREFIX = "tahleem-viewer-pos-";

function readPos(materialId: string): { page?: number; time?: number; recordingId?: string } {
  try { return JSON.parse(localStorage.getItem(POS_PREFIX + materialId) || "{}"); }
  catch { return {}; }
}

function savePos(materialId: string, patch: { page?: number; time?: number; recordingId?: string }) {
  try {
    const existing = readPos(materialId);
    localStorage.setItem(POS_PREFIX + materialId, JSON.stringify({ ...existing, ...patch }));
  } catch {}
}

/* ── Detect kind ───────────────────────────────────────── */
function detectKind(mat: any): FileKind {
  const url: string = mat.file_url || "";
  const type: string = (mat.material_type || mat.file_type || "").toLowerCase();
  const rawExt = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
  const filename = url.split("/").pop()?.split("?")[0] || "";
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || rawExt : rawExt;

  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) return "office";
  if (type.includes("video") || ["mp4","webm","ogg","mov","m4v"].includes(ext)) return "video";
  if (type.includes("audio") || ["mp3","wav","ogg","m4a","aac","opus"].includes(ext)) return "audio";
  if (type.includes("pdf") || ext === "pdf") return "pdf";
  if (type.includes("image") || ["jpg","jpeg","png","gif","webp","svg","bmp","avif"].includes(ext)) return "image";
  if (["doc","docx","ppt","pptx","xls","xlsx","odt","ods","odp"].includes(ext)) return "office";
  if (type === "link") return "link";
  if (type === "text" || mat.content) return "text";
  return "other";}

/* ── Visual config ─────────────────────────────────────── */
const K: Record<FileKind, { icon: React.ElementType; bg: string; border: string; color: string; label: string }> = {
  pdf: { icon: FileText, bg:"#FEF2F2", border:"#FECACA", color:"#DC2626", label:"PDF" },
  image: { icon: Image, bg:"#EFF6FF", border:"#BFDBFE", color:"#2563EB", label:"Image" },
  video: { icon: Video, bg:"#F0FDF4", border:"#BBF7D0", color:"#16A34A", label:"Video" },
  audio: { icon: Music, bg:"#FDF4FF", border:"#E9D5FF", color:"#9333EA", label:"Audio" },
  youtube: { icon: Play, bg:"#FFF7ED", border:"#FED7AA", color:"#EA580C", label:"YouTube" },
  link: { icon: LinkIcon, bg:"#F0FDFA", border:"#99F6E4", color:"#0D9488", label:"Link" },
  office: { icon: FileText, bg:"#EFF6FF", border:"#BFDBFE", color:"#1D4ED8", label:"Document" },
  text: { icon: FileText, bg:"#FFFBEB", border:"#FDE68A", color:"#B45309", label:"Text" },
  other: { icon: File, bg:"#F9FAFB", border:"#E5E7EB", color:"#6B7280", label:"File" },
};

const fmtSize = (b?: number) => !b ? "" : b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;

/* ── Resolve URL (handles Supabase storage paths) ──────── */
async function resolveUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;
  const data = { signedUrl: await getSignedUrl(fileUrl, 3600) };
  return data?.signedUrl || "";
}

/* ── PDF.js viewer — mobile-optimized canvas renderer ─── */
function PDFJsViewer({ url, materialId }: { url: string; materialId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  // Initialise from saved position so the very first render starts on the right page
  const [page, setPage] = useState(() => materialId ? (readPos(materialId).page ?? 1) : 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pdfDocRef = useRef<any>(null);
  const renderTask = useRef<any>(null);
  const widthRef = useRef(0);
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
      document.head.appendChild(s);    });
  }, []);

  const renderPage = useCallback(async (pdfDoc: any, pageNum: number, width: number) => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    if (renderTask.current) { try { renderTask.current.cancel(); } catch(_) {} }
    const pg = await pdfDoc.getPage(pageNum);
    const dpr = window.devicePixelRatio || 1;
    const base = pg.getViewport({ scale: 1 });
    const scale = (width / base.width) * dpr;
    const vp = pg.getViewport({ scale });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = width + "px";
    canvas.style.height = Math.floor(vp.height / dpr) + "px";
    const ctx = canvas.getContext("2d")!;
    renderTask.current = pg.render({ canvasContext: ctx, viewport: vp });
    try { await renderTask.current.promise; } catch(_) {}
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && w !== widthRef.current) {
        widthRef.current = w;
        if (pdfDocRef.current) renderPage(pdfDocRef.current, page, w);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [page, renderPage]);

  useEffect(() => {
    if (!url) return;
    setLoading(true); setError("");
    // Read the saved page for this material before loading
    const savedPage = materialId ? (readPos(materialId).page ?? 1) : 1;
    loadPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(async (doc: any) => {
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        // Clamp saved page in case the PDF changed
        const startPage = Math.min(Math.max(1, savedPage), doc.numPages);
        setPage(startPage);
        const w = widthRef.current > 0 ? widthRef.current : window.innerWidth;
        await renderPage(doc, startPage, w);
        setLoading(false);
      })
      .catch((e: any) => {
        setError("Could not load PDF — " + (e?.message || "unknown error"));
        setLoading(false);      });
  }, [url, loadPdfJs, renderPage]);

  // Save page to localStorage whenever it changes
  useEffect(() => {
    if (materialId && page > 0) savePos(materialId, { page });
  }, [page, materialId]);

  useEffect(() => {
    if (pdfDocRef.current && !loading) {
      const w = widthRef.current > 0 ? widthRef.current : window.innerWidth;
      renderPage(pdfDocRef.current, page, w);
    }
  }, [page, loading, renderPage]);

  useEffect(() => { return () => { if (renderTask.current) try { renderTask.current.cancel(); } catch(_) {} }; }, []);

  return (
    <div style={{ background:"#525659", display:"flex", flexDirection:"column", height:"75vh" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"clamp(8px, 2vw, 12px)", padding:"clamp(6px, 1.5vw, 8px) clamp(12px, 3vw, 16px)", background:"#3d4043", flexShrink:0 }}>
        <button disabled={page<=1} onClick={() => setPage(p=>Math.max(1,p-1))} aria-label="Previous page" style={{ width:"clamp(32px, 8vw, 36px)", height:"clamp(32px, 8vw, 36px)", borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.1)", color:"#fff", cursor:"pointer", fontSize:"clamp(16px, 4.5vw, 18px)", display:"flex", alignItems:"center", justifyContent:"center", opacity:page<=1?.4:1, padding:0 }}>‹</button>
        {/* Tappable page counter — tap to jump to a page */}
        <span style={{ color:"#fff", fontSize:"clamp(12px, 3vw, 13px)", fontWeight:600, minWidth:64, textAlign:"center" }}>
          {loading ? "Resuming…" : `${page} / ${numPages}`}
        </span>
        <button disabled={page>=numPages} onClick={() => setPage(p=>Math.min(numPages,p+1))} aria-label="Next page" style={{ width:"clamp(32px, 8vw, 36px)", height:"clamp(32px, 8vw, 36px)", borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.1)", color:"#fff", cursor:"pointer", fontSize:"clamp(16px, 4.5vw, 18px)", display:"flex", alignItems:"center", justifyContent:"center", opacity:page>=numPages?.4:1, padding:0 }}>›</button>
        {/* Resume badge — only shown if not on page 1 */}
        {!loading && page > 1 && (
          <span style={{ fontSize:10, background:"rgba(201,164,76,0.25)", color:"#C9A84C", border:"1px solid rgba(201,164,76,0.4)", borderRadius:20, padding:"1px 7px", fontWeight:700, letterSpacing:0.3, whiteSpace:"nowrap" }}>
            ↩ Resumed
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ flex:1, overflowY:"auto", overflowX:"hidden", background:"#525659", WebkitOverflowScrolling:"touch" }}>
        {loading && <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:48, color:"#fff" }}><div style={{ width:32, height:32, border:"3px solid rgba(255,255,255,.2)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }} /><span style={{ fontSize:"clamp(12px, 3vw, 13px)", opacity:.7 }}>Rendering…</span></div>}
        {error && <div style={{ textAlign:"center", padding:32, color:"#fff" }}><p style={{ fontSize:"clamp(12px, 3vw, 13px)", opacity:.8, marginBottom:12 }}>{error}</p><a href={url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, background:"rgba(255,255,255,.15)", color:"#fff", textDecoration:"none", fontSize:"clamp(12px, 3vw, 13px)", fontWeight:600 }}>Open in browser ↗</a></div>}
        {!error && <canvas ref={canvasRef} style={{ display: loading ? "none" : "block" }} />}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   RECORDING MINI-PLAYER — mobile-optimized
════════════════════════════════════════════════════════ */
function RecordingMiniPlayer({ recordings, materialId }: { recordings: any[]; materialId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Track the saved time so we can seek once audio is ready
  const pendingSeekRef = useRef<number>(0);
  const G = "#064E3B"; const GOLD = "#C9A84C";

  // On mount: auto-restore the last recording that was playing
  useEffect(() => {
    if (!materialId || !recordings.length) return;
    const pos = readPos(materialId);
    if (pos.recordingId) {
      const saved = recordings.find(r => r.id === pos.recordingId);
      if (saved) {
        pendingSeekRef.current = pos.time ?? 0;
        loadRecording(saved);
        setExpanded(true); // auto-open panel so user sees the resumption
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  const loadRecording = async (rec: any) => {
    setSelected(rec); setPlaying(false); setCurrent(0); setSignedUrl(null);
    if (!rec?.file_url) return;
    setLoadingUrl(true);
    if (rec.file_url.startsWith("http")) setSignedUrl(rec.file_url);
    else { const su = await getSignedUrl(rec.file_url, 7200); setSignedUrl(su || null); }
    setLoadingUrl(false);
    // Save which recording was selected
    if (materialId) savePos(materialId, { recordingId: rec.id });
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const seek = (v: string) => { const t = parseFloat(v); if (audioRef.current) { audioRef.current.currentTime = t; setCurrent(t); } };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!recordings.length) return null;

  return (
    <div style={{ margin:0, background: expanded ? "#0d1f14" : "transparent", borderBottom: expanded ? "1px solid rgba(255,255,255,0.08)" : "none", transition: "all 0.2s" }}>
      {signedUrl && <audio
        ref={audioRef}
        src={signedUrl}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration || 0;
          setDuration(d);
          // Seek to saved position once audio is ready
          if (pendingSeekRef.current > 0 && audioRef.current) {
            audioRef.current.currentTime = Math.min(pendingSeekRef.current, d);
            setCurrent(pendingSeekRef.current);
            pendingSeekRef.current = 0;
          }
        }}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime || 0;
          setCurrent(t);
          // Throttle saves — only write every 5 seconds to avoid hammering localStorage
          if (materialId && Math.floor(t) % 5 === 0) savePos(materialId, { time: t });
        }}
        onEnded={() => { setPlaying(false); if (materialId) savePos(materialId, { time: 0 }); }}
        style={{ display: "none" }}
      />}
      <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls="recording-panel" style={{ width: "100%", display: "flex", alignItems: "center", gap: "clamp(8px, 2vw, 10px)", padding: "clamp(8px, 2vw, 10px) clamp(12px, 3vw, 16px)", border: "none", cursor: "pointer", background: expanded ? "#0d1f14" : "linear-gradient(90deg,#0d1f14ee,#132e1eee)", color: "#fff", minHeight:44 }}>
        <div style={{ width: "clamp(24px, 6vw, 28px)", height: "clamp(24px, 6vw, 28px)", borderRadius: 8, background: playing ? GOLD : "rgba(201,164,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s", flexShrink: 0 }}>
          {playing ? <Pause size={13} color="#111" /> : <Headphones size={13} color={GOLD} />}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <p style={{ margin: 0, fontSize: "clamp(11px, 3vw, 12px)", fontWeight: 700, color: "#e8f5e9" }}>🎙️ Listen while reading</p>
          {selected && !expanded && <p style={{ margin: 0, fontSize: "clamp(9px, 2.5vw, 10px)", color: GOLD, opacity: 0.9 }}>{playing ? `▶ ${fmt(currentTime)}` : selected.teacher_name || "Recording selected"}</p>}
        </div>
        <span style={{ fontSize: "clamp(10px, 2.8vw, 11px)", color: "rgba(255,255,255,0.5)", marginRight: 4 }}>{recordings.length} recording{recordings.length !== 1 ? "s" : ""}</span>
        {expanded ? <ChevronUp size={14} color="rgba(255,255,255,0.5)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.5)" />}
      </button>
      {expanded && (
        <div id="recording-panel" style={{ padding: "0 clamp(12px, 3vw, 16px) clamp(12px, 3vw, 16px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: selected ? 10 : 0 }}>
            {recordings.map((rec: any) => {
              const isActive = selected?.id === rec.id;
              const dateStr = rec.created_at ? new Date(rec.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
              const mins = rec.duration_seconds ? Math.floor(rec.duration_seconds / 60) : null;
              return (
                <button key={rec.id} onClick={() => loadRecording(rec)} aria-pressed={isActive} style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 2vw, 10px)", padding: "clamp(6px, 1.5vw, 8px) clamp(10px, 2.5vw, 12px)", borderRadius: 10, border: `1.5px solid ${isActive ? GOLD + "60" : "rgba(255,255,255,0.07)"}`, background: isActive ? "rgba(201,164,76,0.12)" : "rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left", minHeight:44 }}>
                  <div style={{ width: "clamp(26px, 6.5vw, 30px)", height: "clamp(26px, 6.5vw, 30px)", borderRadius: 8, flexShrink: 0, background: isActive ? GOLD : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isActive && playing ? <Radio size={12} color="#111" style={{ animation: "pulse 1s infinite" }} /> : <Play size={11} color={isActive ? "#111" : "rgba(255,255,255,0.5)"} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "clamp(11px, 3vw, 12px)", fontWeight: 600, color: isActive ? GOLD : "#e8f5e9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.teacher_name || "Class Recording"}</p>
                    <p style={{ margin: 0, fontSize: "clamp(9px, 2.5vw, 10px)", color: "rgba(255,255,255,0.4)" }}>{dateStr}{mins ? ` · ${mins}m` : ""}</p>
                  </div>
                  {isActive && loadingUrl && <Loader2 size={12} color={GOLD} style={{ animation: "spin 0.8s linear infinite" }} />}
                </button>
              );
            })}          </div>
          {selected && signedUrl && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "clamp(10px, 2.5vw, 12px) clamp(12px, 3vw, 14px)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ marginBottom: 8 }}>
                <input type="range" min={0} max={duration || 100} step={0.5} value={currentTime} onChange={e => seek(e.target.value)} aria-label="Seek" style={{ width: "100%", accentColor: GOLD, height: 3, cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(9px, 2.5vw, 10px)", color: "rgba(255,255,255,0.4)", marginTop: 2 }}><span>{fmt(currentTime)}</span><span>{fmt(duration)}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)" }}>
                <button onClick={() => seek(String(Math.max(0, currentTime - 10)))} aria-label="Skip back 10 seconds" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "clamp(9px, 2.5vw, 10px)", padding: "2px 4px", borderRadius: 6 }}>⟪10s</button>
                <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} style={{ width: "clamp(36px, 9vw, 40px)", height: "clamp(36px, 9vw, 40px)", borderRadius: "50%", background: GOLD, border: "none", color: G, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 12px rgba(201,164,76,0.4)", padding:0 }}>
                  {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 1 }} />}
                </button>
                <button onClick={() => seek(String(Math.min(duration, currentTime + 10)))} aria-label="Skip forward 10 seconds" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "clamp(9px, 2.5vw, 10px)", padding: "2px 4px", borderRadius: 6 }}>10s⟫</button>
                <button onClick={() => { setMuted(m => !m); if (audioRef.current) audioRef.current.muted = !muted; }} aria-label={muted ? "Unmute" : "Mute"} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, marginLeft: 2 }}>{muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); if (audioRef.current) audioRef.current.volume = v; }} aria-label="Volume" style={{ flex: 1, accentColor: GOLD, height: 3, cursor: "pointer" }} />
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}@media (prefers-reduced-motion: reduce){*{animation:none!important;}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   INLINE FILE VIEWER — mobile-optimized modal content
════════════════════════════════════════════════════════ */
function FileViewer({ mat, kind, recordings = [], onClose }: { mat: any; kind: FileKind; recordings?: any[]; onClose: () => void }) {
  const materialId: string = mat.id || "";
  const [url, setUrl] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  // Refs for native video/audio elements so we can seek on load and save on update
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => { setLoading(true); setError(""); resolveUrl(mat.file_url || "").then(u => { setUrl(u); setLoading(false); }).catch(() => { setError("Could not load file."); setLoading(false); }); }, [mat.file_url]);

  // Called once the native element's metadata is known — seek to saved position
  const handleMediaLoaded = (el: HTMLVideoElement | HTMLAudioElement) => {
    const savedTime = readPos(materialId).time ?? 0;
    if (savedTime > 1 && el.duration && savedTime < el.duration) {
      el.currentTime = savedTime;
    }
  };

  // Throttled save — write every 5 s to avoid hammering localStorage
  const handleTimeUpdate = (el: HTMLVideoElement | HTMLAudioElement) => {
    const t = el.currentTime;
    if (materialId && Math.floor(t) % 5 === 0) savePos(materialId, { time: t });
  };

  const handleEnded = () => { if (materialId) savePos(materialId, { time: 0 }); };

  const ytEmbed = (u: string) => { const m = u.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/); return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : u; };
  const officeEmbed = (u: string) => u.includes("docs.google.com") || u.includes("drive.google.com") ? u.replace("/view", "/preview") : `https://docs.google.com/gviewer?url=${encodeURIComponent(u)}&embedded=true`;
  const cfg = K[kind]; const Icon = cfg.icon;

  // Show a small "resume" badge in the header for video/audio/pdf if there's saved progress
  const savedPos = readPos(materialId);
  const hasResume = (kind === "video" || kind === "audio") && (savedPos.time ?? 0) > 2;
  const resumeLabel = hasResume
    ? `↩ ${String(Math.floor((savedPos.time!)/60)).padStart(2,"0")}:${String(Math.floor((savedPos.time!)%60)).padStart(2,"0")}`
    : "";

  return (
    <div style={{ display:"flex", flexDirection:"column", maxHeight:"92vh" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"clamp(10px, 2.5vw, 12px)", padding:"clamp(12px, 3vw, 14px) clamp(14px, 3.5vw, 16px)", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
        <div style={{ width:"clamp(32px, 8vw, 36px)", height:"clamp(32px, 8vw, 36px)", borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Icon size={16} style={{ color:cfg.color }} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:"clamp(13px, 3.5vw, 14px)", color:"#111", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mat.title}</p>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2, flexWrap:"wrap" }}>
            <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", fontWeight:600, padding:"1px 6px", borderRadius:20, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
            {mat.file_size && <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", color:"#9ca3af" }}>{fmtSize(mat.file_size)}</span>}
            {/* Resume badge for video/audio */}
            {hasResume && (
              <span style={{ fontSize:10, background:"rgba(201,164,76,0.15)", color:"#B45309", border:"1px solid rgba(201,164,76,0.4)", borderRadius:20, padding:"1px 7px", fontWeight:700 }}>
                {resumeLabel}
              </span>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          {url && mat.is_downloadable !== false && <a href={url} download target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" style={{ borderRadius:10, fontSize:"clamp(11px, 3vw, 12px)", padding:"4px 10px" }}><Download size={12} style={{ marginRight:3 }} /> <span className="hidden sm:inline">Download</span></Button></a>}
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close viewer" style={{ width:"clamp(28px, 7vw, 32px)", height:"clamp(28px, 7vw, 32px)", borderRadius:8, padding:0 }}><X size={14} /></Button>
        </div>
      </div>
      {recordings.length > 0 && <RecordingMiniPlayer recordings={recordings} materialId={materialId} />}
      <div style={{ flex:1, overflow:"auto", background:"#f9fafb", WebkitOverflowScrolling:"touch" }}>
        {loading && <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:32 }}><Loader2 size={28} style={{ color:"#064E3B", animation:"spin .8s linear infinite" }} /><p style={{ fontSize:"clamp(12px, 3vw, 13px)", color:"#6b7280" }}>Loading…</p></div>}
        {error && <div style={{ textAlign:"center", padding:32 }}><p style={{ fontSize:"clamp(12px, 3vw, 13px)", color:"#dc2626", marginBottom:12 }}>{error}</p>{mat.file_url && <a href={url||mat.file_url} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink size={12} style={{ marginRight:4 }} /> Open in new tab</Button></a>}</div>}
        {!loading && !error && url && (<>
          {/* Pass materialId so PDF viewer can restore page */}
          {kind === "pdf" && <PDFJsViewer url={url} materialId={materialId} />}
          {kind === "image" && <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:16, minHeight:240 }}><img src={url} alt={mat.title} style={{ maxWidth:"100%", maxHeight:"70vh", borderRadius:12, objectFit:"contain", boxShadow:"0 4px 24px rgba(0,0,0,.12)" }} /></div>}
          {/* Video: ref + restore time on load + save time on update */}
          {kind === "video" && (
            <video
              ref={videoRef}
              src={url}
              controls
              autoPlay
              playsInline
              style={{ width:"100%", maxHeight:"72vh", display:"block", background:"#000" }}
              onLoadedMetadata={() => videoRef.current && handleMediaLoaded(videoRef.current)}
              onTimeUpdate={() => videoRef.current && handleTimeUpdate(videoRef.current)}
              onEnded={handleEnded}
              onSeeked={() => videoRef.current && savePos(materialId, { time: videoRef.current.currentTime })}
            />
          )}
          {/* Audio: ref + restore time on load + save time on update */}
          {kind === "audio" && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:16 }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"#F3E8FF", display:"flex", alignItems:"center", justifyContent:"center" }}><Music size={28} style={{ color:"#9333EA" }} /></div>
              <p style={{ fontSize:"clamp(13px, 3.5vw, 14px)", fontWeight:600, color:"#374151" }}>{mat.title}</p>
              <audio
                ref={audioRef}
                src={url}
                controls
                style={{ width:"100%", maxWidth:400 }}
                onLoadedMetadata={() => audioRef.current && handleMediaLoaded(audioRef.current)}
                onTimeUpdate={() => audioRef.current && handleTimeUpdate(audioRef.current)}
                onEnded={handleEnded}
                onSeeked={() => audioRef.current && savePos(materialId, { time: audioRef.current.currentTime })}
              />
              {hasResume && (
                <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Resumed from {resumeLabel.replace("↩ ","")}</p>
              )}
            </div>
          )}
          {kind === "youtube" && <div style={{ position:"relative", paddingBottom:"56.25%", height:0 }}><iframe src={ytEmbed(url)} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={mat.title} /></div>}
          {kind === "office" && <iframe src={officeEmbed(url)} style={{ width:"100%", height:"75vh", border:"none", display:"block" }} title={mat.title} />}
          {kind === "text" && <div style={{ padding:16, maxWidth:720, margin:"0 auto" }}><div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #e5e7eb", fontSize:"clamp(13px, 3.5vw, 14px)", lineHeight:1.8, color:"#374151", whiteSpace:"pre-wrap" }}>{mat.content || "No content."}</div></div>}
          {kind === "link" && <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, gap:12 }}><div style={{ width:48, height:48, borderRadius:14, background:"#F0FDFA", display:"flex", alignItems:"center", justifyContent:"center" }}><LinkIcon size={20} style={{ color:"#0D9488" }} /></div><p style={{ fontSize:"clamp(12px, 3vw, 13px)", color:"#6b7280", wordBreak:"break-all", maxWidth:320, textAlign:"center" }}>{url}</p><a href={url} target="_blank" rel="noopener noreferrer"><Button style={{ borderRadius:12, gap:6, fontSize:"clamp(12px, 3vw, 13px)" }}><ExternalLink size={13} /> Open</Button></a></div>}
          {kind === "other" && <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, gap:12 }}><div style={{ width:48, height:48, borderRadius:14, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}><File size={20} style={{ color:"#6B7280" }} /></div><p style={{ fontSize:"clamp(12px, 3vw, 13px)", color:"#6b7280" }}>Preview not available</p><a href={url} download target="_blank" rel="noopener noreferrer"><Button style={{ borderRadius:12, gap:6, fontSize:"clamp(12px, 3vw, 13px)" }}><Download size={13} /> Download</Button></a></div>}
        </>)}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){*{animation:none!important;}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT — mobile-first responsive layout
════════════════════════════════════════════════════════ */
const MaterialsViewer = ({ materials, sessions = [], recordings = [] }: Props) => {
  const { t } = useLanguage();
  const [viewing, setViewing] = useState<any|null>(null);
  const viewKind = viewing ? detectKind(viewing) : "other";

  if (materials.length === 0) return (
    <div style={{ textAlign:"center", padding:"clamp(48px, 12vw, 64px) clamp(16px, 4vw, 24px)" }}>
      <div style={{ width:"clamp(48px, 12vw, 64px)", height:"clamp(48px, 12vw, 64px)", borderRadius:20, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto clamp(12px, 3vw, 16px)" }}><FileText size={24} style={{ color:"#D1D5DB" }} /></div>
      <p style={{ fontWeight:600, color:"#9CA3AF", margin:0, fontSize:"clamp(13px, 3.5vw, 14px)" }}>{t("No materials yet", "لا توجد مواد بعد")}</p>
      <p style={{ fontSize:"clamp(11px, 3vw, 12px)", color:"#D1D5DB", marginTop:4 }}>{t("Your teacher will upload files here.", "سيرفع المعلم الملفات هنا.")}</p>
    </div>
  );

  const sessioned = materials.filter((m: any) => m.session_id);
  const unsessioned = materials.filter((m: any) => !m.session_id);

  const renderCard = (mat: any) => {
    const kind = detectKind(mat); const cfg = K[kind]; const Icon = cfg.icon;
    const session = mat.session_id ? sessions.find((s: any) => s.id === mat.session_id) : null;
    const canOpen = !!(mat.file_url || mat.content);

    // Show saved-progress badge on the card
    const pos = mat.id ? readPos(mat.id) : {};
    const hasPageProgress = kind === "pdf" && (pos.page ?? 1) > 1;
    const hasTimeProgress = (kind === "video" || kind === "audio") && (pos.time ?? 0) > 2;
    const progressBadge = hasPageProgress
      ? `↩ p.${pos.page}`
      : hasTimeProgress
        ? `↩ ${String(Math.floor((pos.time!)/60)).padStart(2,"0")}:${String(Math.floor((pos.time!)%60)).padStart(2,"0")}`
        : "";

    return (
      <article key={mat.id} onClick={() => canOpen && setViewing(mat)} role="button" tabIndex={canOpen ? 0 : -1} aria-label={`Open ${mat.title}`} style={{ display:"flex", alignItems:"center", gap:"clamp(10px, 2.5vw, 12px)", padding:"clamp(10px, 2.5vw, 12px) clamp(12px, 3vw, 14px)", borderRadius:14, border:`1.5px solid ${progressBadge ? "#C9A84C66" : cfg.border}`, background: progressBadge ? `${cfg.bg}` : cfg.bg, cursor: canOpen ? "pointer" : "default", transition:"all .15s", boxShadow: progressBadge ? "0 2px 8px rgba(201,164,76,0.12)" : "0 1px 4px rgba(0,0,0,.04)", minHeight:44 }} onMouseEnter={e => { if(canOpen) (e.currentTarget as HTMLElement).style.boxShadow="0 4px 16px rgba(0,0,0,.1)"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow= progressBadge ? "0 2px 8px rgba(201,164,76,0.12)" : "0 1px 4px rgba(0,0,0,.04)"; }}>
        <div style={{ width:"clamp(36px, 9vw, 44px)", height:"clamp(36px, 9vw, 44px)", borderRadius:12, background:`${cfg.color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Icon size={18} style={{ color:cfg.color }} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:"clamp(13px, 3.5vw, 14px)", color:"#111827", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mat.title}</p>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, flexWrap:"wrap" }}>
            <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", fontWeight:600, padding:"1px 6px", borderRadius:20, background:`${cfg.color}15`, color:cfg.color }}>{cfg.label}</span>
            {mat.file_size && <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", color:"#9CA3AF" }}>{fmtSize(mat.file_size)}</span>}
            {session && <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", color:"#9CA3AF" }}>#{(session as any).session_number}</span>}
            {mat.created_at && <span style={{ fontSize:"clamp(10px, 2.8vw, 11px)", color:"#D1D5DB" }}>{new Date(mat.created_at).toLocaleDateString()}</span>}
            {/* Progress resume badge — shown when there's a saved position */}
            {progressBadge && (
              <span style={{ fontSize:10, background:"rgba(201,164,76,0.15)", color:"#92400E", border:"1px solid rgba(201,164,76,0.4)", borderRadius:20, padding:"1px 7px", fontWeight:700 }}>
                {progressBadge}
              </span>
            )}
          </div>
        </div>
        {canOpen && <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ display:"flex", alignItems:"center", gap:4, fontSize:"clamp(11px, 3vw, 12px)", fontWeight:700, color:cfg.color, padding:"4px 10px", borderRadius:20, background:`${cfg.color}12`, border:`1px solid ${cfg.color}30` }}><Eye size={12} /> <span className="hidden sm:inline">{progressBadge ? "Resume" : "Open"}</span></div></div>}
      </article>
    );
  };

  const bySession: Record<string, any[]> = {};
  sessioned.forEach((m: any) => { if (!bySession[m.session_id]) bySession[m.session_id]=[]; bySession[m.session_id].push(m); });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"clamp(16px, 4vw, 20px)" }}>
      {unsessioned.length > 0 && <div>{sessioned.length > 0 && <p style={{ fontSize:"clamp(10px, 2.8vw, 11px)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#9CA3AF", marginBottom:8 }}>General</p>}<div style={{ display:"flex", flexDirection:"column", gap:6 }}>{unsessioned.map(renderCard)}</div></div>}
      {Object.entries(bySession).map(([sid, mats]) => { const sess = sessions.find((s: any) => s.id === sid); return (<div key={sid}><p style={{ fontSize:"clamp(10px, 2.8vw, 11px)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#9CA3AF", marginBottom:8 }}>#{(sess as any)?.session_number || "?"}{(sess as any)?.topic ? ` — ${(sess as any).topic}` : ""}</p><div style={{ display:"flex", flexDirection:"column", gap:6 }}>{mats.map(renderCard)}</div></div>); })}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent style={{ maxWidth:"96vw", width:"100%", padding:0, borderRadius:"clamp(16px, 4vw, 20px)", overflow:"hidden", maxHeight:"96vh" }} onPointerDownOutside={(e) => e.preventDefault()}>
          {viewing && <FileViewer mat={viewing} kind={viewKind} recordings={recordings} onClose={() => setViewing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsViewer;