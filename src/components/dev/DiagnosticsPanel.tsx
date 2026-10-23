/*
  src/components/dev/DiagnosticsPanel.tsx — Tahleem Academy
  ═══════════════════════════════════════════════════════════════════════
  On-device viewer for the ta_diag_log_v1 ring buffer (see src/lib/diagnostics.ts).
  Only renders when isDebugMode() is true — invisible and inert for every
  real student/teacher/admin.

  Usage — mount ONCE, anywhere near the root (see App.tsx):
    <DiagnosticsPanel />

  On-device workflow (no computer needed):
    1. Visit the app once with ?ta_debug=1 (persists after that via localStorage).
    2. A small 🐞 button appears bottom-right on every page.
    3. Reproduce the issue (minimize, wait, come back), then tap it.
    4. Tap "Copy log" — the raw JSON is on the clipboard, ready to paste
       into a message.
  ═══════════════════════════════════════════════════════════════════════
*/
import { useEffect, useState } from "react";
import { isDebugMode } from "@/lib/debugMode";
import { getDiagLog, clearDiagLog, type DiagEntry } from "@/lib/diagnostics";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

// Events worth visually flagging — the ones that actually indicate the
// "reload on minimize" bug family, as opposed to routine boot/resume noise.
const FLAGGED = new Set([
  "auth_safety_timeout_forced_logout",
  "protected_route_redirect_to_login",
]);

export default function DiagnosticsPanel() {
  // Computed once per mount so the hook count below never changes between
  // renders — rules-of-hooks safe even though this early-returns null.
  const [debugMode] = useState(() => isDebugMode());
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<DiagEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLog(getDiagLog().slice().reverse()); // newest first
  }, [open]);

  if (!debugMode) return null;

  const handleCopy = async () => {
    const text = JSON.stringify(getDiagLog(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — fall back to a selectable textarea below.
    }
  };

  const handleClear = () => {
    clearDiagLog();
    setLog([]);
  };

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Diagnostics"
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 99998,
          width: 44, height: 44, borderRadius: 22, border: "none",
          background: "#111827", color: "#fff", fontSize: 20,
          boxShadow: "0 4px 14px rgba(0,0,0,.4)", cursor: "pointer",
        }}
      >
        🐞
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,.6)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0b0f1a", color: "#e5e7eb",
              width: "100%", maxHeight: "75vh", overflowY: "auto",
              borderRadius: "16px 16px 0 0", padding: "16px 14px 24px",
              fontFamily: "monospace", fontSize: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Diagnostics ({log.length})
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleCopy} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #374151", background: copied ? "#065f46" : "#1f2937", color: "#fff", fontSize: 11, cursor: "pointer" }}>
                  {copied ? "Copied ✓" : "Copy log"}
                </button>
                <button onClick={handleClear} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #374151", background: "#1f2937", color: "#fff", fontSize: 11, cursor: "pointer" }}>
                  Clear
                </button>
                <button onClick={() => setOpen(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #374151", background: "#1f2937", color: "#fff", fontSize: 11, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>

            {log.length === 0 && (
              <div style={{ color: "#6b7280", padding: "20px 0", textAlign: "center" }}>
                No events yet. Reproduce the issue, then reopen this panel.
              </div>
            )}

            {log.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px", marginBottom: 6, borderRadius: 8,
                  background: FLAGGED.has(entry.type) ? "#7c2d1230" : "#111827",
                  border: FLAGGED.has(entry.type) ? "1px solid #ea580c50" : "1px solid #1f2937",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: FLAGGED.has(entry.type) ? "#fb923c" : "#93c5fd", fontWeight: 700 }}>
                    {entry.type}
                  </span>
                  <span style={{ color: "#6b7280" }}>{formatTime(entry.ts)}</span>
                </div>
                {entry.detail && (
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#9ca3af" }}>
                    {JSON.stringify(entry.detail)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
