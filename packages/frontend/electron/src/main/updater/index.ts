import { app } from 'electron';

import type { NamespaceHandlers } from '../type';
import { checkForUpdates, quitAndInstall } from './electron-updater';

export const updaterHandlers = {
  currentVersion: async () => {
    return app.getVersion();
  },
  quitAndInstall: async () => {
    return quitAndInstall();
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
