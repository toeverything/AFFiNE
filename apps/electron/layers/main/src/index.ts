import './security-restrictions';

import { app } from 'electron';
import path from 'path';

import { logger } from '../../logger';
import { registerHandlers } from './handlers';
import { restoreOrCreateWindow } from './main-window';
import { registerProtocol } from './protocol';
import { registerUpdater } from './updater';

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
/**
 * Prevent multiple instances
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  logger.info('Another instance is running, exiting...');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  restoreOrCreateWindow();
});

app.on('open-url', async (_, _url) => {
  // todo: handle `affine://...` urls
});

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
  .then(registerUpdater)
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
