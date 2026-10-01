// src/components/hifdh/MushafPageView.tsx
// Read-only Quran page in the same parchment/mushaf style as the Daily Hifdh Revision screen.
// Usage: <MushafPageView page={50} />

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SURAHS } from "@/components/hifdh/surahData";
import { supabase } from "@/integrations/supabase/client";

const MV_GOLD = "#C9A84C";

interface MvWord { t: string; line: number; }
interface MvAyah {
  numberInSurah: number;
  text: string;
  surahNum: number;
  words: MvWord[];
}

// Simple in-memory cache so flipping between pages is instant.
const MV_CACHE = new Map<number, Promise<MvAyah[]>>();

async function mvFetchPage(page: number): Promise<MvAyah[]> {
  try {
    const r = await fetch(
      `https://api.qurancdn.com/api/qdc/verses/by_page/${page}?words=true&per_page=50&fields=text_uthmani`,
    );
    if (r.ok) {
      const j = await r.json();
      const verses: any[] = j?.verses ?? [];
      if (verses.length) {
        return verses.map((v) => {
          const apiWords: any[] = (v.words || []).filter((w: any) => w.char_type_name !== "end");
          const text: string = v.text_uthmani ?? apiWords.map((w: any) => w.text_uthmani ?? w.text).join(" ");
          const split = text.split(/\s+/).filter(Boolean);
          let prev = 0;
          const words = split.map((t, i) => {
            const ln = apiWords[i]?.line_number ?? prev;
            prev = ln;
            return { t, line: ln };
          });
          return {
            numberInSurah: v.verse_number ?? 0,
            surahNum: v.chapter_id ?? Number(String(v.verse_key || "0:0").split(":")[0]),
            text, words,
          };
        });
      }
    }
  } catch { /* fall through to fallback */ }
  const r = await fetch(`https://api.alquran.cloud/v1/page/${page}/quran-uthmani`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.data?.ayahs ?? []).map((a: any) => ({
    numberInSurah: a.numberInSurah, text: a.text, surahNum: a.surah?.number ?? 0,
    words: String(a.text).split(/\s+/).filter(Boolean).map((t: string) => ({ t, line: 0 })),
  }));
}
const mvLoad = (page: number) => {
  if (!MV_CACHE.has(page)) {
    const p = mvFetchPage(page).catch(() => { MV_CACHE.delete(page); return [] as MvAyah[]; });
    MV_CACHE.set(page, p);
  }
  return MV_CACHE.get(page)!;
};

const mvSurah = (n: number) => SURAHS.find((s: any) => s.num === n || s.id === n);

