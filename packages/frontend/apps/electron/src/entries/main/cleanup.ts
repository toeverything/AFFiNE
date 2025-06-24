import { app } from 'electron';

import { logger } from './logger';

const beforeAppQuitRegistry: (() => void)[] = [];
const beforeTabCloseRegistry: ((tabId: string) => void)[] = [];

export function beforeAppQuit(fn: () => void) {
  beforeAppQuitRegistry.push(fn);
}

export function beforeTabClose(fn: (tabId: string) => void) {
  beforeTabCloseRegistry.push(fn);
}

app.on('before-quit', () => {
  beforeAppQuitRegistry.forEach(fn => {
    // some cleanup functions might throw on quit and crash the app
    try {
      fn();
    } catch (err) {
      logger.warn('cleanup error on quit', err);
    }
  });
});

export function onTabClose(tabId: string) {
  beforeTabCloseRegistry.forEach(fn => {
    try {
      fn(tabId);
    } catch (err) {
      logger.warn('cleanup error on tab close', err);
    }
  });
}
