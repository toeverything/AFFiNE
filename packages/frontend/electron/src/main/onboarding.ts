import { assert } from 'console';
import { BrowserWindow } from 'electron';
import { join } from 'path';

import { mainWindowOrigin } from './constants';
import { eventEmitter } from './emitter';
import { getExposedMeta } from './exposed';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';

async function createOnboardingWindow() {
  logger.info('creating onboarding window');

  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();

  assert(helperExposedMeta, 'helperExposedMeta should be defined');
  const mainExposedMeta = getExposedMeta();

  const browserWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    show: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // transparent: true,
    webPreferences: {
      webgl: true,
      preload: join(__dirname, './preload.js'),
      additionalArguments: [
        `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
        `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
      ],
    },
  });

  browserWindow.on('ready-to-show', () => {
    browserWindow.show();
  });

  await browserWindow.loadURL(
    `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}onboarding`
  );

  return browserWindow;
}

let onBoardingWindow$: Promise<BrowserWindow> | undefined;

export async function getOrCreateOnboardingWindow() {
  if (
    !onBoardingWindow$ ||
    (await onBoardingWindow$.then(w => w.isDestroyed()))
  ) {
    onBoardingWindow$ = createOnboardingWindow();
  }

  return onBoardingWindow$;
}

export async function getOnboardingWindow() {
  if (!onBoardingWindow$) return;
  const window = await onBoardingWindow$;
  if (window.isDestroyed()) return;
  return window;
}

eventEmitter.on('window:onboarding:close', () => {
  getOnboardingWindow()
    .then(w => w?.destroy())
    .catch(logger.error);
});
