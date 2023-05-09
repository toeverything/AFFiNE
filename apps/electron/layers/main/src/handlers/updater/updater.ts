import type { AppUpdater } from 'electron-updater';

import { isMacOS } from '../../../../utils';
import { updaterSubjects } from '../../events/updater';
import { logger } from '../../logger';

const buildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const mode = process.env.NODE_ENV;
const isDev = mode === 'development';

let _autoUpdater: AppUpdater | null = null;

export const updateClient = async () => {
  _autoUpdater?.quitAndInstall();
};

export const registerUpdater = async () => {
  // require it will cause some side effects and will break generate-main-exposed-meta,
  // so we wrap it in a function
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = await import('electron-updater');

  _autoUpdater = autoUpdater;

  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = buildType !== 'stable';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.setFeedURL({
    channel: buildType,
    provider: 'github',
    repo: 'AFFiNE',
    owner: 'toeverything',
    releaseType: buildType === 'stable' ? 'release' : 'prerelease',
  });

  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = buildType !== 'stable';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.setFeedURL({
    channel: buildType,
    provider: 'github',
    repo: 'AFFiNE',
    owner: 'toeverything',
    releaseType: buildType === 'stable' ? 'release' : 'prerelease',
  });

  if (isMacOS()) {
    autoUpdater.on('update-available', () => {
      autoUpdater.downloadUpdate();
      logger.info('Update available, downloading...');
    });
    autoUpdater.on('download-progress', e => {
      logger.info(`Download progress: ${e.percent}`);
    });
    autoUpdater.on('update-downloaded', e => {
      updaterSubjects.clientUpdateReady.next({
        version: e.version,
      });
      logger.info('Update downloaded, ready to install');
    });
    autoUpdater.on('error', e => {
      logger.error('Error while updating client', e);
    });
    autoUpdater.forceDevUpdateConfig = isDev;
    await autoUpdater.checkForUpdatesAndNotify();
  }
};
