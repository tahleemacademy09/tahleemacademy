// src/components/ErrorBoundary.tsx
// Fixed:
// • ChunkLoadError (Vite lazy chunk 404 after Vercel redeploy) → auto-reloads silently
// • ChunkLoadError after a deployment → auto-reloads once silently
// • Runtime errors never hard-reload the active page; they show the error UI
// • Prevents reload loop: per-error key in sessionStorage so each unique error only
//   triggers one auto-reload. Clears automatically after 60 s.

import React from "react";
import { isDebugMode } from "@/lib/debugMode";

interface State {
  hasError:      boolean;
  error:         Error | null;
  didAutoReload: boolean;
}

function isChunkError(err: Error | null): boolean {
  if (!err) return false;
  const msg = err.message || "";
  const name = err.name   || "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS") ||
    msg.includes("Loading chunk") ||
    msg.includes("Load failed")
  );
}

/** Stable key for this particular error so we only auto-reload once per error. */
function errorKey(err: Error | null): string {
  if (!err) return "unknown";
  // Chunk-load errors embed a content-hashed filename that changes on every
  // deploy, so keying on the raw message let a new deploy's stale-chunk
  // error bypass the "only reload once" guard every single time — looking
  // like an infinite reload loop instead of a single self-healing reload.
  // Bucket all chunk errors under one stable key regardless of which hash.
  if (isChunkError(err)) return "eb_reloaded_chunk_load_error";
  // FIX (silent infinite reload loop — looks exactly like a stuck spinner):
  // this used to key on the raw first 60 chars of err.message. If the SAME
  // underlying bug's message happens to embed anything that varies between
  // occurrences (a record id, a UUID, a count, a timestamp), every single
  // occurrence produces a different key — so "alreadyReloaded" never matches,
  // and the app reload-loops forever, each cycle showing the "Updating…"
  // spinner for ~400ms before crashing and reloading again. To the user this
  // is indistinguishable from a spinner that never resolves. Strip out the
  // common shapes of dynamic content BEFORE truncating so repeat occurrences
  // of the same bug always collapse to the same key.
  const normalized = (err.message || err.name || "err")
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "UUID")
    .replace(/\b\d+\b/g, "N")
    .slice(0, 60);
  return `eb_reloaded_${err.name || "Error"}_${normalized}`.replace(/\W+/g, "_");
}

// FIX (belt-and-suspenders): no matter what causes errorKey() to be unstable
// (a bug we haven't anticipated, a third-party error format, etc.), the app
// must NEVER be able to auto-reload silently more than a handful of times in
// a row. Once this cap is hit, we always fall through to the persistent
// "Something went wrong" screen with the real error details instead of
// reloading again — so a loop can, at worst, flash the spinner a few times
// and then stop and show the user (and us) what's actually happening.
const MAX_AUTO_RELOADS = 3;
const RELOAD_COUNT_KEY = "eb_reload_count";
const RELOAD_COUNT_TS_KEY = "eb_reload_count_ts";
const RELOAD_COUNT_WINDOW_MS = 60_000;

