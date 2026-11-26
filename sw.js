// Service worker: guarda la app para abrirla sin internet. Sube CACHE cada vez que publiques cambios.
const CACHE = 'subnetpro-v9';
const SHELL = [
  './', 'index.html', 'css/app.css', 'favicon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/lib.js', 'js/quiz.js', 'js/practice.js', 'js/calculator.js',
  'js/account.js', 'js/chat.js', 'js/supa.js', 'js/sync.js', 'js/config.js', 'js/bits.js', 'js/drills.js', 'js/themes.js', 'js/theme-boot.js', 'js/feedback.js',
  'js/core/ipv4.js', 'js/core/subnetting.js', 'data/unidades.json',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para ver siempre lo último) y, si no hay conexión, lo guardado.
// Las peticiones a Supabase nunca se guardan: llevan datos personales.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? caches.match('index.html'))),
  );
});
