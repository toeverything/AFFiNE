import './security-restrictions';

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { parse } from 'url';

import { exchangeToken } from '../../auth';
import { registerHandlers } from './app-state';
import { restoreOrCreateWindow } from './main-window';
import { registerProtocol } from './protocol';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('affine', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('affine');
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
  const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
  const urlObj = parse(url.replace('??', '?'), true);
  if (!mainWindow || !url.startsWith('affine://')) return;
  const token = (await exchangeToken(urlObj.query['code'] as string)) as {
    id_token: string;
  };
  mainWindow.webContents.send('auth:callback-firebase-token', token.id_token);
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
