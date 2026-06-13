import path from 'node:path';

import { app, safeStorage } from 'electron';

import { PersistentJSONFileStorage } from '../shared-storage/json-file';
import type { NamespaceHandlers } from '../type';

const byokStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'workspace-byok-keys.json')
);

export function disposeWorkspaceByokStorage() {
  byokStorage.dispose();
}

const allowedProviders = new Set(['openai', 'anthropic', 'gemini', 'fal']);

type WorkspaceByokKey = {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'fal';
  name: string;
  description?: string | null;
  apiKey: string;
  endpoint?: string | null;
  sortOrder?: number | null;
  enabled?: boolean | null;
};

type WorkspaceByokKeyInput = Omit<WorkspaceByokKey, 'apiKey'> & {
  apiKey?: string | null;
};

function assertSupported() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure BYOK key storage is not available.');
  }
}

function hasOwnField(
  key: WorkspaceByokKeyInput,
  field: keyof WorkspaceByokKey
) {
  return Object.prototype.hasOwnProperty.call(key, field);
}

function normalizeKey(
  key: WorkspaceByokKeyInput,
  existing?: WorkspaceByokKey,
  defaultSortOrder = 0
): WorkspaceByokKey {
  if (!allowedProviders.has(key.provider)) {
    throw new Error('Unsupported BYOK provider.');
  }
  const apiKey = key.apiKey ?? existing?.apiKey;
  if (!key.id || !key.name || !apiKey) {
    throw new Error('Invalid BYOK key.');
  }
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    description: hasOwnField(key, 'description')
      ? (key.description ?? null)
      : (existing?.description ?? null),
    apiKey,
    endpoint: hasOwnField(key, 'endpoint')
      ? (key.endpoint ?? null)
      : (existing?.endpoint ?? null),
    sortOrder: hasOwnField(key, 'sortOrder')
      ? (key.sortOrder ?? defaultSortOrder)
      : (existing?.sortOrder ?? defaultSortOrder),
    enabled: hasOwnField(key, 'enabled')
      ? (key.enabled ?? true)
      : (existing?.enabled ?? true),
  };
}

function encryptKey(key: WorkspaceByokKey) {
  return safeStorage
    .encryptString(JSON.stringify(normalizeKey(key)))
    .toString('base64');
}

function decryptKey(value: string): WorkspaceByokKey | null {
  try {
    return normalizeKey(
      JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')))
    );
  } catch {
    return null;
  }
}

function sortWorkspaceKeys(keys: WorkspaceByokKey[]) {
  return keys.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function readWorkspaceKeys(workspaceId: string): WorkspaceByokKey[] {
  assertSupported();
  const encryptedKeys = byokStorage.get<string[]>(workspaceId) ?? [];
  return sortWorkspaceKeys(
    encryptedKeys.flatMap(value => {
      const key = decryptKey(value);
      return key ? [key] : [];
    })
  );
}

function writeWorkspaceKeys(workspaceId: string, keys: WorkspaceByokKey[]) {
  assertSupported();
  byokStorage.set(workspaceId, keys.map(encryptKey));
}

function toPublicKey({ apiKey: _, ...key }: WorkspaceByokKey) {
  return {
    ...key,
    storage: 'local',
    configured: true,
    endpointEditable: false,
    testStatus: 'passed',
  };
}

export const byokStorageHandlers = {
  isSupported: async () => safeStorage.isEncryptionAvailable(),
  listWorkspaceKeys: async (_e, workspaceId: string) => {
    return readWorkspaceKeys(workspaceId).map(toPublicKey);
  },
  getWorkspaceLeaseProviders: async (_e, workspaceId: string) => {
    return readWorkspaceKeys(workspaceId).filter(key => key.enabled !== false);
  },
  upsertWorkspaceKey: async (
    _e,
    workspaceId: string,
    key: WorkspaceByokKeyInput
  ) => {
    const keys = readWorkspaceKeys(workspaceId);
    const index = keys.findIndex(storedKey => storedKey.id === key.id);
    const nextKey = normalizeKey(
      key,
      index === -1 ? undefined : keys[index],
      keys.length
    );
    if (index === -1) {
      keys.push(nextKey);
    } else {
      keys[index] = nextKey;
    }
    writeWorkspaceKeys(workspaceId, keys);
    return toPublicKey(nextKey);
  },
  deleteWorkspaceKey: async (_e, workspaceId: string, keyId: string) => {
    writeWorkspaceKeys(
      workspaceId,
      readWorkspaceKeys(workspaceId).filter(key => key.id !== keyId)
    );
    return true;
  },
  reorderWorkspaceKeys: async (_e, workspaceId: string, ids: string[]) => {
    const keys = readWorkspaceKeys(workspaceId);
    const byId = new Map(keys.map(key => [key.id, key]));
    const ordered = ids
      .map((id, sortOrder) => {
        const key = byId.get(id);
        byId.delete(id);
        return key ? ({ ...key, sortOrder } as WorkspaceByokKey) : null;
      })
      .filter((key): key is WorkspaceByokKey => !!key);
    const nextKeys = sortWorkspaceKeys([
      ...ordered,
      ...Array.from(byId.values()).map((key, index) => ({
        ...key,
        sortOrder: ordered.length + index,
      })),
    ]);
    writeWorkspaceKeys(workspaceId, nextKeys);
    return nextKeys.map(toPublicKey);
  },
  clearWorkspaceKeys: async (_e, workspaceId: string) => {
    byokStorage.del(workspaceId);
    return true;
  },
} satisfies NamespaceHandlers;
