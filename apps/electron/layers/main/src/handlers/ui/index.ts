import { app, BrowserWindow, nativeTheme } from 'electron';

import { isMacOS } from '../../../../utils';
import { getOrCreateAppWindow } from '../../window';
import type { NamespaceHandlers } from '../type';
import { getGoogleOauthCode } from './google-auth';

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

  addNewTab: async (_, url?: string) => {
    const window = getOrCreateAppWindow();
    window.addAppView(url);
  },
  removeTab: async (_, id: string) => {
    const window = getOrCreateAppWindow();
    window.removeView(id);
  },
  showTab: async (_, id: string) => {
    const window = getOrCreateAppWindow();
    window.showView(id);
  },
  getActiveTab: async () => {
    const window = getOrCreateAppWindow();
    return window.activeViewId;
  },
  getTabs: async () => {
    const window = getOrCreateAppWindow();
    return window.viewIds;
  },
  revealDevTools: async e => {
    const window = getOrCreateAppWindow();
    const id = window.fromWebContentId(e.sender.id);
    if (id) {
      window.revealDevTools(id);
    }
  },
} satisfies NamespaceHandlers;
