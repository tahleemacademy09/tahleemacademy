// src/components/ramadan/MushafPager.tsx
// Swipeable pager of printed Madinah Mushaf pages (same behaviour as the Daily Hifdh Revision pager).
// One page per slide, it fills the space it is given, only neighbouring slides are mounted, swipe only (no buttons).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import MushafPageView, { type MvAyahRef } from "@/components/hifdh/MushafPageView";

export type RevealProgress = Record<string, { m: number; n: number; f: number }>;
export type BlurRange = { from: MvAyahRef; to: MvAyahRef } | null;

const Slide = React.memo(function Slide({ page, height, show, first, onBg, coverUnrevealed, revealProgress, blurRange, onUnavailable }: {
  page: number; height: number; show: boolean; first: boolean; onBg?: (css: string) => void;
  coverUnrevealed?: boolean; revealProgress?: RevealProgress; blurRange?: BlurRange; onUnavailable?: () => void;
}) {
  return (
    <div style={{ flex: "0 0 100%", height: "100%", direction: "ltr", scrollSnapAlign: "center", scrollSnapStop: "always",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", contain: "layout paint" }}>
      {show && (
        <div style={{ width: "100%" }}>
          <MushafPageView page={page} seamless pureWhite availableHeight={height} maxStretch={1.4}
            coverUnrevealed={coverUnrevealed} revealProgress={revealProgress} blurRange={blurRange}
            onUnavailable={onUnavailable} onBackground={first ? onBg : undefined} />
        </div>
      )}
    </div>
  );
});

export default function MushafPager({ pages, viewIdx, onView, onBg, coverUnrevealed, revealProgress, blurRange, onUnavailable }: {
  pages: number[]; viewIdx: number; onView: (i: number) => void; onBg?: (css: string) => void;
  /** live recitation: hide the printed page and uncover it word by word following `revealProgress` ("surah:ayah" keys) */
  coverUnrevealed?: boolean; revealProgress?: RevealProgress;
  /** blur every ayah outside this range (the selected verses stay sharp) */
  blurRange?: BlurRange; onUnavailable?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const [cur, setCur] = useState(viewIdx);
  const curRef = useRef(viewIdx);
  const notifiedRef = useRef(viewIdx);
  const timerRef = useRef<number | null>(null);
  const lastW = useRef(0);

  // the page uses ALL the height it is given
  useLayoutEffect(() => {
    const box = boxRef.current; if (!box) return;
    const measure = () => {
      setH(Math.round(box.clientHeight));
      const sc = ref.current;
      if (sc && sc.clientWidth && sc.clientWidth !== lastW.current) {
        lastW.current = sc.clientWidth;
        sc.scrollLeft = -curRef.current * sc.clientWidth;
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const ro = new ResizeObserver(measure); ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) { lastW.current = el.clientWidth; el.scrollLeft = -viewIdx * el.clientWidth; } // RTL scroller: page 1 on the right
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the parent moved us (recitation reached the next page) — scroll there; ignore echoes of our own reports
  useEffect(() => {
    if (viewIdx === notifiedRef.current) return;
    notifiedRef.current = viewIdx; curRef.current = viewIdx; setCur(viewIdx);
    const el = ref.current;
    if (el) el.scrollTo({ left: -viewIdx * el.clientWidth, behavior: "smooth" });
  }, [viewIdx]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== curRef.current && i >= 0 && i < pages.length) { curRef.current = i; setCur(i); }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (notifiedRef.current !== curRef.current) { notifiedRef.current = curRef.current; onView(curRef.current); }
    }, 120);
  };

  return (
    <div ref={boxRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={ref} onScroll={onScroll}
        style={{ position: "absolute", inset: 0, display: "flex", direction: "rtl", overflowX: "auto", overflowY: "hidden",
          scrollSnapType: "x mandatory", overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none" as never, msOverflowStyle: "none" as never }}>
        {pages.map((pn, i) => (
          <Slide key={pn} page={pn} height={h} show={h > 0 && Math.abs(i - cur) <= 2} first={i === 0}
            onBg={onBg} coverUnrevealed={coverUnrevealed} revealProgress={revealProgress} blurRange={blurRange}
            onUnavailable={onUnavailable} />
        ))}
      </div>
    </div>
  );
}
