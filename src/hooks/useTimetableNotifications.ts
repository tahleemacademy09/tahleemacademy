/*
  src/hooks/useTimetableNotifications.ts — Tahleem Academy v4
  
  KEY FIX: Handles RESUBSCRIBE_REQUIRED message from service worker.
  When VAPID keys change, the SW fires pushsubscriptionchange → sends
  RESUBSCRIBE_REQUIRED to all open clients → this hook unsubscribes the
  old browser subscription and re-subscribes with the new VAPID key.
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SW_PATH = "/sw.js";

// ── Service Worker ────────────────────────────────────────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    _swReg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    await navigator.serviceWorker.ready;
    return _swReg;
  } catch (err) {
    console.warn("[useTimetableNotifications] SW register failed:", err);
    return null;
  }
}

// ── VAPID key ─────────────────────────────────────────────────────────────────

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
    console.warn("[useTimetableNotifications] VAPID key fetch failed:", err);
  }
  return null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── Save subscription to DB ───────────────────────────────────────────────────

async function saveSubscription(
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
  const { error } = await supabase.from("push_subscriptions")
    .upsert(row, { onConflict: "user_id,endpoint" });
  if (error) {
    await supabase.from("push_subscriptions")
      .upsert(row, { onConflict: "user_id" });
  }
}

// ── Full re-subscribe (used after VAPID key change) ───────────────────────────

export async function resubscribePush(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "granted") return false;

    const vapidKey = await fetchVapidPublicKey();
    if (!vapidKey) return false;

    const reg = await navigator.serviceWorker.ready;

    // Unsubscribe old subscription first
    const oldSub = await reg.pushManager.getSubscription();
    if (oldSub) {
      await oldSub.unsubscribe();
      // Remove from DB
      await supabase.from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", oldSub.endpoint);
    }

    // Subscribe fresh with new VAPID key
    const newSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    const p256dh = newSub.getKey("p256dh");
    const auth   = newSub.getKey("auth");
    if (!p256dh || !auth) return false;

    await saveSubscription(userId, newSub.endpoint, p256dh, auth);
    console.log("[useTimetableNotifications] ✅ re-subscribed with new VAPID key");
    return true;
  } catch (e: any) {
    console.warn("[useTimetableNotifications] resubscribe failed:", e.message);
    return false;
  }
}

// ── Initial push subscription ─────────────────────────────────────────────────

async function savePushSubscription(
  userId: string,
  reg: ServiceWorkerRegistration
): Promise<void> {
  if (!("PushManager" in window)) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) return;

  try {
    let sub = await reg.pushManager.getSubscription();

    // Check if existing subscription matches current VAPID key
    // by trying to verify its application server key
    if (sub) {
      try {
        const serverKey = sub.options?.applicationServerKey;
        if (serverKey) {
          const existing = btoa(String.fromCharCode(...new Uint8Array(serverKey)));
          const current  = btoa(String.fromCharCode(...urlBase64ToUint8Array(vapidKey)));
          if (existing !== current) {
            // VAPID key mismatch — re-subscribe
            console.log("[useTimetableNotifications] VAPID key mismatch, re-subscribing...");
            await sub.unsubscribe();
            sub = null;
          }
        }
      } catch { /* ignore comparison errors */ }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
    }

    const p256dh = sub.getKey("p256dh");
    const auth   = sub.getKey("auth");
    if (!p256dh || !auth) return;

    await saveSubscription(userId, sub.endpoint, p256dh, auth);
    console.log("[useTimetableNotifications] ✅ push subscription saved");
  } catch (err) {
    console.warn("[useTimetableNotifications] Push subscription failed:", err);
  }
}

// ── Realtime bell icon updates ────────────────────────────────────────────────

function subscribeToNotifications(userId: string): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event:  "INSERT",
        schema: "public",
        table:  "notifications",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const row = payload.new as any;
        if (row.type === "class_reminder" || row.type === "class_ring") {
          const isRing = row.type === "class_ring";
          try {
            navigator.vibrate?.(isRing ? [800, 300, 800] : [200, 100, 200]);
          } catch {}
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ── SW message listener ───────────────────────────────────────────────────────

function listenToSWMessages(userId: string): () => void {
  if (!("serviceWorker" in navigator)) return () => {};

  const handler = async (event: MessageEvent) => {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "RESUBSCRIBE_REQUIRED") {
      // VAPID key changed — old subscription is dead, re-subscribe automatically
      console.log("[useTimetableNotifications] RESUBSCRIBE_REQUIRED received");
      const ok = await resubscribePush(userId);
      console.log("[useTimetableNotifications] re-subscribe result:", ok);
    }

    if (msg.type === "NOTIFICATION_CLICK") {
      // msg.url is now a relative path (e.g. "/live/abc123") sent by sw v9.
      // We dispatch a custom event that App.tsx / useAppStateRestore can catch
      // and navigate with React Router — no full-page reload needed.
      // Fallback: if for some reason the SW sent a full URL, extract the path.
      const raw = msg.url ?? msg.fullUrl ?? "/";
      let path = raw;
      try {
        if (raw.startsWith("http")) {
          const u = new URL(raw);
          path = u.pathname + u.search + u.hash;
        }
      } catch { /* use raw as-is */ }
      if (!path || path === "") path = "/";
      // Dispatch a custom DOM event so any mounted React component can listen
      window.dispatchEvent(new CustomEvent("tahleem:notification-navigate", { detail: { path } }));
      // Also do a location.assign as fallback (handles cold-start / no listener yet)
      setTimeout(() => {
        if (window.__tahleemNotifNavigated) return;
        window.location.assign(path);
      }, 300);
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimetableNotifications() {
  const { user, profile, hasRole } = useAuth();
  const initRef    = useRef(false);
  const unsubRef   = useRef<(() => void) | null>(null);
  const swMsgUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    if (hasRole("admin")) return;

    if (!initRef.current) {
      initRef.current = true;
      ensureServiceWorker().then(reg => {
        if (reg) savePushSubscription(user.id, reg);
      });
    }

    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeToNotifications(user.id);

    if (swMsgUnsub.current) swMsgUnsub.current();
    swMsgUnsub.current = listenToSWMessages(user.id);

    return () => {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (swMsgUnsub.current) { swMsgUnsub.current(); swMsgUnsub.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
