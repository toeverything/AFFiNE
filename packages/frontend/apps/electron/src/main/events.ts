import { app, BrowserWindow, WebContentsView } from 'electron';

import { AFFINE_EVENT_CHANNEL_NAME } from '../shared/type';
import { applicationMenuEvents } from './application-menu';
import { logger } from './logger';
import { sharedStorageEvents } from './shared-storage';
import { uiEvents } from './ui/events';
import { updaterEvents } from './updater/event';

export const allEvents = {
  applicationMenu: applicationMenuEvents,
  updater: updaterEvents,
  ui: uiEvents,
  sharedStorage: sharedStorageEvents,
};

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

export function registerEvents() {
  const unsubs: (() => void)[] = [];
  // register events
  for (const [namespace, namespaceEvents] of Object.entries(allEvents)) {
    for (const [key, eventRegister] of Object.entries(namespaceEvents)) {
      const unsubscribe = eventRegister((...args: any[]) => {
        const chan = `${namespace}:${key}`;
        logger.debug(
          '[ipc-event]',
          chan,
          args.filter(
            a =>
              a !== undefined &&
              typeof a !== 'function' &&
              typeof a !== 'object'
          )
        );
        // is this efficient?
        getActiveWindows().forEach(win => {
          if (win.isDestroyed()) {
            return;
          }
          // .webContents could be undefined if the window is destroyed
          win.webContents?.send(AFFINE_EVENT_CHANNEL_NAME, chan, ...args);
          win.contentView.children.forEach(child => {
            if (
              child instanceof WebContentsView &&
              child.webContents &&
              !child.webContents.isDestroyed()
            ) {
              child.webContents?.send(AFFINE_EVENT_CHANNEL_NAME, chan, ...args);
            }
          });
        });
      });
      unsubs.push(unsubscribe);
    }
  }
  app.on('before-quit', () => {
    // subscription on quit sometimes crashes the app
    try {
      unsubs.forEach(unsub => unsub());
    } catch (err) {
      logger.error('unsubscribe error', err);
    }
  });
}
