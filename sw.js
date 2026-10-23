/* Service Worker: Spiel offline spielbar und installierbar machen.
   Netz zuerst (beim Entwickeln immer der neueste Stand), Cache als Rückfall ohne Verbindung.
   Eigene Musik aus music/ wird nicht zwischengespeichert. Bei neuen Dateien ASSETS und VERSION anpassen. */
const VERSION = 'godzilla-heisei-v9';
const ASSETS = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/main.js', './js/input.js', './js/camera.js', './js/godzilla.js', './js/effects.js', './js/city.js',
  './js/buildings.js', './js/ground.js', './js/military.js', './js/boss.js', './js/atmosphere.js', './js/audio.js', './js/minimap.js', './js/levels.js', './js/biollante.js', './js/chain.js', './js/ghidorah.js', './js/moths.js', './js/water.js', './js/props.js', './js/kaiju.js', './js/kaiju93.js', './js/kaiju94.js',
  './vendor/three/build/three.module.min.js', './vendor/three/addons/loaders/GLTFLoader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js', './vendor/three/addons/utils/SkeletonUtils.js',
  './assets/models/godzilla.glb', './assets/models/city.glb', './assets/models/units.glb', './assets/models/biollante.glb', './assets/models/ghidorah.glb', './assets/models/mothra.glb', './assets/models/kaiju93.glb', './assets/models/kaiju94.glb',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/music/')) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
