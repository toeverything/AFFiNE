import { app, BrowserWindow } from 'electron';

import { logger } from '../logger';
import { dbEvents } from './db';
import { updaterEvents } from './updater';

export const allEvents = {
  db: dbEvents,
  updater: updaterEvents,
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
