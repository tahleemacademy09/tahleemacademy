// src/components/ForceUpdateGate.tsx
//
// Mandatory update screen for the Android app. When a newer published release
// exists than the installed build, the app itself does not render at all —
// only this screen, with no dismiss button. It goes away when the new build
// is installed (the app restarts on the new version).
//
// Only exception: it waits while a live class or exam is running (the same
// reloadGuard lock the other update banners use) and appears the moment that
// ends.
//
// Offline: the newest required build is remembered on the device, so someone
// who already knows about an update can't skip it by turning on airplane mode.

import { useEffect, useState, type ReactNode } from "react";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { useAppRelease, formatBytes, startReleaseDownload } from "@/hooks/useAppRelease";
import { isReloadSafe, onReloadSafe } from "@/lib/reloadGuard";
import AppUpdateProgress from "@/components/AppUpdateProgress";

const LS_REQ = "tahleem_required_build";
const readReq = (): number => {
  try { const n = parseInt(localStorage.getItem(LS_REQ) || "", 10); return Number.isFinite(n) ? n : 0; }
  catch { return 0; }
};

export default function ForceUpdateGate({ children }: { children: ReactNode }) {
  const { latest, fetched, isNative, isAndroid, installedBuild, inApp, updater, download } = useAppRelease();
  const [safe, setSafe] = useState(isReloadSafe());
  const [fallbackBusy, setFallbackBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSafe(isReloadSafe()), 3000);
    const off = onReloadSafe(() => setSafe(true));
    return () => { clearInterval(t); off(); };
  }, []);

  // Remember what the server said (overwrites, so unpublishing a release un-blocks people).
  useEffect(() => {
    if (!isNative || !fetched) return;
    try {
      if (latest) localStorage.setItem(LS_REQ, String(latest.version_code));
      else localStorage.removeItem(LS_REQ);
    } catch { /* ignore */ }
  }, [isNative, fetched, latest]);

  const enforce = isNative && isAndroid;
  const target = latest ? latest.version_code : fetched ? 0 : readReq();
  const blocked = enforce && installedBuild != null && target > installedBuild;

  if (!blocked || !safe) return <>{children}</>;

  const busy = updater.phase === "signing" || updater.phase === "downloading";
  const label =
    updater.phase === "ready" || updater.phase === "installing" ? "Install now"
    : updater.phase === "needs-permission" ? "Open settings"
    : updater.phase === "error" ? "Try again"
    : "Download & install";

  const onUpdate = async () => {
    if (inApp) {
      try { await download(); } catch { /* shown by AppUpdateProgress */ }
      return;
    }
    // This APK predates in-app installs: one-time fallback through the browser.
    if (!latest) return;
    setFallbackBusy(true);
    try { await startReleaseDownload(latest); } catch { /* ignore */ }
    finally { setFallbackBusy(false); }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000,
        background: "linear-gradient(160deg,#052e22,#064E3B 55%,#075E54)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        fontFamily: "'Cairo',system-ui,sans-serif", overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <img src="/icons/icon-96x96.png" alt="" style={{ width: 76, height: 76, borderRadius: 20, boxShadow: "0 8px 28px rgba(0,0,0,.35)" }} />
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#c9a84c", fontWeight: 800, fontSize: 13 }}>
          <ShieldAlert size={16} /> UPDATE REQUIRED
        </div>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: "8px 0 6px" }}>A new version is ready</h1>
        <p style={{ color: "#d8c895", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          You need to update Tahleem Academy before you can continue.
          {latest ? ` Version ${latest.version_name}${latest.file_size ? ` · ${formatBytes(latest.file_size)}` : ""}.` : ""}
          {" "}Your account and data stay as they are.
        </p>

        {latest?.release_notes && (
          <div style={{ marginTop: 16, textAlign: "left", background: "rgba(255,255,255,.07)", border: "1px solid rgba(201,168,76,.35)", borderRadius: 14, padding: "12px 14px", color: "#fff", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>
            <div style={{ color: "#c9a84c", fontWeight: 800, fontSize: 12, marginBottom: 4 }}>What's new</div>
            {latest.release_notes}
          </div>
        )}

        <button
          onClick={onUpdate}
          disabled={busy || fallbackBusy || !latest}
          style={{
            marginTop: 20, width: "100%", padding: 16, borderRadius: 14, border: "none",
            background: "#c9a84c", color: "#052e22", fontWeight: 900, fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            cursor: busy ? "default" : "pointer", opacity: busy || fallbackBusy ? 0.7 : 1,
          }}
        >
          {busy || fallbackBusy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          {busy ? "Downloading…" : label}
        </button>

        <AppUpdateProgress s={updater} light />

        {!inApp && (
          <p style={{ marginTop: 14, color: "#d8c895", fontSize: 12, lineHeight: 1.6 }}>
            When the download finishes, open it. If Android asks, allow installs from your browser, then tap <strong>Install</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
