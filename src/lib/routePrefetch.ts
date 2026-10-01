/* src/lib/routePrefetch.ts
   ────────────────────────────────────────────────────────────────────
   Makes page changes feel instant by downloading a page's code BEFORE
   the user taps on it.

   1. INTENT  — hover (desktop) / touch-start / pointer-down on any internal
                link prefetches that page's chunk immediately.
   2. IDLE    — a few seconds after load, while the browser is idle, the
                pages linked in the sidebar/nav are quietly warmed one at a
                time (never in parallel, never on Data Saver / 2G).
   ──────────────────────────────────────────────────────────────────── */
import { routeLoaders } from "./routeLoaders";

const done = new Set<string>();

function normalise(href: string): string | null {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  } catch { return null; }
}

export function prefetchRoute(href: string): Promise<unknown> | undefined {
  const path = normalise(href);
  if (!path || done.has(path)) return;
  const loader = routeLoaders[path];
  if (!loader) return;
  done.add(path);
  return loader().catch(() => { done.delete(path); }); // allow retry if offline
}

function slowConnection(): boolean {
  const c = (navigator as any).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ""));
}

const idle = (fn: () => void) =>
  "requestIdleCallback" in window
    ? (window as any).requestIdleCallback(fn, { timeout: 4000 })
    : setTimeout(fn, 300);

/** Warm the pages linked in the current nav, sequentially, when idle. */
function warmVisibleNav() {
  if (slowConnection() || document.visibilityState !== "visible") return;
  const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='/']"))
    .map(a => normalise(a.getAttribute("href") || ""))
    .filter((p): p is string => !!p && !done.has(p) && !!routeLoaders[p]);
  const queue = Array.from(new Set(hrefs)).slice(0, 12);
  const next = () => {
    const p = queue.shift();
    if (!p) return;
    prefetchRoute(p)?.finally(() => idle(next)) ?? idle(next);
  };
  idle(next);
}

let started = false;
export function initRoutePrefetch() {
  if (started || typeof window === "undefined") return;
  started = true;

  const onIntent = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (a) prefetchRoute(a.getAttribute("href") || "");
  };
  document.addEventListener("pointerover",  onIntent, { passive: true, capture: true });
  document.addEventListener("touchstart",   onIntent, { passive: true, capture: true });
  document.addEventListener("pointerdown",  onIntent, { passive: true, capture: true });

  // Warm the nav once the page has settled, and again after each route change
  // (the sidebar for a different role/section may have just appeared).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(warmVisibleNav, 2500); };
  schedule();
  window.addEventListener("popstate", schedule);
  const origPush = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const r = origPush.apply(this, args); schedule(); return r;
  };
}
