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

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.json') || url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).then(r=>{ const c=r.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(req,c)); return r; }).catch(()=>caches.match(req)));
    return;
  }
  if (req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')) {
    e.respondWith(fetch(req).then(r=>{ caches.open(CACHE_NAME).then(c=>c.put(req,r.clone())); return r; }).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(networkRes => { if (['script','style','image'].includes(req.destination)) { caches.open(CACHE_NAME).then(c=>c.put(req, networkRes.clone())); } return networkRes; })));
});
