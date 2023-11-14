import { app } from 'electron';

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
  autoCheckUpdate: async () => {
    return getAllowAutoCheckUpdate();
  },
  autoDownloadUpdate: async () => {
    return getAllowAutoDownloadUpdate();
  },
  enableAutoCheckUpdate: async () => {
    return setAllowAutoCheckUpdate(true);
  },
  disableAutoCheckUpdate: async () => {
    return setAllowAutoCheckUpdate(false);
  },
  enableAutoDownloadUpdate: async () => {
    return setAllowAutoDownloadUpdate(true);
  },
  disableAutoDownloadUpdate: async () => {
    return setAllowAutoDownloadUpdate(false);
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
