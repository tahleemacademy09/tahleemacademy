/*  src/components/NotificationPermissionBanner.tsx
    ═══════════════════════════════════════════════════════════════════════
    Visible, dismissable banner that prompts students AND teachers to enable
    push notifications.

    FIXES IN THIS VERSION:
    ──────────────────────
    FIX 1 — iOS Safari: Safari on iPhone/iPad requires the PWA to be
      "Add to Home Screen" installed before Web Push works. We detect this
      case and show a specific install-first message instead of the
      normal Enable button.

    FIX 2 — Permission prompt outside user gesture: We call
      Notification.requestPermission() only from a button onClick, which
      is a browser-trusted user gesture. Silent auto-calls are removed.

    FIX 3 — Multi-device: upsert uses (user_id, endpoint) unique key.
      Falls back gracefully if the DB constraint is old (user_id only).

    FIX 4 — Teachers: banner shows to both students and teachers.
      Only admins are excluded.

    FIX 5 — Re-subscription on login: if permission is already granted
      but the DB row is missing (cleared cache, new browser), we silently
      re-save the subscription in the background.

    Usage — mount once in student layout AND teacher layout:
      <NotificationPermissionBanner />
    ═══════════════════════════════════════════════════════════════════════
*/
import { useState, useEffect } from "react";
import { Bell, BellOff, X, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_KEY = "tahleem_notif_banner_dismissed";
const NB_G    = "#064E3B";
const NB_GM   = "#075E54";

type PermState = "unknown" | "default" | "granted" | "denied" | "unsupported" | "ios-needs-install";

function detectState(): PermState {
  if (typeof window === "undefined") return "unknown";

  // iOS Safari detection
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  if (isIOS && isSafari) {
    // Check if running as installed PWA (standalone)
    const isInstalled = (window.navigator as any).standalone === true;
    if (!isInstalled) {
      // On iOS Safari, Web Push ONLY works in installed PWA
      return "ios-needs-install";
    }
    // Installed PWA on iOS 16.4+ — check Notification API
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as PermState;
  }

  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermState;
}

export default function NotificationPermissionBanner() {
  const { user, hasRole } = useAuth();

  const [perm,        setPerm]        = useState<PermState>("unknown");
  const [dismissed,   setDismissed]   = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [success,     setSuccess]     = useState(false);

  // Show to students AND teachers — both need class reminders.
  // Admins are excluded (they manage the platform, don't attend classes).
  const shouldShow = !!user && !hasRole("admin");

  useEffect(() => {
    if (!shouldShow) return;
    const state = detectState();
    setPerm(state);
    setDismissed(!!sessionStorage.getItem(SESSION_KEY));

    // FIX 5: Silently re-subscribe if permission already granted but DB row missing
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

  // ── iOS: needs PWA install first ────────────────────────────────────────────
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

  // ── Blocked / denied ────────────────────────────────────────────────────────
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
            You'll miss class reminders. To fix: tap the 🔒 lock icon in your browser address bar → Notifications → Allow, then refresh.
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A3412", padding: 2 }}>
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── Default: not yet asked ──────────────────────────────────────────────────
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
          Get class reminders on your phone
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          We'll notify you 15 min before each class, even when this page is closed — just like WhatsApp.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0))).buffer;
}

async function getVapidKey(): Promise<string | null> {
  // Prefer build-time env var (fastest, no network call)
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv?.length) return fromEnv.trim();

  // Fall back to edge function
  try {
    const { data, error } = await supabase.functions.invoke("vapid-public-key");
    if (error) throw error;
    const key = (data as any)?.publicKey || (data as any)?.public_key;
    if (typeof key === "string" && key.length > 10) return key.trim();
  } catch (e: any) {
    console.warn("[NotificationBanner] VAPID key fetch failed:", e.message);
  }
  return null;
}

/** Called from the Enable button click — browser shows native permission prompt */
export async function enablePushNotifications(userId: string): Promise<"granted" | "denied" | "error"> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "error";

    // Must be called from user gesture (button click) — browser enforces this
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.warn("[NotificationBanner] VAPID key not available — check VITE_VAPID_PUBLIC_KEY env var");
      return "error";
    }

    // Get or create push subscription
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const p256dh = sub.getKey("p256dh");
    const auth   = sub.getKey("auth");
    if (!p256dh || !auth) return "error";

    await saveToDB(userId, sub.endpoint, p256dh, auth);
    console.log("[NotificationBanner] ✅ push subscription saved for user:", userId);
    return "granted";
  } catch (e: any) {
    console.warn("[NotificationBanner] subscription error:", e.message);
    return "error";
  }
}

async function saveToDB(
  userId: string,
  endpoint: string,
  p256dh: ArrayBuffer,
  auth: ArrayBuffer
): Promise<void> {
  const row = {
    user_id:    userId,
    endpoint,
    p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
    auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
    updated_at: new Date().toISOString(),
  };

  // Multi-device upsert (requires unique(user_id, endpoint) constraint)
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "user_id,endpoint" });

  if (error) {
    // Old schema — fall back to single-device upsert
    console.warn("[NotificationBanner] multi-device upsert failed, falling back:", error.message);
    await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "user_id" });
  }
}

/** Silent background re-subscription for users who already granted permission */
async function ensureSubscribed(userId: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // No browser subscription — user must click Enable

    // Check if this endpoint exists in DB
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", sub.endpoint)
      .maybeSingle();

    if (!data) {
      // Browser has subscription but DB doesn't — re-save silently
      const p256dh = sub.getKey("p256dh");
      const auth   = sub.getKey("auth");
      if (!p256dh || !auth) return;
      await saveToDB(userId, sub.endpoint, p256dh, auth);
      console.log("[NotificationBanner] silently re-saved subscription for user:", userId);
    }
  } catch { /* silent */ }
}
