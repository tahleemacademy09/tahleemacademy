/*
  src/hooks/useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  ARCHITECTURE CHANGE:
  ───────────────────
  Notifications are now fired SERVER-SIDE by the schedule-class-reminders
  edge function (called every minute via pg_cron). This means:

  ✅ Works even when the user is NOT on the website
  ✅ Notifications appear in the bell icon immediately on login
  ✅ No missed reminders if the browser tab was closed

  This hook now does only two lightweight things:
  1. Registers the service worker + saves the push subscription so the
     server can send Web Push to the device even when browser is closed.
  2. Listens to Supabase Realtime on the notifications table so the bell
     icon updates instantly the moment the server fires a notification,
     without needing a page refresh.

  The heavy "what classes are coming up" logic lives entirely in:
    supabase/functions/schedule-class-reminders/index.ts
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SW_PATH = "/sw.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── Service Worker + Push Subscription ───────────────────────────────────────

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

let _cachedVapid: string | null = null;
async function fetchVapidPublicKey(): Promise<string | null> {
  if (_cachedVapid) return _cachedVapid;
  // Prefer build-time env when present (for self-hosted), else hit the edge function
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv) { _cachedVapid = fromEnv; return _cachedVapid; }
  try {
    const { data, error } = await supabase.functions.invoke("vapid-public-key");
    if (error) throw error;
    const key = (data as any)?.publicKey || (data as any)?.public_key;
    if (typeof key === "string" && key.length > 0) {
      _cachedVapid = key;
      return key;
    }
  } catch (err) {
    console.warn("[useTimetableNotifications] Could not fetch VAPID public key:", err);
  }
  return null;
}

async function savePushSubscription(
  userId: string,
  reg: ServiceWorkerRegistration
): Promise<void> {
  if (!("PushManager" in window)) return;
  if (typeof Notification === "undefined") return;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return;

  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) {
    console.warn("[useTimetableNotifications] VAPID public key unavailable — push subscription skipped");
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

    // Upsert so re-registrations after browser clears subscriptions still work
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
  } catch (err) {
    console.warn("[useTimetableNotifications] Push subscription failed:", err);
  }
}

// ── Show in-browser notification (for users who ARE on the site) ─────────────
// The server has already written the row to the DB. This just shows the
// browser popup immediately for users with the tab open.

async function showBrowserNotification(opts: {
  title:        string;
  message:      string;
  url:          string;
  tag:          string;
  minutes_left: number;
}): Promise<void> {
  const baseOpts: NotificationOptions = {
    body:              opts.message,
    icon:              "/favicon.ico",
    badge:             "/favicon.ico",
    tag:               opts.tag,
    renotify:          true,
    requireInteraction: opts.minutes_left <= 5,
    vibrate:           [200, 100, 200, 100, 400],
    data:              { url: opts.url },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss" },
    ],
  } as NotificationOptions;

  if (_swReg) {
    try { await _swReg.showNotification(opts.title, baseOpts); return; } catch {}
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(opts.title, { body: opts.message, icon: "/favicon.ico", tag: opts.tag }); } catch {}
  }
  try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
}

// ── Realtime listener ─────────────────────────────────────────────────────────
// When the server inserts a class_reminder notification we immediately show
// the browser popup for users who have the tab open. The notification is
// already in the DB so the bell icon also updates.

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
        if (row.type !== "class_reminder") return;

        // Show browser popup for the current tab
        const minsLeft = row.message?.includes("5 min") ? 5 : 15;
        await showBrowserNotification({
          title:        row.title   ?? "Class Reminder",
          message:      row.message ?? "",
          url:          row.link    ?? "/student/timetable",
          tag:          row.link    ?? row.id,
          minutes_left: minsLeft,
        });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimetableNotifications() {
  const { user, profile, hasRole } = useAuth();
  const initRef  = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    if (hasRole("admin")) return;

    // One-time setup per session
    if (!initRef.current) {
      initRef.current = true;

      // Register service worker and push subscription so the server-side
      // cron function can deliver Web Push even when the browser is closed
      ensureServiceWorker().then(reg => {
        if (reg) savePushSubscription(user.id, reg);
      });
    }

    // Subscribe to realtime so the bell icon + browser popup update immediately
    // when the server writes a notification (no polling needed)
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeToNotifications(user.id);

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
