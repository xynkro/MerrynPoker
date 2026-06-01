// Merryn Poker — service worker
// Strategy:
//   • HTML (the app shell) → NETWORK-FIRST so updates ship instantly when online,
//     falling back to cache only when offline.
//   • Static assets (icons, bg images, manifest) → CACHE-FIRST.
//   • Cross-origin (Apps Script, Sheets API) → never intercepted.

const CACHE = 'merryn-v37';

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'merryn-fonts').map((k) => caches.delete(k))))
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

  // Google Fonts (display font) — cache-first so the headings render on a cold
  // OFFLINE launch after the first online load. Stored in a separate long-lived
  // cache that isn't purged on version bumps (fonts rarely change).
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open('merryn-fonts').then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((resp) => {
            if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

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
