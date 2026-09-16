/**
 * MaterialsViewer.tsx
 *
 * ✅ All previous fixes retained (resume position, PDF page memory,
 *    video/audio timestamp restore, progress badges on cards)
 *
 * 🆕 Minimize / Multi-panel switching:
 * • Every opened material gets its own persistent viewer panel.
 * • A Minimize button collapses the panel to a compact tray at the bottom.
 * • The tray shows all open materials as clickable chips — tap any to restore.
 * • Opening a new material while one is active automatically minimizes the
 *   current one so you can switch without losing your place.
 * • FileViewer stays fully mounted when minimized (video/audio keep playing).
 * • Close (✕) fully unmounts and removes the panel from the tray.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "../../integrations/supabase/storageClient";
import { Button } from "@/components/ui/button";
import {
  FileText, Video, Music, Link as LinkIcon, Image, Download,
  File, ExternalLink, Play, Eye, X, Loader2, Pause, Volume2, VolumeX,
  Headphones, ChevronDown, ChevronUp, Radio,
  Minimize2, Maximize2, Layers, LayoutTemplate,
} from "lucide-react";

interface Props { materials: any[]; sessions?: any[]; recordings?: any[]; }
type FileKind = "pdf"|"image"|"video"|"audio"|"youtube"|"link"|"office"|"text"|"html"|"other";

interface OpenEntry { mat: any; kind: FileKind; prefetchedUrl?: string; }

/* ── Resume-position helpers ─────────────────────────────────── */
const POS_PREFIX = "tahleem-viewer-pos-";
function readPos(id: string): { page?: number; time?: number; recordingId?: string } {
  try { return JSON.parse(localStorage.getItem(POS_PREFIX + id) || "{}"); } catch { return {}; }
}
function savePos(id: string, patch: { page?: number; time?: number; recordingId?: string }) {
  try {
    const e = readPos(id);
    localStorage.setItem(POS_PREFIX + id, JSON.stringify({ ...e, ...patch }));
  } catch {}
}

/* ── Detect kind ─────────────────────────────────────────────── */
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
  if (type.includes("html") || ["html","htm"].includes(ext)) return "html";
  if (type === "link") return "link";
  if (type === "text" || mat.content) return "text";
  return "other";
}

/* ── Visual config ───────────────────────────────────────────── */
const K: Record<FileKind, { icon: React.ElementType; bg: string; border: string; color: string; label: string }> = {
  pdf:    { icon: FileText, bg:"#FEF2F2", border:"#FECACA", color:"#DC2626", label:"PDF" },
  image:  { icon: Image,    bg:"#EFF6FF", border:"#BFDBFE", color:"#2563EB", label:"Image" },
  video:  { icon: Video,    bg:"#F0FDF4", border:"#BBF7D0", color:"#16A34A", label:"Video" },
  audio:  { icon: Music,    bg:"#FDF4FF", border:"#E9D5FF", color:"#9333EA", label:"Audio" },
  youtube:{ icon: Play,     bg:"#FFF7ED", border:"#FED7AA", color:"#EA580C", label:"YouTube" },
  link:   { icon: LinkIcon, bg:"#F0FDFA", border:"#99F6E4", color:"#0D9488", label:"Link" },
  office: { icon: FileText, bg:"#EFF6FF", border:"#BFDBFE", color:"#1D4ED8", label:"Document" },
  html:   { icon: LayoutTemplate, bg:"#FBF6E6", border:"#E4D9B0", color:"#A9791E", label:"Interactive" },
  text:   { icon: FileText, bg:"#FFFBEB", border:"#FDE68A", color:"#B45309", label:"Text" },
  other:  { icon: File,     bg:"#F9FAFB", border:"#E5E7EB", color:"#6B7280", label:"File" },
};

const fmtSize = (b?: number) => !b ? "" : b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;

const MATERIALS_BUCKET = "subject-materials";

async function resolveUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;

  // Materials live in the `subject-materials` bucket (see SubjectMaterials.tsx),
  // which is a different bucket than the one getSignedUrl() defaults to for
  // non-recording paths — resolve against the correct bucket directly.
  const { data: pub } = supabase.storage.from(MATERIALS_BUCKET).getPublicUrl(fileUrl);
  if (pub?.publicUrl) {
    try {
      const res = await fetch(pub.publicUrl, { method: "HEAD" });
      if (res.ok || res.status === 304) return pub.publicUrl;
    } catch { /* fall through to signed URL */ }
  }

  const { data: signed, error } = await supabase.storage
    .from(MATERIALS_BUCKET).createSignedUrl(fileUrl, 3600);
  if (error) {
    console.error("[MaterialsViewer] could not resolve file URL:", error.message, fileUrl);
    return pub?.publicUrl || "";
  }
  return signed?.signedUrl || pub?.publicUrl || "";
}

