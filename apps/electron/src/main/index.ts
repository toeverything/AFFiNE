import './security-restrictions';

import { app } from 'electron';

import { createApplicationMenu } from './application-menu/create';
import { registerEvents } from './events';
import { registerHandlers } from './handlers';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';
import { registerPlugin } from './plugin';
import { registerProtocol } from './protocol';
import { registerUpdater } from './updater';
import { restoreOrCreateMainWindow } from './window';

if (require('electron-squirrel-startup')) app.quit();
// allow tests to overwrite app name through passing args
if (process.argv.includes('--app-name')) {
  const appNameIndex = process.argv.indexOf('--app-name');
  const appName = process.argv[appNameIndex + 1];
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
  restoreOrCreateMainWindow().catch(e =>
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

app.on('activate', restoreOrCreateMainWindow);

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
  .then(restoreOrCreateMainWindow)
  .then(createApplicationMenu)
  .then(registerUpdater)
  .catch(err => {
    console.error('Failed create window:', err);
  });
