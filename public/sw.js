// public/sw.js — Tahleem Academy Service Worker v7
// v7 fixes (on top of v6):
//   1. APP_URL is HARDCODED to the production domain — never self.location.origin.
//      If the SW was registered while the app was open on a Lovable preview URL,
//      self.location.origin would be wrong and every notification click would open
//      the wrong site.
//   2. sanitiseUrl() strips non-production hosts from push payload URLs so old
//      notifications with a Lovable URL stored in join_url still navigate correctly.
//   3. Cache name bumped to tahleem-v7 so the new SW auto-activates on deploy.

const CACHE_NAME = "tahleem-v7";
const ICON       = "/icons/icon-192x192.png";
const BADGE      = "/icons/icon-96x96.png";

// ⚠️  HARDCODED — do NOT change to self.location.origin.
//     self.location.origin returns whatever origin the SW script was served from.
//     On a Lovable preview domain that becomes *.lovable.app, which gets embedded
//     into every notification click URL permanently.
const APP_URL = "https://tahleemacademy.vercel.app";

// Strips any non-production host from an absolute URL, or prepends APP_URL to a
// relative path. Also handles the case where old notifications stored a Lovable URL.
function sanitiseUrl(raw) {
  if (!raw) return APP_URL;
  if (raw.startsWith(APP_URL)) return raw;
  if (raw.startsWith("/")) return APP_URL + raw;
  try {
    const { pathname, search, hash } = new URL(raw);
    return APP_URL + pathname + search + hash;
  } catch {
    return APP_URL;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", ICON, BADGE]).catch(() => {})
    )
    // No self.skipWaiting() on purpose — see v6 comments. A new SW sits in
    // "waiting" until the page explicitly requests the takeover via SKIP_WAITING,
    // preventing disruptive reloads mid-class or mid-exam.
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

  // FIX: sanitise the URL from the push payload — old DB records may have a
  // Lovable preview URL saved as join_url.
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
    // Store the SANITISED url — notificationclick reads from here
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

  // Double-sanitise — handles old notifications stored before v7 that may have
  // had a Lovable URL baked into notification.data.url
  const fullUrl = sanitiseUrl(e.notification.data?.url ?? "/");

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      // Focus an already-open Tahleem tab and navigate it to the target URL
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", url: fullUrl });
          return client.focus();
        }
      }
      // No open tab — open a new window at the correct production URL
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

// ── Fetch — cache-first navigation strategy (unchanged from v6) ───────────────
//
// Navigation requests serve the cached shell instantly to prevent the
// reload-on-resume bug on iOS/Android. Static assets are cache-first.
// API/Supabase/LiveKit/Anthropic calls bypass the SW entirely.

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
