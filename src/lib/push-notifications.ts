/*
  src/lib/push-notifications.ts — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Single source of truth for web-push subscription management. Previously
  this logic was duplicated (with slightly different bugs) in both
  useTimetableNotifications.ts and NotificationPermissionBanner.tsx — both
  now import from here instead.

  Exposes:
    ensureServiceWorker()         — register /sw.js, wait for ready
    enablePushNotifications(uid)  — user-gesture triggered: ask permission + subscribe
    ensureSubscribed(uid)         — silent: if permission already granted but no
                                    DB row (new browser / cleared cache), re-subscribe
    resubscribePush(uid)          — force fresh subscribe (used after VAPID key rotation)
    listenForServiceWorkerMessages(uid) — RESUBSCRIBE_REQUIRED + NOTIFICATION_CLICK
*/
import { supabase } from "@/integrations/supabase/client";

const SW_PATH = "/sw.js";

// ── Service Worker ───────────────────────────────────────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    _swReg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    await navigator.serviceWorker.ready;
    return _swReg;
  } catch (err) {
    console.warn("[push] SW register failed:", err);
    return null;
  }
}

// ── VAPID key ────────────────────────────────────────────────────────────────

let _cachedVapid: string | null = null;

async function fetchVapidPublicKey(): Promise<string | null> {
  if (_cachedVapid) return _cachedVapid;
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv?.trim()) { _cachedVapid = fromEnv.trim(); return _cachedVapid; }
  try {
    const { data, error } = await supabase.functions.invoke("vapid-public-key");
    if (error) throw error;
    const key = (data as any)?.publicKey || (data as any)?.public_key;
    if (typeof key === "string" && key.length > 10) {
      _cachedVapid = key.trim();
      return _cachedVapid;
    }
  } catch (err) {
    console.warn("[push] VAPID key fetch failed:", err);
  }
  return null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

// ── Save subscription row ────────────────────────────────────────────────────

async function saveSubscription(userId: string, endpoint: string, p256dh: ArrayBuffer, auth: ArrayBuffer): Promise<void> {
  const row = {
    user_id: userId,
    endpoint,
    p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
    auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("push_subscriptions").upsert(row, { onConflict: "user_id,endpoint" });
  if (error) {
    // Fallback for older schemas without the composite unique key
    await supabase.from("push_subscriptions").upsert(row, { onConflict: "user_id" });
  }
}

async function subscribeWithKey(reg: ServiceWorkerRegistration, vapidKey: string): Promise<PushSubscription> {
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  });
}

// ── Public: force a fresh subscribe (VAPID key rotation) ────────────────────

export async function resubscribePush(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

    const vapidKey = await fetchVapidPublicKey();
    if (!vapidKey) return false;

    const reg = await navigator.serviceWorker.ready;
    const oldSub = await reg.pushManager.getSubscription();
    if (oldSub) {
      await oldSub.unsubscribe();
      await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", oldSub.endpoint);
    }

    const newSub = await subscribeWithKey(reg, vapidKey);
    const p256dh = newSub.getKey("p256dh");
    const auth = newSub.getKey("auth");
    if (!p256dh || !auth) return false;

    await saveSubscription(userId, newSub.endpoint, p256dh, auth);
    console.log("[push] resubscribed with new VAPID key");
    return true;
  } catch (e: any) {
    console.warn("[push] resubscribe failed:", e.message);
    return false;
  }
}

// ── Public: silent, permission already granted ───────────────────────────────

export async function ensureSubscribed(userId: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("PushManager" in window)) return;

  const reg = await ensureServiceWorker();
  if (!reg) return;

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) return;

  try {
    let sub = await reg.pushManager.getSubscription();

    if (sub) {
      try {
        const serverKey = sub.options?.applicationServerKey;
        if (serverKey) {
          const existing = btoa(String.fromCharCode(...new Uint8Array(serverKey)));
          const current = btoa(String.fromCharCode(...urlBase64ToUint8Array(vapidKey)));
          if (existing !== current) {
            await sub.unsubscribe();
            sub = null;
          }
        }
      } catch { /* ignore comparison errors */ }
    }

    if (!sub) sub = await subscribeWithKey(reg, vapidKey);

    const p256dh = sub.getKey("p256dh");
    const auth = sub.getKey("auth");
    if (!p256dh || !auth) return;

    await saveSubscription(userId, sub.endpoint, p256dh, auth);
    console.log("[push] subscription ensured");
  } catch (err) {
    console.warn("[push] ensureSubscribed failed:", err);
  }
}

// ── Public: user-gesture triggered (from a banner/button onClick) ──────────

export async function enablePushNotifications(userId: string): Promise<"granted" | "denied" | "error"> {
  if (typeof Notification === "undefined") return "error";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "error";

    const reg = await ensureServiceWorker();
    if (!reg) return "error";

    await ensureSubscribed(userId);
    return "granted";
  } catch (err) {
    console.warn("[push] enablePushNotifications failed:", err);
    return "error";
  }
}

// ── Public: SW message listener (resubscribe + click-to-navigate) ──────────

export function listenForServiceWorkerMessages(userId: string): () => void {
  if (!("serviceWorker" in navigator)) return () => {};

  const handler = async (event: MessageEvent) => {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "RESUBSCRIBE_REQUIRED") {
      const ok = await resubscribePush(userId);
      console.log("[push] re-subscribe result:", ok);
    }

    if (msg.type === "NOTIFICATION_CLICK") {
      const raw = msg.url ?? msg.fullUrl ?? "/";
      let path = raw;
      try {
        if (raw.startsWith("http")) {
          const u = new URL(raw);
          path = u.pathname + u.search + u.hash;
        }
      } catch { /* use raw as-is */ }
      if (!path) path = "/";
      window.dispatchEvent(new CustomEvent("tahleem:notification-navigate", { detail: { path } }));
      setTimeout(() => {
        if ((window as any).__tahleemNotifNavigated) return;
        window.location.assign(path);
      }, 300);
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
