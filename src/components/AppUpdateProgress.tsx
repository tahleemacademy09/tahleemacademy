// Progress bar + status line for the in-app APK update. Used by the mandatory
// update screen and the "Get the App" page.
import { formatBytes } from "@/hooks/useAppRelease";
import type { UpdaterState } from "@/lib/apkUpdater";

export default function AppUpdateProgress({ s, light = false }: { s: UpdaterState; light?: boolean }) {
  if (s.phase === "idle") return null;
  const pct = s.total > 0 ? Math.min(100, Math.round((s.received / s.total) * 100)) : 0;
  const fg = light ? "#fff" : "#374151";
  const sub = light ? "#d8c895" : "#6B7280";

  let text = "";
  if (s.phase === "signing") text = "Preparing the download…";
  else if (s.phase === "downloading") text = s.total > 0 ? `Downloading… ${pct}% · ${formatBytes(s.received)} of ${formatBytes(s.total)}` : "Downloading…";
  else if (s.phase === "ready") text = "Downloaded. Tap Install to finish.";
  else if (s.phase === "installing") text = "Tap Install in the Android prompt to finish updating.";
  else if (s.phase === "needs-permission") text = "Allow “Install unknown apps” for Tahleem Academy, then come back here. The install will start by itself.";
  else if (s.phase === "error") text = s.error ?? "Something went wrong. Please try again.";

  const showBar = s.phase === "signing" || s.phase === "downloading" || s.phase === "ready" || s.phase === "installing";
  return (
    <div style={{ marginTop: 14 }}>
      {showBar && (
        <div style={{ height: 8, borderRadius: 8, background: light ? "rgba(255,255,255,.18)" : "#E5E7EB", overflow: "hidden" }}>
          <div
            style={{
              height: "100%", borderRadius: 8, background: "#c9a84c",
              width: s.phase === "downloading" ? `${pct}%` : s.phase === "signing" ? "8%" : "100%",
              transition: "width .2s linear",
            }}
          />
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: s.phase === "error" ? "#F87171" : (showBar ? fg : sub) }}>{text}</div>
    </div>
  );
}
