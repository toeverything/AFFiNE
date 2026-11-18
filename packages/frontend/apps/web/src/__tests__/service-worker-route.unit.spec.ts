import { describe, expect, it } from 'vitest';

import { routeRequest } from '../service-worker-route';

const origin = 'https://affine.example';
const precached = new Set(['/', '/js/index.abc123.js']);
const route = (path: string, mode = 'cors', method = 'GET') =>
  routeRequest({ method, url: origin + path, mode }, origin, precached);

describe('service worker request routing', () => {
  it('serves a home-screen launch (start_url "/?source=pwa") as a navigation, not a precache lookup', () => {
    // The precache holds "/" but not "/?source=pwa": routed to the precache
    // first, the full-URL cache match missed and offline launch failed
    // ("FetchEvent.respondWith received an error: TypeError: Load failed").
    expect(route('/?source=pwa', 'navigate')).toBe('navigate');
    expect(route('/', 'navigate')).toBe('navigate');
    expect(route('/workspace/w/doc', 'navigate')).toBe('navigate');
  });

  it('serves precached assets from the precache and other chunks from the runtime cache', () => {
    expect(route('/js/index.abc123.js')).toBe('precache');
    expect(route('/js/lazy.def456.js')).toBe('runtime');
    expect(route('/npm-async-x.css')).toBe('runtime');
  });

  it('leaves other requests to the network', () => {
    expect(route('/api/workspaces')).toBeNull();
    expect(route('/js/index.abc123.js', 'cors', 'POST')).toBeNull();
    expect(
      routeRequest(
        { method: 'GET', url: 'https://cdn.example/x.js', mode: 'cors' },
        origin,
        precached
      )
    ).toBeNull();
  });
});
