// Merryn Poker — service worker
// Strategy: cache-first for app shell + assets, network for everything else.
// Apps Script (cross-origin) is intentionally NOT intercepted — the app must
// always hit the network for sync.

const CACHE = 'merryn-v2';

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'poker-bg.jpg',
  'merryn-exterior.jpg',
  'merryn-entrance.jpg',
  'merryn-hosting.jpg',
  'merryn-stairs1.jpg',
  'merryn-stairs2.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only intercept same-origin requests. Apps Script + Sheets API stay on the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Stash successful basic responses for next visit
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => {
        // Offline + uncached → fall back to the app shell so SPA-style navigation still works
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
