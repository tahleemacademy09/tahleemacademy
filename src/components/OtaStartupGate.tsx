import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { applyOta, getOtaReady, type OtaReady } from "@/lib/otaUpdate";

/** Full-screen "Update ready" shown on top of everything when the app opens (phone app only). */
export default function OtaStartupGate() {
  const [info, setInfo] = useState<OtaReady | null>(getOtaReady());
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const onReady = () => setInfo(getOtaReady());
    window.addEventListener("ta:ota-ready", onReady);
    return () => window.removeEventListener("ta:ota-ready", onReady);
  }, []);

  if (!info || dismissed) return null;

  const onUpdate = async () => {
    setBusy(true);
    try {
      const applied = await applyOta();
      if (!applied) { setWaiting(true); setBusy(false); }
    } catch {
      setBusy(false);
    }
  };

  return (
    <div role="alertdialog" aria-live="assertive" style={{ position: "fixed", inset: 0, zIndex: 999999, background: "#0f2d1f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <RefreshCw size={52} color="#c9a84c" />
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginTop: 20 }}>Update ready</div>
      <div style={{ color: "#d8c895", fontSize: 15, marginTop: 10, maxWidth: 320, lineHeight: 1.6 }}>
        {waiting ? "It'll apply as soon as your class or exam finishes." : info.notes?.split("\n")[0].slice(0, 120) || "A new version of Tahleem Academy is ready."}
      </div>
      {!waiting && (
        <button onClick={onUpdate} disabled={busy} style={{ marginTop: 28, background: "#c9a84c", color: "#0f2d1f", border: "none", borderRadius: 12, padding: "14px 40px", fontWeight: 800, fontSize: 16, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Updating…" : "Update now"}
        </button>
      )}
      <button onClick={() => setDismissed(true)} style={{ marginTop: 14, background: "transparent", border: "none", color: "#d8c895", fontSize: 14, padding: 8 }}>
        Later
      </button>
    </div>
  );
}
