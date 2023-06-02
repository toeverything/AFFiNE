import { join } from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';

import type { NamespaceHandlers } from '../type';
import { isMacOS } from '../utils';
import { getGoogleOauthCode } from './google-auth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handlers = require(join(
  process.env.PLUGIN_DIR ?? '../../plugins',
  './bookmark-block/server'
)) as NamespaceHandlers;

export const uiHandlers = {
  handleThemeChange: async (_, theme: (typeof nativeTheme)['themeSource']) => {
    nativeTheme.themeSource = theme;
  },
  handleSidebarVisibilityChange: async (_, visible: boolean) => {
    if (isMacOS()) {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(w => {
        // hide window buttons when sidebar is not visible
        w.setWindowButtonVisibility(visible);
      });
    }
  },
  handleMinimizeApp: async () => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      w.minimize();
    });
  },
  handleMaximizeApp: async () => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      if (w.isMaximized()) {
        w.unmaximize();
      } else {
        w.maximize();
      }
    });
  },
  handleCloseApp: async () => {
    app.quit();
  },
  getGoogleOauthCode: async () => {
    return getGoogleOauthCode();
  },
  ...handlers,
} satisfies NamespaceHandlers;
