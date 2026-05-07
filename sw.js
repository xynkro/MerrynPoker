// Merryn Poker — service worker
// Strategy:
//   • HTML (the app shell) → NETWORK-FIRST so updates ship instantly when online,
//     falling back to cache only when offline.
//   • Static assets (icons, bg images, manifest) → CACHE-FIRST.
//   • Cross-origin (Apps Script, Sheets API) → never intercepted.

const CACHE = 'merryn-v16';

const STATIC_ASSETS = [
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
      .then((cache) => cache.addAll([...STATIC_ASSETS, 'index.html']))
      .then(() => self.skipWaiting()) // take over without waiting for tab close
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page → SW message: lets the page request immediate activation of a waiting SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell (navigation requests + index.html) → network-first
  const isShell = req.mode === 'navigate'
    || url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isShell) {
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put('index.html', clone));
        }
        return resp;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Everything else → cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => Response.error());
    })
  );
});
