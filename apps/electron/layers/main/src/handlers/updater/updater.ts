import { app } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { z } from 'zod';

import { isMacOS } from '../../../../utils';
import { updaterSubjects } from '../../events/updater';
import { logger } from '../../logger';

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

let _autoUpdater: AppUpdater | null = null;

export const quitAndInstall = async () => {
  _autoUpdater?.quitAndInstall();
};

let lastCheckTime = 0;
export const checkForUpdatesAndNotify = async (force = true) => {
  if (!_autoUpdater) {
    return; // ?
  }
  // check every 30 minutes (1800 seconds) at most
  if (force || lastCheckTime + 1000 * 1800 < Date.now()) {
    lastCheckTime = Date.now();
    return _autoUpdater.checkForUpdatesAndNotify();
  }
};

export const registerUpdater = async () => {
  // require it will cause some side effects and will break generate-main-exposed-meta,
  // so we wrap it in a function
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = require('electron-updater');

  _autoUpdater = autoUpdater;

  if (!_autoUpdater) {
    return;
  }

  if (!isMacOS()) {
    // TODO: support auto update on windows and linux
    return;
  }

  _autoUpdater.autoDownload = false;
  _autoUpdater.allowPrerelease = buildType !== 'stable';
  _autoUpdater.autoInstallOnAppQuit = false;
  _autoUpdater.autoRunAppAfterInstall = true;
  _autoUpdater.setFeedURL({
    channel: buildType,
    provider: 'github',
    repo: buildType !== 'internal' ? 'AFFiNE' : 'AFFiNE-Releases',
    owner: 'toeverything',
    releaseType: buildType === 'stable' ? 'release' : 'prerelease',
  });

  // register events for checkForUpdatesAndNotify
  _autoUpdater.on('update-available', info => {
    _autoUpdater!.downloadUpdate();
    logger.info('Update available, downloading...', info);
    updaterSubjects.updateAvailable.next({
      version: info.version,
    });
  });
  _autoUpdater.on('download-progress', e => {
    logger.info(`Download progress: ${e.percent}`);
    updaterSubjects.downloadProgress.next(e.percent);
  });
  _autoUpdater.on('update-downloaded', e => {
    updaterSubjects.updateReady.next({
      version: e.version,
    });
    // I guess we can skip it?
    // updaterSubjects.clientDownloadProgress.next(100);
    logger.info('Update downloaded, ready to install');
  });
  _autoUpdater.on('error', e => {
    logger.error('Error while updating client', e);
  });
  _autoUpdater.forceDevUpdateConfig = isDev;

  app.on('activate', async () => {
    await checkForUpdatesAndNotify(false);
  });
};
