import './security-restrictions';

import path from 'node:path';

import * as Sentry from '@sentry/electron/main';
import { IPCMode } from '@sentry/electron/main';
import { app } from 'electron';

import { createApplicationMenu } from './application-menu/create';
import { buildType, overrideSession } from './config';
import { persistentConfig } from './config-storage/persist';
import { setupDeepLink } from './deep-link';
import { registerEvents } from './events';
import { registerHandlers } from './handlers';
import { logger } from './logger';
import { registerProtocol } from './protocol';
import { isOnline } from './ui';
import { registerUpdater } from './updater';
import { launch } from './windows-manager/launcher';
import { launchStage } from './windows-manager/stage';

app.enableSandbox();

app.commandLine.appendSwitch('enable-features', 'CSSTextAutoSpace');

// use the same data for internal & beta for testing
if (overrideSession) {
  const appName = buildType === 'stable' ? 'AFFiNE' : `AFFiNE-${buildType}`;
  const userDataPath = path.join(app.getPath('appData'), appName);
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', userDataPath);
}

if (require('electron-squirrel-startup')) app.quit();

if (process.env.SKIP_ONBOARDING) {
  launchStage.value = 'main';
  persistentConfig.set({
    onBoarding: false,
  });
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

/**
 * Shout down background process if all windows was closed
 */
app.on('window-all-closed', () => {
  app.quit();
});

/**
 * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'
 */
app.on('activate', () => {
  launch().catch(e => console.error('Failed launch:', e));
});

setupDeepLink(app);

/**
 * Create app window when background process will be ready
 */
app
  .whenReady()
  .then(registerProtocol)
  .then(registerHandlers)
  .then(registerEvents)
  .then(launch)
  .then(createApplicationMenu)
  .then(registerUpdater)
  .catch(e => console.error('Failed create window:', e));

if (process.env.SENTRY_RELEASE) {
  // https://docs.sentry.io/platforms/javascript/guides/electron/
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.BUILD_TYPE ?? 'development',
    ipcMode: IPCMode.Protocol,
    transportOptions: {
      maxAgeDays: 30,
      maxQueueSize: 100,
      shouldStore: () => !isOnline,
      shouldSend: () => isOnline,
    },
  });
}
