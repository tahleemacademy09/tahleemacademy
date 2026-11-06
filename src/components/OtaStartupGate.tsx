import { useEffect, useState } from "react";
import { RefreshCw, Download } from "lucide-react";
import { applyOta, downloadOta, getOtaAvailable, getOtaReady, getOtaProgress, type OtaAvailable, type OtaReady, type OtaProgress } from "@/lib/otaUpdate";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Full-screen update screen shown on top of everything when the app opens (phone app only).
 * 1. "Update available" — shows the size in MB and waits for the user to tap "Update now".
 * 2. "Downloading update" — MB downloaded / total, progress bar.
 * 3. "Installing update" — applies automatically (the user already tapped).
 * If an update was downloaded earlier but not applied, step 1 reads "Update ready" and the tap applies it.
 */
export default function OtaStartupGate() {
  const [info, setInfo] = useState<OtaReady | null>(getOtaReady());
  const [avail, setAvail] = useState<OtaAvailable | null>(getOtaAvailable());
  const [prog, setProg] = useState<OtaProgress | null>(getOtaProgress());
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onReady = () => setInfo(getOtaReady());
    const onAvail = () => setAvail(getOtaAvailable());
    const onProgress = () => setProg(getOtaProgress());
    window.addEventListener("ta:ota-ready", onReady);
    window.addEventListener("ta:ota-available", onAvail);
    window.addEventListener("ta:ota-progress", onProgress);
    return () => {
      window.removeEventListener("ta:ota-ready", onReady);
      window.removeEventListener("ta:ota-available", onAvail);
      window.removeEventListener("ta:ota-progress", onProgress);
    };
  }, []);

  if (!info && !avail && !prog) return null;

  const onUpdate = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!getOtaReady()) await downloadOta();   // shows the progress screen while it downloads
      const applied = await applyOta();
      if (!applied) { setWaiting(true); setBusy(false); }
    } catch {
      setError("Download failed. Check your connection and try again.");
      setBusy(false);
    }
  };

  const shell: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 999999, background: "#0f2d1f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", fontFamily: "'Cairo',system-ui,sans-serif" };
  const keyframes = <style>{`@keyframes ta-ota-spin{to{transform:rotate(360deg)}}@keyframes ta-ota-shine{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style>;
  const sub: React.CSSProperties = { color: "#d8c895", fontSize: 15, marginTop: 10, maxWidth: 320, lineHeight: 1.6 };

  // ── Downloading (after the tap) ────────────────────────────────────────────
  if (prog) {
    const pct = Math.round(Math.max(0, Math.min(100, prog.percent)));
    const total = prog.totalBytes;
    const done = total ? (total * pct) / 100 : undefined;
    return (
      <div role="alertdialog" aria-live="polite" style={shell}>
        {keyframes}
        <Download size={52} color="#c9a84c" />
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>Downloading update</div>
        <div style={sub}>Please keep the app open while the new version downloads.</div>

        <div style={{ width: "100%", maxWidth: 320, marginTop: 28 }}>
          <div style={{ height: 12, borderRadius: 999, background: "rgba(201,168,76,.18)", overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${pct}%`, minWidth: pct > 0 ? 12 : 0, background: "#c9a84c", borderRadius: 999, transition: "width .3s ease", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)", animation: "ta-ota-shine 1.4s linear infinite" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, color: "#fff", fontSize: 14, fontWeight: 700 }}>
            <span>{total ? `${mb(done!)} / ${mb(total)} MB` : "Downloading…"}</span>
            <span style={{ color: "#c9a84c" }}>{pct}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Installing (download finished, applying) ───────────────────────────────
  if (busy && info) {
    return (
      <div role="alertdialog" aria-live="polite" style={shell}>
        {keyframes}
        <RefreshCw size={52} color="#c9a84c" style={{ animation: "ta-ota-spin 1s linear infinite" }} />
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>Installing update</div>
        <div style={sub}>Almost done — the app will restart in a moment.</div>
      </div>
    );
  }

  // ── Waiting for the user's tap ─────────────────────────────────────────────
  const downloaded = !!info;               // already on the phone → "ready"
  const notes = (info?.notes ?? avail?.notes)?.split("\n")[0].slice(0, 120);
  const total = avail?.totalBytes;
  return (
    <div role="alertdialog" aria-live="assertive" style={shell}>
      {keyframes}
      <RefreshCw size={52} color="#c9a84c" />
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>{downloaded ? "Update ready" : "Update available"}</div>
      <div style={sub}>
        {waiting ? "It'll apply as soon as your class or exam finishes." : notes || "A new version of Tahleem Academy is ready."}
      </div>
      {!waiting && !downloaded && total ? (
        <div style={{ marginTop: 14, color: "#c9a84c", fontWeight: 800, fontSize: 15 }}>Download size: {mb(total)} MB</div>
      ) : null}
      {error ? <div style={{ marginTop: 14, color: "#ff9d9d", fontSize: 14, maxWidth: 300 }}>{error}</div> : null}
      {!waiting && (
        <button onClick={onUpdate} disabled={busy} style={{ marginTop: 28, background: "#c9a84c", color: "#0f2d1f", border: "none", borderRadius: 12, padding: "14px 40px", fontWeight: 800, fontSize: 16, opacity: busy ? 0.7 : 1 }}>
          {error ? "Try again" : "Update now"}
        </button>
      )}
      {/* MANDATORY: no "Later" — students must update before using the app */}
    </div>
  );
}
