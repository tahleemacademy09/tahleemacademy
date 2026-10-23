// src/components/UpdateAvailableBanner.tsx
//
// Shown when a new deploy has installed and is waiting to take over. Nothing
// is ever applied automatically while the user is doing something — see
// src/main.tsx (ta:update-available / ta:apply-update) and
// src/lib/reloadGuard.ts for the locking mechanics.

import { useEffect, useState } from "react";
import { isReloadSafe } from "@/lib/reloadGuard";

export default function UpdateAvailableBanner() {
  const [visible, setVisible] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const onAvailable = () => setVisible(true);
    window.addEventListener("ta:update-available", onAvailable);
    return () => window.removeEventListener("ta:update-available", onAvailable);
  }, []);

  if (!visible) return null;

  const safe = isReloadSafe();

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 99998,
        background: "#0f2d1f",
        border: "1px solid #c9a84c",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 12px 32px rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>✨</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
          A new version of Tahleem Academy is ready
        </div>
        <div style={{ color: "#d8c895", fontSize: 12.5, marginTop: 2 }}>
          {requested && !safe
            ? "It'll apply as soon as your class or exam finishes."
            : "Update now, or it'll apply next time you reopen the app."}
        </div>
      </div>
      {!(requested && !safe) && (
        <button
          onClick={() => {
            setRequested(true);
            window.dispatchEvent(new Event("ta:apply-update"));
          }}
          style={{
            background: "#c9a84c",
            color: "#0f2d1f",
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Update
        </button>
      )}
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "#d8c895",
          fontSize: 18,
          cursor: "pointer",
          padding: 4,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
