/*
  src/lib/diagnostics.ts — Tahleem Academy
  ═══════════════════════════════════════════════════════════════════════
  A permanent, on-device event log for exactly this class of bug — "why
  did the app reload/bounce just now" — so it can be answered from the
  phone alone, without plugging into a computer for remote DevTools.

  WHAT IT RECORDS (ring buffer, last 60 events, in localStorage):
    • "boot"    — main.tsx executed. This ONLY happens on a real document
                  load (first launch OR a genuine reload) — SPA route
                  changes never re-run main.tsx. Captures the Navigation
                  Timing API's `type` field, which tells you definitively
                  whether THIS load was a fresh navigation, a reload, or
                  back/forward — plus how long the app was in the
                  background right before it happened.
    • "resume"  — the tab/WebView became visible again after being
                  hidden. Happens on every minimize→return, whether or
                  not a reload occurs. Recorded with the hidden duration.
    • "hidden"  — the tab/WebView was minimized/backgrounded.
    • custom app-level events other modules push via logDiag(), e.g.
      AuthContext's safety-timeout firing, or ProtectedRoute bouncing to
      /login — see the call sites for exact event names.

  HOW TO READ IT ON-DEVICE (no computer needed):
    1. Open the app with ?ta_debug=1 once (or run
       localStorage.setItem('ta_debug','1') once via remote console) —
       persists after that.
    2. A small 🐞 button appears bottom-right. Reproduce the issue
       (minimize, wait, come back), then tap it.
    3. The panel lists every event in order with timestamps. "Copy log"
       puts the raw JSON on the clipboard — paste it straight into a
       message to hand off for diagnosis.

  A "boot" entry with navType "reload" sitting right after a "hidden" /
  "resume" pair confirms a REAL OS-level reload happened (Android killed
  the process — see useAppStateRestore.ts). If instead you only see
  app-level events (e.g. auth_safety_timeout_forced_logout) with no
  matching "boot", the page never actually reloaded — it was a client-side
  race (redirect bounce) that only looked like one. These need different
  fixes, and this log is what tells you which one you're looking at.
  ═══════════════════════════════════════════════════════════════════════
*/

const LOG_KEY = "ta_diag_log_v1";
const LAST_HIDDEN_KEY = "ta_diag_last_hidden_at";
const MAX_ENTRIES = 60;

export interface DiagEntry {
  ts: number;       // epoch ms
  type: string;
  detail?: Record<string, unknown>;
}

function safeGetLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota / private mode — drop silently */ }
}

export function getDiagLog(): DiagEntry[] {
  try {
    return JSON.parse(safeGetLocal(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearDiagLog(): void {
  safeSetLocal(LOG_KEY, "[]");
}

export function logDiag(type: string, detail?: Record<string, unknown>): void {
  try {
    const log = getDiagLog();
    log.push({ ts: Date.now(), type, detail });
    while (log.length > MAX_ENTRIES) log.shift();
    safeSetLocal(LOG_KEY, JSON.stringify(log));
  } catch {
    /* never let logging itself break the app */
  }
}

/**
 * Call ONCE from main.tsx, as early as possible. Records how THIS
 * document load happened (fresh nav / reload / back-forward) and how
 * long the app was backgrounded beforehand, then wires up hidden/resume
 * tracking for the rest of this session.
 */
export function initDiagnostics(): void {
  try {
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const navType = navEntries[0]?.type ?? "unknown";
    const lastHiddenAt = Number(safeGetLocal(LAST_HIDDEN_KEY) || "0");
    const bgDurationMs = lastHiddenAt ? Date.now() - lastHiddenAt : null;

    logDiag("boot", {
      navType,                                   // "navigate" | "reload" | "back_forward" | "unknown"
      path: location.pathname + location.search,
      referrer: document.referrer || null,
      bgDurationMs,                               // null on true first launch this device has ever recorded
    });
  } catch {
    /* ignore */
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      safeSetLocal(LAST_HIDDEN_KEY, String(Date.now()));
      logDiag("hidden", { path: location.pathname });
    } else if (document.visibilityState === "visible") {
      const lastHiddenAt = Number(safeGetLocal(LAST_HIDDEN_KEY) || "0");
      logDiag("resume", {
        path: location.pathname,
        hiddenForMs: lastHiddenAt ? Date.now() - lastHiddenAt : null,
      });
    }
  });
}