/** halves = [startHalf, endHalf] (0 = first half, 1 = second half). Words outside are dimmed. */
function MushafTextPage({ page, fontSize = 26, halves }: { page: number; fontSize?: number; halves?: [number, number] }) {
  const [ayahs, setAyahs] = useState<MvAyah[] | null>(null);

  useEffect(() => {
    let alive = true;
    setAyahs(null);
    mvLoad(page).then((a) => { if (alive) setAyahs(a); });
    return () => { alive = false; };
  }, [page]);

  if (ayahs === null) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={MV_GOLD} /></div>;
  }
  if (!ayahs.length) {
    return <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Could not load this page — check your internet connection.</div>;
  }

  // ── which half does each word belong to? (by real mushaf line when known, otherwise by word count)
  const flat = ayahs.flatMap((a) => a.words);
  const maxLine = Math.max(0, ...flat.map((w) => w.line));
  const splitLine = Math.ceil(maxLine / 2);
  const halfOfWord = (w: MvWord, idx: number) =>
    maxLine > 0 ? (w.line <= splitLine ? 0 : 1) : (idx < flat.length / 2 ? 0 : 1);
  const partial = !!halves && !(halves[0] === 0 && halves[1] === 1);
  const inPortion = (h: number) => !partial || (h >= halves![0] && h <= halves![1]);
  let running = 0;

  const first = mvSurah(ayahs[0].surahNum) as any;
  const last = mvSurah(ayahs[ayahs.length - 1].surahNum) as any;

  const renderAyah = (a: MvAyah, i: number) => {
    let lastHalf = 0;
    return (
      <React.Fragment key={i}>
        {a.words.map((w, wi) => {
          const h = halfOfWord(w, running++);
          lastHalf = h;
          return (
            <React.Fragment key={wi}>
              <span style={{ display: "inline-block", margin: "0 1px", color: "#000", opacity: inPortion(h) ? 1 : 0.2, transition: "opacity .2s" }}>{w.t}</span>{" "}
            </React.Fragment>
          );
        })}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%",
          border: `1.5px solid ${MV_GOLD}`, background: "#fffdf6", fontSize: 10, color: MV_GOLD, fontFamily: "'Amiri',serif",
          margin: "0 4px", verticalAlign: "middle", lineHeight: 1, opacity: inPortion(lastHalf) ? 1 : 0.2, WebkitTextStroke: "0",
        }}>{a.numberInSurah}</span>{" "}
      </React.Fragment>
    );
  };

  return (
    <div style={{
      background: "#fdf8ee", borderRadius: 4, border: `3px solid ${MV_GOLD}cc`, position: "relative", overflow: "hidden",
      boxShadow: `0 0 0 6px #fdf8ee, 0 0 0 7px ${MV_GOLD}66, 0 6px 28px rgba(0,0,0,.18)`,
      fontFamily: "'Amiri Quran','Amiri',serif", margin: "8px 7px",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>

      {["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => (
        <div key={c} style={{
          position: "absolute", width: 18, height: 18, background: MV_GOLD, zIndex: 2,
          top: c.startsWith("top") ? -1 : undefined, bottom: c.startsWith("bottom") ? -1 : undefined,
          left: c.endsWith("left") ? -1 : undefined, right: c.endsWith("right") ? -1 : undefined,
          clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
        }} />
      ))}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 0 4px",
        background: `linear-gradient(to bottom,${MV_GOLD}28,${MV_GOLD}08)`, borderBottom: `1px solid ${MV_GOLD}55`,
      }}>
        <span style={{ color: `${MV_GOLD}99`, fontSize: 14 }}>❧</span>
        <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, fontWeight: 700, color: MV_GOLD, letterSpacing: 2 }}>{page}</span>
        <span style={{ color: `${MV_GOLD}99`, fontSize: 14 }}>❧</span>
      </div>

      {first && (
        <div style={{
          textAlign: "center", padding: "3px 10px", fontSize: 12, fontWeight: 700, color: `${MV_GOLD}dd`,
          background: `linear-gradient(to right,transparent,${MV_GOLD}10,transparent)`, fontFamily: "'Amiri',serif",
        }}>
          {first.arabicName || first.nameAr}
          {last && last.num !== first.num ? ` — ${last.arabicName || last.nameAr}` : ""}
        </div>
      )}

      {partial && (
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#78350F", background: "#fbf3da", padding: "4px 0", fontFamily: "'Cairo',sans-serif" }}>
          Your portion: {halves![0] === halves![1] ? (halves![0] === 0 ? "first half of the page" : "second half of the page") : "whole page"}
        </div>
      )}
      <div style={{ height: 1, background: `linear-gradient(to right,transparent,${MV_GOLD}88,transparent)`, margin: "0 14px" }} />

      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ direction: "rtl", textAlign: "justify", lineHeight: 2.6, fontSize, letterSpacing: 0, wordBreak: "normal", overflowWrap: "normal", color: "#000", WebkitTextStroke: "0.6px #000", textRendering: "optimizeLegibility" as any }}>
          {ayahs.map(renderAyah)}
        </div>
      </div>

      <div style={{ height: 1, background: `linear-gradient(to right,transparent,${MV_GOLD}88,transparent)`, margin: "0 14px" }} />
      <div style={{ padding: "5px 0", textAlign: "center", color: `${MV_GOLD}99`, fontSize: 12, letterSpacing: 6 }}>❦</div>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────────────────────
   Real printed Madinah Mushaf page (Hafs, KFGQPC layout) as vector SVG.
   Source: quran-ws/quran-svg (github.com/quran-ws/quran-svg), served from cdn.quran.ws.
   The SVG is loaded inline (inside a shadow root so its CSS can't leak) and cropped to its real
   ink area, so the page always fills the width. If that fails we use a plain <img>, and if the
   image fails too, the text renderer above.
   ───────────────────────────────────────────────────────────────────────────── */
const MV_CDN = "https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc";

const mvClean = (raw: string): string | null => {
  try {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
    svg.querySelectorAll("script,foreignObject").forEach((n) => n.remove());
    svg.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((a) => {
        const n = a.name.toLowerCase();
        const v = a.value.trim().toLowerCase();
        if (n.startsWith("on") || ((n === "href" || n === "xlink:href") && v.startsWith("javascript:"))) el.removeAttribute(a.name);
      });
    });
    return new XMLSerializer().serializeToString(svg);
  } catch { return null; }
};

