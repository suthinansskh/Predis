const CACHE_VERSION = 5;
const CACHE_NAME = `predis-v${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './report.html',
  './dashboard.html',
  './myreport.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network-first for API calls, cache-first for assets
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-first for drug_list.json (data that updates)
  if (url.pathname.endsWith('drug_list.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for static assets (serve cached but update in background)
  if (ASSETS.some(a => url.pathname === a || url.pathname.endsWith(a.slice(1)))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
          .then(response => {
            if (response.ok) {
              const resClone = response.clone(); // Clone synchronously
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
});
