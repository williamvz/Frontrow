// Frontrow's service worker.
//
// Two jobs, and deliberately no more:
//   1. serve the app shell instantly, and keep working when the Pi is asleep;
//   2. show a goal notification and take you to the right match when you tap it.
//
// The classic trap here is a stale worker serving an old build forever. The
// cache name carries the build stamp, the worker takes over immediately, and
// anything that is not a same-origin static asset goes straight to the network.

const VERSION = 'frontrow-v1';
const SHELL = 'frontrow-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // The scope is the app's base, so this works under Home Assistant ingress.
    await cache.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API or the event stream: a cached score is a wrong score.
  if (url.pathname.includes('/api/')) {
    // Crests are the one exception — they are immutable and worth keeping.
    if (url.pathname.includes('/api/crest/')) {
      event.respondWith(cacheFirst(request));
    }
    return;
  }

  // Navigations fall back to the cached shell when the Pi is unreachable, so
  // the app opens and says "no connection" rather than showing a browser error.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Hashed build assets are immutable; everything else revalidates.
  if (/\.[0-9a-f]{8,}\./.test(url.pathname) || /\.(woff2|png|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return hit || Response.error();
  }
}

// ------------------------------------------------------------ notifications
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }

  const title = payload.title || 'Frontrow';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    // The tag is the match id, so a second goal in the same match replaces the
    // first notification instead of stacking a fourth buzz onto your lock screen.
    tag: payload.tag || 'frontrow',
    renotify: payload.renotify !== false,
    icon: './icon-192.png',
    badge: './icon-badge.png',
    vibrate: [120, 60, 120, 60, 240],
    data: payload.data || {},
    silent: false,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '#/vandaag';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.includes(self.registration.scope)) {
        await client.focus();
        client.postMessage({ type: 'navigate', to: target });
        return;
      }
    }
    await self.clients.openWindow(`./${target}`);
  })());
});
