// SpeakUp Daily service worker: shows reminder pushes and opens the app on Today's plan when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'SpeakUp Daily', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'SpeakUp Daily';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Today's plan is waiting.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'speakup-plan',
    renotify: true,
    data: { url: data.url || '/?plan=1#plan' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/?plan=1#plan', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* cross-scope */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
