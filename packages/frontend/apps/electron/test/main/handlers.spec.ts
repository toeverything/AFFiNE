import { afterAll, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }));
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
  checkSource: () => true,
}));
vi.mock('../../src/main/shared-storage', () => ({
  sharedStorageHandlers: {},
}));
vi.mock('../../src/main/ui/handlers', () => ({ uiHandlers: {} }));
vi.mock('../../src/main/updater', () => ({ updaterHandlers: {} }));
vi.mock('../../src/main/windows-manager/popup', () => ({ popupHandlers: {} }));
vi.mock('../../src/main/worker/handlers', () => ({ workerHandlers: {} }));

import { I18n } from '@affine/i18n';

import { i18nHandlers } from '../../src/main/handlers';

describe('i18n IPC handlers', () => {
  afterAll(async () => {
    await I18n.changeLanguage('en');
  });

  test('changeLanguage switches the language and returns a cloneable result', async () => {
    const result = await i18nHandlers.changeLanguage(
      {} as Electron.IpcMainInvokeEvent,
      'zh-Hans'
    );

    expect(I18n.language).toBe('zh-Hans');
    expect(() => structuredClone(result)).not.toThrow();
  });
});
