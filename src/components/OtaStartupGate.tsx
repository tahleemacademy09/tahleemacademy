import { useEffect, useState } from "react";
import { RefreshCw, Download } from "lucide-react";
import { applyOta, getOtaReady, getOtaProgress, type OtaReady, type OtaProgress } from "@/lib/otaUpdate";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Full-screen update screen shown on top of everything when the app opens (phone app only).
 * Step 1: "Downloading update" with MB downloaded / total and a progress bar.
 * Step 2: "Update ready" with the "Update now" button.
 */
export default function OtaStartupGate() {
  const [info, setInfo] = useState<OtaReady | null>(getOtaReady());
  const [prog, setProg] = useState<OtaProgress | null>(getOtaProgress());
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const onReady = () => setInfo(getOtaReady());
    const onProgress = () => setProg(getOtaProgress());
    window.addEventListener("ta:ota-ready", onReady);
    window.addEventListener("ta:ota-progress", onProgress);
    return () => {
      window.removeEventListener("ta:ota-ready", onReady);
      window.removeEventListener("ta:ota-progress", onProgress);
    };
  }, []);

  if ((!info && !prog) || dismissed) return null;

  const onUpdate = async () => {
    setBusy(true);
    try {
      const applied = await applyOta();
      if (!applied) { setWaiting(true); setBusy(false); }
    } catch {
      setBusy(false);
    }
  };

  const shell: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 999999, background: "#0f2d1f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", fontFamily: "'Cairo',system-ui,sans-serif" };
  const keyframes = <style>{`@keyframes ta-ota-spin{to{transform:rotate(360deg)}}@keyframes ta-ota-shine{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style>;

  // ── Step 1: downloading ────────────────────────────────────────────────────
  if (!info && prog) {
    const pct = Math.round(Math.max(0, Math.min(100, prog.percent)));
    const total = prog.totalBytes;
    const done = total ? (total * pct) / 100 : undefined;
    return (
      <div role="alertdialog" aria-live="polite" style={shell}>
        {keyframes}
        <Download size={52} color="#c9a84c" />
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>Downloading update</div>
        <div style={{ color: "#d8c895", fontSize: 15, marginTop: 10, maxWidth: 320, lineHeight: 1.6 }}>
          {prog.notes?.split("\n")[0].slice(0, 120) || "Please keep the app open while the new version downloads."}
        </div>

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

  // ── Step 2: ready to install ───────────────────────────────────────────────
  return (
    <div role="alertdialog" aria-live="assertive" style={shell}>
      {keyframes}
      <RefreshCw size={52} color="#c9a84c" style={busy ? { animation: "ta-ota-spin 1s linear infinite" } : undefined} />
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>{busy ? "Installing update" : "Update ready"}</div>
      <div style={{ color: "#d8c895", fontSize: 15, marginTop: 10, maxWidth: 320, lineHeight: 1.6 }}>
        {waiting ? "It'll apply as soon as your class or exam finishes." : busy ? "Almost done — the app will restart in a moment." : info?.notes?.split("\n")[0].slice(0, 120) || "A new version of Tahleem Academy is ready."}
      </div>
      {!waiting && (
        <button onClick={onUpdate} disabled={busy} style={{ marginTop: 28, background: "#c9a84c", color: "#0f2d1f", border: "none", borderRadius: 12, padding: "14px 40px", fontWeight: 800, fontSize: 16, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Updating…" : "Update now"}
        </button>
      )}
      {/* MANDATORY: no "Later" — students must update before using the app */}
    </div>
  );
}
