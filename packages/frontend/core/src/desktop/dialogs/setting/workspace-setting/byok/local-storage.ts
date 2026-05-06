import { apis } from '@affine/electron-api';
import { ByokKeyStorage, ByokKeyTestStatus } from '@affine/graphql';

import { capabilitiesFor } from './metadata';
import type { ByokKey, LocalByokKeyInput, LocalByokPublicKey } from './types';

function byokStorageApi() {
  return BUILD_CONFIG.isElectron ? apis?.byokStorage : undefined;
}

export async function localByokStorageSupported() {
  const storage = byokStorageApi();
  if (!storage) {
    return false;
  }
  try {
    return await storage.isSupported();
  } catch {
    return false;
  }
}

function toLocalByokKey(key: LocalByokPublicKey): ByokKey {
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    description: key.description ?? null,
    storage: ByokKeyStorage.local,
    configured: key.configured ?? true,
    enabled: key.enabled ?? true,
    endpoint: key.endpoint ?? null,
    endpointEditable: key.endpointEditable ?? false,
    sortOrder: key.sortOrder ?? 0,
    capabilities: capabilitiesFor(key.provider, ByokKeyStorage.local),
    testStatus: key.testStatus ?? ByokKeyTestStatus.passed,
  };
}

export async function readLocalKeys(workspaceId: string): Promise<ByokKey[]> {
  const storage = byokStorageApi();
  if (!(await localByokStorageSupported()) || !storage) {
    return [];
  }
  try {
    const keys = (await storage.listWorkspaceKeys(
      workspaceId
    )) as LocalByokPublicKey[];
    return keys.map(toLocalByokKey);
  } catch {
    return [];
  }
}

export async function upsertLocalKey(
  workspaceId: string,
  key: LocalByokKeyInput
) {
  const storage = byokStorageApi();
  if (!(await localByokStorageSupported()) || !storage) {
    return null;
  }
  try {
    return await storage.upsertWorkspaceKey(workspaceId, key);
  } catch {
    return null;
  }
}

export async function deleteLocalKey(workspaceId: string, keyId: string) {
  const storage = byokStorageApi();
  if (!(await localByokStorageSupported()) || !storage) {
    return false;
  }
  try {
    return await storage.deleteWorkspaceKey(workspaceId, keyId);
  } catch {
    return false;
  }
}

export async function reorderLocalKeys(workspaceId: string, ids: string[]) {
  const storage = byokStorageApi();
  if (!(await localByokStorageSupported()) || !storage) {
    return [];
  }
  try {
    const keys = (await storage.reorderWorkspaceKeys(
      workspaceId,
      ids
    )) as LocalByokPublicKey[];
    return keys.map(toLocalByokKey);
  } catch {
    return [];
  }
}

export async function clearLocalKeys(workspaceId: string) {
  const storage = byokStorageApi();
  if (!(await localByokStorageSupported()) || !storage) {
    return false;
  }
  try {
    return await storage.clearWorkspaceKeys(workspaceId);
  } catch {
    return false;
  }
}
