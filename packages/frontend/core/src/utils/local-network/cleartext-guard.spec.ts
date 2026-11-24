import { describe, expect, test, vi } from 'vitest';

import { installCleartextGuard } from './cleartext-guard';

function createScope() {
  class FakeWebSocket {
    constructor(readonly url: string | URL) {}
  }
  const fetch = vi.fn(() => Promise.resolve(new Response()));
  const scope = {
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    fetch: fetch as unknown as typeof globalThis.fetch,
    location: { href: 'https://localhost/' } as Location,
  };
  installCleartextGuard(scope);
  return { scope, fetch };
}

describe('installCleartextGuard', () => {
  test.each([
    { url: 'ws://affine.home.com/socket.io/', blocked: true },
    { url: 'ws://192.168.1.10:3010/socket.io/', blocked: false },
    { url: 'ws://nas.local/socket.io/', blocked: false },
    { url: 'wss://affine.home.com/socket.io/', blocked: false },
  ])('WebSocket to $url is blocked: $blocked', ({ url, blocked }) => {
    const { scope } = createScope();
    const open = () => new scope.WebSocket(url);
    if (blocked) {
      expect(open).toThrow(DOMException);
    } else {
      expect(open().url).toBe(url);
    }
  });

  test.each([
    { url: 'http://affine.home.com/graphql', blocked: true },
    { url: 'http://192.168.1.10:3010/graphql', blocked: false },
    { url: 'http://localhost:3010/graphql', blocked: false },
    { url: 'https://affine.home.com/graphql', blocked: false },
    { url: '/graphql', blocked: false },
  ])('fetch to $url is blocked: $blocked', async ({ url, blocked }) => {
    const { scope, fetch } = createScope();
    const request = scope.fetch(url);
    if (blocked) {
      await expect(request).rejects.toThrow(TypeError);
      expect(fetch).not.toHaveBeenCalled();
    } else {
      await expect(request).resolves.toBeInstanceOf(Response);
      expect(fetch).toHaveBeenCalledWith(url, undefined);
    }
  });
});
