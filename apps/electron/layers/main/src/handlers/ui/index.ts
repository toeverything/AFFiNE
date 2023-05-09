import { BrowserWindow, nativeTheme } from 'electron';

import { isMacOS } from '../../../../utils';
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
  getGoogleOauthCode: async () => {
    return getGoogleOauthCode();
  },
} satisfies NamespaceHandlers;
