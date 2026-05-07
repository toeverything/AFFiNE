import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp-byok-storage');
let disposeWorkspaceByokStorage: (() => void) | undefined;

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDir,
    on: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
}));

beforeEach(async () => {
  vi.resetModules();
  disposeWorkspaceByokStorage = undefined;
  await fs.remove(tmpDir);
});

afterEach(async () => {
  disposeWorkspaceByokStorage?.();
  vi.resetModules();
  await fs.remove(tmpDir);
});

describe('byok storage handlers', () => {
  test('stores encrypted local keys and keeps lease providers sorted', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      sortOrder: 1,
    });
    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-gemini',
      provider: 'gemini',
      name: 'Gemini',
      apiKey: 'sk-gemini',
      sortOrder: 0,
    });

    const list = await byokStorageHandlers.listWorkspaceKeys(
      ipcEvent,
      'workspace-1'
    );
    expect(list.map(key => key.id)).toEqual(['local-gemini', 'local-openai']);
    expect(JSON.stringify(list)).not.toContain('sk-openai');

    const reordered = await byokStorageHandlers.reorderWorkspaceKeys(
      ipcEvent,
      'workspace-1',
      ['local-openai', 'local-gemini']
    );
    expect(reordered.map(key => key.id)).toEqual([
      'local-openai',
      'local-gemini',
    ]);

    const leaseProviders = await byokStorageHandlers.getWorkspaceLeaseProviders(
      ipcEvent,
      'workspace-1'
    );
    expect(leaseProviders.map(key => key.apiKey)).toEqual([
      'sk-openai',
      'sk-gemini',
    ]);

    await byokStorageHandlers.clearWorkspaceKeys(ipcEvent, 'workspace-1');
    await expect(
      byokStorageHandlers.listWorkspaceKeys(ipcEvent, 'workspace-1')
    ).resolves.toEqual([]);
  });

  test('preserves existing local key fields during partial updates', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      description: 'Primary key',
      apiKey: 'sk-openai',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: false,
    });

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI renamed',
      apiKey: 'sk-openai-next',
    });

    const [publicKey] = await byokStorageHandlers.listWorkspaceKeys(
      ipcEvent,
      'workspace-1'
    );
    expect(publicKey).toMatchObject({
      id: 'local-openai',
      name: 'OpenAI renamed',
      description: 'Primary key',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: false,
    });

    const [leaseProvider] =
      await byokStorageHandlers.getWorkspaceLeaseProviders(
        ipcEvent,
        'workspace-1'
      );
    expect(leaseProvider).toBeUndefined();

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI renamed again',
      enabled: true,
    });

    const [enabledLeaseProvider] =
      await byokStorageHandlers.getWorkspaceLeaseProviders(
        ipcEvent,
        'workspace-1'
      );
    expect(enabledLeaseProvider).toMatchObject({
      name: 'OpenAI renamed again',
      apiKey: 'sk-openai-next',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: true,
    });
  });
});
