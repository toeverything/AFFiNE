import { afterEach, describe, expect, test, vi } from 'vitest';

import { MessagePortAuthProvider, serveAuthRequests } from './channel';
import { canonicalAuthEndpoint, shouldRefreshAccessToken } from './endpoint';
import { createAuthFetch, installAuthRequestProxy } from './request';

function stubXMLHttpRequest(completeOnSend = false) {
  const send = vi.fn();
  const abort = vi.fn();
  const instances = new Set<FakeXMLHttpRequest>();

  class FakeXMLHttpRequest extends EventTarget {
    static readonly DONE = 4;
    readyState = 0;
    status = 0;
    responseType: XMLHttpRequestResponseType = '';
    response: unknown;
    responseText = '';
    timeout = 0;
    withCredentials = false;

    constructor() {
      super();
      instances.add(this);
    }

    open() {
      this.readyState = 1;
    }

    setRequestHeader() {}

    send(body?: Document | XMLHttpRequestBodyInit | null) {
      send(body);
      if (completeOnSend) {
        this.readyState = FakeXMLHttpRequest.DONE;
        this.dispatchEvent(new Event('loadend'));
      }
    }

    abort() {
      abort();
      this.dispatchEvent(new Event('abort'));
      this.dispatchEvent(new Event('loadend'));
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  return {
    send,
    abort,
    respond(status: number, responseText: string) {
      const current = [...instances].at(-1);
      if (!current) throw new Error('No XMLHttpRequest instance');
      current.status = status;
      current.responseText = responseText;
      current.readyState = FakeXMLHttpRequest.DONE;
      current.dispatchEvent(new Event('readystatechange'));
      current.dispatchEvent(new Event('load'));
      current.dispatchEvent(new Event('loadend'));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canonicalAuthEndpoint', () => {
  test.each([
    ['https://AFFINE.PRO/path?query=1', 'https://affine.pro'],
    ['https://affine.pro:443', 'https://affine.pro'],
    ['http://localhost:80/path', 'http://localhost'],
    ['http://localhost:8080/path', 'http://localhost:8080'],
    ['capacitor://localhost/path', 'capacitor://localhost/path'],
    ['invalid endpoint', 'invalid endpoint'],
  ])('normalizes %s', (endpoint, expected) => {
    expect(canonicalAuthEndpoint(endpoint)).toBe(expected);
  });
});

describe('shouldRefreshAccessToken', () => {
  test.each(['ACCESS_TOKEN_EXPIRED', 'ACCESS_TOKEN_INVALID'])(
    'refreshes for %s',
    code => {
      expect(shouldRefreshAccessToken(code)).toBe(true);
    }
  );

  test.each(['INVALID_REFRESH_TOKEN', undefined, null])(
    'does not refresh for %s',
    code => {
      expect(shouldRefreshAccessToken(code)).toBe(false);
    }
  );
});

describe('auth request fetch', () => {
  test('injects the endpoint token', async () => {
    const provider = {
      getValidAccessToken: vi.fn(async () => 'access-token'),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    };
    const rawFetch = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 })
    );
    const fetch = createAuthFetch(provider, rawFetch);

    await fetch('https://example.com/api/workspaces/1/blobs/1');

    expect(provider.getValidAccessToken).toHaveBeenCalledWith(
      'https://example.com'
    );
    expect(
      (rawFetch.mock.calls[0][0] as Request).headers.get('Authorization')
    ).toBe('Bearer access-token');
  });

  test('refreshes and replays an expired request once', async () => {
    const provider = {
      getValidAccessToken: vi.fn(async () => 'expired-token'),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    };
    const rawFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'ACCESS_TOKEN_EXPIRED' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const fetch = createAuthFetch(provider, rawFetch);

    const response = await fetch('https://example.com/graphql');

    expect(response.status).toBe(200);
    expect(provider.refreshAccessToken).toHaveBeenCalledOnce();
    expect(provider.refreshAccessToken).toHaveBeenCalledWith(
      'https://example.com'
    );
    expect(rawFetch).toHaveBeenCalledTimes(2);
    expect(
      (rawFetch.mock.calls[1][0] as Request).headers.get('Authorization')
    ).toBe('Bearer refreshed-token');
  });

  test('does not attach a token when the endpoint has no session', async () => {
    const provider = {
      getValidAccessToken: vi.fn(async () => null),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    };
    const rawFetch = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 })
    );
    const fetch = createAuthFetch(provider, rawFetch);

    await fetch('https://cdn.example.com/presigned/blob');

    expect(
      (rawFetch.mock.calls[0][0] as Request).headers.has('Authorization')
    ).toBe(false);
  });
});

