/* sw.js - simple but safer caching strategy
   - precaches core shell
   - network-first for JSON (subjects.json)
   - stale-while-revalidate for static assets
*/

const CACHE_NAME = 'ahx-shell-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/subjects.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // network-first for JSON and API calls to keep data fresh
  if (url.pathname.endsWith('.json') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then(res => { 
          // update cache
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(()=>caches.match(req))
    );
    return;
  }

  // for navigation (HTML) network-first with fallback to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(r => { caches.open(CACHE_NAME).then(c=>c.put(req, r.clone())); return r; })
      .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  // static assets: cache-first, falling back to network
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(networkRes => {
      // cache resources that look cacheable (images, css, js)
      if (req.destination === 'script' || req.destination === 'style' || req.destination === 'image') {
        caches.open(CACHE_NAME).then(c => c.put(req, networkRes.clone()));
      }
      return networkRes;
    })).catch(() => {
      // optional: return a fallback image for images
      if (req.destination === 'image') return caches.match('/assets/icon-192.png');
    })
  );
});
