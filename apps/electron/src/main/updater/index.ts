import { app } from 'electron';

import type { NamespaceHandlers } from '../type';
import { checkForUpdatesAndNotify, quitAndInstall } from './electron-updater';

export const updaterHandlers = {
  currentVersion: async () => {
    return app.getVersion();
  },
  quitAndInstall: async () => {
    return quitAndInstall();
  },
  checkForUpdatesAndNotify: async () => {
    const res = await checkForUpdatesAndNotify(true);
    if (res) {
      const { updateInfo } = res;
      return {
        updateInfo,
      };
    }
    return null;
  },
} satisfies NamespaceHandlers;

export * from './electron-updater';
