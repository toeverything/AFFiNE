import assert from 'node:assert';
import { join } from 'node:path';

import { BrowserWindow, type CookiesSetDetails, nativeTheme } from 'electron';
import electronWindowState from 'electron-window-state';

import { isLinux, isMacOS, isWindows } from '../shared/utils';
import { mainWindowOrigin } from './constants';
import { ensureHelperProcess } from './helper-process';
import { logger } from './logger';
import { uiSubjects } from './ui/subject';
import { parseCookie } from './utils';

const IS_DEV: boolean =
  process.env.NODE_ENV === 'development' && !process.env.CI;

// todo: not all window need all of the exposed meta
const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('./exposed');
  const mainExposedMeta = getExposedMeta();
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
    `--window-name=main`,
  ];
};

function closeAllWindows() {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.destroy();
    }
  });
}

async function createWindow(additionalArguments: string[]) {
  logger.info('create window');
  const mainWindowState = electronWindowState({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();

  assert(helperExposedMeta, 'helperExposedMeta should be defined');

  const browserWindow = new BrowserWindow({
    titleBarStyle: isMacOS()
      ? 'hiddenInset'
      : isWindows()
        ? 'hidden'
        : 'default',
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    autoHideMenuBar: isLinux(),
    minWidth: 640,
    minHeight: 480,
    visualEffectState: 'active',
    vibrancy: 'under-window',
    // backgroundMaterial: 'mica',
    height: mainWindowState.height,
    show: false, // Use 'ready-to-show' event to show window
    webPreferences: {
      webgl: true,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like iframe or Electron's BrowserView. https://www.electronjs.org/docs/latest/api/webview-tag#warning
      spellcheck: false, // FIXME: enable?
      preload: join(__dirname, './preload.js'),
      // serialize exposed meta that to be used in preload
      additionalArguments: additionalArguments,
    },
  });

  nativeTheme.themeSource = 'light';

  mainWindowState.manage(browserWindow);

  let helperConnectionUnsub: (() => void) | undefined;

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  browserWindow.on('ready-to-show', () => {
    helperConnectionUnsub?.();
    helperConnectionUnsub = helperProcessManager.connectRenderer(
      browserWindow.webContents
    );

    logger.info('main window is ready to show');

    if (browserWindow.isMaximized() || browserWindow.isFullScreen()) {
      uiSubjects.onMaximized.next(true);
    }

    handleWebContentsResize().catch(logger.error);
  });

  browserWindow.on('close', e => {
    // TODO: gracefully close the app, for example, ask user to save unsaved changes
    e.preventDefault();
    if (!isMacOS()) {
      closeAllWindows();
    } else {
      // hide window on macOS
      // application quit will be handled by closing the hidden window
      //
      // explanation:
      // - closing the top window (by clicking close button or CMD-w)
      //   - will be captured in "close" event here
      //   - hiding the app to make the app open faster when user click the app icon
      // - quit the app by "cmd+q" or right click on the dock icon and select "quit"
      //   - all browser windows will capture the "close" event
      //   - the hidden window will close all windows
      //   - "window-all-closed" event will be emitted and eventually quit the app
      browserWindow.hide();
    }
    helperConnectionUnsub?.();
    helperConnectionUnsub = undefined;
  });

  browserWindow.on('leave-full-screen', () => {
    // FIXME: workaround for theme bug in full screen mode
    const size = browserWindow.getSize();
    browserWindow.setSize(size[0] + 1, size[1] + 1);
    browserWindow.setSize(size[0], size[1]);
    uiSubjects.onMaximized.next(false);
  });

  browserWindow.on('maximize', () => {
    uiSubjects.onMaximized.next(true);
  });

  // full-screen == maximized in UI on windows
  browserWindow.on('enter-full-screen', () => {
    uiSubjects.onMaximized.next(true);
  });

  browserWindow.on('unmaximize', () => {
    uiSubjects.onMaximized.next(false);
  });

  /**
   * URL for main window.
   */
  const pageUrl = mainWindowOrigin; // see protocol.ts

  logger.info('loading page at', pageUrl);

  await browserWindow.loadURL(pageUrl);

  logger.info('main window is loaded at', pageUrl);

  return browserWindow;
}

// singleton
let browserWindow$: Promise<BrowserWindow> | undefined;

// a hidden window that prevents the app from quitting on MacOS
let hiddenMacWindow: BrowserWindow | undefined;

/**
 * Init main BrowserWindow. Will create a new window if it's not created yet.
 */
export async function initAndShowMainWindow() {
  if (!browserWindow$ || (await browserWindow$.then(w => w.isDestroyed()))) {
    const additionalArguments = await getWindowAdditionalArguments();
    browserWindow$ = createWindow(additionalArguments);
  }
  const mainWindow = await browserWindow$;

  if (IS_DEV) {
    // do not gain focus in dev mode
    mainWindow.showInactive();
  } else {
    mainWindow.show();
  }

  if (!hiddenMacWindow && isMacOS()) {
    hiddenMacWindow = new BrowserWindow({
      show: false,
      width: 100,
      height: 100,
    });
    hiddenMacWindow.on('close', () => {
      closeAllWindows();
    });
  }

  return mainWindow;
}

export async function getMainWindow() {
  if (!browserWindow$) return;
  const window = await browserWindow$;
  if (window.isDestroyed()) return;
  return window;
}

export async function handleOpenUrlInHiddenWindow(url: string) {
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
    webPreferences: {
      preload: join(__dirname, './preload.js'),
    },
    show: false,
  });
  win.on('close', e => {
    e.preventDefault();
    if (!win.isDestroyed()) {
      win.destroy();
    }
  });
  logger.info('loading page at', url);
  await win.loadURL(url);
  return win;
}

export async function setCookie(cookie: CookiesSetDetails): Promise<void>;
export async function setCookie(origin: string, cookie: string): Promise<void>;

export async function setCookie(
  arg0: CookiesSetDetails | string,
  arg1?: string
) {
  const window = await browserWindow$;
  if (!window) {
    // do nothing if window is not ready
    return;
  }
  const details =
    typeof arg1 === 'string' && typeof arg0 === 'string'
      ? parseCookie(arg0, arg1)
      : arg0;

  logger.info('setting cookie to main window', details);

  if (typeof details !== 'object') {
    throw new Error('invalid cookie details');
  }

  await window.webContents.session.cookies.set(details);
}

export async function removeCookie(url: string, name: string): Promise<void> {
  const window = await browserWindow$;
  if (!window) {
    // do nothing if window is not ready
    return;
  }
  await window.webContents.session.cookies.remove(url, name);
}

export async function getCookie(url?: string, name?: string) {
  const window = await browserWindow$;
  if (!window) {
    // do nothing if window is not ready
    return;
  }
  const cookies = await window.webContents.session.cookies.get({
    url,
    name,
  });
  return cookies;
}

// there is no proper way to listen to webContents resize event
// we will rely on window.resize event in renderer instead
export async function handleWebContentsResize() {
  // right now when window is resized, we will relocate the traffic light positions
  if (isMacOS()) {
    const window = await getMainWindow();
    const factor = window?.webContents.getZoomFactor() || 1;
    window?.setWindowButtonPosition({ x: 20 * factor, y: 24 * factor - 6 });
  }
}
