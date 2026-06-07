// public/sw.js — Tahleem Academy Service Worker v4
// Force re-subscribe on VAPID key change

const CACHE_NAME = "tahleem-v4";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";
const APP_URL    = self.location.origin;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", ICON, BADGE]).catch(() => {})
    ).then(() => self.skipWaiting())  // immediately activate new SW
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())  // take control of all open tabs
  );
});

// ── Push handler ──────────────────────────────────────────────────────────────

self.addEventListener("push", e => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "Tahleem Academy", body: e.data ? e.data.text() : "" };
  }

  const isRing = data.type === "ring" || data.type === "class_ring";
  const title  = data.title   ?? "Tahleem Academy 🕌";
  const body   = data.body    ?? data.message ?? "";
  const url    = data.url     ?? data.join_url ?? "/";
  const tag    = data.tag     ?? (isRing ? "tahleem-ring" : "tahleem-push");

  const options = {
    body,
    icon:    ICON,
    badge:   BADGE,
    tag,
    renotify: true,
    requireInteraction: isRing || !!data.requireInteraction,
    silent: false,
    vibrate: isRing
      ? [800, 300, 800, 300, 800, 600, 800, 300, 800]
      : (data.vibrate ?? [200, 100, 200]),
    timestamp: Date.now(),
    data: { url, type: data.type },
    actions: isRing
      ? [
          { action: "join",    title: "📹 Join Now" },
          { action: "dismiss", title: "✕ Dismiss"  },
        ]
      : [
          { action: "open",    title: "Open"        },
          { action: "dismiss", title: "Dismiss"     },
        ],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const url     = e.notification.data?.url ?? APP_URL;
  const fullUrl = url.startsWith("http") ? url : APP_URL + (url.startsWith("/") ? url : "/" + url);

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", url: fullUrl });
          return client.focus();
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});

// ── Push subscription change (VAPID key rotated) ──────────────────────────────
// Fires automatically when the browser detects the old subscription is invalid.
// We notify open clients so they can re-subscribe with the new VAPID key.

self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        client.postMessage({ type: "RESUBSCRIBE_REQUIRED" });
      }
    })
  );
});

// ── Messages from app ─────────────────────────────────────────────────────────

self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch — offline shell ─────────────────────────────────────────────────────

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes("supabase.co")) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match("/").then(r => r ?? Response.error())
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && e.request.url.match(/\.(png|jpg|svg|woff2?|css)$/)) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});
