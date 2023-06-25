import { app, BrowserWindow, nativeTheme } from 'electron';

import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';
import { isMacOS } from '../utils';
import { quickNoteWindow } from '../window';
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
  /**
   * @deprecated Remove this when bookmark block plugin is migrated to plugin-infra
   */
  getBookmarkDataByLink: async (_, link: string) => {
    return globalThis.asyncCall[
      'com.blocksuite.bookmark-block.get-bookmark-data-by-link'
    ](link);
  },
  handleShowQuickNote: async () => {
    if (quickNoteWindow) {
      quickNoteWindow.show();
    } else {
      logger.error('quickNoteWindow is not defined');
    }
  },
  handleHideQuickNote: async () => {
    if (quickNoteWindow) {
      quickNoteWindow.hide();
    } else {
      logger.error('quickNoteWindow is not defined');
    }
  },
  handleQuickNoteHeightChange: async (_, height: number) => {
    if (quickNoteWindow) {
      quickNoteWindow.setSize(quickNoteWindow.getSize()[0], height);
    } else {
      logger.error('quickNoteWindow is not defined');
    }
  },
} satisfies NamespaceHandlers;
