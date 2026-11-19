// src/components/ramadan/QcfMushafReveal.tsx
// Printed Madinah Mushaf pages for the live "Read & Reveal" test, drawn with the official per-page QCF fonts:
// every printed line is a row whose words are spread edge to edge, so each word keeps ONE fixed position on its
// line for the whole session — exactly like a physical Quran. Reading never moves a word: unrecited words are
// simply blurred in place and come into focus as they are recited.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { glyphFontFamily, glyphText, type GlyphLine } from "@/components/quran/mushafGlyphs";
import { SURAHS } from "@/components/hifdh/surahData";
import type { RevealState, RevealStatus } from "@/lib/revealEngine";
import type { QcfPlan } from "@/lib/qcfPlan";

const GOLD = "#c9a84c";
const AMIRI = "'Amiri Quran','Amiri','Noto Naskh Arabic',serif";
const TINT: Record<Exclude<RevealStatus, "pending" | "ok">, { fg: string; bg: string }> = {
  close:  { fg: "#78350f", bg: "#fef3c7" },
  wrong:  { fg: "#7f1d1d", bg: "#fee2e2" },
  missed: { fg: "#374151", bg: "#e5e7eb" },
};
const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const surahNameAr = (n: number) => SURAHS.find((s) => s.num === n)?.nameAr ?? "";

const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const MIN_GAP = 0.16;        // minimum space between two words, in em
const LINE_H = 1.9;          // printed line height, in em

