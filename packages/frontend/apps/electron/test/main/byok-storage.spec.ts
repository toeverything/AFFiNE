import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp-byok-storage');

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
  await fs.remove(tmpDir);
});

afterEach(async () => {
  const { disposeWorkspaceByokStorage } =
    await import('@affine/electron/main/byok-storage/handlers');
  disposeWorkspaceByokStorage();
  vi.resetModules();
  await fs.remove(tmpDir);
});

describe('byok storage handlers', () => {
  test('stores encrypted local keys and keeps lease providers sorted', async () => {
    const { byokStorageHandlers } =
      await import('@affine/electron/main/byok-storage/handlers');
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
});
