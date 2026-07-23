// Kill switch: an earlier version of this file cached the app shell, which
// could leave a browser stuck on a stale shell. This version unregisters itself
// and clears all caches so clients recover to the plain (network) app.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.navigate(c.url));
      } catch {
        /* best effort */
      }
    })(),
  );
});