/* ══════════════════════════════════════════════════════════════
   PDF VIEWER
══════════════════════════════════════════════════════════════ */
function PDFJsViewer({ url, materialId }: { url: string; materialId?: string }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage]         = useState(() => materialId ? (readPos(materialId).page ?? 1) : 1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const pdfDocRef  = useRef<any>(null);
  const renderTask = useRef<any>(null);
  const widthRef   = useRef(0);
  const CDNBASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

  const loadPdfJs = useCallback((): Promise<any> => new Promise((res, rej) => {
    if ((window as any).pdfjsLib) { res((window as any).pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${CDNBASE}/pdf.min.js`;
    s.onload = () => { const lib = (window as any).pdfjsLib; lib.GlobalWorkerOptions.workerSrc = `${CDNBASE}/pdf.worker.min.js`; res(lib); };
    s.onerror = rej;
    document.head.appendChild(s);
  }), []);

  const renderPage = useCallback(async (doc: any, pageNum: number, width: number) => {
    const canvas = canvasRef.current; if (!canvas || width <= 0) return;
    if (renderTask.current) { try { renderTask.current.cancel(); } catch(_) {} }
    const pg  = await doc.getPage(pageNum);
    const dpr = window.devicePixelRatio || 1;
    const base = pg.getViewport({ scale: 1 });
    const scale = (width / base.width) * dpr;
    const vp = pg.getViewport({ scale });
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width  = width + "px";
    canvas.style.height = Math.floor(vp.height / dpr) + "px";
    const ctx = canvas.getContext("2d")!;
    renderTask.current = pg.render({ canvasContext: ctx, viewport: vp });
    try { await renderTask.current.promise; } catch(_) {}
  }, []);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && w !== widthRef.current) { widthRef.current = w; if (pdfDocRef.current) renderPage(pdfDocRef.current, page, w); }
    });
    obs.observe(el); return () => obs.disconnect();
  }, [page, renderPage]);

  useEffect(() => {
    if (!url) return;
    setLoading(true); setError("");
    const saved = materialId ? (readPos(materialId).page ?? 1) : 1;
    loadPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(async (doc: any) => {
        pdfDocRef.current = doc; setNumPages(doc.numPages);
        const start = Math.min(Math.max(1, saved), doc.numPages);
        setPage(start);
        await renderPage(doc, start, widthRef.current > 0 ? widthRef.current : window.innerWidth);
        setLoading(false);
      })
      .catch((e: any) => { setError("Could not load PDF — " + (e?.message || "unknown error")); setLoading(false); });
  }, [url, loadPdfJs, renderPage]);

  useEffect(() => { if (materialId && page > 0) savePos(materialId, { page }); }, [page, materialId]);
  useEffect(() => { if (pdfDocRef.current && !loading) renderPage(pdfDocRef.current, page, widthRef.current > 0 ? widthRef.current : window.innerWidth); }, [page, loading, renderPage]);
  useEffect(() => () => { if (renderTask.current) try { renderTask.current.cancel(); } catch(_) {} }, []);

  return (
    <div style={{ background:"#525659", display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"6px 12px", background:"#3d4043", flexShrink:0 }}>
        <button disabled={page<=1} onClick={() => setPage(p=>Math.max(1,p-1))} aria-label="Previous page" style={{ width:34,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",opacity:page<=1?.4:1,padding:0 }}>‹</button>
        <span style={{ color:"#fff",fontSize:13,fontWeight:600,minWidth:64,textAlign:"center" }}>{loading?"Resuming…":`${page} / ${numPages}`}</span>
        <button disabled={page>=numPages} onClick={() => setPage(p=>Math.min(numPages,p+1))} aria-label="Next page" style={{ width:34,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",opacity:page>=numPages?.4:1,padding:0 }}>›</button>
        {!loading && page > 1 && <span style={{ fontSize:10,background:"rgba(201,164,76,.25)",color:"#C9A84C",border:"1px solid rgba(201,164,76,.4)",borderRadius:20,padding:"1px 7px",fontWeight:700 }}>↩ Resumed</span>}
      </div>
      <div ref={containerRef} style={{ flex:1,overflowY:"auto",overflowX:"hidden",background:"#525659",WebkitOverflowScrolling:"touch" }}>
        {loading && <div style={{ display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:48,color:"#fff" }}><div style={{ width:32,height:32,border:"3px solid rgba(255,255,255,.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"mv-spin .8s linear infinite" }}/><span style={{ fontSize:13,opacity:.7 }}>Rendering…</span></div>}
        {error && <div style={{ textAlign:"center",padding:32,color:"#fff" }}><p style={{ fontSize:13,opacity:.8,marginBottom:12 }}>{error}</p><a href={url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,background:"rgba(255,255,255,.15)",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:600 }}>Open in browser ↗</a></div>}
        {!error && <canvas ref={canvasRef} style={{ display:loading?"none":"block" }}/>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RECORDING MINI-PLAYER
══════════════════════════════════════════════════════════════ */
function RecordingMiniPlayer({ recordings, materialId }: { recordings: any[]; materialId?: string }) {
  const [expanded, setExpanded]   = useState(false);
  const [selected, setSelected]   = useState<any|null>(null);
  const [signedUrl, setSignedUrl] = useState<string|null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [playing, setPlaying]     = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration]   = useState(0);
  const [volume, setVolume]       = useState(1);
  const [muted, setMuted]         = useState(false);
  const audioRef    = useRef<HTMLAudioElement>(null);
  const pendingSeek = useRef(0);
  const G = "#064E3B"; const GOLD = "#C9A84C";

  useEffect(() => {
    if (!materialId || !recordings.length) return;
    const pos = readPos(materialId);
    if (pos.recordingId) {
      const saved = recordings.find(r => r.id === pos.recordingId);
      if (saved) { pendingSeek.current = pos.time ?? 0; loadRecording(saved); setExpanded(true); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  const loadRecording = async (rec: any) => {
    setSelected(rec); setPlaying(false); setCurrent(0); setSignedUrl(null);
    if (!rec?.file_url) return;
    setLoadingUrl(true);
    setSignedUrl(rec.file_url.startsWith("http") ? rec.file_url : (await getSignedUrl(rec.file_url, 7200) || null));
    setLoadingUrl(false);
    if (materialId) savePos(materialId, { recordingId: rec.id });
  };

  const togglePlay = () => { if (!audioRef.current) return; if (playing) { audioRef.current.pause(); setPlaying(false); } else { audioRef.current.play(); setPlaying(true); } };
  const seek = (v: string) => { const t = parseFloat(v); if (audioRef.current) { audioRef.current.currentTime = t; setCurrent(t); } };
  const fmt  = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  if (!recordings.length) return null;
  return (
    <div style={{ background:expanded?"#0d1f14":"transparent", borderBottom:expanded?"1px solid rgba(255,255,255,0.08)":"none", transition:"all .2s", flexShrink:0 }}>
      {signedUrl && <audio ref={audioRef} src={signedUrl}
        onLoadedMetadata={() => { const d=audioRef.current?.duration||0; setDuration(d); if(pendingSeek.current>0&&audioRef.current){audioRef.current.currentTime=Math.min(pendingSeek.current,d);setCurrent(pendingSeek.current);pendingSeek.current=0;} }}
        onTimeUpdate={() => { const t=audioRef.current?.currentTime||0; setCurrent(t); if(materialId&&Math.floor(t)%5===0) savePos(materialId,{time:t}); }}
        onEnded={() => { setPlaying(false); if(materialId) savePos(materialId,{time:0}); }}
        style={{ display:"none" }}
      />}
      <button onClick={() => setExpanded(e=>!e)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 16px",border:"none",cursor:"pointer",background:expanded?"#0d1f14":"linear-gradient(90deg,#0d1f14ee,#132e1eee)",color:"#fff",minHeight:44 }}>
        <div style={{ width:26,height:26,borderRadius:8,background:playing?GOLD:"rgba(201,164,76,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{playing?<Pause size={13} color="#111"/>:<Headphones size={13} color={GOLD}/>}</div>
        <div style={{ flex:1,textAlign:"left" }}>
          <p style={{ margin:0,fontSize:12,fontWeight:700,color:"#e8f5e9" }}>🎙️ Listen while reading</p>
          {selected&&!expanded&&<p style={{ margin:0,fontSize:10,color:GOLD }}>{playing?`▶ ${fmt(currentTime)}`:selected.teacher_name||"Recording selected"}</p>}
        </div>
        <span style={{ fontSize:11,color:"rgba(255,255,255,0.5)",marginRight:4 }}>{recordings.length} rec{recordings.length!==1?"s":""}</span>
        {expanded?<ChevronUp size={14} color="rgba(255,255,255,0.5)"/>:<ChevronDown size={14} color="rgba(255,255,255,0.5)"/>}
      </button>
      {expanded && (
        <div style={{ padding:"0 16px 16px" }}>
          <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:selected?10:0 }}>
            {recordings.map((rec: any) => {
              const isActive = selected?.id===rec.id;
              const dateStr  = rec.created_at ? new Date(rec.created_at).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "";
              const mins     = rec.duration_seconds ? Math.floor(rec.duration_seconds/60) : null;
              return (
                <button key={rec.id} onClick={()=>loadRecording(rec)} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,border:`1.5px solid ${isActive?GOLD+"60":"rgba(255,255,255,0.07)"}`,background:isActive?"rgba(201,164,76,0.12)":"rgba(255,255,255,0.04)",cursor:"pointer",textAlign:"left",minHeight:44 }}>
                  <div style={{ width:28,height:28,borderRadius:8,flexShrink:0,background:isActive?GOLD:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    {isActive&&playing?<Radio size={12} color="#111" style={{animation:"mv-pulse 1s infinite"}}/>:<Play size={11} color={isActive?"#111":"rgba(255,255,255,0.5)"}/>}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ margin:0,fontSize:12,fontWeight:600,color:isActive?GOLD:"#e8f5e9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.teacher_name||"Class Recording"}</p>
                    <p style={{ margin:0,fontSize:10,color:"rgba(255,255,255,0.4)" }}>{dateStr}{mins?` · ${mins}m`:""}</p>
                  </div>
                  {isActive&&loadingUrl&&<Loader2 size={12} color={GOLD} style={{animation:"mv-spin .8s linear infinite"}}/>}
                </button>
              );
            })}
          </div>
          {selected&&signedUrl&&(
            <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)" }}>
              <input type="range" min={0} max={duration||100} step={0.5} value={currentTime} onChange={e=>seek(e.target.value)} style={{ width:"100%",accentColor:GOLD,height:3,cursor:"pointer" }}/>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2,marginBottom:8 }}><span>{fmt(currentTime)}</span><span>{fmt(duration)}</span></div>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <button onClick={()=>seek(String(Math.max(0,currentTime-10)))} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:10,padding:"2px 4px" }}>⟪10s</button>
                <button onClick={togglePlay} style={{ width:38,height:38,borderRadius:"50%",background:GOLD,border:"none",color:G,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 12px rgba(201,164,76,0.4)",padding:0 }}>{playing?<Pause size={15}/>:<Play size={15} style={{marginLeft:1}}/>}</button>
                <button onClick={()=>seek(String(Math.min(duration,currentTime+10)))} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:10,padding:"2px 4px" }}>10s⟫</button>
                <button onClick={()=>{setMuted(m=>!m);if(audioRef.current)audioRef.current.muted=!muted;}} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",padding:0,marginLeft:2 }}>{muted||volume===0?<VolumeX size={14}/>:<Volume2 size={14}/>}</button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:volume} onChange={e=>{const v=parseFloat(e.target.value);setVolume(v);setMuted(v===0);if(audioRef.current)audioRef.current.volume=v;}} style={{ flex:1,accentColor:GOLD,height:3,cursor:"pointer" }}/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FILE VIEWER — onMinimize added alongside onClose
══════════════════════════════════════════════════════════════ */
function FileViewer({
  mat, kind, recordings = [], onClose, onMinimize, prefetchedUrl,
}: {
  mat: any; kind: FileKind; recordings?: any[];
  onClose: () => void;
  onMinimize: () => void;
  prefetchedUrl?: string;
}) {
  const materialId = mat.id || "";
  // If a pre-fetched URL was passed in, start ready immediately — no loading spinner
  const [url, setUrl]         = useState(prefetchedUrl || "");
  const [loading, setLoading] = useState(!prefetchedUrl);
  const [error, setError]     = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Already have a good URL — nothing to do
    if (prefetchedUrl) { setUrl(prefetchedUrl); setLoading(false); return; }
    setLoading(true); setError("");
    resolveUrl(mat.file_url || "")
      .then(u => { setUrl(u); setLoading(false); })
      .catch(() => { setError("Could not load file."); setLoading(false); });
  }, [mat.file_url, prefetchedUrl]);

  const handleMediaLoaded = (el: HTMLVideoElement | HTMLAudioElement) => {
    const t = readPos(materialId).time ?? 0;
    if (t > 1 && el.duration && t < el.duration) el.currentTime = t;
  };
  const handleTimeUpdate = (el: HTMLVideoElement | HTMLAudioElement) => {
    const t = el.currentTime;
    if (materialId && Math.floor(t) % 5 === 0) savePos(materialId, { time: t });
  };
  const handleEnded = () => { if (materialId) savePos(materialId, { time: 0 }); };

  const ytEmbed     = (u: string) => { const m = u.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/); return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : u; };
  const officeEmbed = (u: string) => u.includes("docs.google.com")||u.includes("drive.google.com") ? u.replace("/view","/preview") : `https://docs.google.com/gviewer?url=${encodeURIComponent(u)}&embedded=true`;

  const cfg = K[kind]; const Icon = cfg.icon;
  const savedPos   = readPos(materialId);
  const hasResume  = (kind==="video"||kind==="audio") && (savedPos.time??0) > 2;
  const resumeLabel = hasResume ? `↩ ${String(Math.floor(savedPos.time!/60)).padStart(2,"0")}:${String(Math.floor(savedPos.time!%60)).padStart(2,"0")}` : "";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:"1px solid #e5e7eb", flexShrink:0, background:"#fff" }}>
        <div style={{ width:34,height:34,borderRadius:10,background:cfg.bg,border:`1px solid ${cfg.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <Icon size={16} style={{ color:cfg.color }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700,fontSize:14,color:"#111",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{mat.title}</p>
          <div style={{ display:"flex",alignItems:"center",gap:5,marginTop:2,flexWrap:"wrap" }}>
            <span style={{ fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
            {mat.file_size && <span style={{ fontSize:10,color:"#9ca3af" }}>{fmtSize(mat.file_size)}</span>}
            {hasResume && <span style={{ fontSize:10,background:"rgba(201,164,76,0.15)",color:"#B45309",border:"1px solid rgba(201,164,76,0.4)",borderRadius:20,padding:"1px 7px",fontWeight:700 }}>{resumeLabel}</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
          {url && mat.is_downloadable !== false && (
            <a href={url} download target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" style={{ borderRadius:10,fontSize:12,padding:"4px 10px",height:30 }}>
                <Download size={12} style={{ marginRight:3 }}/><span className="hidden sm:inline">Save</span>
              </Button>
            </a>
          )}

          {/* ── MINIMIZE — keeps viewer alive in tray ── */}
          <button
            onClick={onMinimize}
            title="Minimize (keep open — switch materials without closing)"
            aria-label="Minimize viewer"
            style={{ width:30,height:30,borderRadius:8,border:"1px solid #e5e7eb",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",gap:0 }}
            onMouseEnter={e=>{ e.currentTarget.style.background="#dbeafe"; e.currentTarget.style.borderColor="#93c5fd"; }}
            onMouseLeave={e=>{ e.currentTarget.style.background="#f8fafc"; e.currentTarget.style.borderColor="#e5e7eb"; }}
          >
            <Minimize2 size={14} color="#3b82f6"/>
          </button>

          {/* ── CLOSE — unmounts this viewer entirely ── */}
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close viewer"
            style={{ width:30,height:30,borderRadius:8,border:"1px solid #e5e7eb",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s" }}
            onMouseEnter={e=>{ e.currentTarget.style.background="#fee2e2"; e.currentTarget.style.borderColor="#fca5a5"; }}
            onMouseLeave={e=>{ e.currentTarget.style.background="#f8fafc"; e.currentTarget.style.borderColor="#e5e7eb"; }}
          >
            <X size={14} color="#ef4444"/>
          </button>
        </div>
      </div>

      {/* Recordings strip */}
      {recordings.length > 0 && <RecordingMiniPlayer recordings={recordings} materialId={materialId}/>}

      {/* ── Content body ───────────────────────────────────── */}
      <div style={{ flex:1, overflow:"auto", background:"#f9fafb", WebkitOverflowScrolling:"touch", display:"flex", flexDirection:"column" }}>
        {loading && (
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:32,flex:1 }}>
            <Loader2 size={28} style={{ color:"#064E3B",animation:"mv-spin .8s linear infinite" }}/>
            <p style={{ fontSize:13,color:"#6b7280",margin:0 }}>Loading…</p>
          </div>
        )}
        {error && (
          <div style={{ textAlign:"center",padding:32,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
            <p style={{ fontSize:13,color:"#dc2626",marginBottom:4 }}>{error}</p>
            {mat.file_url && <a href={url||mat.file_url} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink size={12} style={{ marginRight:4 }}/> Open in new tab</Button></a>}
          </div>
        )}
        {!loading && !error && url && (
          <>
            {kind==="pdf" && <PDFJsViewer url={url} materialId={materialId}/>}
            {kind==="image" && <div style={{ display:"flex",alignItems:"center",justifyContent:"center",padding:16,flex:1 }}><img src={url} alt={mat.title} style={{ maxWidth:"100%",maxHeight:"70vh",borderRadius:12,objectFit:"contain",boxShadow:"0 4px 24px rgba(0,0,0,.12)" }}/></div>}
            {kind==="video" && <video ref={videoRef} src={url} controls autoPlay playsInline style={{ width:"100%",display:"block",background:"#000" }} onLoadedMetadata={()=>videoRef.current&&handleMediaLoaded(videoRef.current)} onTimeUpdate={()=>videoRef.current&&handleTimeUpdate(videoRef.current)} onEnded={handleEnded} onSeeked={()=>videoRef.current&&savePos(materialId,{time:videoRef.current.currentTime})}/>}
            {kind==="audio" && (
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16,flex:1 }}>
                <div style={{ width:64,height:64,borderRadius:"50%",background:"#F3E8FF",display:"flex",alignItems:"center",justifyContent:"center" }}><Music size={28} style={{ color:"#9333EA" }}/></div>
                <p style={{ fontSize:14,fontWeight:600,color:"#374151",margin:0 }}>{mat.title}</p>
                <audio ref={audioRef} src={url} controls style={{ width:"100%",maxWidth:400 }} onLoadedMetadata={()=>audioRef.current&&handleMediaLoaded(audioRef.current)} onTimeUpdate={()=>audioRef.current&&handleTimeUpdate(audioRef.current)} onEnded={handleEnded} onSeeked={()=>audioRef.current&&savePos(materialId,{time:audioRef.current.currentTime})}/>
                {hasResume && <p style={{ fontSize:11,color:"#9CA3AF",margin:0 }}>Resumed from {resumeLabel.replace("↩ ","")}</p>}
              </div>
            )}
            {kind==="youtube" && <div style={{ position:"relative",paddingBottom:"56.25%",height:0 }}><iframe src={ytEmbed(url)} style={{ position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none" }} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={mat.title}/></div>}
            {kind==="office" && <iframe src={officeEmbed(url)} style={{ width:"100%",flex:1,border:"none",display:"block",minHeight:400 }} title={mat.title}/>}
            {kind==="html" && (
              <iframe
                src={url}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                style={{ width:"100%",flex:1,border:"none",display:"block",minHeight:400,background:"#fff" }}
                title={mat.title}
              />
            )}
            {kind==="text" && <div style={{ padding:16,maxWidth:720,margin:"0 auto",width:"100%" }}><div style={{ background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb",fontSize:14,lineHeight:1.8,color:"#374151",whiteSpace:"pre-wrap" }}>{mat.content||"No content."}</div></div>}
            {kind==="link" && <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:12,flex:1 }}><div style={{ width:48,height:48,borderRadius:14,background:"#F0FDFA",display:"flex",alignItems:"center",justifyContent:"center" }}><LinkIcon size={20} style={{ color:"#0D9488" }}/></div><p style={{ fontSize:13,color:"#6b7280",wordBreak:"break-all",maxWidth:320,textAlign:"center" }}>{url}</p><a href={url} target="_blank" rel="noopener noreferrer"><Button style={{ borderRadius:12,gap:6 }}><ExternalLink size={13}/> Open</Button></a></div>}
            {kind==="other" && <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:12,flex:1 }}><div style={{ width:48,height:48,borderRadius:14,background:"#F3F4F6",display:"flex",alignItems:"center",justifyContent:"center" }}><File size={20} style={{ color:"#6B7280" }}/></div><p style={{ fontSize:13,color:"#6b7280",margin:0 }}>Preview not available</p><a href={url} download target="_blank" rel="noopener noreferrer"><Button style={{ borderRadius:12,gap:6 }}><Download size={13}/> Download</Button></a></div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VIEWER PANEL
   Stays mounted (visibility-hidden) when minimized so media keeps playing.
══════════════════════════════════════════════════════════════ */
function ViewerPanel({
  entry, isActive, onMinimize, onClose, recordings,
}: {
  entry: OpenEntry; isActive: boolean;
  onMinimize: () => void; onClose: () => void; recordings: any[];
}) {
  return (
    /* Use opacity + visibility instead of display:none to keep the DOM
       mounted (so video/audio elements don't reset on restore). */
    <div style={{
      position:"fixed", inset:0, zIndex:9000,
      display:"flex", alignItems:"center", justifyContent:"center",
      background: isActive ? "rgba(0,0,0,0.55)" : "transparent",
      pointerEvents: isActive ? "all" : "none",
      opacity: isActive ? 1 : 0,
      visibility: isActive ? "visible" : "hidden",
      transition:"opacity .22s, background .22s",
    }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:"min(96vw,900px)", height:"min(92vh,800px)",
          background:"#fff", borderRadius:16, overflow:"hidden",
          display:"flex", flexDirection:"column",
          boxShadow:"0 24px 60px rgba(0,0,0,0.3)",
          animation: isActive ? "mv-slideUp .2s ease" : "none",
        }}
      >
        <FileViewer
          mat={entry.mat}
          kind={entry.kind}
          recordings={recordings}
          onMinimize={onMinimize}
          onClose={onClose}
          prefetchedUrl={entry.prefetchedUrl}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MINIMIZED TRAY — chips at bottom-right for each minimized panel
══════════════════════════════════════════════════════════════ */
function MinimizedTray({
  entries, activeId, onRestore, onClose,
}: {
  entries: OpenEntry[]; activeId: string|null;
  onRestore: (id: string) => void; onClose: (id: string) => void;
}) {
  const minimized = entries.filter(e => e.mat.id !== activeId);
  if (!minimized.length) return null;

  return (
    <div style={{
      position:"fixed", bottom:16, right:16, zIndex:8999,
      display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end",
      pointerEvents:"none",
    }}>
      {/* Badge showing how many minimized */}
      <div style={{ background:"#064E3B", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#fff", pointerEvents:"none", boxShadow:"0 2px 8px rgba(6,78,59,0.35)", display:"flex", alignItems:"center", gap:5, alignSelf:"flex-end" }}>
        <Layers size={12}/>{minimized.length} open in tray
      </div>

      {minimized.map(entry => {
        const cfg   = K[entry.kind];
        const Icon  = cfg.icon;
        const title = entry.mat.title || "Material";
        const pos   = entry.mat.id ? readPos(entry.mat.id) : {};
        const hasPg = entry.kind==="pdf" && (pos.page??1)>1;
        const hasTm = (entry.kind==="video"||entry.kind==="audio") && (pos.time??0)>2;
        const badge = hasPg ? `p.${pos.page}` : hasTm ? `${String(Math.floor(pos.time!/60)).padStart(2,"0")}:${String(Math.floor(pos.time!%60)).padStart(2,"0")}` : "";

        return (
          <div
            key={entry.mat.id}
            style={{
              display:"flex", alignItems:"center", gap:8,
              background:"#1e293b", borderRadius:12,
              padding:"8px 10px", boxShadow:"0 4px 20px rgba(0,0,0,0.35)",
              pointerEvents:"all", animation:"mv-slideUp .2s ease",
              maxWidth:260, border:"1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Click the body to restore */}
            <div
              onClick={() => onRestore(entry.mat.id)}
              style={{ display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,cursor:"pointer" }}
            >
              <div style={{ width:28,height:28,borderRadius:8,background:cfg.bg,border:`1px solid ${cfg.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <Icon size={13} style={{ color:cfg.color }}/>
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <p style={{ margin:0,fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{title}</p>
                <p style={{ margin:0,fontSize:10,color:"#64748b" }}>
                  {badge ? <span style={{ color:"#C9A84C",fontWeight:700 }}>↩ {badge} · </span> : null}
                  {cfg.label} · tap to restore
                </p>
              </div>
              <Maximize2 size={13} color="#64748b" style={{ flexShrink:0 }}/>
            </div>
            {/* Close button */}
            <button
              onClick={e => { e.stopPropagation(); onClose(entry.mat.id); }}
              title="Close"
              style={{ background:"rgba(255,255,255,0.08)",border:"none",borderRadius:6,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0 }}
              onMouseEnter={e=>(e.currentTarget.style.background="rgba(239,68,68,0.3)")}
              onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.08)")}
            >
              <X size={11} color="#94a3b8"/>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
const MaterialsViewer = ({ materials, sessions = [], recordings = [] }: Props) => {
  const { t } = useLanguage();

  // All materials that have been opened (including currently minimized)
  const [openEntries, setOpenEntries] = useState<OpenEntry[]>([]);
  // The one currently displayed full-screen (null = all minimized)
  const [activeId, setActiveId]       = useState<string|null>(null);

  // ── Prefetch cache: resolve signed URLs in the background as soon
  //    as the material list is available so tapping Open is instant.
  const urlCache = useRef<Record<string, string>>({});

  useEffect(() => {
    // Resolve URLs for all materials that have a file_url and aren't
    // already cached. Fire-and-forget — we don't block anything.
    materials.forEach(mat => {
      if (!mat.file_url || urlCache.current[mat.id]) return;
      resolveUrl(mat.file_url).then(resolved => {
        if (resolved) urlCache.current[mat.id] = resolved;
      }).catch(() => { /* silent */ });
    });
  }, [materials]);

  // Inject shared CSS once
  useEffect(() => {
    const id = "mv-global-css";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes mv-spin    { to { transform:rotate(360deg); } }
      @keyframes mv-pulse   { 0%,100%{opacity:1}50%{opacity:.5} }
      @keyframes mv-slideUp { from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1} }
    `;
    document.head.appendChild(s);
  }, []);

  if (materials.length === 0) return (
    <div style={{ textAlign:"center",padding:"clamp(48px,12vw,64px) clamp(16px,4vw,24px)" }}>
      <div style={{ width:64,height:64,borderRadius:20,background:"#F3F4F6",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}><FileText size={24} style={{ color:"#D1D5DB" }}/></div>
      <p style={{ fontWeight:600,color:"#9CA3AF",margin:0 }}>{t("No materials yet","لا توجد مواد بعد")}</p>
      <p style={{ fontSize:12,color:"#D1D5DB",marginTop:4 }}>{t("Your teacher will upload files here.","سيرفع المعلم الملفات هنا.")}</p>
    </div>
  );

  /* Open or restore a material */
  const openMaterial = (mat: any) => {
    const id = mat.id;
    if (openEntries.find(e => e.mat.id === id)) {
      // Already open — just bring to front
      setActiveId(id);
      return;
    }
    // New material — use cached URL if available so viewer opens instantly
    const prefetchedUrl = urlCache.current[id] || undefined;
    setOpenEntries(prev => [...prev, { mat, kind: detectKind(mat), prefetchedUrl }]);
    setActiveId(id);
  };

  const minimizeCurrent = () => setActiveId(null);
  const restoreEntry    = (id: string) => setActiveId(id);
  const closeEntry      = (id: string) => {
    setOpenEntries(prev => prev.filter(e => e.mat.id !== id));
    setActiveId(prev => {
      if (prev !== id) return prev;
      const remaining = openEntries.filter(e => e.mat.id !== id);
      return remaining.length ? remaining[remaining.length - 1].mat.id : null;
    });
  };

  /* Card list */
  const sessioned   = materials.filter((m: any) => m.session_id);
  const unsessioned = materials.filter((m: any) => !m.session_id);

  const renderCard = (mat: any) => {
    const kind    = detectKind(mat);
    const cfg     = K[kind];
    const Icon    = cfg.icon;
    const session = mat.session_id ? sessions.find((s: any) => s.id === mat.session_id) : null;
    const canOpen = !!(mat.file_url || mat.content);

    const pos  = mat.id ? readPos(mat.id) : {};
    const hasPg = kind==="pdf" && (pos.page??1)>1;
    const hasTm = (kind==="video"||kind==="audio") && (pos.time??0)>2;
    const progressBadge = hasPg ? `↩ p.${pos.page}` : hasTm ? `↩ ${String(Math.floor(pos.time!/60)).padStart(2,"0")}:${String(Math.floor(pos.time!%60)).padStart(2,"0")}` : "";

    const isOpen      = openEntries.some(e => e.mat.id === mat.id);
    const isMaximized = activeId === mat.id;
    const isMinimized = isOpen && !isMaximized;

    return (
      <article
        key={mat.id}
        onClick={() => canOpen && openMaterial(mat)}
        role="button"
        tabIndex={canOpen ? 0 : -1}
        onKeyDown={e => e.key==="Enter" && canOpen && openMaterial(mat)}
        aria-label={`Open ${mat.title}`}
        style={{
          display:"flex", alignItems:"center", gap:12,
          padding:"10px 14px", borderRadius:14,
          border:`1.5px solid ${isMaximized?"#064E3B":isMinimized?"#C9A84C66":progressBadge?"#C9A84C66":cfg.border}`,
          background: isMaximized?"#f0fdf4":cfg.bg,
          cursor: canOpen?"pointer":"default",
          transition:"all .15s",
          boxShadow: isMaximized?"0 2px 12px rgba(6,78,59,0.15)":progressBadge?"0 2px 8px rgba(201,164,76,0.12)":"0 1px 4px rgba(0,0,0,.04)",
          minHeight:44,
        }}
        onMouseEnter={e=>{if(canOpen)(e.currentTarget as HTMLElement).style.boxShadow="0 4px 16px rgba(0,0,0,.1)";}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow=isMaximized?"0 2px 12px rgba(6,78,59,0.15)":progressBadge?"0 2px 8px rgba(201,164,76,0.12)":"0 1px 4px rgba(0,0,0,.04)";}}
      >
        <div style={{ width:44,height:44,borderRadius:12,background:`${cfg.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative" }}>
          <Icon size={18} style={{ color:cfg.color }}/>
          {/* Green dot = maximized, amber dot = minimized */}
          {isMaximized && <span style={{ position:"absolute",top:-3,right:-3,width:10,height:10,borderRadius:"50%",background:"#064E3B",border:"2px solid #fff" }}/>}
          {isMinimized && <span style={{ position:"absolute",top:-3,right:-3,width:10,height:10,borderRadius:"50%",background:"#C9A84C",border:"2px solid #fff" }}/>}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontWeight:700,fontSize:14,color:"#111827",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{mat.title}</p>
          <div style={{ display:"flex",alignItems:"center",gap:5,marginTop:3,flexWrap:"wrap" }}>
            <span style={{ fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:20,background:`${cfg.color}15`,color:cfg.color }}>{cfg.label}</span>
            {mat.file_size && <span style={{ fontSize:10,color:"#9CA3AF" }}>{fmtSize(mat.file_size)}</span>}
            {session && <span style={{ fontSize:10,color:"#9CA3AF" }}>#{(session as any).session_number}</span>}
            {mat.created_at && <span style={{ fontSize:10,color:"#D1D5DB" }}>{new Date(mat.created_at).toLocaleDateString()}</span>}
            {progressBadge && <span style={{ fontSize:10,background:"rgba(201,164,76,0.15)",color:"#92400E",border:"1px solid rgba(201,164,76,0.4)",borderRadius:20,padding:"1px 7px",fontWeight:700 }}>{progressBadge}</span>}
            {isMinimized && <span style={{ fontSize:10,background:"rgba(201,164,76,0.15)",color:"#92400E",border:"1px solid rgba(201,164,76,0.4)",borderRadius:20,padding:"1px 7px",fontWeight:700 }}>minimized</span>}
          </div>
        </div>
        {canOpen && (
          <div style={{ display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,color:isMaximized?"#064E3B":isMinimized?"#92400E":cfg.color,padding:"4px 10px",borderRadius:20,background:isMaximized?"rgba(6,78,59,0.1)":isMinimized?"rgba(201,164,76,0.12)":`${cfg.color}12`,border:`1px solid ${isMaximized?"#064E3B40":isMinimized?"rgba(201,164,76,0.4)":cfg.color+"30"}`,flexShrink:0,whiteSpace:"nowrap" }}>
            {isMaximized ? <><Eye size={12}/> <span>Viewing</span></> :
             isMinimized ? <><Maximize2 size={12}/> <span>Restore</span></> :
                           <><Eye size={12}/> <span>{progressBadge?"Resume":"Open"}</span></>}
          </div>
        )}
      </article>
    );
  };

  const bySession: Record<string,any[]> = {};
  sessioned.forEach((m: any) => { if(!bySession[m.session_id]) bySession[m.session_id]=[]; bySession[m.session_id].push(m); });

  return (
    <>
      {/* ── Material card list ── */}
      <div style={{ display:"flex",flexDirection:"column",gap:"clamp(16px,4vw,20px)" }}>
        {unsessioned.length > 0 && (
          <div>
            {sessioned.length > 0 && <p style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#9CA3AF",marginBottom:8 }}>General</p>}
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{unsessioned.map(renderCard)}</div>
          </div>
        )}
        {Object.entries(bySession).map(([sid,mats]) => {
          const sess = sessions.find((s: any) => s.id === sid);
          return (
            <div key={sid}>
              <p style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#9CA3AF",marginBottom:8 }}>
                #{(sess as any)?.session_number||"?"}{(sess as any)?.topic?` — ${(sess as any).topic}`:""}
              </p>
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{mats.map(renderCard)}</div>
            </div>
          );
        })}
      </div>

      {/* ── One floating panel per open entry.
             All stay mounted so media never resets.
             Only the activeId panel is visible.          ── */}
      {openEntries.map(entry => (
        <ViewerPanel
          key={entry.mat.id}
          entry={entry}
          isActive={activeId === entry.mat.id}
          onMinimize={minimizeCurrent}
          onClose={() => closeEntry(entry.mat.id)}
          recordings={recordings}
        />
      ))}

      {/* Clicking the backdrop minimizes the active panel */}
      {activeId && (
        <div
          style={{ position:"fixed",inset:0,zIndex:8998,cursor:"default" }}
          onClick={minimizeCurrent}
          aria-hidden
        />
      )}

      {/* ── Minimized tray ── */}
      <MinimizedTray
        entries={openEntries}
        activeId={activeId}
        onRestore={restoreEntry}
        onClose={closeEntry}
      />
    </>
  );
};

export default MaterialsViewer;
