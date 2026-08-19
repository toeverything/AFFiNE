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
const allowedInputs = new Set(['text', 'image', 'audio', 'file']);
const allowedOutputs = new Set([
  'text',
  'object',
  'structured',
  'embedding',
  'rerank',
  'image',
]);
const allowedFeatures = new Set(['tool_calling', 'reasoning', 'web_search']);
const allowedAttachmentKinds = new Set(['image', 'audio', 'file']);
const allowedAttachmentSources = new Set([
  'url',
  'data',
  'bytes',
  'file_handle',
]);

type WorkspaceByokKey = {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'fal';
  name: string;
  description?: string | null;
  credential: string;
  definition: {
    endpoint: {
      kind: 'provider_default' | 'openai_compatible';
      url?: string | null;
      dialect?: 'responses' | 'chat_completions' | null;
    };
    models: Array<{
      modelId: string;
      enabled: boolean;
      capabilities: Array<{
        input: string[];
        output: string[];
        features: string[];
        attachmentKinds: string[];
        attachmentSources: string[];
      }>;
    }>;
  };
  sortOrder?: number | null;
  enabled?: boolean | null;
};

type WorkspaceByokKeyInput = Omit<
  WorkspaceByokKey,
  'credential' | 'definition'
> & {
  credential?: string | null;
  definition?: WorkspaceByokKey['definition'];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedStringArray(
  value: unknown,
  allowed: Set<string>
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && allowed.has(item))
  );
}

function isValidEndpoint(value: unknown) {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'provider_default')
    return value.url == null && value.dialect == null;
  if (
    value.kind !== 'openai_compatible' ||
    typeof value.url !== 'string' ||
    !['responses', 'chat_completions'].includes(String(value.dialect))
  )
    return false;
  try {
    const endpoint = new URL(value.url);
    return (
      (endpoint.protocol === 'http:' || endpoint.protocol === 'https:') &&
      !!endpoint.hostname &&
      !endpoint.username &&
      !endpoint.password
    );
  } catch {
    return false;
  }
}

function isValidCapability(value: unknown) {
  return (
    isRecord(value) &&
    isAllowedStringArray(value.input, allowedInputs) &&
    value.input.length > 0 &&
    isAllowedStringArray(value.output, allowedOutputs) &&
    value.output.length > 0 &&
    isAllowedStringArray(value.features, allowedFeatures) &&
    isAllowedStringArray(value.attachmentKinds, allowedAttachmentKinds) &&
    isAllowedStringArray(value.attachmentSources, allowedAttachmentSources)
  );
}

function isValidDefinition(
  value: unknown
): value is WorkspaceByokKey['definition'] {
  return (
    isRecord(value) &&
    isValidEndpoint(value.endpoint) &&
    Array.isArray(value.models) &&
    value.models.length > 0 &&
    value.models.every(
      model =>
        isRecord(model) &&
        typeof model.modelId === 'string' &&
        model.modelId.trim().length > 0 &&
        model.modelId.length <= 512 &&
        typeof model.enabled === 'boolean' &&
        Array.isArray(model.capabilities) &&
        model.capabilities.length > 0 &&
        model.capabilities.every(isValidCapability)
    )
  );
}

function normalizeKey(
  key: WorkspaceByokKeyInput,
  existing?: WorkspaceByokKey,
  defaultSortOrder = 0
): WorkspaceByokKey {
  if (!allowedProviders.has(key.provider)) {
    throw new Error('Unsupported BYOK provider.');
  }
  const credential = key.credential ?? existing?.credential;
  const definition = key.definition ?? existing?.definition;
  if (
    definition?.endpoint.kind === 'openai_compatible' &&
    key.provider !== 'openai'
  ) {
    throw new Error('OpenAI-compatible endpoints require OpenAI provider.');
  }
  if (!key.id || !key.name || !credential || !isValidDefinition(definition)) {
    throw new Error('Invalid BYOK key.');
  }
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    description: hasOwnField(key, 'description')
      ? (key.description ?? null)
      : (existing?.description ?? null),
    credential,
    definition,
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

function toPublicKey({ credential: _, ...key }: WorkspaceByokKey) {
  return {
    ...key,
    storage: 'local',
    configured: true,
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
