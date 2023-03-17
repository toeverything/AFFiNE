import { BrowserWindow } from 'electron';
import electronWindowState from 'electron-window-state';
import { join } from 'path';

const IS_DEV = process.env.NODE_ENV === 'development';

async function createWindow() {
  const mainWindowState = electronWindowState({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  const browserWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    show: false, // Use 'ready-to-show' event to show window
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like iframe or Electron's BrowserView. https://www.electronjs.org/docs/latest/api/webview-tag#warning
      spellcheck: false, // FIXME: enable?
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  mainWindowState.manage(browserWindow);

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  browserWindow.on('ready-to-show', () => {
    browserWindow.show();

    if (IS_DEV) {
      browserWindow.webContents.openDevTools();
    }
  });

  browserWindow.on('close', e => {
    e.preventDefault();
    browserWindow.destroy();
    // TODO: gracefully close the app, for example, ask user to save unsaved changes
  });

  /**
   * URL for main window.
   */
  const pageUrl =
    IS_DEV && process.env.DEV_SERVER_URL !== undefined
      ? process.env.DEV_SERVER_URL
      : 'file://./index.html'; // see protocol.ts

  await browserWindow.loadURL(pageUrl);

  return browserWindow;
}

/**
 * Restore existing BrowserWindow or Create new BrowserWindow
 */
export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await createWindow();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}
