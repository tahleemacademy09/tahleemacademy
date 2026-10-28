// src/components/AppUpdateBanner.tsx
//
// Top banner shown when a newer Android app release is available (see
// useAppRelease for exactly what counts as an "update"). Dismissing it hides
// it for that version only — a newer release brings it back. Never shown in
// the middle of a live class or exam (same lock the web update banner uses).

import { useEffect, useState } from "react";
import { Download, X, Loader2 } from "lucide-react";
import { useAppRelease } from "@/hooks/useAppRelease";
import { isReloadSafe, onReloadSafe } from "@/lib/reloadGuard";
import { useToast } from "@/hooks/use-toast";

const dismissKey = (code: number) => `tahleem_app_update_dismissed_${code}`;

export default function AppUpdateBanner() {
  const { latest, hasUpdate, isNative, download } = useAppRelease();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [safe, setSafe] = useState(isReloadSafe());

  useEffect(() => {
    const t = setInterval(() => setSafe(isReloadSafe()), 4000);
    const off = onReloadSafe(() => setSafe(true));
    return () => { clearInterval(t); off(); };
  }, []);

  useEffect(() => {
    if (!latest) return;
    try { setDismissed(localStorage.getItem(dismissKey(latest.version_code)) === "1"); }
    catch { setDismissed(false); }
  }, [latest]);

  // Inside the native app the update is mandatory — see ForceUpdateGate.
  if (isNative || !latest || !hasUpdate || dismissed || !safe) return null;

  const onDownload = async () => {
    setBusy(true);
    try { await download(); }
    catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const onDismiss = () => {
    try { localStorage.setItem(dismissKey(latest.version_code), "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: 12, right: 12, zIndex: 99997,
        maxWidth: 520, margin: "0 auto",
        background: "linear-gradient(135deg,#0b1f3a,#12305a)",
        border: "1px solid #c9a84c", borderRadius: 14,
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,.35)", fontFamily: "'Cairo',system-ui,sans-serif",
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>⭐</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
          {isNative ? "New app update available" : "A newer app version is available"}
        </div>
        <div style={{ color: "#d8c895", fontSize: 12, marginTop: 2 }}>
          Version {latest.version_name}
          {latest.release_notes ? ` — ${latest.release_notes.split("\n")[0].slice(0, 70)}` : ""}
        </div>
      </div>
      <button
        onClick={onDownload}
        disabled={busy}
        style={{
          background: "#c9a84c", color: "#0b1f3a", border: "none", borderRadius: 10,
          padding: "8px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Update
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: "transparent", border: "none", color: "#d8c895", cursor: "pointer", padding: 4, lineHeight: 1 }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
