import { app, BrowserWindow } from 'electron';

import { applicationMenuEvents } from './application-menu';
import { dbEvents } from './db';
import { logger } from './logger';
import { updaterEvents } from './updater/event';
import { workspaceEvents } from './workspace';

export const allEvents = {
  applicationMenu: applicationMenuEvents,
  db: dbEvents,
  updater: updaterEvents,
  workspace: workspaceEvents,
};

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

export function registerEvents() {
  // register events
  for (const [namespace, namespaceEvents] of Object.entries(allEvents)) {
    for (const [key, eventRegister] of Object.entries(namespaceEvents)) {
      const subscription = eventRegister((...args: any) => {
        const chan = `${namespace}:${key}`;
        logger.info('[ipc-event]', chan, args);
        getActiveWindows().forEach(win => win.webContents.send(chan, ...args));
      });
      app.on('before-quit', () => {
        subscription();
      });
    }
  }
}
