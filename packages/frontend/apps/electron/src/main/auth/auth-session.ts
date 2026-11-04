import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  AuthSessionError,
  AuthTokenBroker,
  type AuthTokenPair,
  type AuthTokenResponse,
  classifyAuthError,
  classifyAuthHttpError,
  PERMANENT_AUTH_CODES,
} from '@affine/auth';
import { app, safeStorage } from 'electron';

import { logger } from '../logger';
import { authFetch } from './transport';

const FILEPATH = path.join(app.getPath('userData'), 'auth-sessions.json');
const TEMP_FILEPATH = `${FILEPATH}.tmp`;
const INSTALLATION_FILEPATH = path.join(
  app.getPath('userData'),
  'installation-id'
);
const brokers = new Map<string, AuthTokenBroker>();
const refreshCapabilities = new Map<
  string,
  { promise: Promise<boolean>; expiresAt: number }
>();
// Auth starts after the main process acquires Electron's single-instance lock.
// The token store and operation journal require one owner per userData directory.
const memoryStore = new Map<string, AuthTokenPair>();
let fileMutation = Promise.resolve();
let installationId: Promise<string> | undefined;
const AUTH_REQUEST_TIMEOUT = 10_000;

function secureStorageAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' ||
      safeStorage.getSelectedStorageBackend() !== 'basic_text')
  );
}

export function normalizeEndpoint(endpoint: string) {
  return new URL(endpoint).origin;
}

async function readStore(): Promise<Record<string, string>> {
  let encoded: string;
  try {
    encoded = await fs.readFile(FILEPATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    logger.error('failed to read auth session store');
    throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
  }
  try {
    const value = JSON.parse(encoded);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    logger.error('invalid auth session store');
    return {};
  }
}

async function mutateFile(mutator: (store: Record<string, string>) => void) {
  const operation = fileMutation.then(async () => {
    const store = await readStore();
    mutator(store);
    await fs.writeFile(TEMP_FILEPATH, JSON.stringify(store), {
      mode: 0o600,
      flush: true,
    });
    await fs.rename(TEMP_FILEPATH, FILEPATH);
  });
  fileMutation = operation.catch(() => {});
  return await operation;
}

function encrypt(pair: AuthTokenPair) {
  return safeStorage.encryptString(JSON.stringify(pair)).toString('base64');
}

function decrypt(value: string): AuthTokenPair | null {
  let plaintext: string;
  try {
    plaintext = safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    // A locked Keychain is not evidence that the persisted credential is bad.
    logger.error('failed to decrypt auth session');
    throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
  }
  try {
    return JSON.parse(plaintext);
  } catch {
    // Parser errors can contain the decrypted credential; never log them.
    logger.error('invalid auth session record');
    return null;
  }
}

function storage(endpoint: string) {
  let persistedSessionId: string | undefined;
  return {
    async load() {
      const memory = memoryStore.get(endpoint);
      if (memory) return memory;
      if (!secureStorageAvailable()) {
        // Retain an encrypted session while its storage backend is unavailable.
        if ((await readStore())[endpoint]) {
          throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
        }
        return null;
      }
      const encrypted = (await readStore())[endpoint];
      if (!encrypted) return null;
      const pair = decrypt(encrypted);
      if (!pair) await mutateFile(store => delete store[endpoint]);
      persistedSessionId = pair?.session?.id;
      return pair;
    },
    async save(pair: AuthTokenPair) {
      if (!secureStorageAvailable()) {
        // Refresh must not turn an existing durable session into a volatile one
        // if Keychain availability changes while its request is in flight.
        if (persistedSessionId === pair.session.id) {
          throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
        }
        await mutateFile(store => delete store[endpoint]);
        memoryStore.set(endpoint, pair);
        persistedSessionId = undefined;
        return;
      }
      await mutateFile(store => {
        store[endpoint] = encrypt(pair);
      });
      memoryStore.delete(endpoint);
      persistedSessionId = pair.session.id;
    },
    async clear() {
      memoryStore.delete(endpoint);
      await mutateFile(store => delete store[endpoint]);
      persistedSessionId = undefined;
    },
  };
}

// Discover support without credentials; pending operations never downgrade.
function supportsRefreshRequestId(endpoint: string) {
  let cached = refreshCapabilities.get(endpoint);
  if (cached && cached.expiresAt <= Date.now()) cached = undefined;
  if (!cached) {
    const pending = (async () => {
      const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT);
      const response = await authFetch(
        new URL('/api/auth/session/refresh', endpoint).toString(),
        {
          headers: {
            'x-affine-client-kind': 'native',
            'x-affine-version': BUILD_CONFIG.appVersion,
          },
          signal,
        }
      );
      // Old servers have no GET handler for this route. Never probe via POST.
      if (response.status === 404 || response.status === 405) return false;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw classifyAuthHttpError(response.status, body);
      }
      // Some old self-hosts serve the SPA fallback for unknown GET routes.
      if (!response.headers.get('content-type')?.includes('application/json')) {
        return false;
      }
      const body: unknown = await response.json().catch(() => {
        throw new AuthSessionError(
          signal.aborted
            ? 'AUTH_REQUEST_TIMEOUT'
            : 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
          true
        );
      });
      if (
        body &&
        typeof body === 'object' &&
        'refreshRequestId' in body &&
        typeof body.refreshRequestId === 'boolean'
      ) {
        return body.refreshRequestId;
      }
      throw new AuthSessionError('AUTH_SESSION_TEMPORARILY_UNAVAILABLE', true);
    })();
    const entry = { promise: pending, expiresAt: Infinity };
    refreshCapabilities.set(endpoint, entry);
    void pending.then(
      supported => {
        if (refreshCapabilities.get(endpoint) === entry) {
          entry.expiresAt = supported ? Infinity : Date.now() + 60_000;
        }
      },
      () => {
        if (refreshCapabilities.get(endpoint) === entry) {
          refreshCapabilities.delete(endpoint);
        }
      }
    );
    cached = entry;
  }
  return cached.promise;
}

