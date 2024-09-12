import type { IpcMainInvokeEvent } from 'electron';
import { app } from 'electron';

import type { NamespaceHandlers } from '../type';
import type { UpdaterConfig } from './electron-updater';
import {
  checkForUpdates,
  downloadUpdate,
  getConfig,
  quitAndInstall,
  setConfig,
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
    return getConfig();
  },
  setConfig: async (
    _e: IpcMainInvokeEvent,
    newConfig: Partial<UpdaterConfig>
  ): Promise<void> => {
    return setConfig(newConfig);
  },
  checkForUpdates: async () => {
    const res = await checkForUpdates();
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
