/*
  src/components/NotificationPermissionBanner.tsx — Tahleem Academy
  ═══════════════════════════════════════════════════════════════════════
  Visible, dismissable banner that prompts students, teachers, and admins
  to enable push notifications.

  Rebuilt: the push-subscription logic that used to be duplicated here
  (separately from useTimetableNotifications.ts, with slightly different
  bugs) now lives in one place — src/lib/push-notifications.ts. This file
  is UI only.

  Handles:
  • iOS Safari — Web Push only works once the PWA is installed to Home
    Screen; shows install instructions instead of an Enable button.
  • Permission requested only from a button onClick (user gesture).
  • Silent re-subscribe if permission is already granted but the DB row
    is missing (new browser / cleared cache).

  Usage — mount once in each layout (student/teacher/admin):
    <NotificationPermissionBanner />
  ═══════════════════════════════════════════════════════════════════════
*/
import { useState, useEffect } from "react";
import { Bell, BellOff, X, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { enablePushNotifications, ensureSubscribed } from "@/lib/push-notifications";

const SESSION_KEY = "tahleem_notif_banner_dismissed";
const NB_G = "#064E3B";
const NB_GM = "#075E54";

type PermState = "unknown" | "default" | "granted" | "denied" | "unsupported" | "ios-needs-install";

function detectState(): PermState {
  if (typeof window === "undefined") return "unknown";

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  if (isIOS && isSafari) {
    const isInstalled = (window.navigator as any).standalone === true;
    if (!isInstalled) return "ios-needs-install";
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as PermState;
  }

  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermState;
}

export default function NotificationPermissionBanner() {
  const { user } = useAuth();

  const [perm, setPerm] = useState<PermState>("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState(false);

  const shouldShow = !!user;

  useEffect(() => {
    if (!shouldShow) return;
    const state = detectState();
    setPerm(state);
    setDismissed(!!sessionStorage.getItem(SESSION_KEY));

    // Permission already granted but DB row might be missing — re-sync quietly.
    if (state === "granted" && user) {
      ensureSubscribed(user.id).catch(() => {});
    }
  }, [shouldShow, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shouldShow) return null;
  if (dismissed || success) return null;
  if (perm === "unknown" || perm === "unsupported" || perm === "granted") return null;

  const handleEnable = async () => {
    if (!user || subscribing) return;
    setSubscribing(true);
    try {
      const result = await enablePushNotifications(user.id);
      if (result === "granted") {
        setSuccess(true);
        setPerm("granted");
        setTimeout(() => setSuccess(false), 4000);
      } else if (result === "denied") {
        setPerm("denied");
      }
    } catch {
      // ignore
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  };

  // ── iOS: needs PWA install first ────────────────────────────────────────
  if (perm === "ios-needs-install") {
    return (
      <div style={{
        background: "linear-gradient(135deg, #1E3A5F08, #1E3A5F12)",
        border: "1px solid #1E3A5F25",
        borderRadius: 16, padding: "16px 18px",
        display: "flex", alignItems: "flex-start", gap: 14,
        fontFamily: "'Cairo',system-ui,sans-serif",
        boxShadow: "0 2px 12px rgba(30,58,95,.08)",
        margin: "0 0 12px",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "linear-gradient(135deg, #1E3A5F, #2563EB)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Smartphone size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1E3A5F", marginBottom: 4 }}>
            Install the app for notifications on iPhone
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
            Tap <strong>Share</strong> (□↑) in Safari → <strong>Add to Home Screen</strong> → then open Tahleem from your home screen to enable push notifications.
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2, flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── Blocked / denied ──────────────────────────────────────────────────────
  if (perm === "denied") {
    return (
      <div style={{
        background: "#FFF7ED", border: "1px solid #FED7AA",
        borderRadius: 14, padding: "14px 16px",
        display: "flex", alignItems: "flex-start", gap: 12,
        fontFamily: "'Cairo',system-ui,sans-serif",
        margin: "0 0 12px",
      }}>
        <BellOff size={18} color="#EA580C" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9A3412", marginBottom: 3 }}>
            Notifications are blocked
          </div>
          <div style={{ fontSize: 12, color: "#C2410C", lineHeight: 1.5 }}>
            You'll miss updates. To fix: tap the 🔒 lock icon in your browser address bar → Notifications → Allow, then refresh.
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A3412", padding: 2 }}>
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── Default: not yet asked ──────────────────────────────────────────────
  return (
    <div style={{
      background: `linear-gradient(135deg, ${NB_G}08, ${NB_GM}12)`,
      border: `1px solid ${NB_G}25`,
      borderRadius: 16, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
      fontFamily: "'Cairo',system-ui,sans-serif",
      boxShadow: "0 2px 12px rgba(6,78,59,.08)",
      margin: "0 0 12px",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${NB_G}, ${NB_GM})`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Bell size={22} color="#fff" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: NB_G, marginBottom: 2 }}>
          Stay updated on your phone
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          We'll notify you the moment something important happens — even when this page is closed.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          Not now
        </button>
        <button
          onClick={handleEnable}
          disabled={subscribing}
          style={{
            padding: "8px 16px", borderRadius: 10, border: "none",
            background: subscribing ? "#9CA3AF" : `linear-gradient(135deg, ${NB_G}, ${NB_GM})`,
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: subscribing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}
        >
          {subscribing ? (
            <><span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #ffffff80", borderTopColor: "#fff", animation: "spin .7s linear infinite", display: "inline-block" }} /> Enabling…</>
          ) : (
            <><Bell size={13} /> Enable</>
          )}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