export default function QcfMushafReveal({
  pageNumbers, pages, plan, view, started, showAll, mode, hintOn, peeked, onPeek,
}: {
  pageNumbers: number[];            // mushaf page number of each entry in `pages`
  pages: GlyphLine[][];
  plan: QcfPlan;
  view: RevealState;
  started: boolean;
  showAll: boolean;                 // keep the selected verses visible while reciting
  mode: "word" | "ayah";
  hintOn: boolean;
  peeked: Set<number>;
  onPeek: (i: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fs, setFs] = useState(24);

  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    const measure = () => setWidth(Math.max(0, el.clientWidth - 20));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the page to the screen width: the widest printed line (words + minimum gaps) must just fit.
  // Word widths scale linearly with the font size, so one measured correction is enough (repeated until stable).
  useLayoutEffect(() => {
    const el = boxRef.current; if (!el || !width) return;
    let widest = 0;
    el.querySelectorAll<HTMLElement>("[data-line='text']").forEach((row) => {
      const kids = Array.from(row.children) as HTMLElement[];
      const sum = kids.reduce((a, k) => a + k.offsetWidth, 0) + Math.max(0, kids.length - 1) * MIN_GAP * fs;
      if (sum > widest) widest = sum;
    });
    if (!widest) return;
    const next = Math.min(46, Math.max(12, (fs * width) / widest));
    if (Math.abs(next - fs) > 0.25) setFs(next);
  }, [width, fs, pages]);

  // keep the current word in view while reciting; before starting, show the first selected word WITH the surah
  // banner and Bismillah printed above it (they are separate lines, so scrolling to the word alone would hide them)
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const el = box.querySelector<HTMLElement>(`[data-w="${started ? view.cursor : 0}"]`);
    if (!el) return;
    if (started) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    let target: HTMLElement = (el.closest("[data-line]") as HTMLElement | null) ?? el;
    while ((target.previousElementSibling as HTMLElement | null)?.dataset.line === "head") target = target.previousElementSibling as HTMLElement;
    box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top - 6;
  }, [view.cursor, started, pages, fs, width]);

  const doneAyah = useMemo(() => {
    const m = new Map<number, boolean>();
    if (mode !== "ayah") return m;
    const last = new Map<number, number>();
    plan.words.forEach((w, i) => last.set(w.ayah, i));
    const rem = new Map<number, boolean>();
    plan.words.forEach((w, i) => { if (view.status[i] === "pending") rem.set(w.ayah, true); });
    last.forEach((_, a) => m.set(a, !rem.get(a)));
    return m;
  }, [plan, view.status, mode]);

  const hidden = (ei: number) => {
    if (!started || showAll || peeked.has(ei)) return false;
    if (view.status[ei] === "pending") return true;
    return mode === "ayah" && !doneAyah.get(plan.words[ei].ayah);
  };

  const lineStyle = (centered: boolean): CSSProperties => ({
    display: "flex", flexDirection: "row", direction: "rtl", flexWrap: "nowrap",
    justifyContent: centered ? "center" : "space-between", gap: centered ? `${0.34}em` : 0,
    width, height: `${LINE_H}em`, lineHeight: `${LINE_H}em`, alignItems: "center", margin: "0 auto",
  });

  return (
    <div ref={boxRef} style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#fffdf8", padding: "10px 10px 30px" }}>
      {pages.map((lines, pi) => {
        if (!plan.usedPages.has(pi)) return null;
        const pageNo = pageNumbers[pi];
        const family = `${glyphFontFamily(pageNo)}, ${AMIRI}`;
        return (
          <div key={pageNo} dir="rtl" style={{ width, margin: "0 auto 18px", fontSize: fs, color: "#000", borderBottom: "1px solid #eadfc2", paddingBottom: 10 }}>
            {lines.map((line, li) => {
              if (line.type === "surah-header") {
                return (
                  <div key={li} data-line="head" style={{ ...lineStyle(true), justifyContent: "center", fontFamily: AMIRI }}>
                    <div style={{ width: "86%", height: "82%", display: "grid", placeItems: "center", border: `1.5px solid ${GOLD}`, borderRadius: "0.3em", background: "#fbf3d9", fontSize: "0.82em", lineHeight: 1 }}>
                      سُورَةُ {surahNameAr(line.surah ?? 0).replace(/^سورة\s*/, "")}
                    </div>
                  </div>
                );
              }
              if (line.type === "basmalah") {
                return <div key={li} data-line="head" style={{ ...lineStyle(true), fontFamily: AMIRI, fontSize: "0.9em", justifyContent: "center" }}>{BISMILLAH}</div>;
              }
              const centered = line.endsSurah || pageNumbers[pi] <= 2;
              return (
                <div key={li} data-line="text" style={lineStyle(centered)}>
                  {line.words.map((w, wi) => {
                    const key = `${pi}:${li}:${wi}`;
                    const ei = plan.idx.get(key);
                    const endIdx = plan.endAfter.get(key);
                    const selected = ei !== undefined || endIdx !== undefined || plan.ungraded.has(key);
                    const style: CSSProperties = { flex: "0 0 auto", fontFamily: family, whiteSpace: "nowrap", borderRadius: "0.12em", transition: "filter .25s, background .25s, opacity .25s" };
                    let onClick: (() => void) | undefined;
                    let dataW: number | undefined;
                    if (!selected) {
                      style.filter = "blur(2.5px)"; style.opacity = 0.35;                   // other verses on the page
                    } else if (ei !== undefined) {
                      dataW = ei;
                      const st = view.status[ei];
                      const isCur = started && ei === view.cursor;
                      const bad = isCur && view.blocked;
                      if (hidden(ei)) { style.filter = "blur(7px)"; style.opacity = 0.55; onClick = () => onPeek(ei); }
                      else if (started && !showAll && st !== "pending" && st !== "ok") { style.color = TINT[st as keyof typeof TINT].fg; style.background = TINT[st as keyof typeof TINT].bg; }
                      if (peeked.has(ei) && st === "pending") style.outline = "2px dashed #d97706";
                      if (isCur) style.background = "#fff2bf";
                      if (bad) { style.background = "#fecaca"; style.outline = "2px solid #dc2626"; }
                    } else if (endIdx !== undefined) {
                      // verse-end sign: appears together with the last word of its verse
                      const shown = !started || showAll || endIdx < 0 || (view.status[endIdx] !== "pending" && !hidden(endIdx));
                      if (!shown) { style.filter = "blur(7px)"; style.opacity = 0.55; }
                    }
                    const isHintWord = ei !== undefined && started && ei === view.cursor && hintOn && hidden(ei);
                    return (
                      <span key={wi} data-w={dataW} onClick={onClick} style={style}>
                        {isHintWord ? <span style={{ fontFamily: AMIRI, color: "#000", filter: "none" }}>{plan.words[ei!].text.slice(0, 2)}…</span> : glyphText(w.code)}
                      </span>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ textAlign: "center", fontFamily: AMIRI, fontSize: "0.5em", color: "#8a7a4a", marginTop: 6 }}>{toArabicDigits(pageNo)}</div>
          </div>
        );
      })}
    </div>
  );
}
