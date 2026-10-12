/* 408 考研学习系统 - Service Worker */
const CACHE_NAME = 'quiz408-main-v1';

const PRECACHE = [
  './',
  './home.html',
  './index.html',
  './notes.html',
  './css/variables.css',
  './css/reset.css',
  './css/layout.css',
  './css/components.css',
  './css/quiz.css',
  './css/notes.css',
  './css/responsive.css',
  './js/utils.js',
  './js/quiz.js',
  './js/notes.js',
  './datasets.json',
  './subjects.json',
  './data.json',
  './data/ds.json',
  './data/os.json',
  './data/ds-cs.json',
  './data/ds-v1.json',
  './data/os-v1.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match('./home.html');
        }
        return Response.error();
      });
    })
  );
});