async function refresh(
  endpoint: string,
  refreshToken: string,
  requestId?: string
) {
  const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT);
  const response = await authFetch(
    new URL('/api/auth/session/refresh', endpoint).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
        'x-affine-version': BUILD_CONFIG.appVersion,
      },
      body: JSON.stringify({ refreshToken, refreshRequestId: requestId }),
      signal,
    }
  );
  const body = await response.json().catch(error => {
    // Keep known HTTP errors when the response body is lost.
    if (!response.ok) throw classifyAuthHttpError(response.status, null);
    if (signal.aborted)
      throw new AuthSessionError('AUTH_REQUEST_TIMEOUT', true);
    if (error instanceof SyntaxError) return {};
    throw new AuthSessionError('NETWORK_ERROR', true);
  });
  if (!response.ok) {
    const error = classifyAuthHttpError(response.status, body);
    if (
      requestId &&
      response.status === 400 &&
      error.code === 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE' &&
      body &&
      typeof body === 'object' &&
      (('code' in body && body.code === 'VALIDATION_ERROR') ||
        ('type' in body && body.type === 'VALIDATION_ERROR') ||
        ('name' in body && body.name === 'VALIDATION_ERROR'))
    ) {
      // Never downgrade an operation that a newer server may already have committed.
      throw new AuthSessionError('AUTH_SESSION_RECOVERY_UNSUPPORTED', false);
    }
    throw error;
  }
  return body as AuthTokenResponse;
}

export function getAuthSessionBroker(endpoint: string) {
  const normalized = normalizeEndpoint(endpoint);
  let broker = brokers.get(normalized);
  if (!broker) {
    broker = new AuthTokenBroker(
      storage(normalized),
      {
        refresh: (token, requestId) => refresh(normalized, token, requestId),
      },
      {
        createRefreshRequestId: randomUUID,
        supportsRefreshRequestId: () => supportsRefreshRequestId(normalized),
      }
    );
    brokers.set(normalized, broker);
  }
  return broker;
}

