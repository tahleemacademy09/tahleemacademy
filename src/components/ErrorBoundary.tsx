// src/components/ErrorBoundary.tsx
// Fixed:
// • ChunkLoadError (Vite lazy chunk 404 after Vercel redeploy) → auto-reloads silently
// • ANY React runtime error → auto-reloads once silently (e.g. React error #310)
// • Second error after reload → shows friendly UI with Reload button
// • Prevents reload loop: per-error key in sessionStorage so each unique error only
//   triggers one auto-reload. Clears automatically after 60 s.

import React from "react";

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
  // Use first 60 chars of message to keep key manageable
  return `eb_reloaded_${(err.message || err.name || "err").slice(0, 60).replace(/\W+/g, "_")}`;
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

    const key = errorKey(error);
    const alreadyReloaded = sessionStorage.getItem(key);

    if (!alreadyReloaded) {
      sessionStorage.setItem(key, Date.now().toString());
      setTimeout(() => sessionStorage.removeItem(key), 60_000);
      setTimeout(() => window.location.reload(), 400);
      this.setState({ didAutoReload: true });
      return;
    }
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

    // Show spinner while auto-reload is in progress
    if (didAutoReload || !sessionStorage.getItem(errorKey(error))) {
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
          <details style={{ marginTop: 28, maxWidth: 480, textAlign: "left" }}>
            <summary style={{ color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
              ▶ Error details
            </summary>
            <pre style={{
              marginTop: 8, padding: "10px 14px", borderRadius: 10,
              background: "#f3f4f6", color: "#4b5563", fontSize: 11,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            }}>
              {error.name}: {error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
