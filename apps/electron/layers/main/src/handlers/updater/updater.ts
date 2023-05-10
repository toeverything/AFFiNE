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
  const { autoUpdater } = require('electron-updater');

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
    repo: 'AFFiNE',
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
