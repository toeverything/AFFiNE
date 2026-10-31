/**
 * How the service worker serves a request: `'navigate'` (network first,
 * cached app shell when offline), `'precache'` / `'runtime'` (cache first
 * from that cache), or `null` (not intercepted). Pure, so it can be tested
 * outside a service worker.
 */
export type ServiceWorkerRoute = 'navigate' | 'precache' | 'runtime' | null;

// Lazy-loaded JS/CSS chunks: content-hashed, so safe to cache-first once
// requested. See the matching comment in service-worker.ts.
const RUNTIME_CACHEABLE_PATTERN = /\.(js|css)$/;

export function routeRequest(
  request: { method: string; url: string; mode: string },
  origin: string,
  precachedPathnames: Set<string>
): ServiceWorkerRoute {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;

  // Navigations first: the home-screen launch URL (manifest start_url
  // "/?source=pwa") has pathname "/", which is precached, but the cache
  // holds "/" without the query. Routed to the precache, its full-URL
  // match missed and every offline launch failed. The navigate route falls
  // back to the cached "/" shell explicitly.
  if (request.mode === 'navigate') return 'navigate';
  if (precachedPathnames.has(url.pathname)) return 'precache';
  if (RUNTIME_CACHEABLE_PATTERN.test(url.pathname)) return 'runtime';
  return null;
}
