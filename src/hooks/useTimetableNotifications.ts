/*
  src/hooks/useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  ARCHITECTURE:
  ─────────────
  Notifications are fired SERVER-SIDE by the schedule-class-reminders
  edge function called every minute via pg_cron.

  This hook does three lightweight things:
  1. Registers service worker + saves push subscription so the server
     can send Web Push even when the browser is closed.
  2. Listens to Supabase Realtime so the bell icon updates the instant
     the server inserts a notification — no polling needed.
  3. Handles PUSH_SUBSCRIPTION_CHANGED messages from the service worker
     so new endpoints are automatically re-saved to the DB.
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

// ── Save push subscription to DB ──────────────────────────────────────────────

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

  // Multi-device: one row per (user, endpoint)
  const { error } = await supabase.from("push_subscriptions")
    .upsert(row, { onConflict: "user_id,endpoint" });

  if (error) {
    // Old schema fallback
    await supabase.from("push_subscriptions")
      .upsert(row, { onConflict: "user_id" });
  }
}

async function savePushSubscription(
  userId: string,
  reg: ServiceWorkerRegistration
): Promise<void> {
  if (!("PushManager" in window)) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) {
    console.warn("[useTimetableNotifications] VAPID key unavailable");
    return;
  }

  try {
    let sub = await reg.pushManager.getSubscription();
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

// ── Show in-browser popup (for users with the tab open) ───────────────────────

async function showBrowserNotification(opts: {
  title:        string;
  message:      string;
  url:          string;
  tag:          string;
  minutes_left: number;
  type?:        string;
}): Promise<void> {
  const isRing = opts.type === "class_ring" || opts.type === "ring";
  const baseOpts: NotificationOptions = {
    body:               opts.message,
    icon:               "/icons/icon-192x192.png",
    badge:              "/icons/icon-96x96.png",
    tag:                opts.tag,
    renotify:           true,
    requireInteraction: isRing || opts.minutes_left <= 5,
    vibrate:            isRing
      ? [800, 300, 800, 300, 800, 600, 800, 300, 800]
      : [200, 100, 200, 100, 400],
    data:               { url: opts.url, type: opts.type },
    actions: isRing
      ? [{ action: "join", title: "📹 Join Now" }, { action: "dismiss", title: "Dismiss" }]
      : [{ action: "open", title: "View"         }, { action: "dismiss", title: "Dismiss" }],
  } as NotificationOptions;

  if (_swReg) {
    try { await _swReg.showNotification(opts.title, baseOpts); return; } catch {}
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(opts.title, { body: opts.message, icon: "/icons/icon-192x192.png", tag: opts.tag }); } catch {}
  }
  try { navigator.vibrate?.(isRing ? [800, 300, 800] : [200, 100, 200]); } catch {}
}

// ── Realtime listener ─────────────────────────────────────────────────────────

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

        // Show browser popup for relevant types
        if (row.type === "class_reminder" || row.type === "class_ring") {
          const isRing      = row.type === "class_ring";
          const minsLeft    = isRing ? 0 : (row.message?.includes("5 min") ? 5 : 15);
          await showBrowserNotification({
            title:        row.title   ?? "Class Reminder",
            message:      row.message ?? "",
            url:          row.link    ?? "/student/timetable",
            tag:          row.id      ?? row.link,
            minutes_left: minsLeft,
            type:         row.type,
          });
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ── Handle SW messages (e.g. pushsubscriptionchange) ─────────────────────────

function listenToSWMessages(userId: string): () => void {
  if (!("serviceWorker" in navigator)) return () => {};

  const handler = async (event: MessageEvent) => {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "PUSH_SUBSCRIPTION_CHANGED" && msg.subscription) {
      // Service worker rotated our push keys — re-save to DB
      try {
        const sub = msg.subscription;
        const p256dh = Uint8Array.from(atob(sub.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const auth   = Uint8Array.from(atob(sub.keys.auth.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        await saveSubscription(userId, sub.endpoint, p256dh.buffer, auth.buffer);
        console.log("[useTimetableNotifications] re-saved rotated subscription");
      } catch (e) {
        console.warn("[useTimetableNotifications] failed to re-save rotated sub:", e);
      }
    }

    if (msg.type === "NOTIFICATION_CLICK" && msg.url) {
      window.location.href = msg.url;
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

      // Register SW and save push subscription so server-side cron can reach device
      ensureServiceWorker().then(reg => {
        if (reg) savePushSubscription(user.id, reg);
      });
    }

    // Realtime bell icon + browser popup
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeToNotifications(user.id);

    // SW message listener (subscription changes, click routing)
    if (swMsgUnsub.current) swMsgUnsub.current();
    swMsgUnsub.current = listenToSWMessages(user.id);

    return () => {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (swMsgUnsub.current) { swMsgUnsub.current(); swMsgUnsub.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
