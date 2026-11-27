// Oryzen Learn service worker (27 Nov 2026). It makes the app installable and shows a friendly
// page when there's no internet. It never caches study data or pages: everything comes fresh
// from the network, so nothing private is kept by the browser here.
const OFFLINE = "oryzen-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE).then((cache) => cache.add("/offline.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});
