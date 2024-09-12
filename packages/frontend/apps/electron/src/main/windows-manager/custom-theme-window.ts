import { join } from 'node:path';

import { BrowserWindow, type Display, screen } from 'electron';

import { isMacOS } from '../../shared/utils';
import { customThemeViewUrl } from '../constants';
import { logger } from '../logger';

let customThemeWindow: Promise<BrowserWindow> | undefined;

const getScreenSize = (display: Display) => {
  const { width, height } = isMacOS() ? display.bounds : display.workArea;
  return { width, height };
};

async function createCustomThemeWindow(additionalArguments: string[]) {
  logger.info('creating custom theme window');

  const { width: maxWidth, height: maxHeight } = getScreenSize(
    screen.getPrimaryDisplay()
  );

  const browserWindow = new BrowserWindow({
    width: Math.min(maxWidth, 800),
    height: Math.min(maxHeight, 600),
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      webgl: true,
      preload: join(__dirname, './preload.js'),
      additionalArguments: additionalArguments,
    },
  });

  await browserWindow.loadURL(customThemeViewUrl);

  browserWindow.on('closed', () => {
    customThemeWindow = undefined;
  });

  return browserWindow;
}

const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--window-name=theme-editor`,
  ];
};

export async function getOrCreateCustomThemeWindow() {
  const additionalArguments = await getWindowAdditionalArguments();
  if (
    !customThemeWindow ||
    (await customThemeWindow.then(w => w.isDestroyed()))
  ) {
    customThemeWindow = createCustomThemeWindow(additionalArguments);
  }

  return customThemeWindow;
}

export async function getCustomThemeWindow() {
  if (!customThemeWindow) return;
  const window = await customThemeWindow;
  if (window.isDestroyed()) return;
  return window;
}
