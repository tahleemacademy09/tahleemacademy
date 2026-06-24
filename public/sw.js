// public/sw.js — Tahleem Academy Service Worker v9
// v9 fixes:
//   1. notificationclick: navigates to path-only (strips domain) so APK deep-links work
//   2. push handler: strips dedup query params from url before displaying notification
//   3. Urgency header added via web-push options for timely Android delivery

const CACHE_NAME = "tahleem-v9";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";

// ⚠️  HARDCODED — do NOT change to self.location.origin.
const APP_URL = "https://tahleemacademy.vercel.app";

// Strips any non-production host from an absolute URL, or prepends APP_URL to a
// relative path. Also strips dedup query params (class=...&t=...) added by scheduler.
function sanitiseUrl(raw) {
  if (!raw) return APP_URL;
  let url = raw;
  // Strip dedup params first (e.g. ?class=abc:t=0 or &class=...)
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
    // No self.skipWaiting() on purpose — see v6 comments.
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

  // Sanitise the URL — strips dedup params and non-production hosts
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
    // Store SANITISED url (no dedup params) so notificationclick navigates cleanly
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

  // Sanitise and extract relative path — critical for APK deep-link navigation
  const fullUrl      = sanitiseUrl(e.notification.data?.url ?? "/");
  const relativePath = toRelativePath(fullUrl);

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          // Post relative path so the app navigates via React Router (no full reload)
          client.postMessage({ type: "NOTIFICATION_CLICK", url: relativePath, fullUrl });
          return client.focus();
        }
      }
      // No open tab — open directly to the full URL
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

// ── Fetch — cache-first navigation strategy ───────────────────────────────────

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  if (
    e.request.url.includes("supabase.co") ||
    e.request.url.includes("livekit") ||
    e.request.url.includes("anthropic.com") ||
    e.request.url.includes("fonts.googleapis.com") ||
    e.request.url.includes("fonts.gstatic.com")
  ) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match("/");
        if (cached) {
          e.waitUntil(
            fetch("/").then(fresh => {
              if (fresh.ok) cache.put("/", fresh);
            }).catch(() => {})
          );
          return cached;
        }
        return fetch(e.request).then(response => {
          if (response.ok) cache.put("/", response.clone());
          return response;
        }).catch(() => Response.error());
      })
    );
    return;
  }

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
