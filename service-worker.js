// TransFísica PWA — Service Worker
// Estrategia: Cache-First para assets, Network-First para datos externos

const CACHE_NAME = 'transfisica-v6';
const STATIC_ASSETS = [
  './PWA.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&family=Barlow:wght@300;400;500;600;700&display=swap'
];

// ── INSTALL: precache assets estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets locales (no fallar si los externos no cargan)
      return cache.addAll([
        './PWA.html',
        './manifest.json',
        './icons/icon.svg'
      ]).then(() => {
        // Intentar cachear icons PNG (pueden no existir aún)
        return Promise.allSettled([
          cache.add('./icons/icon-192.png'),
          cache.add('./icons/icon-512.png')
        ]);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejas ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-First con fallback a red ──
self.addEventListener('fetch', event => {
  const { request } = event;

  // Solo interceptar GET
  if (request.method !== 'GET') return;

  // No interceptar extensiones de Chrome ni requests de devtools
  if (request.url.startsWith('chrome-extension://')) return;
  if (request.url.includes('localhost') && request.url.includes('/__')) return;

  // APIs externas (OpenFoodFacts, etc.) → Network-first, fallback cache
  const isExternalAPI = request.url.includes('world.openfoodfacts.org') ||
                        request.url.includes('api.') ||
                        request.url.includes('/api/');

  if (isExternalAPI) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML principal → Network-first (siempre intenta red, cache solo si offline)
  if (request.destination === 'document' || request.url.endsWith('PWA.html')) {
    event.respondWith(
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Resto de assets (iconos, fuentes) → Cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});

// ── SYNC: notificación de actualización disponible ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
