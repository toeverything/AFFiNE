import { app, BrowserWindow } from 'electron';

import { applicationMenuEvents } from './application-menu';
import { logger } from './logger';
import { uiEvents } from './ui';
import { updaterEvents } from './updater/event';

export const allEvents = {
  applicationMenu: applicationMenuEvents,
  updater: updaterEvents,
  ui: uiEvents,
};

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

export function registerEvents() {
  // register events
  for (const [namespace, namespaceEvents] of Object.entries(allEvents)) {
    for (const [key, eventRegister] of Object.entries(namespaceEvents)) {
      const subscription = eventRegister((...args: any[]) => {
        const chan = `${namespace}:${key}`;
        logger.info(
          '[ipc-event]',
          chan,
          args.filter(
            a =>
              a !== undefined &&
              typeof a !== 'function' &&
              typeof a !== 'object'
          )
        );
        getActiveWindows().forEach(win => win.webContents.send(chan, ...args));
      });
      app.on('before-quit', () => {
        subscription();
      });
    }
  }
}
