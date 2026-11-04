// src/hooks/useElementHeight.ts
// Live pixel height of an element (follows rotation, browser bars, A−/A+ …). Used to fit a whole Quran page
// into the space that is really available so it shows in full without scrolling.
import { useCallback, useEffect, useState } from "react";

export function useElementHeight<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [h, setH] = useState(0);
  const ref = useCallback((n: T | null) => setEl(n), []);
  useEffect(() => {
    if (!el) return;
    const read = () => setH(el.clientHeight);
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, h];
}
