import { autoUpdater } from 'electron-updater';

import { isMacOS } from '../../utils';
import { sendMainEvent } from './send-main-event';
const buildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const mode = process.env.NODE_ENV;
const isDev = mode === 'development';

autoUpdater.autoDownload = false;
autoUpdater.allowPrerelease = buildType !== 'stable';
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.autoRunAppAfterInstall = false;
autoUpdater.setFeedURL({
  channel: buildType,
  provider: 'github',
  repo: 'AFFiNE',
  owner: 'toeverything',
  releaseType: buildType === 'stable' ? 'release' : 'prerelease',
});

export const updateClient = async () => {
  autoUpdater.quitAndInstall();
};

export const registerUpdater = async () => {
  if (isMacOS()) {
    autoUpdater.on('update-available', () => {
      autoUpdater.downloadUpdate();
    });
    autoUpdater.on('download-progress', e => {
      console.log(e.percent);
    });

    autoUpdater.on('update-downloaded', e => {
      sendMainEvent('main:client-update-available', e.version);
    });
    autoUpdater.on('error', e => {
      console.log(e.message);
    });
    autoUpdater.forceDevUpdateConfig = isDev;
    await autoUpdater.checkForUpdatesAndNotify();
  }
};
