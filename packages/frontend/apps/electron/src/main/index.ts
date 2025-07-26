import './security-restrictions';

import path from 'node:path';
import * as Sentry from '@sentry/electron/main';
import { IPCMode } from '@sentry/electron/main';
import { app } from 'electron';

import { createApplicationMenu } from './application-menu/create';
import { buildType, isDev, overrideSession } from './config';
import { persistentConfig } from './config-storage/persist';
import { setupDeepLink } from './deep-link';
import { registerEvents } from './events';
import { registerHandlers } from './handlers';
import { logger } from './logger';
import { registerProtocol } from './protocol';
import { setupRecordingFeature } from './recording/feature';
import { setupTrayState } from './tray';
import { registerUpdater } from './updater';
import { launch } from './windows-manager/launcher';
import { launchStage } from './windows-manager/stage';

app.enableSandbox();

app.commandLine.appendSwitch('enable-features', 'CSSTextAutoSpace');
if (isDev) {
  app.commandLine.appendSwitch('host-rules', 'MAP 0.0.0.0 127.0.0.1');
}

app.commandLine.appendSwitch(
  'disable-features',
  'PlzDedicatedWorker,CalculateNativeWinOcclusion'
);

const featuresToEnable =
  'DocumentPolicyIncludeJSCallStacksInCrashReports,EarlyEstablishGpuChannel,EstablishGpuChannelAsync';
app.commandLine.appendSwitch('enable-features', featuresToEnable);
app.commandLine.appendSwitch('force-color-profile', 'srgb');

if (overrideSession) {
  const appName = buildType === 'stable' ? 'AFFiNE' : `AFFiNE-${buildType}`;
  const userDataPath = path.join(app.getPath('appData'), appName);
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', userDataPath);
}

// oxlint-disable-next-line @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) app.quit();

if (process.env.SKIP_ONBOARDING) {
  launchStage.value = 'main';
  persistentConfig.set({ onBoarding: false });
}

const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  logger.info('Another instance is running or responding deep link, exiting...');
  app.quit();
  process.exit(0);
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (app.isReady()) {
    launch().catch(e => console.error('Failed launch:', e));
  }
});

setupDeepLink(app);

app
  .whenReady()
  .then(registerProtocol)
  .then(registerHandlers)
  .then(registerEvents)
  .then(launch)
  .then(createApplicationMenu)
  .then(registerUpdater)
  .then(setupRecordingFeature)
  .then(setupTrayState)
  .catch(e => console.error('Failed create window:', e));

if (process.env.SENTRY_RELEASE) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.BUILD_TYPE ?? 'development',
    ipcMode: IPCMode.Protocol,
    transportOptions: {
      maxAgeDays: 30,
      maxQueueSize: 100,
    },
  });
  Sentry.setTags({
    distribution: 'electron',
    appVersion: app.getVersion(),
  });
}
