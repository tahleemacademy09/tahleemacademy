// Route-chunk preloading: every page is a lazy chunk, so the FIRST click on a
// page used to download its JS (visible "loading"). We now warm the chunks for
// the user's own area in the background right after login, so clicks are instant.
import { lazy, type ComponentType } from "react";

type Loader = () => Promise<{ default: ComponentType<any> }>;
const groups: Record<string, Loader[]> = {};
const done = new Set<Loader>();

export const lazyRoute = (group: string, loader: Loader) => {
  (groups[group] ||= []).push(loader);
  return lazy(loader);
};

const slowConnection = () => {
  const c = (navigator as any).connection;
  return !!c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""));
};

const idle = (fn: () => void) =>
  (window as any).requestIdleCallback ? (window as any).requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 600);

export const preloadGroups = (names: string[]) => {
  if (typeof window === "undefined" || slowConnection()) return;
  const queue = names.flatMap((n) => groups[n] || []).filter((l) => !done.has(l));
  const next = () => {
    const l = queue.shift();
    if (!l) return;
    done.add(l);
    l().catch(() => done.delete(l)).finally(() => idle(next)); // one at a time, only when idle
  };
  idle(next);
};
