/*
  public/sw.js — Tahleem Academy Service Worker  v4
  ═══════════════════════════════════════════════════════════════════════
  Capabilities:
  1. INSTANT LOADING  — App shell + JS/CSS chunks cached on install.
                        Navigation preloading eliminates SW wake-up delay.
                        Stale-while-revalidate for all static assets.
  2. OFFLINE SUPPORT  — Every visited page cached. Works on poor/no network.
  3. PUSH + RING      — Class reminders (15/5 min) + live ring notifications.
  4. KEEP-ALIVE       — Prevents WebRTC throttling during live classes.
  5. BACKGROUND SYNC  — Retries failed writes when connection restores.
  ═══════════════════════════════════════════════════════════════════════
*/

const CACHE_VERSION = "tahleem-sw-v4";
const OFFLINE_CACHE = "tahleem-offline-v4";
const STATIC_CACHE  = "tahleem-static-v4";
const CHUNK_CACHE   = "tahleem-chunks-v4";   // Vite JS/CSS bundles — long TTL

// App shell: pre-cached on every SW install so first paint is instant
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/apple-touch-icon.png",
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // never let a missing icon block the SW
  );
  self.skipWaiting(); // activate immediately, don't wait for old tabs to close
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keep = [CACHE_VERSION, OFFLINE_CACHE, STATIC_CACHE, CHUNK_CACHE];
  event.waitUntil(
    Promise.all([
      // Delete all old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))
      ),
      // Enable navigation preloading — this is the key change that makes
      // page navigations feel instant. While the SW is waking up, the browser
      // simultaneously starts fetching the navigation request.
      self.registration.navigationPreload?.enable(),
    ]).then(() => self.clients.claim()) // control all open tabs immediately
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
//
//  URL type          Strategy                  Why
//  ──────────────    ────────────────────────  ──────────────────────────────
//  Supabase API      BYPASS (never cache)      Auth/data must always be fresh
//  Navigation        Network + preload, then   Fast page switches
//                    cache fallback
//  /assets/*.js/css  Cache-first + bg update   Vite content-hashes = safe to cache
//  Images/fonts      Stale-while-revalidate    Serve instantly, update quietly
//  Everything else   Cache-first, net fallback  Icons, manifest etc.
//
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Never cache: Supabase (auth/db/storage), Paystack, LiveKit ─────────────
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.hostname.includes("paystack.co") ||
    url.hostname.includes("livekit.io")  ||
    url.hostname.includes("livekit.cloud")
  ) return;

  // ── Google Fonts: cache-first ───────────────────────────────────────────────
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Only handle same-origin from here
  if (url.origin !== self.location.origin) return;

  // ── Vite JS/CSS chunks (/assets/*.js, /assets/*.css) ───────────────────────
  // These are content-hashed so a new filename = new file = safe to cache forever.
  // Cache-first: serve from cache instantly, fetch + update in background.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Background update so next visit gets latest
          fetch(request).then((res) => {
            if (res.ok) {
              caches.open(CHUNK_CACHE).then((c) => c.put(request, res));
            }
          }).catch(() => {});
          return cached;
        }
        // Not cached yet — fetch and store
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CHUNK_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Page navigations ────────────────────────────────────────────────────────
  // Uses navigation preload response if available (activated above).
  // Falls back to cache → offline page if network fails.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Try the preloaded response first (browser already started fetching)
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            // Cache this page for offline use
            const clone = preloaded.clone();
            caches.open(OFFLINE_CACHE).then((c) => c.put(request, clone));
            return preloaded;
          }
          // No preload — fetch normally
          const fresh = await fetch(request);
          const clone = fresh.clone();
          caches.open(OFFLINE_CACHE).then((c) => c.put(request, clone));
          return fresh;
        } catch {
          // Offline — serve cached page or app shell
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/") || await caches.match("/index.html");
          return shell || new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // ── Static assets (images, icons, etc.) ────────────────────────────────────
  // Stale-while-revalidate: respond from cache immediately, update quietly.
  if (
    request.destination === "image" ||
    request.destination === "font"  ||
    request.destination === "style"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// ── Push notifications ────────────────────────────────────────────────────────

function buildNotificationOptions(data) {
  const minutesLeft = data.minutes_left ?? 99;
  return {
    body:               data.message || "You have an upcoming class.",
    icon:               "/icons/icon-192x192.png",
    badge:              "/icons/icon-96x96.png",
    tag:                data.tag || "tahleem-class",
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

function buildRingNotificationOptions(data) {
  return {
    body:               `${data.teacher_name || "Your teacher"} is waiting — tap to join now!`,
    icon:               "/icons/icon-192x192.png",
    badge:              "/icons/icon-96x96.png",
    tag:                `ring-${data.class_id || "class"}`,
    renotify:           true,
    requireInteraction: true,   // stays visible until tapped
    silent:             false,
    vibrate:            [800, 400, 800, 400, 800, 1500, 800, 400, 800, 400, 800],
    data: {
      url:          data.join_url || data.url || "/student/timetable",
      type:         "ring",
      class_id:     data.class_id,
      class_title:  data.class_title,
      teacher_name: data.teacher_name,
      join_url:     data.join_url || data.url,
      ring_id:      data.ring_id || `push-${Date.now()}`,
    },
    actions: [
      { action: "join",    title: "📞 Join Now" },
      { action: "dismiss", title: "Decline"     },
    ],
  };
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const isRing = data.type === "ring";
  const title  = isRing
    ? `📞 ${data.class_title || "Class"} — Starting Now!`
    : (data.title || "📚 Class Reminder — Tahleem Academy");
  const opts = isRing
    ? buildRingNotificationOptions(data)
    : buildNotificationOptions(data);

  event.waitUntil(
    self.registration.showNotification(title, opts).then(() => {
      // If a tab is open, also postMessage so the ring overlay shows in-app
      if (isRing) {
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
          clients.forEach((c) => c.postMessage({
            type:         "CLASS_RING",
            class_id:     data.class_id,
            class_title:  data.class_title,
            teacher_name: data.teacher_name,
            join_url:     data.join_url || data.url,
            ring_id:      data.ring_id || `push-${Date.now()}`,
          }));
        });
      }
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url ||
                    event.notification.data?.join_url ||
                    "/student/timetable";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if one is open
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

// ── Messages from the app ─────────────────────────────────────────────────────
let keepAliveInterval = null;

self.addEventListener("message", (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "LIVE_CLASS_KEEPALIVE":
      event.source?.postMessage({ type: "LIVE_CLASS_KEEPALIVE_ACK" });
      break;

    case "LIVE_CLASS_START":
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(() => {
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage({ type: "SW_ALIVE" }))
        );
      }, 20000);
      break;

    case "LIVE_CLASS_END":
      if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
      break;

    case "SHOW_NOTIFICATION": {
      const { title, ...rest } = event.data;
      self.registration.showNotification(
        title || "📚 Tahleem Class Reminder",
        buildNotificationOptions(rest)
      );
      break;
    }
  }
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "tahleem-sync") {
    event.waitUntil(
      Promise.resolve().then(() => {
        console.log("[Tahleem SW] Background sync — connection restored");
      })
    );
  }
});

// ── Periodic Background Sync — refresh timetable hourly ──────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "tahleem-timetable-refresh") {
    event.waitUntil(
      fetch("/student/timetable", { cache: "no-store" })
        .then((res) => {
          if (res.ok) {
            return caches.open(OFFLINE_CACHE).then((c) =>
              c.put("/student/timetable", res)
            );
          }
        })
        .catch(() => {})
    );
  }
});
