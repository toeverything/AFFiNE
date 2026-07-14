import path from 'node:path';

import { beforeEach, expect, test, vi } from 'vitest';

const sessionFile = path.join('/test-user-data', 'auth-sessions.json');
const temporarySessionFile = `${sessionFile}.tmp`;

const runtime = vi.hoisted(() => ({
  encryptionAvailable: true,
  backend: 'unknown',
  failWrite: false,
  files: new Map<string, string>(),
  fetch: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (file: string) => {
      const value = runtime.files.get(file);
      if (value === undefined) {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      }
      return value;
    }),
    writeFile: vi.fn(async (file: string, value: string) => {
      if (runtime.failWrite) throw new Error('disk unavailable');
      runtime.files.set(file, value);
    }),
    rename: vi.fn(async (source: string, target: string) => {
      runtime.rename(source, target);
      const value = runtime.files.get(source);
      if (value !== undefined) runtime.files.set(target, value);
      runtime.files.delete(source);
    }),
    rm: vi.fn(async (file: string) => {
      runtime.files.delete(file);
    }),
  },
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/test-user-data' },
  net: { fetch: runtime.fetch },
  safeStorage: {
    isEncryptionAvailable: () => runtime.encryptionAvailable,
    getSelectedStorageBackend: () => runtime.backend,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

vi.mock('../../src/main/logger', () => ({
  logger: { error: vi.fn() },
}));

import {
  clearAuthSession,
  executeAuthSessionRequest,
  getValidAccessToken,
  normalizeEndpoint,
  revokeAuthSession,
  setAuthSession,
} from '../../src/main/auth/auth-session';

beforeEach(() => {
  runtime.encryptionAvailable = true;
  runtime.backend = 'unknown';
  runtime.failWrite = false;
  runtime.fetch.mockReset();
  runtime.rename.mockClear();
});

test.each([
  ['https://AFFINE.PRO/path?query=1', 'https://affine.pro'],
  ['https://affine.pro:443', 'https://affine.pro'],
  ['http://localhost:80/path', 'http://localhost'],
  ['http://localhost:8080/path', 'http://localhost:8080'],
])('normalizes auth endpoint %s', (endpoint, expected) => {
  expect(normalizeEndpoint(endpoint)).toBe(expected);
});

test('atomically persists one encrypted token-pair record', async () => {
  const endpoint = 'https://persistent.example';
  const pair = tokenResponse('access-persistent', 'p', 900);

  await expect(setAuthSession(endpoint, pair)).resolves.toEqual({
    persistent: true,
  });
  expect(await getValidAccessToken(endpoint)).toBe('access-persistent');
  expect(runtime.rename).toHaveBeenCalledWith(
    temporarySessionFile,
    sessionFile
  );
  const file = runtime.files.get(sessionFile) ?? '';
  expect(file).not.toContain(pair.refreshToken);
});

test('keeps a session in main-process memory when safeStorage is unavailable', async () => {
  const endpoint = 'https://session-only.example';
  await setAuthSession(endpoint, tokenResponse('old-persistent', 'o', 900));
  runtime.encryptionAvailable = false;

  await expect(
    setAuthSession(endpoint, tokenResponse('session-access', 's', 900))
  ).resolves.toEqual({ persistent: false });
  expect(await getValidAccessToken(endpoint)).toBe('session-access');
  expect(runtime.files.get(sessionFile)).not.toContain(endpoint);
  runtime.encryptionAvailable = true;
});

test('rejects Linux basic_text persistence and removes an older disk session', async () => {
  const platform = vi
    .spyOn(process, 'platform', 'get')
    .mockReturnValue('linux');
  const endpoint = 'https://basic-text.example';
  await setAuthSession(endpoint, tokenResponse('old', 'o', 900));
  runtime.backend = 'basic_text';

  await expect(
    setAuthSession(endpoint, tokenResponse('memory', 'm', 900))
  ).resolves.toEqual({ persistent: false });
  expect(await getValidAccessToken(endpoint)).toBe('memory');
  expect(runtime.files.get(sessionFile)).not.toContain(endpoint);
  platform.mockRestore();
});

test('shares one refresh across concurrent main-process callers', async () => {
  const endpoint = 'https://refresh.example';
  await setAuthSession(endpoint, tokenResponse('expiring', 'a', 1));
  runtime.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(tokenResponse('fresh', 'b', 900)))
  );

  const tokens = await Promise.all(
    Array.from({ length: 50 }, () => getValidAccessToken(endpoint, 120_000))
  );

  expect(tokens.every(token => token === 'fresh')).toBe(true);
  expect(runtime.fetch).toHaveBeenCalledTimes(1);
});

test('preserves credentials for unknown refresh errors', async () => {
  const endpoint = 'https://unknown-error.example';
  await setAuthSession(endpoint, tokenResponse('still-valid', 'u', 900));
  runtime.fetch.mockImplementation(
    async () =>
      new Response(JSON.stringify({ code: 'UNKNOWN_SELF_HOSTED_ERROR' }), {
        status: 401,
      })
  );

  await expect(getValidAccessToken(endpoint, 1_000_000)).rejects.toMatchObject({
    code: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
    transient: true,
  });
  await expect(getValidAccessToken(endpoint, 0)).resolves.toBe('still-valid');
});

