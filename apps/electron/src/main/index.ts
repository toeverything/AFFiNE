import './security-restrictions';

import { argsParser } from '@affine/electron/main/utils/args-parser';
import { app } from 'electron';

import { createApplicationMenu } from './application-menu/create';
import { registerEvents } from './events';
import { registerHandlers } from './handlers';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';
import { restoreOrCreateWindow } from './main-window';
import { registerPlugin } from './plugin';
import { registerProtocol } from './protocol';
import { registerUpdater } from './updater';

app.enableSandbox();

if (require('electron-squirrel-startup')) app.quit();
const { appName } = argsParser();
if (appName) {
  app.setName(appName);
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
  restoreOrCreateWindow().catch(e =>
    console.error('Failed to restore or create window:', e)
  );
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
  .then(registerPlugin)
  .then(registerHandlers)
  .then(registerEvents)
  .then(ensureHelperProcess)
  .then(restoreOrCreateWindow)
  .then(createApplicationMenu)
  .then(registerUpdater)
  .catch(e => console.error('Failed create window:', e));