function getRecentReloadCount(): number {
  try {
    const ts = Number(sessionStorage.getItem(RELOAD_COUNT_TS_KEY) || "0");
    if (!ts || Date.now() - ts > RELOAD_COUNT_WINDOW_MS) return 0;
    return Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || "0");
  } catch {
    return 0;
  }
}
function bumpRecentReloadCount(): void {
  try {
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(getRecentReloadCount() + 1));
    sessionStorage.setItem(RELOAD_COUNT_TS_KEY, String(Date.now()));
  } catch {}
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, didAutoReload: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error.name, error.message, info.componentStack);

    // If caller supplied a fallback (e.g. null for the classroom overlay),
    // don't auto-reload — just render the fallback silently.
    if (this.props.fallback !== undefined) return;

    // ── Debug bypass ─────────────────────────────────────────────────────
    // Add ?ta_debug=1 to the URL (or run `localStorage.setItem('ta_debug','1')`
    // in the console once) to skip the auto-reload entirely and see the real
    // error on screen immediately, with full stack trace. Remove/unset to
    // restore normal auto-reload behavior for real users.
    if (isDebugMode()) {
      console.error("[ErrorBoundary] ta_debug=1 — auto-reload skipped, showing error:", error.stack);
      return; // falls through to render() persistent-error screen below
    }

    const key = errorKey(error);
    const alreadyReloaded = sessionStorage.getItem(key);
    const recentReloads = getRecentReloadCount();

    // A hard reload is a valid recovery only for a stale lazy-loaded chunk
    // after deployment. Reloading for an ordinary React error destroys page
    // state and, on Android resume, was perceived as the student page
    // remounting. Runtime failures now stop at the boundary so the current URL
    // and saved state remain intact and the underlying error stays observable.
    if (isChunkError(error) && !alreadyReloaded && recentReloads < MAX_AUTO_RELOADS) {
      sessionStorage.setItem(key, Date.now().toString());
      bumpRecentReloadCount();
      setTimeout(() => sessionStorage.removeItem(key), 60_000);
      setTimeout(() => window.location.reload(), 400);
      this.setState({ didAutoReload: true });
      return;
    }

    if (isChunkError(error) && recentReloads >= MAX_AUTO_RELOADS) {
      console.error(
        "[ErrorBoundary] Hit MAX_AUTO_RELOADS — stopping auto-reload loop and " +
        "showing the persistent error screen. This means the SAME crash kept " +
        "recurring immediately after each reload:", error.name, error.message
      );
    }
    // Falls through to render()'s persistent-error screen below.
  }

  handleReload = () => {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith("eb_"))
      .forEach(k => sessionStorage.removeItem(k));
    window.location.reload();
  };

  render() {
    const { hasError, error, didAutoReload } = this.state;

    if (!hasError) return this.props.children;

    // If a fallback was supplied, render it silently (no crash screen, no reload)
    if (this.props.fallback !== undefined) return this.props.fallback;

    const debugMode = isDebugMode();

    // Show spinner while auto-reload is in progress (never in debug mode —
    // we want the error screen with full details immediately).
    if (!debugMode && didAutoReload) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh",
          fontFamily: "'Cairo', -apple-system, sans-serif", background: "#f0faf4",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "4px solid #064E3B", borderTopColor: "transparent",
            animation: "eb_spin .7s linear infinite", marginBottom: 16,
          }} />
          <style>{`@keyframes eb_spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#064E3B", fontSize: 14, fontWeight: 600 }}>
            Updating… please wait
          </p>
        </div>
      );
    }

    // Persistent error — show friendly screen with manual reload
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", padding: 32,
        fontFamily: "'Cairo', -apple-system, sans-serif",
        background: "#f0faf4", textAlign: "center",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg,#064E3B,#0a7c5c)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20, fontSize: 34, boxShadow: "0 8px 24px rgba(6,78,59,.25)",
        }}>
          📖
        </div>
        <h2 style={{ color: "#064E3B", fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
          Something went wrong
        </h2>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 28px", maxWidth: 320, lineHeight: 1.6 }}>
          The page encountered an unexpected error. Tapping reload usually fixes this.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: "13px 32px", borderRadius: 14, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#064E3B,#0a7c5c)",
            color: "#fff", fontSize: 15, fontWeight: 700,
            boxShadow: "0 4px 14px rgba(6,78,59,.3)",
          }}
        >
          Reload Page
        </button>
        {error?.message && (
          <details style={{ marginTop: 28, maxWidth: 480, textAlign: "left" }} open={debugMode}>
            <summary style={{ color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
              ▶ Error details
            </summary>
            <pre style={{
              marginTop: 8, padding: "10px 14px", borderRadius: 10,
              background: "#f3f4f6", color: "#4b5563", fontSize: 11,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            }}>
              {error.name}: {error.message}
              {debugMode && error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
