import type { MediaStats } from '@toeverything/infra';
import { app } from 'electron';

import { logger } from './logger';
import { globalStateStorage } from './shared-storage/storage';

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

app.on('ready', () => {
  globalStateStorage.set('media:playback-state', null);
  globalStateStorage.set('media:stats', null);
});

beforeAppQuit(() => {
  globalStateStorage.set('media:playback-state', null);
  globalStateStorage.set('media:stats', null);
});

// set audio play state
beforeTabClose(tabId => {
  const stats = globalStateStorage.get<MediaStats | null>('media:stats');
  if (stats && stats.tabId === tabId) {
    globalStateStorage.set('media:playback-state', null);
    globalStateStorage.set('media:stats', null);
  }
});
