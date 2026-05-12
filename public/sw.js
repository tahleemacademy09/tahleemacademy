/*
  public/sw.js — Tahleem Academy Service Worker
  ═══════════════════════════════════════════════════════════════════════
  Combines two capabilities:

  1. OFFLINE CACHING (PWABuilder "Offline Copy of Pages" strategy)
     – App shell assets cached on install
     – Every page the user visits is cached (StaleWhileRevalidate)
     – If offline, previously-visited pages load instantly from cache

  2. PUSH NOTIFICATIONS (existing Tahleem implementation)
     – Server-sent Web Push (works when app is fully closed)
     – Client-sent messages (app is open, foreground notifications)
     – Notification click → open / focus correct tab

  ═══════════════════════════════════════════════════════════════════════
*/

// ── Cache names ──────────────────────────────────────────────────────────────
const CACHE_VERSION   = "tahleem-sw-v3";
const OFFLINE_CACHE   = "tahleem-offline-v3";
const STATIC_CACHE    = "tahleem-static-v3";

// App-shell resources to pre-cache on install
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/apple-touch-icon.png",
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches, claim all clients ──────────────────────────
self.addEventListener("activate", (event) => {
  const currentCaches = [CACHE_VERSION, OFFLINE_CACHE, STATIC_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !currentCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Offline-copy-of-pages strategy ───────────────────────────────────
//
//  • Navigation requests (HTML pages)  → Network first, fall back to cache
//  • Static assets (JS/CSS/images)     → Cache first, fall back to network
//  • API / Supabase requests           → Network only (never cache auth data)
//
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests except Google Fonts (safe to cache)
  const isGoogleFonts = url.hostname.includes("fonts.googleapis.com") ||
                        url.hostname.includes("fonts.gstatic.com");
  if (url.origin !== self.location.origin && !isGoogleFonts) return;

  // Skip Supabase API calls — never cache auth/database responses
  if (url.hostname.includes("supabase.co")) return;

  // Skip Paystack JS
  if (url.hostname.includes("paystack.co")) return;

  // Navigation (page loads) → Network first, cache as fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Store a fresh copy of every visited page
          const clone = response.clone();
          caches.open(OFFLINE_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.match("/") ||
              caches.match("/index.html")
          )
        )
    );
    return;
  }

  // Static assets → Cache first, then network (Stale-While-Revalidate)
  if (
    request.destination === "script" ||
    request.destination === "style"  ||
    request.destination === "image"  ||
    request.destination === "font"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }
});

// ── Push notification helpers ────────────────────────────────────────────────
function buildNotificationOptions(data) {
  const minutesLeft = data.minutes_left ?? 99;
  return {
    body:               data.message  || "You have an upcoming class.",
    icon:               "/favicon.png",
    badge:              "/favicon.png",
    tag:                data.tag      || "tahleem-class",
    renotify:           true,
    requireInteraction: minutesLeft <= 5,
    vibrate:            [200, 100, 200, 100, 400],
    data:               { url: data.url || "/student/timetable" },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss"        },
    ],
  };
}

// ── Server-sent Web Push (works when app is fully closed) ───────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || "📚 Class Reminder — Tahleem Academy";
  event.waitUntil(
    self.registration.showNotification(title, buildNotificationOptions(data))
  );
});

// ── Client-sent message (app is open in foreground) ─────────────────────────
self.addEventListener("message", (event) => {
  // Allow the page to trigger a SW update
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (!event.data || event.data.type !== "SHOW_NOTIFICATION") return;

  const { title, ...rest } = event.data;
  self.registration.showNotification(
    title || "📚 Tahleem Class Reminder",
    buildNotificationOptions(rest)
  );
});

// ── Background Sync — retry failed requests when connection restores ─────────
//
//  Usage from the app:
//    navigator.serviceWorker.ready.then(reg =>
//      reg.sync.register('tahleem-sync')
//    );
//
self.addEventListener("sync", (event) => {
  if (event.tag === "tahleem-sync") {
    event.waitUntil(
      // Re-attempt any queued fetch that failed while offline
      // (extend here if you queue Supabase writes during offline mode)
      Promise.resolve().then(() => {
        console.log("[Tahleem SW] Background sync fired — connection restored");
      })
    );
  }
});

// ── Periodic Background Sync — refresh timetable data in background ──────────
//
//  Register from the app (requires permission):
//    const reg = await navigator.serviceWorker.ready;
//    await reg.periodicSync.register('tahleem-timetable-refresh', {
//      minInterval: 60 * 60 * 1000  // once per hour
//    });
//
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "tahleem-timetable-refresh") {
    event.waitUntil(
      // Fetch fresh timetable data and cache it so the app shows
      // up-to-date class info even before the user opens the app
      fetch("/student/timetable", { cache: "no-store" })
        .then((res) => {
          if (res.ok) {
            return caches.open(OFFLINE_CACHE).then((cache) =>
              cache.put("/student/timetable", res)
            );
          }
        })
        .catch(() => {
          // Silently ignore — offline or server unavailable
        })
    );
  }
});

// ── Notification click ───────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/student/timetable";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
