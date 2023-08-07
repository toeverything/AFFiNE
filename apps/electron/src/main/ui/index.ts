import { app, BrowserWindow, nativeTheme } from 'electron';

import { isMacOS } from '../../shared/utils';
import { closePopup } from '../main-window';
import type { MainEventRegister, NamespaceHandlers } from '../type';
import { getGoogleOauthCode } from './google-auth';
import { uiSubjects } from './subject';

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
  handleFinishLogin: async () => {
    closePopup();
    uiSubjects.onFinishLogin.next();
  },
  getGoogleOauthCode: async () => {
    return getGoogleOauthCode();
  },
  /**
   * @deprecated Remove this when bookmark block plugin is migrated to plugin-infra
   */
  getBookmarkDataByLink: async (_, link: string) => {
    return globalThis.asyncCall[
      'com.blocksuite.bookmark-block.get-bookmark-data-by-link'
    ](link);
  },
} satisfies NamespaceHandlers;

export * from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onFinishLogin: (fn: () => void) => {
    const sub = uiSubjects.onFinishLogin.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
