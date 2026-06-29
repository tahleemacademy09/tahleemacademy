// public/sw.js — Tahleem Academy Service Worker v10
// v10 fixes:
//   1. JS chunks are NO LONGER cached by the SW — Vite hashes guarantee freshness
//      via CDN/Vercel headers. Caching chunks caused stale deploys to serve old
//      broken bundles (page-transcript-mgmt etc) even after a new deploy.
//   2. "Response body is already used" fix — navigate handler now always clones
//      the response before caching, and returns the original.
//   3. Cache name bumped to tahleem-v10 — forces old v9 cache (with stale chunks)
//      to be deleted on activate.

const CACHE_NAME = "tahleem-v10";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";

// ⚠️  HARDCODED — do NOT change to self.location.origin.
const APP_URL = "https://tahleemacademy.vercel.app";

// Strips any non-production host from an absolute URL, or prepends APP_URL to a
// relative path. Also strips dedup query params (class=...&t=...) added by scheduler.
function sanitiseUrl(raw) {
  if (!raw) return APP_URL;
  let url = raw;
  try {
    const u = new URL(raw.startsWith("http") ? raw : APP_URL + raw);
    u.searchParams.delete("class");
    u.searchParams.delete("t");
    url = u.toString();
  } catch { /* fall through */ }

  if (url.startsWith(APP_URL)) return url;
  if (url.startsWith("/")) return APP_URL + url;
  try {
    const { pathname, search, hash } = new URL(url);
    return APP_URL + pathname + search + hash;
  } catch {
    return APP_URL;
  }
}

// Extract just the path+search+hash from a full URL (for in-app navigation)
function toRelativePath(fullUrl) {
  try {
    const u = new URL(fullUrl);
    return u.pathname + u.search + u.hash || "/";
  } catch {
    return "/";
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", ICON, BADGE]).catch(() => {})
    )
    // No self.skipWaiting() on purpose — avoids forced reload during live class/exam.
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

  const url = sanitiseUrl(data.url ?? data.join_url ?? "/");
  const tag  = data.tag ?? (isRing ? "tahleem-ring" : "tahleem-push");

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
          { action: "open",    title: "Open" },
          { action: "dismiss", title: "Dismiss" },
        ],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const fullUrl      = sanitiseUrl(e.notification.data?.url ?? "/");
  const relativePath = toRelativePath(fullUrl);

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", url: relativePath, fullUrl });
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
    return;
  }

  if (e.data?.type === "LIVE_CLASS_KEEPALIVE") {
    e.source?.postMessage({ type: "LIVE_CLASS_KEEPALIVE_ACK" });
    return;
  }
});

// ── Fetch — strategic caching (NO JS chunks) ──────────────────────────────────
//
// KEY DECISION: Vite JS chunks have content-hashed filenames (e.g. index-ABC123.js).
// Vercel serves them with long Cache-Control max-age. The browser's HTTP cache
// handles JS chunk freshness perfectly — the SW must NOT interfere, or stale
// chunks from old deploys get stuck in the SW cache and cause crashes even after
// a new deploy.
//
// What the SW DOES cache:
//   - The app shell (/) for offline support
//   - Static assets: images, fonts, icons (change rarely, safe to cache)
//
// What the SW does NOT cache:
//   - .js files (Vite chunks) — browser HTTP cache handles these
//   - .css files — also chunk-hashed by Vite, let browser handle
//   - API calls, Supabase, LiveKit, external fonts

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Never intercept external services
  if (
    e.request.url.includes("supabase.co") ||
    e.request.url.includes("livekit") ||
    e.request.url.includes("anthropic.com") ||
    e.request.url.includes("fonts.googleapis.com") ||
    e.request.url.includes("fonts.gstatic.com")
  ) return;

  // Never intercept JS or CSS — Vite hashes + Vercel CDN handle these correctly.
  // SW caching JS chunks causes stale bundles to persist across deploys.
  if (/\/assets\/.*\.(js|css)(\?.*)?$/.test(e.request.url)) return;

  // Navigation requests: serve cached shell, revalidate in background
  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match("/");
        if (cached) {
          // Revalidate shell in background (stale-while-revalidate)
          e.waitUntil(
            fetch("/").then(fresh => {
              if (fresh.ok) cache.put("/", fresh.clone());
            }).catch(() => {})
          );
          return cached;
        }
        // No cache yet — fetch and cache
        return fetch(e.request).then(response => {
          if (response.ok) cache.put("/", response.clone());
          return response;
        }).catch(() => Response.error());
      })
    );
    return;
  }

  // Static assets only: images, icons, woff fonts
  // CSS/JS are excluded above — only cache truly static binary assets here
  if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?)(\?.*)?$/.test(e.request.url)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
          }
          return response;
        });
      })
    );
  }
  // All other requests (API, etc.) — pass through with no caching
});
