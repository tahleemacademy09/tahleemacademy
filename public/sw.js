// public/sw.js — Tahleem Academy Service Worker
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Tahleem Academy', {
      body:    data.body  ?? '',
      icon:    data.icon  ?? '/icons/icon-192x192.png',
      badge:   data.badge ?? '/icons/icon-96x96.png',
      tag:     data.tag   ?? 'tahleem-push',
      vibrate: [200, 100, 200],
      data:    data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
