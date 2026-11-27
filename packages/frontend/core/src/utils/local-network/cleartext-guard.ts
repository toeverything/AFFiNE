import { isBlockedCleartextUrl } from '.';

type GuardedScope = Pick<typeof globalThis, 'WebSocket' | 'fetch' | 'location'>;

// The WebView has to allow mixed content for local http servers, and the
// native request interception never sees WebSocket handshakes (nor, depending
// on the WebView version, worker requests), so plain-text connections to public
// hosts are refused here as well.
export function installCleartextGuard(scope: GuardedScope) {
  const resolve = (url: string | URL) => new URL(url, scope.location.href);
  const message = (url: URL) =>
    `Plain-text connection to ${url.host} is blocked: only local network servers may use ${url.protocol.slice(0, -1)}.`;

  const NativeWebSocket = scope.WebSocket;
  scope.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const target = resolve(url);
      if (isBlockedCleartextUrl(target)) {
        throw new DOMException(message(target), 'SecurityError');
      }
      super(url, protocols);
    }
  };

  const nativeFetch = scope.fetch;
  scope.fetch = (input, init) => {
    const target = resolve(input instanceof Request ? input.url : input);
    if (isBlockedCleartextUrl(target)) {
      return Promise.reject(new TypeError(message(target)));
    }
    return nativeFetch.call(scope, input, init);
  };
}
