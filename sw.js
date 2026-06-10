// Business Hub — Service Worker v1.0
// Offline caching strategy: Cache-first for assets, network-first for data

const CACHE_NAME = 'biz-hub-v1';
const OFFLINE_CACHE = 'biz-hub-offline-v1';

// Files to cache on install
const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
];

// ── INSTALL: pre-cache core files ──────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching core files');
      // Cache each file individually so one failure doesn't break all
      return Promise.allSettled(
        CORE_FILES.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean old caches ─────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== OFFLINE_CACHE;
        }).map(function(k) {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: cache-first strategy ────────────────────────────
self.addEventListener('fetch', function(e) {
  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension://')) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) {
        // Serve from cache, update in background
        var fetchUpdate = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, response.clone());
            });
          }
          return response;
        }).catch(function() {});
        return cached;
      }

      // Not in cache — try network
      return fetch(e.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        // Cache successful responses
        var toCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, toCache);
        });
        return response;
      }).catch(function() {
        // Offline fallback — return cached index.html for navigation
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── BACKGROUND SYNC: data persistence ─────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_VERSION') {
    e.ports[0].postMessage({ version: CACHE_NAME });
  }
});
