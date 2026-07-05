import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

const electronMock = vi.hoisted(() => ({
  tmpDir: '',
  appOn: vi.fn(),
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
  decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
}));

let disposeWorkspaceByokStorage: (() => void) | undefined;

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.tmpDir,
    on: electronMock.appOn,
  },
  safeStorage: {
    isEncryptionAvailable: electronMock.isEncryptionAvailable,
    encryptString: electronMock.encryptString,
    decryptString: electronMock.decryptString,
  },
}));

vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Warm the handler module's transform once so the first per-test dynamic
// import doesn't race the default 60s test timeout on loaded CI shards, where
// cold-transforming the heavy `@toeverything/infra` graph can starve.
beforeAll(async () => {
  await import('@affine/electron/main/byok-storage/handlers');
}, 120_000);

beforeEach(async () => {
  vi.useRealTimers();
  vi.resetModules();
  electronMock.appOn.mockReset();
  electronMock.isEncryptionAvailable.mockReset().mockReturnValue(true);
  electronMock.encryptString
    .mockReset()
    .mockImplementation((value: string) => Buffer.from(value, 'utf-8'));
  electronMock.decryptString
    .mockReset()
    .mockImplementation((value: Buffer) => value.toString('utf-8'));
  disposeWorkspaceByokStorage = undefined;
  electronMock.tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'affine-byok-storage-')
  );
});

afterEach(async () => {
  disposeWorkspaceByokStorage?.();
  disposeWorkspaceByokStorage = undefined;
  vi.resetModules();
  if (electronMock.tmpDir) {
    await fs.remove(electronMock.tmpDir);
  }
  electronMock.tmpDir = '';
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

  test('does not write local keys when secure storage is unavailable', async () => {
    electronMock.isEncryptionAvailable.mockReturnValue(false);

    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await expect(byokStorageHandlers.isSupported()).resolves.toBe(false);
    await expect(
      byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
        id: 'local-openai',
        provider: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-openai',
      })
    ).rejects.toThrow('Secure BYOK key storage is not available.');
    expect(electronMock.encryptString).not.toHaveBeenCalled();
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
