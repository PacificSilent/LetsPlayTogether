const CACHE_NAME = 'webrtc-videobroadcast-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/socket.io/socket.io.js',
  '/watch.js'
  // Agrega otros recursos, por ejemplo, íconos o archivos CSS si es necesario
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});