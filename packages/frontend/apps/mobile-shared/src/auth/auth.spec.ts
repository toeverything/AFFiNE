import { describe, expect, test, vi } from 'vitest';

import { MessagePortAuthProvider, serveAuthRequests } from './channel';
import { canonicalAuthEndpoint, shouldRefreshAccessToken } from './endpoint';
import { createAuthFetch } from './request';

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
