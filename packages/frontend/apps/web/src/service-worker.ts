/// <reference lib="webworker" />
import { routeRequest } from './service-worker-route';

// `self.__WB_MANIFEST` is a placeholder replaced at build time by
// workbox-build's injectManifest (see tools/cli/src/bundle.ts) with an
// array of {url, revision} entries for the small app-shell chunks that are
// safe to precache. Large lazy-loaded chunks (e.g. the drawio shape-library
// partitions, see RUNTIME_CACHEABLE_PATTERN below) are deliberately
// excluded from this list — see CAP-2 in
// _bmad-output/specs/spec-pwa-conversion/SPEC.md.
declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const PRECACHE_MANIFEST = self.__WB_MANIFEST;
const PRECACHE_NAME = `affine-precache-v${BUILD_CONFIG.appVersion}`;
const RUNTIME_CACHE_NAME = 'affine-runtime-v1';
const CACHE_NAMES = new Set([PRECACHE_NAME, RUNTIME_CACHE_NAME]);

const PRECACHED_PATHNAMES = new Set(
  PRECACHE_MANIFEST.map(
    entry => new URL(entry.url, self.location.origin).pathname
  )
);

// Lazy-loaded JS/CSS chunks (this app code-splits heavily — far more than
// just the drawio shape library) must never be *precached* (would defeat
// the lazy-loading these chunks exist for) but are worth caching once
// actually requested, so a feature the user has already visited keeps
// working offline on a later visit. Content-hashed filenames make them safe
// to cache-first indefinitely. Originally scoped to just the drawio
// `library-stencils-*` chunks; broadened to any /js/*.js chunk after
// finding a numbered route/feature chunk failed outright offline; broadened
// again to match by extension alone, not by path prefix, after finding a
// lazy *.css chunk (npm-async-@vanilla-extract...) fails the exact same way
// — it isn't under /js/ at all, it's emitted at the root, so the /js/-
// scoped pattern never matched it.
//
// No `*.worker.js` exclusion (there was one; removed): every worker except
// nbstore.worker.js is small (under 200KB) and completely harmless to
// cache. nbstore.worker.js is ~50MB and *is* a real risk against iOS's
// documented ~50MB Cache Storage soft cap — but it's also the actual engine
// that reads local IndexedDB documents, so excluding it meant offline mode
// could render the app shell but never any real content, defeating this
// story's entire purpose. Caching it is opportunistic (only after a real
// online visit already downloaded it once), not eager precache, so this is
// a considered tradeoff, not an oversight — AC-5's real-hardware testing is
// where this actually gets validated, not guessed at here.
// (RUNTIME_CACHEABLE_PATTERN now lives in service-worker-route.ts.)

async function cacheFirst(
  request: Request,
  cacheName: string
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  // no-store for the same reason as the install handler above: this is the
  // one fetch that actually populates the cache, so it's the one place a
  // stale HTTP-cache hit would get baked in and served cache-first forever
  // after.
  const response = await fetch(request, { cache: 'no-store' });
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(cache =>
      cache.addAll(
        // Request objects, not plain URL strings: cache.addAll()'s internal
        // fetch honors a Request's own cache mode. Without this, a fresh
        // enough entry in the browser's own plain HTTP cache (see the
        // 'no-store' comment in the navigate handler below for the full
        // mechanism) can silently satisfy this fetch too — meaning the
        // *install* step itself can re-poison this precache with stale
        // content on every single install, permanently, regardless of how
        // correct the navigate handler's own fallback logic is: it can only
        // ever be as fresh as whatever got precached here.
        PRECACHE_MANIFEST.map(
          entry => new Request(entry.url, { cache: 'no-store' })
        )
      )
    )
  );
  // Deliberately no self.skipWaiting() here. The new worker stays in the
  // "waiting" state until the page explicitly asks it to activate (see the
  // 'message' listener below) — the user chooses when to reload via the
  // update banner, so an in-progress edit is never interrupted. See CAP-3.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names =>
        Promise.all(
          names
            .filter(name => !CACHE_NAMES.has(name))
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self
      .skipWaiting()
      .catch(error => console.error('skipWaiting failed', error));
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const route = routeRequest(
    request,
    self.location.origin,
    PRECACHED_PATHNAMES
  );

  // Precached shell chunks are served from PRECACHE_NAME rather than the
  // runtime cache (the runtime pattern also matches them), so they aren't
  // needlessly re-fetched into a duplicate runtime-cache entry.
  if (route === 'precache') {
    event.respondWith(cacheFirst(request, PRECACHE_NAME));
    return;
  }

  if (route === 'runtime') {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE_NAME));
    return;
  }

  if (route === 'navigate') {
    // Network-first for navigations so a normal online reload always gets
    // the latest shell; fall back to the cached shell when offline so a
    // previously-open workspace still renders after the OS reclaims the
    // app and relaunches it with no network available. See CAP-1.
    //
    // Deliberately fetch(request.url) here, NOT fetch(request): a Request
    // with mode 'navigate' can't be re-fetched directly (mode 'navigate' is
    // reserved for the browser's own top-level navigations, and passing it
    // to fetch() throws instead of producing a rejected promise, which
    // event.respondWith() then treats as an unhandled error rather than
    // running the .catch() fallback below). Fetching the URL string instead
    // creates a fresh request with the default 'cors'/'same-origin' mode.
    //
    // { cache: 'no-store' } is required, not optional: without it, a fresh
    // enough entry in the browser's own plain HTTP cache (a layer entirely
    // separate from this SW's Cache Storage, e.g. from an earlier request
    // that got server-side content-negotiated to a different variant, such
    // as a mobile UA hitting this same URL) can satisfy this fetch without
    // ever touching the network. That's a silent success, not a rejection,
    // so .catch() never runs and the wrong document renders — no error, no
    // fallback to our own correct cached shell below. no-store forces a
    // genuine network attempt every time, so offline reliably rejects here.
    event.respondWith(
      fetch(request.url, { cache: 'no-store' })
        .then(response => {
          // Keep the offline fallback fresh on every successful online
          // visit, not just at install time: install only runs once per SW
          // version, so without this, '/' could sit unrefreshed in Cache
          // Storage for a version's entire lifetime even while the rest of
          // the precache updates normally alongside it.
          if (response.ok) {
            // Clone synchronously, right here, before returning: the
            // browser starts consuming the returned response's body
            // immediately once respondWith() resolves, and clone() throws
            // once any consumption has started. The async caches.open()
            // below was running after that had already begun, which is
            // exactly what "Body has already been consumed" meant.
            const responseToCache = response.clone();
            caches
              .open(PRECACHE_NAME)
              .then(cache => cache.put('/', responseToCache))
              .catch(error =>
                console.error('failed to refresh cached shell', error)
              );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PRECACHE_NAME);
          // '/' , not '/index.html': see the matching comment in
          // tools/cli/src/bundle.ts's injectServiceWorkerManifest — '/' is
          // the URL actually precached now, and the one proven correct
          // across every real navigation shape this app uses.
          const rootMatch = await cache.match('/');
          return rootMatch ?? Response.error();
        })
    );
  }
});
