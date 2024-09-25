import { app } from 'electron';
import { autoUpdater as defaultAutoUpdater } from 'electron-updater';

import { buildType } from '../config';
import { logger } from '../logger';
import { isOfflineModeEnabled } from '../utils';
import { AFFiNEUpdateProvider } from './affine-update-provider';
import { updaterSubjects } from './event';
import { WindowsUpdater } from './windows-updater';

const mode = process.env.NODE_ENV;
const isDev = mode === 'development';

// skip auto update in dev mode & internal
const disabled = buildType === 'internal' || isDev;

export const autoUpdater =
  process.platform === 'win32' ? new WindowsUpdater() : defaultAutoUpdater;

export const quitAndInstall = async () => {
  autoUpdater.quitAndInstall();
};

let downloading = false;
let configured = false;
let checkingUpdate = false;

export type UpdaterConfig = {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
};

const config: UpdaterConfig = {
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
};

export const getConfig = (): UpdaterConfig => {
  return { ...config };
};

export const setConfig = (newConfig: Partial<UpdaterConfig> = {}): void => {
  configured = true;

  Object.assign(config, newConfig);

  logger.info('Updater configured!', config);

  // if config.autoCheckUpdate is true, trigger a check
  if (config.autoCheckUpdate) {
    checkForUpdates().catch(err => {
      logger.error('Error checking for updates', err);
    });
  }
};

export const checkForUpdates = async () => {
  if (disabled || checkingUpdate || isOfflineModeEnabled()) {
    return;
  }
  checkingUpdate = true;
  try {
    const info = await autoUpdater.checkForUpdates();
    return info;
  } finally {
    checkingUpdate = false;
  }
};

export const downloadUpdate = async () => {
  if (disabled || downloading) {
    return;
  }
  downloading = true;
  updaterSubjects.downloadProgress$.next(0);
  autoUpdater.downloadUpdate().catch(e => {
    downloading = false;
    logger.error('Failed to download update', e);
  });
  logger.info('Update available, downloading...');
  return;
};

export const registerUpdater = async () => {
  if (disabled) {
    return;
  }

  const allowAutoUpdate = true;

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = buildType !== 'stable';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;

  const feedUrl = AFFiNEUpdateProvider.configFeed({
    channel: buildType,
  });

  autoUpdater.setFeedURL(feedUrl);

  // register events for checkForUpdates
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update');
  });
  autoUpdater.on('update-available', info => {
    logger.info('Update available', info);
    if (config.autoDownloadUpdate && allowAutoUpdate) {
      downloadUpdate().catch(err => {
        console.error(err);
      });
    }
    updaterSubjects.updateAvailable$.next({
      version: info.version,
      allowAutoUpdate,
    });
  });
  autoUpdater.on('update-not-available', info => {
    logger.info('Update not available', info);
  });
  autoUpdater.on('download-progress', e => {
    logger.info(`Download progress: ${e.percent}`);
    updaterSubjects.downloadProgress$.next(e.percent);
  });
  autoUpdater.on('update-downloaded', e => {
    downloading = false;
    updaterSubjects.updateReady$.next({
      version: e.version,
      allowAutoUpdate,
    });
    // I guess we can skip it?
    // updaterSubjects.clientDownloadProgress.next(100);
    logger.info('Update downloaded, ready to install');
  });
  autoUpdater.on('error', e => {
    logger.error('Error while updating client', e);
  });
  autoUpdater.forceDevUpdateConfig = isDev;

  // check update whenever the window is activated
  let lastCheckTime = 0;
  app.on('browser-window-focus', () => {
    (async () => {
      if (
        configured &&
        config.autoCheckUpdate &&
        lastCheckTime + 1000 * 1800 < Date.now()
      ) {
        lastCheckTime = Date.now();
        await checkForUpdates();
      }
    })().catch(err => {
      logger.error('Error checking for updates', err);
    });
  });
};