type MvBox = { x: number; y: number; w: number; h: number };
export type MvAyahRef = { surah: number; ayah: number };

const MV_POLY = ".ayahPolygon, path[ayah]";
/** The shipped SVG contains a transparent polygon per ayah with surah/ayah attributes (and a SSSAAA `number`). */
const mvAyahOf = (el: Element): MvAyahRef | null => {
  let sNum = parseInt(el.getAttribute("surah") || "", 10);
  let aNum = parseInt(el.getAttribute("ayah") || "", 10);
  if (!(sNum > 0 && aNum > 0)) {
    const n = el.getAttribute("number") || el.getAttribute("data-number") || "";
    if (/^\d{4,6}$/.test(n)) { const v = parseInt(n, 10); sNum = Math.floor(v / 1000); aNum = v % 1000; }
  }
  return sNum > 0 && aNum > 0 ? { surah: sNum, ayah: aNum } : null;
};

/** Render the SVG to a small canvas: find the true extent of the dark ink and sample the page's own background colour. */
const mvMeasureInk = (svgText: string, vb: MvBox): Promise<{ box: MvBox | null; bg: string | null }> =>
  new Promise((resolve) => {
    let url = "";
    const done = (box: MvBox | null, bg: string | null) => { if (url) URL.revokeObjectURL(url); resolve({ box, bg }); };
    try {
      url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      const img = new Image();
      img.onload = () => {
        try {
          const W = 420;
          const H = Math.max(1, Math.round((W * vb.h) / vb.w));
          const c = document.createElement("canvas");
          c.width = W; c.height = H;
          const ctx = c.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
          ctx.drawImage(img, 0, 0, W, H);
          const px = ctx.getImageData(3, 3, 1, 1).data;
          const bg = px[3] > 200 ? `rgb(${px[0]},${px[1]},${px[2]})` : null;
          const d = ctx.getImageData(0, 0, W, H).data;
          let minX = W, minY = H, maxX = -1, maxY = -1;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const k = (y * W + x) * 4;
              if (d[k + 3] > 80 && (d[k] + d[k + 1] + d[k + 2]) / 3 < 150) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < 0) return done(null, bg);
          done({
            x: vb.x + (minX / W) * vb.w, y: vb.y + (minY / H) * vb.h,
            w: ((maxX - minX + 1) / W) * vb.w, h: ((maxY - minY + 1) / H) * vb.h,
          }, bg);
        } catch { done(null, null); }
      };
      img.onerror = () => done(null, null);
      img.src = url;
    } catch { done(null, null); }
  });


/* ── Pages come from OUR Cloudflare R2 bucket (edge function `mushaf-page`), not browser storage.
   Only a small in-memory cache of recent pages is kept, and the neighbouring pages are fetched ahead of
   time so swiping stays instant. If the function is unreachable we fall back to the public CDN. ─────── */
const mvSrc = (page: number) => `${MV_CDN}/${String(Math.min(604, Math.max(1, Math.round(page)))).padStart(3, "0")}.svg`;
const mvPageOf = (src: string) => parseInt((src.match(/(\d{3})\.svg$/) || [])[1] || "1", 10);

// Optional: public URL of the tahleem-mushaf bucket (custom domain or r2.dev), e.g. https://mushaf.example.com
// Set VITE_MUSHAF_PUBLIC_URL in Vercel to load pages straight from R2 (fastest, browser-cached).
const MV_PUBLIC = ((import.meta as any).env?.VITE_MUSHAF_PUBLIC_URL as string | undefined)?.replace(/\/+$/, "");

const mvWithTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

async function mvFetchSvg(src: string): Promise<string> {
  const pg = mvPageOf(src);
  if (MV_PUBLIC) {
    try {
      const r = await mvWithTimeout(fetch(`${MV_PUBLIC}/svg/hafs-kfqc/${String(pg).padStart(3, "0")}.svg`), 8000);
      if (r.ok) { const t = await r.text(); if (t.includes("<svg")) return t; }
    } catch { /* fall through to function */ }
  }
  try {
    const { data, error } = await mvWithTimeout(supabase.functions.invoke("mushaf-page", { body: { page: pg } }), 8000);
    if (!error && data) {
      const txt = typeof data === "string" ? data : data instanceof Blob ? await data.text() : "";
      if (txt.includes("<svg")) return txt;
    }
  } catch { /* fall through to CDN */ }
  const r = await fetch(src);
  if (!r.ok) throw new Error("http");
  return r.text();
}

