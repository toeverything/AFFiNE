import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  checkSource: vi.fn(() => true),
  globalCache: { cacheKey: 'cache-value' },
  globalState: { stateKey: 'state-value' },
  handle: vi.fn(),
  on: vi.fn(),
}));

vi.mock('@affine/i18n', () => ({
  I18n: { changeLanguage: vi.fn() },
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: fixtures.handle,
    on: fixtures.on,
  },
}));
vi.mock('../../src/main/auth/handlers', () => ({ authHandlers: {} }));
vi.mock('../../src/main/byok-storage/handlers', () => ({
  byokStorageHandlers: {},
}));
vi.mock('../../src/main/clipboard', () => ({ clipboardHandlers: {} }));
vi.mock('../../src/main/config-storage', () => ({
  configStorageHandlers: {},
}));
vi.mock('../../src/main/find-in-page', () => ({ findInPageHandlers: {} }));
vi.mock('../../src/main/import', () => ({ importHandlers: {} }));
vi.mock('../../src/main/logger', () => ({
  getLogFilePath: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn() },
  revealLogFile: vi.fn(),
}));
vi.mock('../../src/main/recording', () => ({ recordingHandlers: {} }));
vi.mock('../../src/main/security-restrictions', () => ({
  checkSource: fixtures.checkSource,
}));
vi.mock('../../src/main/shared-storage', () => ({
  sharedStorageHandlers: {
    getAllGlobalCache: vi.fn(async () => fixtures.globalCache),
    getAllGlobalState: vi.fn(async () => fixtures.globalState),
  },
  sharedStorageSyncHandlers: {
    getAllGlobalCache: vi.fn(() => fixtures.globalCache),
    getAllGlobalState: vi.fn(() => fixtures.globalState),
  },
}));
vi.mock('../../src/main/ui/handlers', () => ({ uiHandlers: {} }));
vi.mock('../../src/main/updater', () => ({ updaterHandlers: {} }));
vi.mock('../../src/main/windows-manager/popup', () => ({ popupHandlers: {} }));
vi.mock('../../src/main/worker/handlers', () => ({ workerHandlers: {} }));

describe('main IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['sharedStorage:getAllGlobalState', fixtures.globalState],
    ['sharedStorage:getAllGlobalCache', fixtures.globalCache],
  ])(
    'returns %s during the synchronous IPC callback',
    async (channel, value) => {
      const { registerHandlers } = await import('../../src/main/handlers');
      registerHandlers();
      const syncListener = fixtures.on.mock.calls[0][1];
      const event = { returnValue: undefined };

      syncListener(event, channel);

      expect(event.returnValue).toEqual(value);
    }
  );

  it('responds to invalid synchronous IPC requests', async () => {
    const { registerHandlers } = await import('../../src/main/handlers');
    registerHandlers();
    const syncListener = fixtures.on.mock.calls[0][1];
    const setReturnValue = vi.fn();
    const event = {};
    Object.defineProperty(event, 'returnValue', {
      set: setReturnValue,
    });

    syncListener(event, 'missing:handler');

    expect(setReturnValue).toHaveBeenCalledWith(undefined);
  });
});
