import { app, BrowserWindow, Menu } from 'electron';
import electronWindowState from 'electron-window-state';

import { isMacOS, isWindows } from '../../utils';
import { subjects } from './events';
import { restoreOrCreateWindow } from './main-window';

export async function registerDock() {
  const dockMenu = Menu.buildFromTemplate([
    {
      label: 'New Page',
      click: async () => {
        if (process.platform === 'darwin') {
          await restoreOrCreateWindow();
        }
        subjects.applicationMenu.newPageAction.next();
      },
    },
    {
      label: 'Daily Note',
      click: async () => {
        const mainWindowState = electronWindowState({
          defaultWidth: 720,
          defaultHeight: 170,
        });

        const browserWindow = new BrowserWindow({
          titleBarStyle: isMacOS()
            ? 'hiddenInset'
            : isWindows()
            ? 'hidden'
            : 'default',
          trafficLightPosition: { x: 24, y: 18 },
          x: mainWindowState.x,
          y: mainWindowState.y,
          width: mainWindowState.width,
          minWidth: 640,
          minHeight: 480,
          visualEffectState: 'active',
          vibrancy: 'under-window',
          height: mainWindowState.height,
          show: false, // Use 'ready-to-show' event to show window
          webPreferences: {
            webgl: true,
            contextIsolation: true,
            sandbox: false,
            webviewTag: false, // The webview tag is not recommended. Consider alternatives like iframe or Electron's BrowserView. https://www.electronjs.org/docs/latest/api/webview-tag#warning
            spellcheck: false, // FIXME: enable?
          },
        });

        /**
         * URL for main window.
         */
        const pageUrl =
          `${process.env.DEV_SERVER_URL}/daily-note` ||
          'file://./daily-note.html'; // see protocol.ts

        await browserWindow.loadURL(pageUrl);
        browserWindow.show();
      },
    },
  ]);

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock.setMenu(dockMenu);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
