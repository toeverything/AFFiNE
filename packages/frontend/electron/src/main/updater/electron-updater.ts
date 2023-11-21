import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

import { isMacOS, isWindows } from '../../shared/utils';
import { buildType } from '../config';
import { logger } from '../logger';
import { CustomGitHubProvider } from './custom-github-provider';
import { updaterSubjects } from './event';

const mode = process.env.NODE_ENV;
const isDev = mode === 'development';

// skip auto update in dev mode & internal
const disabled = buildType === 'internal' || isDev;

export const quitAndInstall = async () => {
  autoUpdater.quitAndInstall();
};

let lastCheckTime = 0;

let downloading = false;

export type UpdaterConfig = {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
};

const config: UpdaterConfig = {
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
};

export const getConfig = async (): Promise<UpdaterConfig> => {
  return { ...config };
};

export const setConfig = async (
  newConfig: Partial<UpdaterConfig> = {}
): Promise<void> => {
  config.autoCheckUpdate =
    newConfig.autoCheckUpdate !== undefined
      ? newConfig.autoCheckUpdate
      : config.autoCheckUpdate;
  config.autoDownloadUpdate =
    newConfig.autoDownloadUpdate !== undefined
      ? newConfig.autoDownloadUpdate
      : config.autoDownloadUpdate;
};

export const checkForUpdates = async (force = false) => {
  if (disabled) {
    return;
  }

  if (
    force ||
    (config.autoCheckUpdate && lastCheckTime + 1000 * 1800 < Date.now())
  ) {
    lastCheckTime = Date.now();
    return await autoUpdater.checkForUpdates();
  }
  return;
};

export const downloadUpdate = async () => {
  if (disabled) {
    return;
  }
  downloading = true;
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

  // TODO: support auto update on linux
  const allowAutoUpdate = isMacOS() || isWindows();

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = buildType !== 'stable';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;

  const feedUrl: Parameters<typeof autoUpdater.setFeedURL>[0] = {
    channel: buildType,
    // hack for custom provider
    provider: 'custom' as 'github',
    repo: buildType !== 'internal' ? 'AFFiNE' : 'AFFiNE-Releases',
    owner: 'toeverything',
    releaseType: buildType === 'stable' ? 'release' : 'prerelease',
    // @ts-expect-error hack for custom provider
    updateProvider: CustomGitHubProvider,
  };

  logger.debug('auto-updater feed config', feedUrl);

  autoUpdater.setFeedURL(feedUrl);

  // register events for checkForUpdatesAndNotify
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update');
  });
  autoUpdater.on('update-available', info => {
    logger.info('Update available', info);
    if (config.autoDownloadUpdate && allowAutoUpdate && !downloading) {
      downloading = true;
      autoUpdater?.downloadUpdate().catch(e => {
        downloading = false;
        logger.error('Failed to download update', e);
      });
      logger.info('Update available, downloading...', info);
    }
    updaterSubjects.updateAvailable.next({
      version: info.version,
      allowAutoUpdate,
    });
  });
  autoUpdater.on('update-not-available', info => {
    logger.info('Update not available', info);
  });
  autoUpdater.on('download-progress', e => {
    logger.info(`Download progress: ${e.percent}`);
    updaterSubjects.downloadProgress.next(e.percent);
  });
  autoUpdater.on('update-downloaded', e => {
    downloading = false;
    updaterSubjects.updateReady.next({
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

  app.on('activate', () => {
    checkForUpdates(false).catch(err => {
      console.error(err);
    });
  });
};
