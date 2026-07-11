import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  AuthTokenBroker,
  type AuthTokenPair,
  type AuthTokenResponse,
  classifyAuthError,
} from '@affine/auth';
import { app, net, safeStorage } from 'electron';

import { logger } from '../logger';

const FILEPATH = path.join(app.getPath('userData'), 'auth-sessions.json');
const TEMP_FILEPATH = `${FILEPATH}.tmp`;
const INSTALLATION_FILEPATH = path.join(
  app.getPath('userData'),
  'installation-id'
);
const brokers = new Map<string, AuthTokenBroker>();
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
  try {
    const value = JSON.parse(await fs.readFile(FILEPATH, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('failed to read auth session store', error);
    }
    return {};
  }
}

async function mutateFile(mutator: (store: Record<string, string>) => void) {
  const operation = fileMutation.then(async () => {
    const store = await readStore();
    mutator(store);
    await fs.writeFile(TEMP_FILEPATH, JSON.stringify(store), { mode: 0o600 });
    await fs.rename(TEMP_FILEPATH, FILEPATH);
  });
  fileMutation = operation.catch(() => {});
  return await operation;
}

function encrypt(pair: AuthTokenPair) {
  return safeStorage.encryptString(JSON.stringify(pair)).toString('base64');
}

function decrypt(value: string): AuthTokenPair | null {
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  } catch (error) {
    logger.error('failed to decrypt auth session', error);
    return null;
  }
}

function storage(endpoint: string) {
  return {
    async load() {
      if (!secureStorageAvailable()) {
        return memoryStore.get(endpoint) ?? null;
      }
      const encrypted = (await readStore())[endpoint];
      if (!encrypted) return null;
      const pair = decrypt(encrypted);
      if (!pair) await mutateFile(store => delete store[endpoint]);
      return pair;
    },
    async save(pair: AuthTokenPair) {
      if (!secureStorageAvailable()) {
        await mutateFile(store => delete store[endpoint]);
        memoryStore.set(endpoint, pair);
        return;
      }
      await mutateFile(store => {
        store[endpoint] = encrypt(pair);
      });
      memoryStore.delete(endpoint);
    },
    async clear() {
      memoryStore.delete(endpoint);
      await mutateFile(store => delete store[endpoint]);
    },
  };
}

async function refresh(endpoint: string, refreshToken: string) {
  const response = await net.fetch(
    new URL('/api/auth/session/refresh', endpoint).toString(),
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyAuthError({
      code:
        typeof body === 'object' && body && 'code' in body
          ? String(body.code)
          : 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
    });
  }
  return body as AuthTokenResponse;
}

export function getAuthSessionBroker(endpoint: string) {
  const normalized = normalizeEndpoint(endpoint);
  let broker = brokers.get(normalized);
  if (!broker) {
    broker = new AuthTokenBroker(storage(normalized), {
      refresh: (token: string) => refresh(normalized, token),
    });
    brokers.set(normalized, broker);
  }
  return broker;
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
      const response = await net.fetch(
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
    if (classified.code === 'AUTH_SESSION_EMPTY' || !classified.transient) {
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
