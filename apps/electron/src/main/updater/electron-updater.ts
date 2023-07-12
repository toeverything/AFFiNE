import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { z } from 'zod';

import { logger } from '../logger';
import { isMacOS } from '../utils';
import { updaterSubjects } from './event';

export const ReleaseTypeSchema = z.enum([
  'stable',
  'beta',
  'canary',
  'internal',
]);

export const envBuildType = (process.env.BUILD_TYPE || 'canary')
  .trim()
  .toLowerCase();
export const buildType = ReleaseTypeSchema.parse(envBuildType);
const mode = process.env.NODE_ENV;
const isDev = mode === 'development';

export const quitAndInstall = async () => {
  autoUpdater.quitAndInstall();
};

let lastCheckTime = 0;
export const checkForUpdates = async (force = true) => {
  // check every 30 minutes (1800 seconds) at most
  if (force || lastCheckTime + 1000 * 1800 < Date.now()) {
    lastCheckTime = Date.now();
    return await autoUpdater.checkForUpdates();
  }
  return void 0;
};

export const registerUpdater = async () => {
  // skip auto update in dev mode
  if (isDev) {
    return;
  }

  // TODO: support auto update on windows and linux
  const allowAutoUpdate = isMacOS();

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = buildType !== 'stable';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;

  const feedUrl: Parameters<typeof autoUpdater.setFeedURL>[0] = {
    channel: buildType,
    provider: 'github',
    repo: buildType !== 'internal' ? 'AFFiNE' : 'AFFiNE-Releases',
    owner: 'toeverything',
    releaseType: buildType === 'stable' ? 'release' : 'prerelease',
  };

  logger.debug('auto-updater feed config', feedUrl);

  autoUpdater.setFeedURL(feedUrl);

  // register events for checkForUpdatesAndNotify
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update');
  });
  autoUpdater.on('update-available', info => {
    logger.info('Update available', info);
    if (allowAutoUpdate) {
      autoUpdater?.downloadUpdate().catch(e => {
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

  app.on('activate', async () => {
    await checkForUpdates(false);
  });
};
