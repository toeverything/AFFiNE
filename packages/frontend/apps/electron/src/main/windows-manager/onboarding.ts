import { join } from 'node:path';

import { BrowserWindow, screen } from 'electron';

import { isDev } from '../config';
import { onboardingViewUrl } from '../constants';
// import { getExposedMeta } from './exposed';
import { logger } from '../logger';
import { buildWebPreferences } from '../web-preferences';
import { fullscreenAndCenter, getScreenSize } from './utils';

// todo: not all window need all of the exposed meta
const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--window-name=onboarding`,
  ];
};

async function createOnboardingWindow(additionalArguments: string[]) {
  logger.info('creating onboarding window');

  // get user's screen size
  const { width, height } = getScreenSize(screen.getPrimaryDisplay());

  const browserWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    show: false,
    resizable: false,
    closable: false,
    minimizable: false,
    movable: false,
    titleBarStyle: 'hidden',
    maximizable: false,
    fullscreenable: false,
    // skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: buildWebPreferences({
      webgl: true,
      preload: join(__dirname, './preload.js'),
      additionalArguments: additionalArguments,
    }),
  });

  // workaround for the phantom title bar on windows when losing focus
  // see https://github.com/electron/electron/issues/39959#issuecomment-1758736966
  browserWindow.on('focus', () => {
    browserWindow.setBackgroundColor('#00000000');
  });

  browserWindow.on('blur', () => {
    browserWindow.setBackgroundColor('#00000000');
  });

  browserWindow.on('ready-to-show', () => {
    // forcing zoom factor to 1 to avoid onboarding display issues
    browserWindow.webContents.setZoomFactor(1);
    fullscreenAndCenter(browserWindow);
    // TODO(@catsjuice): add a timeout to avoid flickering, window is ready, but dom is not ready
    setTimeout(() => {
      browserWindow.show();
    }, 300);
  });

  // When moved to another screen, resize to fit the screen
  browserWindow.on('moved', () => {
    fullscreenAndCenter(browserWindow);
  });

  if (isDev) {
    browserWindow.webContents.openDevTools();
  }

  await browserWindow.loadURL(onboardingViewUrl);

  return browserWindow;
}

let onBoardingWindow: Promise<BrowserWindow> | undefined;

export async function getOrCreateOnboardingWindow() {
  const additionalArguments = await getWindowAdditionalArguments();
  if (
    !onBoardingWindow ||
    (await onBoardingWindow.then(w => w.isDestroyed()))
  ) {
    onBoardingWindow = createOnboardingWindow(additionalArguments);
  }

  return onBoardingWindow;
}

export async function getOnboardingWindow() {
  if (!onBoardingWindow) return;
  const window = await onBoardingWindow;
  if (window.isDestroyed()) return;
  return window;
}
