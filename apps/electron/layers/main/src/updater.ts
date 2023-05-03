import { autoUpdater } from 'electron-updater';

import { isMacOS } from '../../utils';
const buildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();

const mode = process.env.NODE_ENV || 'development';
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

export const registerUpdater = async () => {
  if (isMacOS()) {
    autoUpdater.on('update-available', e => {
      console.log('update-available', e);
    });
    autoUpdater.forceDevUpdateConfig = isDev;
    await autoUpdater.checkForUpdatesAndNotify();
  }
};