describe('auth request XMLHttpRequest', () => {
  test('does not send after abort while waiting for a token', async () => {
    let resolveToken: (token: string | null) => void = () => {};
    const token = new Promise<string | null>(resolve => {
      resolveToken = resolve;
    });
    const xhrCalls = stubXMLHttpRequest();
    installAuthRequestProxy({
      getValidAccessToken: vi.fn(() => token),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    });
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'https://example.com/graphql');
    xhr.send('body');
    xhr.abort();
    resolveToken('access-token');
    await Promise.resolve();

    expect(xhrCalls.abort).toHaveBeenCalledOnce();
    expect(xhrCalls.send).not.toHaveBeenCalled();
  });

  test('does not send a stale body after reopening', async () => {
    const tokenResolvers: ((token: string | null) => void)[] = [];
    const xhrCalls = stubXMLHttpRequest();
    installAuthRequestProxy({
      getValidAccessToken: vi.fn(
        () =>
          new Promise<string | null>(resolve => {
            tokenResolvers.push(resolve);
          })
      ),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    });
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'https://example.com/first');
    xhr.send('first-body');
    xhr.open('POST', 'https://example.com/second');
    xhr.send('second-body');
    tokenResolvers[1](null);
    tokenResolvers[0](null);
    await Promise.resolve();

    expect(xhrCalls.send).toHaveBeenCalledOnce();
    expect(xhrCalls.send).toHaveBeenCalledWith('second-body');
  });

  test('uses the native lifecycle when token lookup fails', async () => {
    const xhrCalls = stubXMLHttpRequest(true);
    installAuthRequestProxy({
      getValidAccessToken: vi.fn(async () => {
        throw new Error('token lookup failed');
      }),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    });
    const xhr = new XMLHttpRequest();
    const loadend = vi.fn();
    xhr.addEventListener('loadend', loadend);

    xhr.open('POST', 'https://example.com/graphql');
    xhr.send('body');
    await vi.waitFor(() => expect(xhrCalls.send).toHaveBeenCalledWith('body'));

    expect(xhr.readyState).toBe(XMLHttpRequest.DONE);
    expect(loadend).toHaveBeenCalledOnce();
  });

  test('preserves abort lifecycle while waiting to replay', async () => {
    let resolveRefresh: (token: string) => void = () => {};
    const refresh = new Promise<string>(resolve => {
      resolveRefresh = resolve;
    });
    const xhrCalls = stubXMLHttpRequest();
    const provider = {
      getValidAccessToken: vi.fn(async () => null),
      refreshAccessToken: vi.fn(() => refresh),
    };
    installAuthRequestProxy(provider);
    const xhr = new XMLHttpRequest();
    const loadend = vi.fn();
    xhr.addEventListener('loadend', loadend);

    xhr.open('POST', 'https://example.com/graphql');
    xhr.send('body');
    await vi.waitFor(() => expect(xhrCalls.send).toHaveBeenCalledOnce());
    xhrCalls.respond(401, JSON.stringify({ code: 'ACCESS_TOKEN_EXPIRED' }));
    expect(provider.refreshAccessToken).toHaveBeenCalledOnce();

    xhr.abort();
    resolveRefresh('refreshed-token');
    await Promise.resolve();

    expect(loadend).toHaveBeenCalledOnce();
    expect(xhrCalls.send).toHaveBeenCalledOnce();
  });
});

describe('auth message channel', () => {
  test('serves get-valid and refresh operations', async () => {
    const channel = new MessageChannel();
    const nativeProvider = {
      getValidAccessToken: vi.fn(async () => 'access-token'),
      refreshAccessToken: vi.fn(async () => 'refreshed-token'),
    };
    serveAuthRequests(channel.port1, nativeProvider);
    const workerProvider = new MessagePortAuthProvider();
    workerProvider.setPort(channel.port2);

    await expect(
      workerProvider.getValidAccessToken('https://example.com')
    ).resolves.toBe('access-token');
    await expect(
      workerProvider.refreshAccessToken('https://example.com')
    ).resolves.toBe('refreshed-token');

    expect(nativeProvider.getValidAccessToken).toHaveBeenCalledWith(
      'https://example.com'
    );
    expect(nativeProvider.refreshAccessToken).toHaveBeenCalledWith(
      'https://example.com'
    );
    channel.port1.close();
    channel.port2.close();
  });

  test('maps terminal get-valid errors to an empty session', async () => {
    const channel = new MessageChannel();
    const error = Object.assign(new Error('expired'), {
      code: 'AUTH_SESSION_EXPIRED',
    });
    serveAuthRequests(channel.port1, {
      getValidAccessToken: vi.fn(async () => {
        throw error;
      }),
      refreshAccessToken: vi.fn(async () => {
        throw error;
      }),
    });
    const workerProvider = new MessagePortAuthProvider();
    workerProvider.setPort(channel.port2);

    await expect(
      workerProvider.getValidAccessToken('https://example.com')
    ).resolves.toBeNull();
    await expect(
      workerProvider.refreshAccessToken('https://example.com')
    ).rejects.toThrow('AUTH_SESSION_EXPIRED');

    channel.port1.close();
    channel.port2.close();
  });
});
