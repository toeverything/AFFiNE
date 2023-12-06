import { BrowserWindow } from 'electron';
import { join } from 'path';

import { mainWindowOrigin } from './constants';
import { logger } from './logger';

async function createOnboardingWindow(additionalArguments: string[]) {
  logger.info('creating onboarding window');

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

export async function initOnboardingWindow(additionalArguments: string[]) {
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
