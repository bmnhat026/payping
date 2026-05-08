// Service Worker cho PingPay PWA
// Bump CACHE_NAME mỗi lần deploy để force refresh client.
const CACHE_NAME = 'pingpay-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Bypass tất cả request Firebase / Google API — Firestore SDK có cache riêng (IndexedDB),
  // nếu SW cache thêm sẽ trả stale data và phá realtime listener.
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com') ||
    url.hostname.endsWith('gstatic.com') ||
    url.hostname.includes('firebase')
  ) {
    return; // mặc định: lên thẳng network
  }

  // Network-first cho navigation/HTML — đảm bảo user thấy bản mới nhất sau deploy.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate cho asset khác.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
