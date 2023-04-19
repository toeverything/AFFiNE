import './security-restrictions';

import { app } from 'electron';
import path from 'path';
import Update from 'update-electron-app';

import { registerHandlers } from './app-state';
import { restoreOrCreateWindow } from './main-window';
import { registerProtocol } from './protocol';
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
if (require('electron-squirrel-startup')) app.exit();
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('affine', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('affine');
}
const isCanary = process.env.BUILD_TYPE === 'canary';
if (!isCanary) {
  Update({
    updateInterval: '1 hour',
    notifyUser: true,
  });
}
/**
 * Prevent multiple instances
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (event, argv) => {
  restoreOrCreateWindow();
});

app.on('open-url', async (_, url) => {
  // todo: handle `affine://...` urls
});

/**
 * Disable Hardware Acceleration for more power-save
 */
app.disableHardwareAcceleration();

/**
 * Shout down background process if all windows was closed
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * @see https://www.electronjs.org/docs/v14-x-y/api/app#event-activate-macos Event: 'activate'
 */
app.on('activate', restoreOrCreateWindow);

/**
 * Create app window when background process will be ready
 */
app
  .whenReady()
  .then(registerProtocol)
  .then(registerHandlers)
  .then(restoreOrCreateWindow)
  .catch(e => console.error('Failed create window:', e));
/**
 * Check new app version in production mode only
 */
// FIXME: add me back later
// if (import.meta.env.PROD) {
//   app
//     .whenReady()
//     .then(() => import('electron-updater'))
//     .then(({ autoUpdater }) => autoUpdater.checkForUpdatesAndNotify())
//     .catch(e => console.error('Failed check updates:', e));
// }
