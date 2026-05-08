// PDFViewer.tsx
// Renders PDF pages directly inside the app using pdf.js (CDN).
// Fetches the file as bytes → no Content-Disposition redirect issues on mobile.

import { useEffect, useRef, useState } from "react";

const PDFJS_VERSION = "3.11.174";
const PDFJS_SRC    = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

function ensureScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
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

interface Props {
  url: string;
  /** background colour behind pages, defaults to #1c1c1e */
  bg?: string;
}

export default function PDFViewer({ url, bg = "#1c1c1e" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase]   = useState<"loading" | "rendering" | "done" | "error">("loading");
  const [pages, setPages]   = useState(0);
  const [done,  setDone]    = useState(0);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    ensureKeyframes();
    let cancelled = false;

    const run = async () => {
      try {
        setPhase("loading"); setErrMsg(""); setPages(0); setDone(0);
        if (containerRef.current) containerRef.current.innerHTML = "";

        await ensureScript(PDFJS_SRC);

        const lib = (window as any).pdfjsLib;
        if (!lib) throw new Error("pdf.js did not load");
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

        // Fetch as bytes so the browser never sees Content-Disposition: attachment
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching PDF`);
        const data  = await resp.arrayBuffer();

        const pdf   = await lib.getDocument({ data }).promise;
        if (cancelled) return;

        const total = pdf.numPages;
        setPages(total);
        setPhase("rendering");

        const dpr   = Math.min(window.devicePixelRatio || 1, 2);

        for (let i = 1; i <= total; i++) {
          if (cancelled || !containerRef.current) break;

          const page = await pdf.getPage(i);
          const vp   = page.getViewport({ scale: dpr });

          const canvas        = document.createElement("canvas");
          canvas.width        = vp.width;
          canvas.height       = vp.height;
          canvas.style.width  = "100%";
          canvas.style.display        = "block";
          canvas.style.borderRadius   = "6px";
          canvas.style.marginBottom   = i < total ? "8px" : "0";
          canvas.style.boxShadow      = "0 2px 12px rgba(0,0,0,.4)";

          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;

          if (!cancelled && containerRef.current) {
            containerRef.current.appendChild(canvas);
            setDone(i);
          }
        }

        if (!cancelled) setPhase("done");
      } catch (e: any) {
        if (!cancelled) { setErrMsg(e?.message || "Unknown error"); setPhase("error"); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [url]);

  const pct = pages > 0 ? Math.round((done / pages) * 100) : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: bg }}>

      {/* ── loading / rendering banner ── */}
      {(phase === "loading" || phase === "rendering") && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: "32px 24px",
          background: bg,
          // stays visible above page while rendering
          position: phase === "loading" ? "absolute" : "relative",
          inset: phase === "loading" ? 0 : "auto",
          zIndex: phase === "loading" ? 2 : "auto",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            border: "3px solid rgba(255,255,255,.1)",
            borderTopColor: "#10b981",
            animation: "pdfv-spin .75s linear infinite",
          }} />
          <p style={{ color: "#d1d5db", fontSize: 13, margin: 0, fontWeight: 500 }}>
            {phase === "loading" ? "Loading PDF…" : `Rendering pages… ${pct}%`}
          </p>
        </div>
      )}

      {/* ── error state ── */}
      {phase === "error" && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 12, padding: 32, textAlign: "center",
        }}>
          <span style={{ fontSize: 48 }}>⚠️</span>
          <p style={{ color: "#f87171", fontWeight: 700, fontSize: 15, margin: 0 }}>Could not render PDF</p>
          <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>{errMsg}</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{
              marginTop: 8, background: "#10b981", color: "#fff",
              padding: "10px 28px", borderRadius: 10,
              textDecoration: "none", fontWeight: 700, fontSize: 14,
            }}>
            Open in browser ↗
          </a>
        </div>
      )}

      {/* ── canvas pages ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflowY: "auto", padding: "12px 8px",
          display: phase === "error" ? "none" : "block",
        }}
      />
    </div>
  );
}
