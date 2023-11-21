import { app, type IpcMainInvokeEvent } from 'electron';

import type { NamespaceHandlers } from '../type';
import {
  checkForUpdates,
  downloadUpdate,
  getConfig,
  quitAndInstall,
  setConfig,
  type UpdaterConfig,
} from './electron-updater';

export const updaterHandlers = {
  currentVersion: async () => {
    return app.getVersion();
  },
  quitAndInstall: async () => {
    return quitAndInstall();
  },
  downloadUpdate: async () => {
    return downloadUpdate();
  },
  getConfig: async (): Promise<UpdaterConfig> => {
    return await getConfig();
  },
  setConfig: async (
    _e: IpcMainInvokeEvent,
    newConfig: Partial<UpdaterConfig>
  ): Promise<void> => {
    await setConfig(newConfig);
  },
  checkForUpdatesAndNotify: async () => {
    const res = await checkForUpdates(true);
    if (res) {
      const { updateInfo } = res;
      return {
        version: updateInfo.version,
      };
    }
    return null;
  },
} satisfies NamespaceHandlers;

export * from './electron-updater';
