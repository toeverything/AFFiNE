import { app, type IpcMainInvokeEvent } from 'electron';

import type { NamespaceHandlers } from '../type';
import {
  checkForUpdates,
  downloadUpdate,
  getAllowAutoCheckUpdate,
  getAllowAutoDownloadUpdate,
  quitAndInstall,
  setAllowAutoCheckUpdate,
  setAllowAutoDownloadUpdate,
} from './electron-updater';

export type UpdaterConfig = {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
};

const config: UpdaterConfig = {
  autoCheckUpdate: getAllowAutoCheckUpdate(),
  autoDownloadUpdate: getAllowAutoDownloadUpdate(),
};

const configProxy: UpdaterConfig = new Proxy(config, {
  set(_target, key: keyof UpdaterConfig, value: boolean) {
    switch (key) {
      case 'autoCheckUpdate':
        setAllowAutoCheckUpdate(value);
        break;
      case 'autoDownloadUpdate':
        setAllowAutoDownloadUpdate(value);
        break;
      default:
        break;
    }
    return true;
  },
  get(target, key: keyof UpdaterConfig) {
    switch (key) {
      case 'autoCheckUpdate':
        return getAllowAutoCheckUpdate();
      case 'autoDownloadUpdate':
        return getAllowAutoDownloadUpdate();
      default:
        return target[key];
    }
  },
});

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
    // Return a plain object with current value of config's properties
    return {
      autoCheckUpdate: configProxy.autoCheckUpdate,
      autoDownloadUpdate: configProxy.autoDownloadUpdate,
    };
  },
  setConfig: async (
    _e: IpcMainInvokeEvent,
    [newConfig]: [Partial<UpdaterConfig>]
  ): Promise<void> => {
    if ('autoCheckUpdate' in newConfig) {
      configProxy.autoCheckUpdate = newConfig.autoCheckUpdate as boolean;
    }
    if ('autoDownloadUpdate' in newConfig) {
      configProxy.autoDownloadUpdate = newConfig.autoDownloadUpdate as boolean;
    }
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
