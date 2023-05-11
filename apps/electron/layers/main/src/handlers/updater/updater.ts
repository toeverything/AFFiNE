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

export const updateClient = async () => {
  _autoUpdater?.quitAndInstall();
};

export const registerUpdater = async () => {
  // require it will cause some side effects and will break generate-main-exposed-meta,
  // so we wrap it in a function
  const { autoUpdater } = await import('electron-updater');

  _autoUpdater = autoUpdater;

  if (!_autoUpdater) {
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

  if (isMacOS()) {
    _autoUpdater.on('update-available', () => {
      _autoUpdater!.downloadUpdate();
      logger.info('Update available, downloading...');
    });
    _autoUpdater.on('download-progress', e => {
      logger.info(`Download progress: ${e.percent}`);
    });
    _autoUpdater.on('update-downloaded', e => {
      updaterSubjects.clientUpdateReady.next({
        version: e.version,
      });
      logger.info('Update downloaded, ready to install');
    });
    _autoUpdater.on('error', e => {
      logger.error('Error while updating client', e);
    });
    _autoUpdater.forceDevUpdateConfig = isDev;
    await _autoUpdater.checkForUpdatesAndNotify();
  }
};
