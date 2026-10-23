/*
  src/pages/student/StudentApp.tsx — "Get the App"
  Shows the latest Android release (version, size, what's new) with a real
  download button. Inside the native app it compares the installed build with
  the latest release and tells the student whether they're up to date.
*/
import { useState } from "react";
import { Download, Smartphone, CheckCircle2, Star, Loader2, Share, Plus } from "lucide-react";
import { useAppRelease, formatBytes } from "@/hooks/useAppRelease";
import { useToast } from "@/hooks/use-toast";

const G = "#064E3B";
const G2 = "#075E54";
const GOLD = "#c9a84c";

export default function StudentApp() {
  const { latest, loading, hasUpdate, upToDate, isNative, isAndroid, installedBuild, download } = useAppRelease();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    try { await download(); }
    catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: 18, border: "1px solid #F0F0F0",
    padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,.04)",
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 40px", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/icons/icon-96x96.png" alt="Tahleem" style={{ width: 64, height: 64, borderRadius: 18, boxShadow: `0 4px 16px ${G}33` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>Tahleem Academy for Android</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>
            {loading ? "Checking for the latest version…" : latest ? `Version ${latest.version_name}${latest.file_size ? ` · ${formatBytes(latest.file_size)}` : ""}` : "No app release yet"}
          </div>
        </div>
        {hasUpdate && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, background: `${GOLD}22`, color: "#8a6d1c", fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 20 }}>
            <Star size={12} fill={GOLD} color={GOLD} /> NEW
          </span>
        )}
      </div>

      {!loading && !latest && (
        <div style={{ ...card, marginTop: 14, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          <Smartphone size={28} style={{ margin: "0 auto 8px", color: G }} />
          The Android app isn't available yet. You'll be notified here as soon as it is.
        </div>
      )}

      {latest && (
        <>
          <div style={{ ...card, marginTop: 14 }}>
            {isNative && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 14,
                color: hasUpdate ? "#8a6d1c" : G,
              }}>
                {hasUpdate ? <Star size={16} fill={GOLD} color={GOLD} /> : <CheckCircle2 size={16} />}
                {hasUpdate
                  ? `A newer version is available${installedBuild ? ` (you have build ${installedBuild})` : ""}`
                  : "You have the latest version"}
              </div>
            )}

            {isNative && upToDate ? (
              <button disabled style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "#E5E7EB", color: "#6B7280", fontWeight: 800, fontSize: 15 }}>
                Up to date
              </button>
            ) : isAndroid || isNative ? (
              <button
                onClick={onDownload}
                disabled={busy}
                style={{
                  width: "100%", padding: 16, borderRadius: 14, border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg,${G},${G2})`, color: "#fff", fontWeight: 800, fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: `0 8px 24px ${G}40`,
                }}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                {isNative ? "Download the update" : "Download the app (APK)"}
              </button>
            ) : (
              <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                The app is an Android download. Open this page on an Android phone to get it.
                <div style={{ marginTop: 12, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 12, padding: 12, color: "#374151" }}>
                  <strong style={{ color: G }}>On iPhone?</strong> In Safari tap <Share size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Share → <Plus size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Add to Home Screen.
                </div>
              </div>
            )}

            {(isAndroid || isNative) && !upToDate && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
                When the download finishes, open it. If Android asks, allow installs from your browser, then tap <strong>Install</strong>.
                Your account and data stay as they are.
              </div>
            )}
          </div>

          {latest.release_notes && (
            <div style={{ ...card, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111", marginBottom: 8 }}>What's new in {latest.version_name}</div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{latest.release_notes}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
