const CACHE_NAME = 'recipebox-v17';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=17',
  './app.js?v=17',
  './manifest.json'
];

// Bypass the browser HTTP cache when installing an updated app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('recipebox-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  // External recipe and Drive requests are never cached by the app.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // Revalidate even when GitHub Pages gives app files a ten-minute lifetime.
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        } catch {
          // A full cache must not prevent a fresh page from opening.
        }
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
