// public/sw.js — Tahleem Academy Service Worker v6
// v5 fix: no-refresh on minimize→resume. Cache-first navigation with background revalidation.
// v6 fix: ROOT CAUSE of forced reloads during login / live class / exams.
//   `self.skipWaiting()` used to be called unconditionally on every install,
//   which seizes every open tab the instant ANY deploy lands — regardless of
//   what the user is doing. Per the SW spec, a worker with no existing
//   controller activates immediately on its own (nothing to wait for), so
//   removing the unconditional call here costs nothing for first installs
//   and fixes everything for updates: a new SW now properly waits until the
//   page explicitly tells it to take over (see the "message" handler below,
//   and src/main.tsx for the safe-to-update gating).

const CACHE_NAME = "tahleem-v6";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";
const APP_URL    = self.location.origin;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", ICON, BADGE]).catch(() => {})
    )
    // NOTE: no self.skipWaiting() here on purpose. If there's no existing
    // controller (true first install / fresh tab), the browser activates this
    // worker on its own — nothing is disrupted. If there IS an existing
    // controller (an update landing while the app is already open), this
    // worker now correctly sits in "waiting" until the page asks for it via
    // the SKIP_WAITING message below, instead of yanking control away
    // mid-login, mid-class, or mid-exam.
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

// ── Push subscription change ──────────────────────────────────────────────────

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

// ── Fetch — FIXED navigation strategy ────────────────────────────────────────
//
// PROBLEM with old code:
//   navigate requests used network-first: `fetch(e.request).catch(→ cache)`.
//   On iOS/Android, when the PWA resumes from background, the OS re-issues
//   the navigation request. The SW intercepts it, goes to the network, gets a
//   fresh response, and the browser treats that as "new document" → full reload.
//
// FIX — cache-first for navigation + background revalidation:
//   1. Serve the cached "/" shell instantly (no network round-trip → no reload).
//   2. In the background, fetch "/" to keep the cache warm for the NEXT visit.
//   3. Static assets (/assets/*) are already immutable-cached by Vercel — they
//      never change after a deploy, so cache-first is always correct for them.
//   4. API calls / Supabase / external requests bypass the SW entirely.

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Let Supabase and external API calls go straight to network
  if (
    e.request.url.includes("supabase.co") ||
    e.request.url.includes("livekit") ||
    e.request.url.includes("fonts.googleapis.com") ||
    e.request.url.includes("fonts.gstatic.com")
  ) return;

  // ── Navigation requests (HTML page loads / resume) ────────────────────────
  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match("/");

        if (cached) {
          // Serve the cached shell immediately — prevents the reload-on-resume.
          // Then silently refresh the cache in the background.
          e.waitUntil(
            fetch("/").then(fresh => {
              if (fresh.ok) cache.put("/", fresh);
            }).catch(() => {/* offline — cached copy is fine */})
          );
          return cached;
        }

        // No cache yet (first install): go to network and cache the result.
        return fetch(e.request).then(response => {
          if (response.ok) cache.put("/", response.clone());
          return response;
        }).catch(() => Response.error());
      })
    );
    return;
  }

  // ── Static assets — cache-first, populate on miss ─────────────────────────
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && /\.(png|jpg|svg|woff2?|css|js)$/.test(e.request.url)) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});
