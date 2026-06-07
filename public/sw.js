// public/sw.js — Tahleem Academy Service Worker v3
// WhatsApp-grade push: persistent, actionable, with ring support

const CACHE_NAME = "tahleem-v3";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";
const APP_URL    = self.location.origin;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", ICON, BADGE]).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
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

  const title   = data.title   ?? "Tahleem Academy 🕌";
  const body    = data.body    ?? data.message ?? data.message_en ?? "";
  const url     = data.url     ?? data.join_url ?? "/";
  const tag     = data.tag     ?? (isRing ? "tahleem-ring" : "tahleem-push");

  const options = {
    body,
    icon:    data.icon  ?? ICON,
    badge:   data.badge ?? BADGE,
    tag,
    renotify: true,
    requireInteraction: isRing || !!data.requireInteraction,
    silent: false,
    // Ring vibration pattern: loud repeating pulse
    vibrate: isRing
      ? [800, 300, 800, 300, 800, 600, 800, 300, 800]
      : (data.vibrate ?? [200, 100, 200]),
    timestamp: Date.now(),
    data: { url, type: data.type },
    actions: isRing
      ? [
          { action: "join",    title: "📹 Join Now"  },
          { action: "dismiss", title: "✕ Dismiss"   },
        ]
      : (Array.isArray(data.actions) ? data.actions : [
          { action: "open",    title: "Open"         },
          { action: "dismiss", title: "Dismiss"      },
        ]),
  };

  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener("notificationclick", e => {
  e.notification.close();

  const action = e.action;
  if (action === "dismiss") return;

  const url = e.notification.data?.url ?? APP_URL;
  const fullUrl = url.startsWith("http") ? url : (APP_URL + (url.startsWith("/") ? url : "/" + url));

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      // Focus an existing open tab if possible
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", url: fullUrl });
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(fullUrl);
    })
  );
});

// ── Notification close (dismissed by user) ────────────────────────────────────

self.addEventListener("notificationclose", e => {
  // Analytics hook — can be extended to mark notification as dismissed in DB
  const data = e.notification.data ?? {};
  console.log("[sw] notification dismissed:", e.notification.tag, data.type);
});

// ── Push subscription change (browser rotated keys) ──────────────────────────
// This fires when the browser changes the push subscription endpoint.
// We save the new subscription to the DB automatically.

self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil(
    (async () => {
      try {
        const reg = await self.registration;
        const vapidKey = await getVapidKeyFromDB();
        if (!vapidKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        // Notify open clients to save the new subscription
        const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of list) {
          client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED", subscription: sub.toJSON() });
        }
      } catch (err) {
        console.warn("[sw] pushsubscriptionchange failed:", err);
      }
    })()
  );
});

// ── Fetch — offline-first for app shell ──────────────────────────────────────

self.addEventListener("fetch", e => {
  // Only handle GET requests for same-origin navigation
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Skip Supabase API / edge function calls — always network-first
  if (e.request.url.includes("supabase.co")) return;

  // For HTML navigation requests: network first, fall back to cached index
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match("/").then(r => r ?? Response.error())
      )
    );
    return;
  }

  // Static assets: cache first
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

async function getVapidKeyFromDB() {
  try {
    const res = await fetch("/api/vapid-key");
    if (res.ok) { const d = await res.json(); return d.publicKey; }
  } catch {}
  return null;
}
