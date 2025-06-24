import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import { app as electronApp } from 'electron';

import { buildType, isDev, overrideSession } from '../../shared/constants';
import { AppModule } from './app.module';
import { logger } from './logger';
import { registerSchemes, setAsDefaultProtocolClient } from './misc';

function enableSandbox() {
  electronApp.enableSandbox();
}

function setupSquirrel() {
  // oxlint-disable-next-line @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) electronApp.quit();
}

function setupCommandLine() {
  electronApp.commandLine.appendSwitch('enable-features', 'CSSTextAutoSpace');

  if (isDev) {
    // In electron the dev server will be resolved to 0.0.0.0, but it
    // might be blocked by electron.
    // See https://github.com/webpack/webpack-dev-server/pull/384
    electronApp.commandLine.appendSwitch('host-rules', 'MAP 0.0.0.0 127.0.0.1');
  }

  // https://github.com/electron/electron/issues/43556
  electronApp.commandLine.appendSwitch(
    'disable-features',
    'PlzDedicatedWorker'
  );
}

function ensureSingleInstance() {
  /**
   * Prevent multiple instances
   */
  const isSingleInstance = electronApp.requestSingleInstanceLock();
  if (!isSingleInstance) {
    logger.log(
      'Another instance is running or responding deep link, exiting...'
    );
    electronApp.quit();
    process.exit(0);
  }
}

function configurePaths() {
  // use the same data for internal & beta for testing
  if (overrideSession) {
    const appName = buildType === 'stable' ? 'AFFiNE' : `AFFiNE-${buildType}`;
    const userDataPath = path.join(electronApp.getPath('appData'), appName);
    electronApp.setPath('userData', userDataPath);
    electronApp.setPath('sessionData', userDataPath);
  }
}

// some settings must be called before ready
function beforeReady() {
  enableSandbox();
  setupSquirrel();
  setupCommandLine();
  ensureSingleInstance();
  configurePaths();
  registerSchemes();
  setAsDefaultProtocolClient();
}

export async function bootstrap() {
  beforeReady();
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger, // use our own logger
  });

  // Close on Electron quit
  electronApp.on('before-quit', () => {
    context.close().catch(err => {
      logger.error(err);
    });
  });
}
