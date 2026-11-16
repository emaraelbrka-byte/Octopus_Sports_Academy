// This site does not use a service worker.
// This file only exists to remove an old service worker that another project left on this address
// (it was caching our API answers). Browsers check /sw.js for updates; this version deletes all caches,
// unregisters itself, and reloads open tabs so they talk to the server directly again.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
