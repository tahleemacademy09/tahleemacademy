// PDFViewer.tsx
// • First open: fetches + renders all pages → caches as ImageBitmaps (module-level)
// • Subsequent opens: draws from cache INSTANTLY — no network, no re-render
// • Scroll position saved per materialId and restored on reopen
// • prewarmPDF() exported so LiveClassFilePanel can silently pre-render PDFs
//   in the background the moment the file list loads — before any click.

import { useEffect, useRef, useState, useCallback } from "react";

const PDFJS_VERSION = "3.11.174";
const PDFJS_SRC    = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

// Module-level caches — survive React unmount/remount
const PAGE_CACHE    = new Map<string, ImageBitmap[]>();
const DIM_CACHE     = new Map<string, Array<{w:number;h:number}>>();
const RENDER_PROMISE= new Map<string, Promise<ImageBitmap[]>>();

function ensureScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
}

function ensureKeyframes() {
  if (document.getElementById("pdfv-kf")) return;
  const s = document.createElement("style");
  s.id = "pdfv-kf";
  s.textContent = `@keyframes pdfv-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

const scrollKey = (id: string) => `pdfv-scroll-${id}`;
function saveScroll(id: string, top: number) {
  try { localStorage.setItem(scrollKey(id), String(Math.round(top))); } catch {}
}
function loadScroll(id: string): number {
  try { return parseInt(localStorage.getItem(scrollKey(id)) || "0", 10) || 0; } catch { return 0; }
}

async function renderPDF(url: string, onProgress?: (done: number, total: number) => void): Promise<ImageBitmap[]> {
  if (PAGE_CACHE.has(url) && !RENDER_PROMISE.has(url)) return PAGE_CACHE.get(url)!;
  if (RENDER_PROMISE.has(url)) return RENDER_PROMISE.get(url)!;

  const promise = (async () => {
    await ensureScript(PDFJS_SRC);
    const lib = (window as any).pdfjsLib;
    if (!lib) throw new Error("pdf.js did not load");
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.arrayBuffer();
    const pdf  = await lib.getDocument({ data }).promise;
    const total = pdf.numPages;
    const dpr   = Math.min(window.devicePixelRatio || 1, 2);
    const bitmaps: ImageBitmap[] = [];
    const dims: Array<{w:number;h:number}> = [];

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp   = page.getViewport({ scale: dpr });
      const oc   = new OffscreenCanvas(vp.width, vp.height);
      await page.render({ canvasContext: oc.getContext("2d") as any, viewport: vp }).promise;
      const bmp = await createImageBitmap(oc);
      bitmaps.push(bmp);
      dims.push({ w: vp.width, h: vp.height });
      // Store partial so poll can draw as they arrive
      PAGE_CACHE.set(url, [...bitmaps]);
      DIM_CACHE.set(url, [...dims]);
      onProgress?.(i, total);
    }

    PAGE_CACHE.set(url, bitmaps);
    DIM_CACHE.set(url, dims);
    RENDER_PROMISE.delete(url);
    return bitmaps;
  })();

  RENDER_PROMISE.set(url, promise);
  return promise;
}

/**
 * Call this with a resolved PDF URL right after the file list loads.
 * It silently renders all pages into PAGE_CACHE in the background so
 * that when the user taps the file, PDFViewer draws from cache instantly
 * with no spinner at all.
 */
export function prewarmPDF(url: string): void {
  if (!url || PAGE_CACHE.has(url) || RENDER_PROMISE.has(url)) return;
  // Fire-and-forget — errors are silently ignored
  renderPDF(url).catch(() => {});
}

interface Props {
  url: string;
  bg?: string;
  materialId?: string;
}

export default function PDFViewer({ url, bg = "#1c1c1e", materialId }: Props) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"instant"|"loading"|"rendering"|"done"|"error">("loading");
  const [pct,   setPct]   = useState(0);
  const [errMsg,setErrMsg]= useState("");
  const cancelRef = useRef(false);
  const lastDrawn = useRef(0);

  const makePage = useCallback((bmp: ImageBitmap, dim: {w:number;h:number}, last: boolean): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = dim.w; c.height = dim.h;
    c.style.width = "100%"; c.style.display = "block";
    c.style.borderRadius = "6px";
    c.style.marginBottom = last ? "0" : "10px";
    c.style.boxShadow = "0 2px 14px rgba(0,0,0,.4)";
    (c.getContext("2d") as CanvasRenderingContext2D).drawImage(bmp, 0, 0);
    return c;
  }, []);

  const restoreScroll = useCallback(() => {
    if (!materialId) return;
    const saved = loadScroll(materialId);
    if (saved > 0) requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = saved;
    });
  }, [materialId]);

  useEffect(() => {
    ensureKeyframes();
    cancelRef.current = false;
    lastDrawn.current = 0;

    const cached = PAGE_CACHE.get(url);
    const dims   = DIM_CACHE.get(url);
    const isFullyCached = cached && cached.length > 0 && !RENDER_PROMISE.has(url);

    if (isFullyCached && dims) {
      // ── INSTANT: draw all from cache ───────────────────────────────────────
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cached.forEach((bmp, i) =>
          containerRef.current!.appendChild(makePage(bmp, dims[i] ?? { w: bmp.width, h: bmp.height }, i === cached.length - 1))
        );
      }
      lastDrawn.current = cached.length;
      setPhase("done");
      restoreScroll();
      return;
    }

    // ── STILL RENDERING IN BACKGROUND (prewarm in progress) ─────────────────
    // If a render promise exists it was started by prewarmPDF — just attach to it
    // and poll for partial pages as they arrive, same as first-render path below.

    // ── FIRST RENDER ────────────────────────────────────────────────────────
    setPhase("loading"); setErrMsg(""); setPct(0);
    if (containerRef.current) containerRef.current.innerHTML = "";

    // Poll every 250ms to draw newly-rendered pages progressively
    const poll = setInterval(() => {
      if (cancelRef.current) { clearInterval(poll); return; }
      const partial = PAGE_CACHE.get(url);
      const pdims   = DIM_CACHE.get(url);
      if (!partial || !pdims || !containerRef.current) return;
      if (partial.length > lastDrawn.current) {
        setPhase("rendering");
        for (let i = lastDrawn.current; i < partial.length; i++) {
          const last = !RENDER_PROMISE.has(url) && i === partial.length - 1;
          containerRef.current.appendChild(makePage(partial[i], pdims[i] ?? { w: partial[i].width, h: partial[i].height }, last));
        }
        lastDrawn.current = partial.length;
        const total = pdims.length || partial.length;
        setPct(Math.round((lastDrawn.current / total) * 100));
      }
    }, 250);

    renderPDF(url)
      .then(bitmaps => {
        if (cancelRef.current) return;
        clearInterval(poll);
        const fdims = DIM_CACHE.get(url) || bitmaps.map(b => ({ w: b.width, h: b.height }));
        if (containerRef.current) {
          for (let i = lastDrawn.current; i < bitmaps.length; i++) {
            containerRef.current.appendChild(makePage(bitmaps[i], fdims[i] ?? { w: bitmaps[i].width, h: bitmaps[i].height }, i === bitmaps.length - 1));
          }
        }
        setPhase("done");
        restoreScroll();
      })
      .catch(e => {
        if (cancelRef.current) return;
        clearInterval(poll);
        setErrMsg(e?.message || "Unknown error");
        setPhase("error");
      });

    return () => { cancelRef.current = true; clearInterval(poll); };
  }, [url, makePage, restoreScroll]);

  // Save scroll while reading
  useEffect(() => {
    if (!materialId || phase !== "done") return;
    const el = scrollRef.current;
    if (!el) return;
    const fn = () => saveScroll(materialId, el.scrollTop);
    el.addEventListener("scroll", fn, { passive: true });
    return () => el.removeEventListener("scroll", fn);
  }, [materialId, phase]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: bg }}>

      {(phase === "loading" || phase === "rendering") && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:"24px 16px", pointerEvents:"none" }}>
          <div style={{ width:38, height:38, borderRadius:"50%", border:"3px solid rgba(255,255,255,.1)", borderTopColor:"#10b981", animation:"pdfv-spin .7s linear infinite" }}/>
          <p style={{ color:"#9ca3af", fontSize:12, margin:0 }}>
            {phase === "loading" ? "Loading…" : `Rendering… ${pct}%`}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:28, textAlign:"center" }}>
          <p style={{ color:"#f87171", fontWeight:700, fontSize:15, margin:0 }}>Could not load PDF</p>
          <p style={{ color:"#6b7280", fontSize:12, margin:0 }}>{errMsg}</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ marginTop:6, background:"#10b981", color:"#fff", padding:"9px 22px", borderRadius:10, textDecoration:"none", fontWeight:700, fontSize:13 }}>
            Open in browser
          </a>
        </div>
      )}

      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"8px", display: phase === "error" ? "none" : "block" }}>
        <div ref={containerRef}/>
      </div>
    </div>
  );
}
