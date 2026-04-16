/*
  public/sw.js — Tahleem Academy Push Notification Service Worker
  ─────────────────────────────────────────────────────────────────
  Handles background push events so class reminders appear as phone
  system notifications even when the app is closed / minimised.

  Flow:
  1. useTimetableNotifications registers this SW and requests a
     Push subscription from the browser.
  2. Subscription endpoint is saved to Supabase (push_subscriptions table).
  3. The Supabase Edge Function "send-class-reminder" uses web-push to
     deliver a push payload to every subscriber for that class.
  4. This SW wakes up, shows a system notification with action buttons.
  5. Tapping the notification navigates to the timetable / join URL.
*/

const CACHE_NAME = "tahleem-sw-v1";

// ── Install & Activate ────────────────────────────────────────────
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Push event (server-sent via web-push library) ─────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title       = data.title        || "📚 Class Reminder — Tahleem Academy";
  const body        = data.message      || "You have an upcoming class.";
  const url         = data.url          || "/student/timetable";
  const tag         = data.tag          || "tahleem-class";
  const minutesLeft = data.minutes_left ?? 99;

  const options = {
    body,
    icon:  "/favicon.ico",
    badge: "/favicon.ico",
    tag,
    renotify:           true,
    requireInteraction: minutesLeft <= 5,   // stays on screen for 5-min alerts
    vibrate:            [200, 100, 200, 100, 400],
    data:               { url },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss"        },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ─────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl =
    (event.notification.data && event.notification.data.url)
      ? event.notification.data.url
      : "/student/timetable";

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
        // Otherwise open a fresh tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Internal message from useTimetableNotifications (foreground tab) ──
// The hook posts { type:"SHOW_NOTIFICATION", … } so every notification
// routes through the SW — this ensures vibration and tray placement
// even when the app tab is in the foreground on Android Chrome.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SHOW_NOTIFICATION") return;

  const { title, message, url, tag, minutes_left } = event.data;

  self.registration.showNotification(
    title || "📚 Tahleem Class Reminder",
    {
      body:               message || "",
      icon:               "/favicon.ico",
      badge:              "/favicon.ico",
      tag:                tag     || "tahleem-class",
      renotify:           true,
      requireInteraction: (minutes_left ?? 99) <= 5,
      vibrate:            [200, 100, 200, 100, 400],
      data:               { url: url || "/student/timetable" },
      actions: [
        { action: "join",    title: "Join Class 📹" },
        { action: "dismiss", title: "Dismiss"        },
      ],
    }
  );
});
