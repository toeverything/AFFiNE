import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { logger } from '../logger';

const FILEPATH = path.join(app.getPath('userData'), 'native-auth-tokens.json');

type TokenRecord = {
  token: string;
};

// safeStorage may not be available in some environments (e.g. Linux without a keyring), so we fall back to an in-memory store in that case
const memoryTokenStore: Record<string, string> = {};

function normalizeEndpoint(endpoint: string) {
  return new URL(endpoint).origin;
}

function readStore(): Record<string, string> {
  if (!fs.existsSync(FILEPATH)) return {};

  try {
    return JSON.parse(fs.readFileSync(FILEPATH, 'utf-8'));
  } catch (error) {
    logger.error('failed to read native auth token store', error);
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  fs.writeFileSync(FILEPATH, JSON.stringify(store, null, 2));
}

function encryptToken(record: TokenRecord) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure native auth token storage is not available.');
  }
  return safeStorage.encryptString(JSON.stringify(record)).toString('base64');
}

function decryptToken(value: string): TokenRecord | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  } catch (error) {
    logger.error('failed to decrypt native auth token', error);
    return null;
  }
}

export function setNativeAuthToken(endpoint: string, token: string) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!safeStorage.isEncryptionAvailable()) {
    memoryTokenStore[normalizedEndpoint] = token;
    return false;
  }

  const store = readStore();
  store[normalizedEndpoint] = encryptToken({ token });
  writeStore(store);
  return true;
}

export function deleteNativeAuthToken(endpoint: string) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  delete memoryTokenStore[normalizedEndpoint];

  const store = readStore();
  delete store[normalizedEndpoint];
  writeStore(store);
}

export function getNativeAuthToken(endpoint: string) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const memoryToken = memoryTokenStore[normalizedEndpoint];
  if (memoryToken) return memoryToken;

  const encrypted = readStore()[normalizedEndpoint];
  if (!encrypted) return null;
  return decryptToken(encrypted)?.token ?? null;
}

export function getAuthTokenForUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'ws:') {
      parsed.protocol = 'http:';
    } else if (parsed.protocol === 'wss:') {
      parsed.protocol = 'https:';
    }
    return getNativeAuthToken(parsed.origin);
  } catch {
    return null;
  }
}
