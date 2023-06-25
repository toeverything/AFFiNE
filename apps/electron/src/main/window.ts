import assert from 'node:assert';

import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  nativeTheme,
} from 'electron';
import electronWindowState from 'electron-window-state';
import { join } from 'path';

import { getExposedMeta } from './exposed';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';
import { isMacOS, isWindows } from './utils';

const IS_DEV: boolean =
  process.env.NODE_ENV === 'development' && !process.env.CI;

async function createWindow(opts?: BrowserWindowConstructorOptions) {
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();

  assert(helperExposedMeta, 'helperExposedMeta should be defined');
  const mainExposedMeta = getExposedMeta();

  const browserWindow = new BrowserWindow({
    visualEffectState: 'active',
    vibrancy: 'under-window',
    show: false, // Use 'ready-to-show' event to show window
    webPreferences: {
      webgl: true,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like iframe or Electron's BrowserView. https://www.electronjs.org/docs/latest/api/webview-tag#warning
      spellcheck: false, // FIXME: enable?
      preload: join(__dirname, './preload.js'),
      // serialize exposed meta that to be used in preload
      additionalArguments: [
        `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
        `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
      ],
    },
    ...opts,
  });

  nativeTheme.themeSource = 'light';

  let helperConnectionUnsub: (() => void) | undefined;

  browserWindow.on('ready-to-show', () => {
    // logger.info('window is ready to show');
    helperConnectionUnsub = helperProcessManager.connectRenderer(
      browserWindow.webContents
    );
  });

  browserWindow.on('close', e => {
    e.preventDefault();
    browserWindow.destroy();
    helperConnectionUnsub?.();
  });

  return browserWindow;
}

const BASE_URL = process.env.DEV_SERVER_URL || 'file://.';

async function createMainWindow() {
  logger.info('create main window');
  const mainWindowState = electronWindowState({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  const browserWindow = await createWindow({
    titleBarStyle: isMacOS()
      ? 'hiddenInset'
      : isWindows()
      ? 'hidden'
      : 'default',
    trafficLightPosition: { x: 24, y: 18 },
    minWidth: 640,
    minHeight: 480,
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
  });

  mainWindowState.manage(browserWindow);

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  browserWindow.on('ready-to-show', () => {
    if (IS_DEV) {
      // do not gain focus in dev mode
      browserWindow.showInactive();
    } else {
      browserWindow.show();
    }

    logger.info('main window is ready to show');
  });

  browserWindow.setTitle('main');

  /**
   * URL for main window (at root)
   */
  logger.info('loading page at', BASE_URL);

  await browserWindow.loadURL(BASE_URL);

  logger.info('main window is loaded at', BASE_URL);

  return browserWindow;
}

// singleton
export let mainWindow: Electron.BrowserWindow | undefined;
export let quickNoteWindow: Electron.BrowserWindow | undefined;

let mainWindowId = 0;
let quickNoteWindowId = 0;

async function createDailyNoteWindow() {
  logger.info('create daily note window');
  const browserWindow = await createWindow({
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    width: 580,
    height: 256,
  });
  browserWindow.setTitle('quick-note');
  await browserWindow.loadURL(BASE_URL + '/quick-note');
  logger.info('quick note window is loaded at', BASE_URL);

  browserWindow.on('show', () => {
    browserWindow.focus();
    browserWindow.setWindowButtonVisibility(false);
  });

  browserWindow.on('focus', () => {
    browserWindow.setWindowButtonVisibility(false);
  });

  browserWindow.on('close', e => {
    if (browserWindow.isDestroyed()) {
      return;
    }
    browserWindow.hide();
    e.preventDefault();
  });

  browserWindow.on('blur', () => {
    if (browserWindow.isDestroyed()) {
      return;
    }
    browserWindow.hide();
  });

  return browserWindow;
}

/**
 * Restore existing BrowserWindow or Create new BrowserWindow
 */
export async function restoreOrCreateMainWindow() {
  const allWindows = BrowserWindow.getAllWindows().filter(
    w => !w.isDestroyed()
  );
  logger.info('restoreOrCreateWindow');

  mainWindow = allWindows.find(w => w.id === mainWindowId);
  quickNoteWindow = allWindows.find(w => w.id === quickNoteWindowId);

  if (!mainWindow) {
    mainWindow = await createMainWindow();
    mainWindowId = mainWindow.id;
  }

  if (!quickNoteWindow) {
    quickNoteWindow = await createDailyNoteWindow();
    quickNoteWindowId = quickNoteWindow.id;
  }

  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
    logger.info('restore main window');
  }

  // close them so that it can be re-created on dev mode
  app.on('before-quit', () => {
    mainWindow?.destroy();
    quickNoteWindow?.destroy();
  });

  return mainWindow;
}
