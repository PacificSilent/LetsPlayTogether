const CACHE_NAME = "lpt-cache-v1";
const urlsToCache = [
  "/index.html",
  "/manifest.json",
  "/socket.io/socket.io.js",
  "/forceH264.js",
  // Agrega aquí otros archivos estáticos (CSS, imágenes, etc.)
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Devuelve la respuesta del cache si existe, de lo contrario, la obtén de la red.
      return response || fetch(event.request);
    })
  );
});
