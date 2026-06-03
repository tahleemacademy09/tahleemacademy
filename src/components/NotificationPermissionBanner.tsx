/*  src/components/NotificationPermissionBanner.tsx
    ═══════════════════════════════════════════════════════════════════════
    A visible, dismissable banner that asks students AND teachers to enable
    push notifications. This is the fix for the silent permission request
    problem — browsers block Notification.requestPermission() when it's
    called programmatically without a user gesture.

    Mount once in your student layout/dashboard AND teacher layout:

      import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
      // Inside your layout return:
      <NotificationPermissionBanner />

    The banner:
      - Shows to students AND teachers (not admins)
      - Only shows if permission is "default" (not yet asked) or "denied"
      - Disappears permanently once permission is granted
      - Has a "Not now" option that hides it for the session

    FIX (Bug 4): Previously excluded teachers, so they never saw the opt-in
    prompt and were never subscribed even though useTimetableNotifications
    runs for them. Now teachers see the banner too.

    FIX (Bug 2 hardening): ensureSubscribed now uses (user_id, endpoint)
    upsert — if the multi-device constraint doesn't exist yet it falls back
    to user_id only, same as before.
    ═══════════════════════════════════════════════════════════════════════
*/
import { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_KEY = "tahleem_notif_banner_dismissed";
const G    = "#064E3B";
const GM   = "#075E54";

type PermState = "unknown" | "default" | "granted" | "denied" | "unsupported";

function getPermState(): PermState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermState;
}

export default function NotificationPermissionBanner() {
  const { user, hasRole } = useAuth();

  const [perm,        setPerm]        = useState<PermState>("unknown");
  const [dismissed,   setDismissed]   = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [success,     setSuccess]     = useState(false);

  // FIX (Bug 4): Show to students AND teachers — both receive class reminders.
  // Only admins are excluded (they manage the platform, don't attend classes).
  const shouldShow = !!user && !hasRole("admin");

  useEffect(() => {
    if (!shouldShow) return;
    setPerm(getPermState());
    setDismissed(!!sessionStorage.getItem(SESSION_KEY));

    // If already granted, silently re-save subscription in case DB row is missing
    if (getPermState() === "granted" && user) {
      ensureSubscribed(user.id).catch(() => {});
    }
  }, [shouldShow, user]);

  // Hide if not relevant
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
            You'll miss class reminders. To fix: tap the 🔒 lock icon in your browser address bar → Notifications → Allow.
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A3412", padding: 2 }}>
          <X size={16} />
        </button>
      </div>
    );
  }

  // perm === "default"
  return (
    <div style={{
      background: `linear-gradient(135deg, ${G}08, ${GM}12)`,
      border: `1px solid ${G}25`,
      borderRadius: 16, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
      fontFamily: "'Cairo',system-ui,sans-serif",
      boxShadow: "0 2px 12px rgba(6,78,59,.08)",
      margin: "0 0 12px",
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${G}, ${GM})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Bell size={22} color="#fff" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: G, marginBottom: 2 }}>
          Get class reminders on your phone
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          We'll notify you 15 min before each class, even when this page is closed.
        </div>
      </div>

      {/* Actions */}
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
            background: subscribing ? "#9CA3AF" : `linear-gradient(135deg, ${G}, ${GM})`,
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
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv?.length) return fromEnv;
  try {
    const { data, error } = await supabase.functions.invoke("vapid-public-key");
    if (error) throw error;
    return (data as any)?.publicKey || null;
  } catch {
    return null;
  }
}

async function enablePushNotifications(userId: string): Promise<"granted" | "denied" | "error"> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "error";

    // Runs from a button click — browser will show the native permission prompt
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.warn("[NotificationBanner] VAPID key not available");
      return "error";
    }

    // Get or create subscription
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

    const row = {
      user_id:    userId,
      endpoint:   sub.endpoint,
      p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
      auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
      updated_at: new Date().toISOString(),
    };

    // Try multi-device upsert first (requires unique(user_id, endpoint) constraint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "user_id,endpoint" });

    if (error) {
      // Constraint doesn't exist yet — fall back to single-device upsert
      console.warn("[NotificationBanner] multi-device upsert failed, falling back:", error.message);
      await supabase
        .from("push_subscriptions")
        .upsert(row, { onConflict: "user_id" });
    }

    return "granted";
  } catch (e: any) {
    console.warn("[NotificationBanner] subscription failed:", e.message);
    return "error";
  }
}

async function ensureSubscribed(userId: string): Promise<void> {
  // Called silently when permission is already granted — re-saves sub if missing from DB
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // no existing sub in browser — user needs to click Enable

    // Check if this endpoint is already in DB
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", sub.endpoint)
      .maybeSingle();

    if (!data) {
      // Subscription exists in browser but not in DB — re-save silently
      const p256dh = sub.getKey("p256dh");
      const auth   = sub.getKey("auth");
      if (!p256dh || !auth) return;

      const row = {
        user_id:    userId,
        endpoint:   sub.endpoint,
        p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
        updated_at: new Date().toISOString(),
      };

      // FIX: Try multi-device upsert, fall back to single-device
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(row, { onConflict: "user_id,endpoint" });

      if (error) {
        await supabase
          .from("push_subscriptions")
          .upsert(row, { onConflict: "user_id" });
      }
    }
  } catch { /* silent */ }
}
