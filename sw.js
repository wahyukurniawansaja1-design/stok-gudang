const CACHE_NAME = 'stok-gudang-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Tambahkan aset statis penting lainnya (CSS, JS utama) jika diperlukan
];

// Install Service Worker dan Cache aset
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Ambil data dari cache jika offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});