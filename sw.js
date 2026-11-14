'use strict';

const CACHE_PREFIX = 'parking-shell:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const FILES = ['./', './parking.js?v=2', './manifest.webmanifest', './parking-192.png', './parking-512.png'];
const START_URL = new URL('./', self.location).href;
const STATIC_URLS = new Set(FILES.slice(1).map(file => new URL(file, self.location).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(FILES.map(file => new Request(new URL(file, self.location), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate' && request.url === START_URL) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { signal: AbortSignal.timeout(2500) });
      } catch {
        return (await caches.match(START_URL, { cacheName: CACHE_NAME })) || Response.error();
      }
    })());
    return;
  }

  if (STATIC_URLS.has(request.url)) {
    event.respondWith((async () =>
      (await caches.match(request, { cacheName: CACHE_NAME })) || fetch(request)
    )());
  }
});
