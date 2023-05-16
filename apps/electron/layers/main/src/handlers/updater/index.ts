import { app } from 'electron';

import type { NamespaceHandlers } from '../type';
import { checkForUpdatesAndNotify, quitAndInstall } from './updater';

export const updaterHandlers = {
  currentVersion: async () => {
    return app.getVersion();
  },
  quitAndInstall: async () => {
    return quitAndInstall();
  },
  checkForUpdatesAndNotify: async () => {
    return checkForUpdatesAndNotify(true);
  },
} satisfies NamespaceHandlers;

export * from './updater';
