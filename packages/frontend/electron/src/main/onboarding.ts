import { assert } from 'console';
import { BrowserWindow } from 'electron';
import { join } from 'path';

import { mainWindowOrigin } from './constants';
// import { getExposedMeta } from './exposed';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';

// todo: not all window need all of the exposed meta
const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('./exposed');
  const mainExposedMeta = getExposedMeta();
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
  ];
};

async function createOnboardingWindow(additionalArguments: string[]) {
  logger.info('creating onboarding window');

  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();

  assert(helperExposedMeta, 'helperExposedMeta should be defined');

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
      additionalArguments: additionalArguments,
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
  const additionalArguments = await getWindowAdditionalArguments();
  if (
    !onBoardingWindow$ ||
    (await onBoardingWindow$.then(w => w.isDestroyed()))
  ) {
    onBoardingWindow$ = createOnboardingWindow(additionalArguments);
  }

  return onBoardingWindow$;
}

export async function getOnboardingWindow() {
  if (!onBoardingWindow$) return;
  const window = await onBoardingWindow$;
  if (window.isDestroyed()) return;
  return window;
}
