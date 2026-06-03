/*
  public/sw.js — Tahleem Academy Service Worker  v5
  ═══════════════════════════════════════════════════════════════════════
  v5 additions vs v4:
  • Daily content push: Quran verse / Hadith / Seerah / Hifdh — rich cards
  • Class RING: persistent ringing notification, posts CLASS_RING to app
  • Class reminder: 15 min / 5 min with Join action
  • All notifications show in phone notification bar when app is closed
  • Notification grouping by type (tag) so they don't stack up
  ═══════════════════════════════════════════════════════════════════════
*/

const CACHE_VERSION = "tahleem-sw-v5";
const OFFLINE_CACHE = "tahleem-offline-v5";
const STATIC_CACHE  = "tahleem-static-v5";
const CHUNK_CACHE   = "tahleem-chunks-v5";

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
      .catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keep = [CACHE_VERSION, OFFLINE_CACHE, STATIC_CACHE, CHUNK_CACHE];
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))
      ),
      self.registration.navigationPreload?.enable(),
    ]).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.hostname.includes("paystack.co") ||
    url.hostname.includes("livekit.io")  ||
    url.hostname.includes("livekit.cloud")
  ) return;

  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          fetch(request).then((res) => {
            if (res.ok) caches.open(CHUNK_CACHE).then((c) => c.put(request, res.clone()));
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then((res) => {
          if (res.ok) caches.open(CHUNK_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            caches.open(OFFLINE_CACHE).then((c) => c.put(request, preloaded.clone()));
            return preloaded;
          }
          const fresh = await fetch(request);
          caches.open(OFFLINE_CACHE).then((c) => c.put(request, fresh.clone()));
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/") || await caches.match("/index.html");
          return shell || new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  if (request.destination === "image" || request.destination === "font" || request.destination === "style") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// ── Push notifications ────────────────────────────────────────────────────────

function buildNotificationOpts(data) {
  const type       = data.type || "reminder";
  const minutesLeft = data.minutes_left ?? 99;

  // ── CLASS RING ─────────────────────────────────────────────────────────────
  if (type === "ring") {
    return {
      body:               `${data.teacher_name || "Your teacher"} is waiting — tap to join now!`,
      icon:               "/icons/icon-192x192.png",
      badge:              "/icons/icon-96x96.png",
      tag:                `ring-${data.class_id || "class"}`,
      renotify:           true,
      requireInteraction: true,
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
        { action: "join",    title: "📹 Join Now" },
        { action: "dismiss", title: "Decline" },
      ],
    };
  }

  // ── DAILY QURANIC VERSE ────────────────────────────────────────────────────
  if (type === "daily_content" && data.tag === "daily-verse") {
    return {
      body:               data.message || data.body || "",
      icon:               "/icons/icon-192x192.png",
      badge:              "/icons/icon-96x96.png",
      tag:                "daily-verse",
      renotify:           false,
      requireInteraction: false,
      silent:             false,
      vibrate:            [200, 100, 200],
      data:               { url: data.url || "/student/dashboard" },
      actions:            [{ action: "open", title: "📖 Open Dashboard" }],
    };
  }

  // ── DAILY HADITH ───────────────────────────────────────────────────────────
  if (type === "daily_content" && data.tag === "daily-hadith") {
    return {
      body:               data.message || "",
      icon:               "/icons/icon-192x192.png",
      badge:              "/icons/icon-96x96.png",
      tag:                "daily-hadith",
      renotify:           false,
      requireInteraction: false,
      silent:             false,
      vibrate:            [200, 100, 200],
      data:               { url: data.url || "/student/dashboard" },
      actions:            [{ action: "open", title: "🌙 Read More" }],
    };
  }

  // ── HIFDH REMINDER ─────────────────────────────────────────────────────────
  if (type === "daily_content" && data.tag === "daily-hifdh") {
    return {
      body:               data.message || "",
      icon:               "/icons/icon-192x192.png",
      badge:              "/icons/icon-96x96.png",
      tag:                "daily-hifdh",
      renotify:           false,
      requireInteraction: false,
      silent:             false,
      vibrate:            [300, 150, 300, 150, 600],
      data:               { url: data.url || "/student/hifdh" },
      actions: [
        { action: "open_hifdh", title: "📗 Open Hifdh" },
        { action: "dismiss",    title: "Later" },
      ],
    };
  }

  // ── SEERAH / OTHER DAILY CONTENT ───────────────────────────────────────────
  if (type === "daily_content") {
    return {
      body:               data.message || "",
      icon:               "/icons/icon-192x192.png",
      badge:              "/icons/icon-96x96.png",
      tag:                data.tag || "daily-content",
      renotify:           false,
      requireInteraction: false,
      silent:             false,
      vibrate:            [200, 100, 200],
      data:               { url: data.url || "/student/dashboard" },
      actions:            [{ action: "open", title: "📚 Open" }],
    };
  }

  // ── CLASS REMINDER (default) ───────────────────────────────────────────────
  return {
    body:               data.message || "You have an upcoming class.",
    icon:               "/icons/icon-192x192.png",
    badge:              "/icons/icon-96x96.png",
    tag:                data.tag || "tahleem-class",
    renotify:           true,
    requireInteraction: minutesLeft <= 5,
    vibrate:            minutesLeft <= 5 ? [400, 200, 400, 200, 800] : [200, 100, 200],
    silent:             false,
    data:               { url: data.url || "/student/timetable" },
    actions: [
      { action: "join",    title: "📹 Join Class" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const isRing  = data.type === "ring";
  const isDaily = data.type === "daily_content";

  let title;
  if (isRing) {
    title = `📞 ${data.class_title || "Class"} — Starting Now!`;
  } else if (isDaily) {
    title = data.title || "📚 Tahleem Academy";
  } else {
    title = data.title || "📚 Class Reminder — Tahleem Academy";
  }

  const opts = buildNotificationOpts(data);

  event.waitUntil(
    self.registration.showNotification(title, opts).then(() => {
      // For ring notifications, also postMessage to open app tabs
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

  // Map action → URL
  let targetUrl = event.notification.data?.url ||
                  event.notification.data?.join_url ||
                  "/student/dashboard";

  if (event.action === "join") {
    targetUrl = event.notification.data?.join_url ||
                event.notification.data?.url ||
                "/student/live-classes";
  }
  if (event.action === "open_hifdh") {
    targetUrl = "/student/hifdh";
  }
  if (event.action === "open") {
    targetUrl = event.notification.data?.url || "/student/dashboard";
  }

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

// ── Messages from the app ─────────────────────────────────────────────────────
let keepAliveInterval = null;

self.addEventListener("message", (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "LIVE_CLASS_START":
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(() => {
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage({ type: "SW_ALIVE" }))
        );
      }, 20_000);
      break;

    case "LIVE_CLASS_END":
      if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
      break;

    case "SHOW_NOTIFICATION": {
      const { title, ...rest } = event.data;
      self.registration.showNotification(
        title || "📚 Tahleem Academy",
        buildNotificationOpts(rest)
      );
      break;
    }
  }
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "tahleem-sync") {
    event.waitUntil(Promise.resolve());
  }
});

// ── Periodic Background Sync ──────────────────────────────────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "tahleem-timetable-refresh") {
    event.waitUntil(
      fetch("/student/timetable", { cache: "no-store" })
        .then((res) => {
          if (res.ok) caches.open(OFFLINE_CACHE).then((c) => c.put("/student/timetable", res));
        })
        .catch(() => {})
    );
  }
});
