/*  src/components/NotificationPermissionBanner.tsx
    ═══════════════════════════════════════════════════════════════════════
    A visible, dismissable banner that asks students to enable push
    notifications. This is the fix for the silent permission request
    problem — browsers block Notification.requestPermission() when it's
    called programmatically without a user gesture.

    Mount once in your student layout/dashboard:

      import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
      // Inside your student layout return:
      <NotificationPermissionBanner />

    The banner:
      - Only shows to students (not admins/teachers)
      - Only shows if permission is "default" (not yet asked) or "denied"
      - Disappears permanently once permission is granted
      - Has a "Not now" option that hides it for the session
    ═══════════════════════════════════════════════════════════════════════
*/
import { useState, useEffect } from "react";
import { Bell, BellOff, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_KEY = "tahleem_notif_banner_dismissed";
const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

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

  // Don't show for admins/teachers — they don't need class reminders
  const isStudent = !hasRole("admin") && !hasRole("teacher");

  useEffect(() => {
    if (!isStudent) return;
    setPerm(getPermState());
    setDismissed(!!sessionStorage.getItem(SESSION_KEY));

    // If already granted, make sure the subscription is in the DB
    if (getPermState() === "granted" && user) {
      ensureSubscribed(user.id).catch(() => {});
    }
  }, [isStudent, user]);

  // Hide if not relevant
  if (!user || !isStudent) return null;
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

    // This runs from a button click — browser will show the permission prompt
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

    // Save to DB — use (user_id, endpoint) upsert to support multiple devices
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id:    userId,
        endpoint:   sub.endpoint,
        p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }  // fixed: was "user_id" only
    );

    if (error) {
      // Fall back to user_id only in case the multi-device constraint isn't added yet
      await supabase.from("push_subscriptions").upsert(
        {
          user_id:    userId,
          endpoint:   sub.endpoint,
          p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
          auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return "granted";
  } catch (e: any) {
    console.warn("[NotificationBanner] subscription failed:", e.message);
    return "error";
  }
}

async function ensureSubscribed(userId: string): Promise<void> {
  // Called silently when permission is already granted — re-saves sub if missing
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // no existing sub, user needs to click Enable

    // Check DB
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", sub.endpoint)
      .maybeSingle();

    if (!data) {
      // Sub exists in browser but not in DB — re-save silently
      const p256dh = sub.getKey("p256dh");
      const auth   = sub.getKey("auth");
      if (!p256dh || !auth) return;

      await supabase.from("push_subscriptions").upsert(
        {
          user_id:    userId,
          endpoint:   sub.endpoint,
          p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
          auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }
  } catch { /* silent */ }
}
