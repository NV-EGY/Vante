// service-worker.js
const CACHE_NAME = 'vante-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/admin-orders.html',
  '/admin-products.html',
  '/Profits.html',
  '/Audit-log.html',
  '/js/logger.js',
  '/js/sync-orders.js',
  '/js/ui-integration.js',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/favicon.png',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});