export async function initializeAuthSessions() {
  // Allow window startup; individual brokers retry credential reads.
  const store = await readStore().catch(() => ({}));
  for (const endpoint of Object.keys(store)) {
    try {
      getAuthSessionBroker(endpoint);
    } catch (error) {
      logger.error('failed to initialize auth session', endpoint, error);
    }
  }
}

export function isManagedAuthEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    return brokers.has(parsed.origin);
  } catch {
    return false;
  }
}

export async function setAuthSession(
  endpoint: string,
  response: AuthTokenResponse
) {
  await getAuthSessionBroker(endpoint).set(response);
  return { persistent: secureStorageAvailable() };
}

export function getInstallationId() {
  if (installationId) return installationId;
  const pending = fs
    .readFile(INSTALLATION_FILEPATH, 'utf8')
    .then(value => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value
        )
      ) {
        throw new Error('Invalid installation id');
      }
      return value;
    })
    .catch(async () => {
      const value = randomUUID();
      await fs.writeFile(INSTALLATION_FILEPATH, value, { mode: 0o600 });
      return value;
    });
  installationId = pending;
  void pending.catch(() => {
    if (installationId === pending) installationId = undefined;
  });
  return pending;
}

export async function revokeAuthSession(endpoint: string) {
  const normalized = normalizeEndpoint(endpoint);
  await getAuthSessionBroker(normalized).revoke(
    'sign-out',
    async (refreshToken: string) => {
      const response = await authFetch(
        new URL('/api/auth/session/revoke', normalized).toString(),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-affine-client-kind': 'native',
            'x-affine-version': BUILD_CONFIG.appVersion,
          },
          body: JSON.stringify({ refreshToken }),
          signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT),
        }
      );
      if (!response.ok) throw new Error('Failed to revoke auth session');
    }
  );
}

export async function clearAuthSession(endpoint: string, reason: string) {
  await getAuthSessionBroker(endpoint).clear(reason);
}

export async function getValidAccessToken(
  endpoint: string,
  minValidity = 60_000
) {
  try {
    return await getAuthSessionBroker(endpoint).getValidAccessToken(
      minValidity
    );
  } catch (error) {
    const classified = classifyAuthError(error);
    if (
      classified.code === 'AUTH_SESSION_EMPTY' ||
      PERMANENT_AUTH_CODES.has(classified.code)
    ) {
      return null;
    }
    throw classified;
  }
}

export async function getAccessTokenForUrl(url: string, minValidity = 60_000) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    return await getValidAccessToken(parsed.origin, minValidity);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export async function refreshAccessTokenForUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  return (
    await getAuthSessionBroker(parsed.origin).refresh('access-token-expired')
  ).accessToken;
}

async function authorizedRequest(
  request: Request,
  targetUrl: string,
  accessToken?: string
) {
  const cloned = request.clone();
  const headers = new Headers(cloned.headers);
  headers.delete('Authorization');
  const token = accessToken ?? (await getAccessTokenForUrl(targetUrl));
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(targetUrl, {
    body:
      cloned.method === 'GET' || cloned.method === 'HEAD'
        ? undefined
        : cloned.body,
    headers,
    method: cloned.method,
    redirect: cloned.redirect,
    signal: cloned.signal,
    duplex: 'half',
  });
}

export async function executeAuthSessionRequest(
  request: Request,
  targetUrl: string,
  execute: (request: Request) => Promise<Response>
) {
  const retry = request.clone();
  const response = await execute(await authorizedRequest(request, targetUrl));
  if (response.status !== 401) return response;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null;
  if (body?.code !== 'ACCESS_TOKEN_EXPIRED') return response;
  const token = await refreshAccessTokenForUrl(targetUrl);
  return await execute(await authorizedRequest(retry, targetUrl, token));
}
