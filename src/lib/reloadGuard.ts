// src/lib/reloadGuard.ts
//
// A tiny global registry of "do not reload right now" locks.
//
// This is the safety net, not the primary fix — the primary fix is that
// sw.js no longer forces a reload in the first place (see sw.js v6 notes).
// This exists so that even a USER-INITIATED "update now" tap (or an
// opportunistic background update) can never land in the middle of a live
// class or an exam: anything that represents a sensitive, uninterruptible
// session should call lockReload() while it's active and unlockReload() when
// it ends.
//
// Usage:
//   useEffect(() => {
//     if (!inCall) return;
//     lockReload("live-class");
//     return () => unlockReload("live-class");
//   }, [inCall]);

const locks = new Set<string>();
const listeners = new Set<() => void>();

export function lockReload(id: string): void {
  locks.add(id);
}

export function unlockReload(id: string): void {
  locks.delete(id);
  if (locks.size === 0) listeners.forEach(cb => cb());
}

export function isReloadSafe(): boolean {
  return locks.size === 0;
}

/** Subscribe to be notified the moment all locks clear. Returns an unsubscribe fn. */
export function onReloadSafe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
