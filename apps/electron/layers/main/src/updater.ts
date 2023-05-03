import { dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

import { isMacOS } from '../../utils';
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

export const registerUpdater = async () => {
  if (isMacOS()) {
    autoUpdater.on('update-available', e => {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Found Updates',
          message: `version ${e.version} available, do you want update now?`,
          buttons: ['Yes', 'No'],
        })
        .then(msg => {
          if (msg.response === 0) {
            autoUpdater.downloadUpdate();
          }
        });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog
        .showMessageBox({
          title: 'Install Updates',
          message: 'Updates downloaded, application will be quit for update...',
        })
        .then(() => {
          setImmediate(() => autoUpdater.quitAndInstall());
        });
    });
    autoUpdater.on('error', e => {
      console.log(e.message);
    });
    autoUpdater.forceDevUpdateConfig = isDev;
    await autoUpdater.checkForUpdatesAndNotify();
  }
};
