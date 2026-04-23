/*
  public/sw.js — Tahleem Academy Push Notification Service Worker
  ─────────────────────────────────────────────────────────────────
  Handles two types of events:

  1. "push"    — fired by the browser when the Supabase cron Edge Function
                 sends a Web Push message. Works even when the app is
                 FULLY CLOSED / phone screen off.

  2. "message" — fired by useTimetableNotifications when the app IS open,
                 so all notifications go through the SW for consistent
                 vibration + system tray placement on Android.

  The SW itself is always "alive" in the background (registered by the
  hook on first login). pg_cron keeps sending pushes server-side.
*/

const CACHE_VERSION = "tahleem-sw-v2";

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install",  ()  => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildOptions(data) {
  const minutesLeft = data.minutes_left ?? 99;
  return {
    body:               data.message  || "You have an upcoming class.",
    icon:               "/favicon.ico",
    badge:              "/favicon.ico",
    tag:                data.tag      || "tahleem-class",
    renotify:           true,
    requireInteraction: minutesLeft <= 5,   // stays on screen for ≤5-min alerts
    vibrate:            [200, 100, 200, 100, 400],
    data:               { url: data.url || "/student/timetable" },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss"        },
    ],
  };
}

// ── Server-sent push (works when browser/app is closed) ──────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || "📚 Class Reminder — Tahleem Academy";

  event.waitUntil(
    self.registration.showNotification(title, buildOptions(data))
  );
});

// ── Client-sent message (app is open in foreground) ───────────────────────────
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SHOW_NOTIFICATION") return;

  const { title, ...rest } = event.data;
  self.registration.showNotification(
    title || "📚 Tahleem Class Reminder",
    buildOptions(rest)
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl =
    event.notification.data?.url || "/student/timetable";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab if the app is already open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow(targetUrl);
      })
  );
});
