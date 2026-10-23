/* src/components/settings/PushBlockedHelp.tsx
   ────────────────────────────────────────────────────────────────────
   Shown when the browser has notifications set to "blocked".

   A website cannot override a browser block — once Chrome/Safari says
   "denied", Notification.requestPermission() returns "denied" instantly
   without asking. So the best we can do is:
     1. Give a short, exact 3-step guide.
     2. Detect the moment the user allows it (Permissions API change event,
        plus a re-check when they come back to the tab) and turn push on
        automatically — no refresh, no second tap.
     3. Offer a manual "Check again" button as a fallback.
   ──────────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { enablePushNotifications } from "@/components/NotificationPermissionBanner";

interface Props {
  userId: string;
  dark?: boolean;
  /** Called after the user allowed notifications and push was subscribed. */
  onEnabled: () => void;
}

export default function PushBlockedHelp({ userId, dark = false, onEnabled }: Props) {
  const [checking, setChecking] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);
  const done = useRef(false);

  const recheck = useCallback(async (manual = false) => {
    if (done.current || typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      if (manual) setStillBlocked(true);
      return;
    }
    setChecking(true);
    // "granted" (user allowed it) or "default" (block was cleared → browser will ask)
    const result = await enablePushNotifications(userId);
    setChecking(false);
    if (result === "granted") {
      done.current = true;
      onEnabled();
    } else if (manual) {
      setStillBlocked(true);
    }
  }, [userId, onEnabled]);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => { void recheck(); };
    const onVisible = () => { if (document.visibilityState === "visible") void recheck(); };

    (navigator as any).permissions?.query({ name: "notifications" as PermissionName })
      .then((s: PermissionStatus) => { status = s; s.addEventListener("change", onChange); })
      .catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onChange);
    return () => {
      status?.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onChange);
    };
  }, [recheck]);

  const c = dark
    ? { bg: "#450a0a", bdr: "#7f1d1d", title: "#fca5a5", text: "#fecaca", btn: "#fca5a5", btnText: "#450a0a" }
    : { bg: "#FEF2F2", bdr: "#FECACA", title: "#991B1B", text: "#B91C1C", btn: "#991B1B", btnText: "#fff" };

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bdr}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🔕</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: c.title, margin: "0 0 4px" }}>
            Notifications are blocked for this site
          </p>
          <p style={{ fontSize: 12, color: c.text, margin: "0 0 6px", lineHeight: 1.5 }}>
            Your browser doesn't let a website switch this on by itself. It takes 3 taps:
          </p>
          <ol style={{ fontSize: 12, color: c.text, margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Tap the <strong>🔒 icon</strong> beside the web address</li>
            <li>Tap <strong>Permissions</strong> → <strong>Notifications</strong></li>
            <li>Choose <strong>Allow</strong>, then come back here</li>
          </ol>
          <p style={{ fontSize: 11.5, color: c.text, margin: "0 0 10px", opacity: .85, lineHeight: 1.5 }}>
            This page will turn notifications on automatically as soon as you allow it.
          </p>
          <button
            onClick={() => { setStillBlocked(false); void recheck(true); }}
            disabled={checking}
            style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: c.btn, color: c.btnText, fontWeight: 700, fontSize: 12, cursor: checking ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {checking ? <><Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Checking…</> : "I've allowed it — check again"}
          </button>
          {stillBlocked && (
            <p style={{ fontSize: 11.5, color: c.title, margin: "8px 0 0", fontWeight: 600 }}>
              Still blocked — make sure Notifications is set to Allow for this site.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
