// C7 Case Files — service worker. App-shell cache so the installed app
// opens instantly and works offline (the DATA already lives in IndexedDB /
// the data folder — this only caches the app's own code).
//
// PUSH LAW (learned the hard way on Book33): bump CACHE_VERSION on EVERY
// push to the deploy repo, or installed phones keep running the old code
// silently. The version string is the whole update mechanism.
importScripts('js/version.js'); // the single version number; bump it there
const CACHE_VERSION = self.C7_VERSION;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/tokens.css',
  'css/app.css',
  'js/main.js',
  'js/db.js',
  'js/store.js',
  'js/ui.js',
  'js/sync.js',
  'js/config.js',
  'js/contradictions.js',
  'js/pages/contradictions.js',
  'js/assets.js',
  'js/profile-parse.js',
  'js/lookup.js',
  'js/media.js',
  'js/version.js',
  'js/schema.sql',
  'js/numerology.js',
  'js/chinese.js',
  'js/western.js',
  'js/relations.js',
  'js/stats.js',
  'js/indicators.js',
  'js/pages/dashboard.js',
  'js/pages/subject.js',
  'js/pages/evidence.js',
  'js/pages/board.js',
  'js/pages/relations.js',
  'js/pages/patterns.js',
  'js/pages/import.js',
  'js/pages/review.js',
  'js/pages/video.js',
  'js/pages/fun.js',
  'vendor/sql-wasm.js',
  'vendor/sql-wasm.wasm',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)));
  // do NOT skipWaiting here — the app shows an "Update ready" chip and the
  // user chooses when to switch. Never reload over her work.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // ONLY our own old caches. Cache storage is origin-wide and Book33
      // lives on this origin too — deleting non-c7 caches would wipe
      // another app's offline shell (and its worker doing the same is
      // exactly how c7's cache got eaten on 2026-09-01).
      Promise.all(keys.filter((k) => k.startsWith('c7-') && k !== CACHE_VERSION && k !== 'c7-share').map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'c7-skip-waiting') self.skipWaiting();
});

// Android share sheet → "Case Files": the OS POSTs the shared images here.
// Stash them in a small cache and bounce to the app, which drains the
// stash into the evidence inbox. (Book33 does the same for .ics files.)
const SHARE_CACHE = 'c7-share';
self.addEventListener('fetch', (e) => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('images').filter((f) => f && f.size);
        const cache = await caches.open(SHARE_CACHE);
        let i = 0;
        for (const f of files) {
          await cache.put(
            `${self.registration.scope}__share__/${Date.now()}-${i++}`,
            new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name || 'shared-image') } })
          );
        }
      } catch (err) { /* nothing shared or unreadable — still open the app */ }
      return Response.redirect('./?shared=1#/evidence', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never intercept cross-origin (Supabase later)
  // ignoreSearch only for page navigations ("./?fresh=…" must still find the
  // shell); for scripts/assets a query string is a deliberate cache-bust and
  // must reach the network
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((hit) => hit || fetch(e.request))
  );
});