test('clears credentials only for an allowlisted permanent refresh error', async () => {
  const endpoint = 'https://permanent-error.example';
  await setAuthSession(endpoint, tokenResponse('expired', 'e', 1));
  runtime.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: 'AUTH_SESSION_REVOKED' }), {
      status: 401,
    })
  );

  await expect(getValidAccessToken(endpoint, 120_000)).resolves.toBeNull();
  await expect(getValidAccessToken(endpoint, 0)).resolves.toBeNull();
  expect(runtime.files.get(sessionFile)).not.toContain(endpoint);
});

test('cleans a decrypted record that does not match the token-pair schema', async () => {
  const endpoint = 'https://corrupt.example';
  runtime.files.set(
    sessionFile,
    JSON.stringify({
      [endpoint]: Buffer.from(JSON.stringify({ token: 'legacy' })).toString(
        'base64'
      ),
    })
  );

  await expect(getValidAccessToken(endpoint)).resolves.toBeNull();
  expect(runtime.files.get(sessionFile)).not.toContain(endpoint);
});

test('recovers an unreadable session file on the next atomic write', async () => {
  runtime.files.set(sessionFile, '{not-json');
  const endpoint = 'https://file-corruption.example';

  await expect(getValidAccessToken(endpoint)).resolves.toBeNull();
  await setAuthSession(endpoint, tokenResponse('recovered', 'c', 900));

  expect(JSON.parse(runtime.files.get(sessionFile)!)).toHaveProperty(endpoint);
  await expect(getValidAccessToken(endpoint)).resolves.toBe('recovered');
});

test('does not publish a rotated pair until an atomic save succeeds', async () => {
  const endpoint = 'https://save-failure.example';
  await setAuthSession(endpoint, tokenResponse('old', 'a', 1));
  runtime.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(tokenResponse('rotated', 'b', 900)))
  );
  runtime.failWrite = true;

  await expect(getValidAccessToken(endpoint, 120_000)).rejects.toMatchObject({
    code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
  });
  runtime.failWrite = false;
  await expect(getValidAccessToken(endpoint, 120_000)).resolves.toBe('rotated');
  expect(runtime.fetch).toHaveBeenCalledTimes(1);
});

test('main replaces renderer bearer and strips it after local clear', async () => {
  const endpoint = 'https://owner.example';
  await setAuthSession(endpoint, tokenResponse('main-token', 'm', 900));
  const execute = vi.fn(async () => new Response('{}'));

  await executeAuthSessionRequest(
    new Request(`${endpoint}/graphql`, {
      headers: { Authorization: 'Bearer renderer-stale' },
    }),
    `${endpoint}/graphql`,
    execute
  );
  expect(execute.mock.calls[0]?.[0].headers.get('Authorization')).toBe(
    'Bearer main-token'
  );

  await clearAuthSession(endpoint, 'test-clear');
  await executeAuthSessionRequest(
    new Request(`${endpoint}/graphql`, {
      headers: { Authorization: 'Bearer renderer-stale' },
    }),
    `${endpoint}/graphql`,
    execute
  );
  expect(execute.mock.calls[1]?.[0].headers.get('Authorization')).toBeNull();
});

test.each([
  {
    code: 'ACCESS_TOKEN_EXPIRED',
    expectedRequests: 2,
    method: 'POST',
  },
  { code: 'FORBIDDEN', expectedRequests: 1, method: 'PUT' },
])('replays a protocol request once for $code only', async item => {
  const endpoint = `https://${item.code.toLowerCase()}.example`;
  await setAuthSession(endpoint, tokenResponse('initial', 'i', 900));
  runtime.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(tokenResponse('refreshed', 'f', 900)))
  );
  const execute = vi
    .fn<(request: Request) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: item.code }), { status: 401 })
    )
    .mockResolvedValueOnce(new Response('{}'));

  await executeAuthSessionRequest(
    new Request(`${endpoint}/api/test`, {
      method: item.method,
      body: JSON.stringify({ value: item.code }),
      duplex: 'half',
    }),
    `${endpoint}/api/test`,
    execute
  );

  expect(execute).toHaveBeenCalledTimes(item.expectedRequests);
  expect(runtime.fetch).toHaveBeenCalledTimes(
    item.code === 'ACCESS_TOKEN_EXPIRED' ? 1 : 0
  );
  for (const [request] of execute.mock.calls) {
    await expect(request.text()).resolves.toBe(
      JSON.stringify({ value: item.code })
    );
  }
});

test('clears locally before revoking without exposing refresh token over IPC', async () => {
  const endpoint = 'https://revoke.example';
  const pair = tokenResponse('revoke-access', 'r', 900);
  await setAuthSession(endpoint, pair);
  runtime.fetch.mockResolvedValueOnce(new Response('{}'));

  await revokeAuthSession(endpoint);

  expect(await getValidAccessToken(endpoint)).toBeNull();
  const request = runtime.fetch.mock.calls.at(-1)?.[1] as RequestInit;
  expect(request.body).toBe(
    JSON.stringify({ refreshToken: pair.refreshToken })
  );
});

function tokenResponse(accessToken: string, seed: string, expiresIn: number) {
  return {
    tokenType: 'Bearer' as const,
    accessToken,
    expiresIn,
    refreshToken: `aff_rt_v1.${seed.repeat(24)}.${seed.repeat(43)}`,
    refreshExpiresAt: '2030-01-01T00:00:00.000Z',
    session: {
      id: '00000000-0000-4000-8000-000000000001',
      absoluteExpiresAt: '2031-01-01T00:00:00.000Z',
    },
  };
}
