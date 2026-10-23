import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { applyOta, getOtaReady, type OtaReady } from "@/lib/otaUpdate";

export default function OtaUpdateBanner() {
  const [info, setInfo] = useState<OtaReady | null>(getOtaReady());
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onReady = () => setInfo(getOtaReady());
    window.addEventListener("ta:ota-ready", onReady);
    return () => window.removeEventListener("ta:ota-ready", onReady);
  }, []);

  if (!info) return null;

  const onUpdate = async () => {
    setBusy(true);
    try {
      const applied = await applyOta();
      if (!applied) setWaiting(true);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", zIndex: 99998, maxWidth: 480, margin: "0 auto", background: "#0f2d1f", border: "1px solid #c9a84c", borderRadius: 14, padding: "14px 16px", boxShadow: "0 12px 32px rgba(0,0,0,.35)", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <RefreshCw size={22} color="#c9a84c" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Update ready</div>
        <div style={{ color: "#d8c895", fontSize: 12.5, marginTop: 2 }}>
          {waiting ? "It'll apply as soon as your class or exam finishes." : info.notes?.split("\n")[0].slice(0, 80) || "Tap Update to get the latest changes."}
        </div>
      </div>
      {!waiting && (
        <button onClick={onUpdate} disabled={busy} style={{ background: "#c9a84c", color: "#0f2d1f", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Updating…" : "Update"}
        </button>
      )}
      <button onClick={() => setInfo(null)} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: "#d8c895", cursor: "pointer", padding: 4, lineHeight: 1 }}>
        <X size={18} />
      </button>
    </div>
  );
}
