// src/components/ErrorBoundary.tsx
// Fixed:
// • ChunkLoadError (Vite lazy chunk 404 after Vercel redeploy) → auto-reloads once
//   silently so users never see the error screen for a deploy-related failure
// • Other errors → friendly UI with Reload button + error details for debugging
// • Prevents reload loop: marks in sessionStorage so it only auto-reloads once per error

import React from "react";

interface State {
  hasError:    boolean;
  error:       Error | null;
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

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, didAutoReload: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error.name, error.message, info.componentStack);

    // Auto-reload once for chunk errors (Vercel redeploy invalidates old chunks)
    if (isChunkError(error)) {
      const reloadKey = "eb_chunk_reloaded";
      const alreadyReloaded = sessionStorage.getItem(reloadKey);
      if (!alreadyReloaded) {
        sessionStorage.setItem(reloadKey, "1");
        // Small delay so the render cycle settles before reload
        setTimeout(() => window.location.reload(), 300);
        this.setState({ didAutoReload: true });
        return;
      }
    }
  }

  handleReload = () => {
    sessionStorage.removeItem("eb_chunk_reloaded");
    window.location.reload();
  };

  render() {
    const { hasError, error, didAutoReload } = this.state;

    if (!hasError) return this.props.children;

    // Show a minimal spinner while auto-reloading for chunk errors
    if (didAutoReload || isChunkError(error)) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh",
          fontFamily: "'Cairo', sans-serif", background: "#f9fafb",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "3px solid #064E3B", borderTopColor: "transparent",
            animation: "spin .7s linear infinite", marginBottom: 16,
          }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Updating app… please wait</p>
        </div>
      );
    }

    // Generic error screen
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", padding: 32,
        fontFamily: "'Cairo', sans-serif", background: "#f9fafb", textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: "linear-gradient(135deg,#0f2d1f,#1a4731)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20, fontSize: 28,
        }}>
          📖
        </div>
        <h2 style={{ color: "#0f2d1f", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
          Something went wrong
        </h2>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px", maxWidth: 320 }}>
          The page encountered an unexpected error. Reloading usually fixes this.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: "12px 28px", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#0f2d1f,#1a4731)",
            color: "#fff", fontSize: 14, fontWeight: 700,
          }}
        >
          Reload Page
        </button>
        {error?.message && (
          <details style={{ marginTop: 24, maxWidth: 480, textAlign: "left" }}>
            <summary style={{ color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
              Error details
            </summary>
            <pre style={{
              marginTop: 8, padding: "10px 12px", borderRadius: 8,
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
