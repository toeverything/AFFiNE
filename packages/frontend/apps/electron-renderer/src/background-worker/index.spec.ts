import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configureSocketAuthMethod: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

vi.mock('@affine/core/bootstrap/electron', () => ({}));
vi.mock('@affine/electron-api', () => ({
  apis: {
    auth: { getValidAccessToken: mocks.getValidAccessToken },
    db: {},
    diskSync: {},
    nbstore: {},
  },
  events: { diskSync: {} },
}));
vi.mock('@affine/nbstore/broadcast-channel', () => ({
  broadcastChannelStorages: [],
}));
vi.mock('@affine/nbstore/cloud', () => ({
  cloudStorages: [],
  configureSocketAuthMethod: mocks.configureSocketAuthMethod,
}));
vi.mock('@affine/nbstore/disk', () => ({
  bindDiskSyncApis: vi.fn(),
  diskStorages: [],
}));
vi.mock('@affine/nbstore/sqlite', () => ({
  bindNativeDBApis: vi.fn(),
  sqliteStorages: [],
}));
vi.mock('@affine/nbstore/sqlite/v1', () => ({
  bindNativeDBV1Apis: vi.fn(),
  sqliteV1Storages: [],
}));
vi.mock('@affine/nbstore/worker/consumer', () => ({
  StoreManagerConsumer: class {
    bindConsumer() {}
  },
}));
vi.mock('@toeverything/infra/op', () => ({
  OpConsumer: class {},
}));
vi.mock('./disk-sync-bridge', () => ({
  createDiskSyncApis: vi.fn(() => ({})),
}));

describe('background worker bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });

  it('configures cloud socket authentication through the Electron API', async () => {
    mocks.getValidAccessToken.mockResolvedValue({ token: 'access-token' });

    await import('./index');

    expect(mocks.configureSocketAuthMethod).toHaveBeenCalledOnce();
    const authMethod = mocks.configureSocketAuthMethod.mock.calls[0][0];
    const callback = vi.fn();
    authMethod('https://app.affine.pro', callback);
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith({
        token: 'access-token',
        tokenType: 'jwt',
      });
    });
    expect(mocks.getValidAccessToken).toHaveBeenCalledWith(
      'https://app.affine.pro'
    );
  });

  it('reports a temporary socket auth failure', async () => {
    mocks.getValidAccessToken.mockRejectedValue(new Error('unavailable'));

    await import('./index');

    const authMethod = mocks.configureSocketAuthMethod.mock.calls[0][0];
    const callback = vi.fn();
    authMethod('https://app.affine.pro', callback);
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith({
        error: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
      });
    });
  });
});