type MvPrep = { clean: string; box: MvBox | null; bg: string | null };
const MV_PREP = new Map<string, Promise<MvPrep>>();
/** fetch (cache → network) + sanitise + measure ink, once per page; keeps only the ~24 most recent pages in memory */
function mvPrep(src: string): Promise<MvPrep> {
  const hit = MV_PREP.get(src);
  if (hit) { MV_PREP.delete(src); MV_PREP.set(src, hit); return hit; }
  const p = mvFetchSvg(src).then(async (raw) => {
    const clean = mvClean(raw);
    if (!clean) throw new Error("svg");
    const el = new DOMParser().parseFromString(clean, "image/svg+xml").documentElement;
    const nums = (el.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const ow = parseFloat(el.getAttribute("width") || "");
    const oh = parseFloat(el.getAttribute("height") || "");
    const vb: MvBox | null = nums.length === 4 && nums[2] > 0 && nums.every((n) => !isNaN(n))
      ? { x: nums[0], y: nums[1], w: nums[2], h: nums[3] }
      : ow > 0 && oh > 0 ? { x: 0, y: 0, w: ow, h: oh } : null;
    const m = vb ? await mvMeasureInk(clean, vb) : { box: null, bg: null };
    return { clean, box: m.box, bg: m.bg } as MvPrep;
  });
  p.catch(() => { if (MV_PREP.get(src) === p) MV_PREP.delete(src); });
  MV_PREP.set(src, p);
  while (MV_PREP.size > 24) MV_PREP.delete(MV_PREP.keys().next().value as string);
  return p;
}
/** warm the pages around `page` so the next swipe is instant */
function mvPrefetchAround(page: number): () => void {
  const timers = [1, -1, 2, 3, 4, -2].map((d, i) => {
    const n = page + d;
    return n < 1 || n > 604 ? 0 : window.setTimeout(() => { mvPrep(mvSrc(n)).catch(() => {}); }, 60 + 140 * i);
  });
  return () => timers.forEach((t) => t && clearTimeout(t));
}

/** fitHeight: pixels of screen NOT available to the page (bars, buttons). When set, the whole page is fitted to the screen height. */
export default function MushafPageView({ page, fontSize = 26, halves, fitHeight, seamless, pureWhite, availableHeight, maxStretch = 1.2, onBackground, highlight, selected, onAyahClick, onUnavailable }: {
  page: number; fontSize?: number; halves?: [number, number]; fitHeight?: number;
  /** force a pure white page with pure black ink (recolours the printed SVG) */
  pureWhite?: boolean;
  /** full-screen mode: pixel height the page may use. The page fills it, stretching vertically by at most `maxStretch`; if it would be taller than this it is narrowed instead so it never scrolls */
  availableHeight?: number;
  maxStretch?: number;
  /** no card, shadow or rounded corners — the page blends into whatever is behind it */
  seamless?: boolean;
  /** called with the page's own background colour so the surrounding screen can use the same one */
  onBackground?: (css: string) => void;
  /** ayah that is currently playing / being read — drawn in gold behind the text */
  highlight?: MvAyahRef | null;
  /** ayah the user selected — drawn in soft green behind the text */
  selected?: MvAyahRef | null;
  /** tap on an ayah (inline mode only) */
  onAyahClick?: (surah: number, ayah: number) => void;
  /** called when the interactive printed page can't be used (offline, blocked, no ayah layer) so the caller can show its own reader */
  onUnavailable?: () => void;
}) {
  const safe = Math.min(604, Math.max(1, Math.round(Number(page) || 1)));
  const src = `${MV_CDN}/${String(safe).padStart(3, "0")}.svg`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"loading" | "inline" | "img" | "text">("loading");
  const [imgReady, setImgReady] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [bg, setBg] = useState(pureWhite ? "#ffffff" : "#fffdf6");
  const [boxW, setBoxW] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unavailRef = useRef(onUnavailable);
  unavailRef.current = onUnavailable;
  const [winH, setWinH] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    let alive = true;
    setMode("loading");
    setImgReady(false);
    mvPrep(src)
      .then((prep) => {
        if (!alive) return;
        const clean = prep.clean;
        const host = hostRef.current;
        if (!clean || !host) { setMode("img"); return; }
        const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
        root.innerHTML = clean;
        const st = document.createElement("style");
        st.textContent =
          "svg *{pointer-events:none}" +
          ".ayahPolygon,path[ayah]{pointer-events:all;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
          ".hl-sel{fill:rgba(6,78,59,.16)!important;fill-opacity:1!important}" +
          ".hl-play{fill:rgba(201,168,76,.42)!important;fill-opacity:1!important}";
        root.appendChild(st);
        if (pureWhite) {
          // Printed SVG ships brown-ish ink on cream. Push every dark fill/stroke to #000 and every
          // near-white fill to #fff. Ayah hit-polygons and mid-tone ornaments are left alone.
          const rgb = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a] = m[1].split(",").map((x) => parseFloat(x)); return { avg: (r + g + b) / 3, a: a === undefined ? 1 : a }; };
          root.querySelectorAll("path,rect,circle,ellipse,polygon,polyline,line,text,tspan").forEach((el) => {
            if (el.matches(MV_POLY)) return;
            const cs = getComputedStyle(el);
            const f = rgb(cs.fill);
            if (f && f.a > 0.05) {
              if (f.avg < 150) (el as SVGElement).style.setProperty("fill", "#000", "important");
              else if (f.avg > 225) (el as SVGElement).style.setProperty("fill", "#fff", "important");
            }
            const sk = rgb(cs.stroke);
            if (sk && sk.a > 0.05 && sk.avg < 150) (el as SVGElement).style.setProperty("stroke", "#000", "important");
          });
        }
        if (!root.querySelector(MV_POLY)) unavailRef.current?.(); // no ayah layer → caller falls back to its own reader
        const svg = root.querySelector("svg") as SVGSVGElement | null;
        if (!svg) { setMode("img"); return; }
        // page box in user units (viewBox, or width/height when there is none)
        const vbl = svg.viewBox && svg.viewBox.baseVal;
        const ow = parseFloat(svg.getAttribute("width") || "");
        const oh = parseFloat(svg.getAttribute("height") || "");
        const vb: MvBox | null =
          vbl && vbl.width > 0 ? { x: vbl.x, y: vbl.y, w: vbl.width, h: vbl.height }
          : ow > 0 && oh > 0 ? { x: 0, y: 0, w: ow, h: oh } : null;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.display = "block";
        if (vb) svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

        const apply = (b: MvBox) => {
          const pad = Math.max(b.w, b.h) * 0.012;
          svg.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`);
          setAspect((b.w + 2 * pad) / (b.h + 2 * pad));
        };
        (async () => {
          const m = { box: prep.box, bg: prep.bg }; // real dark-ink extent + page colour (measured once, cached)
          let box: MvBox | null = m.box;
          if (!alive) return;
          if (pureWhite) { setBg("#ffffff"); onBackground?.("#ffffff"); }
          else if (m.bg) { setBg(m.bg); onBackground?.(m.bg); }
          if (!box) {
            try { const b = svg.getBBox(); if (b.width > 10 && b.height > 10) box = { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { /* ignore */ }
          }
          if (box) apply(box);
          else if (vb) setAspect(vb.w / vb.h);
          setMode("inline");
        })();
      })
      .catch(() => { if (alive) { setMode("img"); unavailRef.current?.(); } });
    return () => { alive = false; };
  }, [src, pureWhite]);

  // once this page is up, quietly fetch its neighbours
  useEffect(() => mvPrefetchAround(safe), [safe]);

  // track the width the page can use (parent box)
  useEffect(() => {
    const parent = wrapRef.current?.parentElement;
    if (!parent) return;
    const upd = () => setBoxW(parent.clientWidth);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // paint playing / selected ayah
  useEffect(() => {
    const root = hostRef.current?.shadowRoot;
    if (!root || mode !== "inline") return;
    root.querySelectorAll(MV_POLY).forEach((el) => {
      const a = mvAyahOf(el);
      el.classList.toggle("hl-play", !!a && !!highlight && a.surah === highlight.surah && a.ayah === highlight.ayah);
      el.classList.toggle("hl-sel", !!a && !!selected && a.surah === selected.surah && a.ayah === selected.ayah);
    });
  }, [mode, src, highlight?.surah, highlight?.ayah, selected?.surah, selected?.ayah]);

  useEffect(() => { if (mode === "img" || mode === "text") unavailRef.current?.(); }, [mode]);

  const handleClick = (e: React.MouseEvent) => {
    if (!onAyahClick) return;
    const t = (e.nativeEvent.composedPath?.()[0] || e.target) as Element;
    const poly = t && (t as any).closest ? (t as Element).closest(MV_POLY) : null;
    const a = poly ? mvAyahOf(poly) : null;
    if (a) onAyahClick(a.surah, a.ayah);
  };

  const zoom = Math.min(1.8, Math.max(0.8, fontSize / 26)); // A− / A+ zooms the page (26 = fit to width)
  // full-screen mode: fill availableHeight (stretch up to maxStretch), or narrow the page if it is too tall
  let fillW: number | undefined;
  let fillH: number | undefined;
  if (availableHeight && aspect && boxW && zoom <= 1) {
    const naturalH = boxW / aspect;
    if (naturalH > availableHeight) fillW = Math.floor(availableHeight * aspect);
    else fillH = Math.round(naturalH * Math.min(maxStretch, availableHeight / naturalH));
  }

  // apply (or clear) the vertical stretch on the inline SVG
  useEffect(() => {
    const svg = hostRef.current?.shadowRoot?.querySelector("svg") as SVGSVGElement | null;
    if (!svg || mode !== "inline") return;
    if (fillH) { svg.setAttribute("preserveAspectRatio", "none"); svg.style.height = `${fillH}px`; }
    else { svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); svg.style.height = "auto"; }
  }, [fillH, mode, aspect, src]);

  if (mode === "text") return <MushafTextPage page={safe} fontSize={fontSize} halves={halves} />;

  const partial = !!halves && !(halves[0] === 0 && halves[1] === 1);
  const dimTop = partial && halves![0] === 1;      // portion is the 2nd half → fade the top
  const dimBottom = partial && halves![1] === 0;   // portion is the 1st half → fade the bottom
  const shown = mode === "inline" || (mode === "img" && imgReady);
  const fitW = fitHeight && aspect && zoom <= 1 ? Math.floor(Math.max(200, winH - fitHeight) * aspect * zoom) : undefined;
  const fade = bg.startsWith("rgb(") ? bg.replace("rgb(", "rgba(").replace(")", ",.88)") : "rgba(253,248,238,.88)";

  return (
    <div ref={wrapRef} style={{ margin: seamless ? "0 auto" : "8px auto 12px", width: "100%", maxWidth: fillW ?? fitW }}>
      <div style={{ overflowX: zoom > 1 ? "auto" : "visible", borderRadius: seamless ? 0 : 6, boxShadow: seamless ? "none" : "0 4px 24px rgba(0,0,0,.14)", background: bg }}>
        <div style={{ position: "relative", width: `${zoom * 100}%`, minHeight: shown ? undefined : 420 }}>
          {!shown && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 className="animate-spin" color={MV_GOLD} size={28} />
            </div>
          )}

          {/* inline SVG lives in a shadow root inside this host */}
          <div ref={hostRef} onClick={handleClick} style={mode === "inline" ? { display: "block" } : { visibility: "hidden", position: "absolute", left: 0, top: 0, width: "100%", height: 0, overflow: "hidden" }} />

          {mode === "img" && (
            <img
              key={src}
              src={src}
              alt={`Madinah Mushaf page ${safe}`}
              draggable={false}
              onLoad={() => setImgReady(true)}
              onError={() => setMode("text")}
              style={{ display: imgReady ? "block" : "none", width: "100%", height: "auto", userSelect: "none", WebkitUserSelect: "none" }}
            />
          )}

          {shown && dimTop && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "50%", background: fade, pointerEvents: "none" }} />}
          {shown && dimBottom && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "50%", background: fade, pointerEvents: "none" }} />}
          {shown && partial && (
            <div style={{
              position: "absolute", left: "50%", transform: "translateX(-50%)", ...(dimTop ? { top: "calc(50% + 6px)" } : { top: 8 }),
              padding: "4px 11px", borderRadius: 999, background: "rgba(253,248,238,.96)", border: `1px solid ${MV_GOLD}99`, color: "#78350F",
              fontSize: 11, fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,.12)", pointerEvents: "none", whiteSpace: "nowrap",
            }}>
              {halves![0] === halves![1] ? (halves![0] === 0 ? "Your portion: top half" : "Your portion: bottom half") : "Your portion"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
