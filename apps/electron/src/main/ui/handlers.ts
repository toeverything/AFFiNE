import { app, BrowserWindow, nativeTheme } from 'electron';
import { getLinkPreview } from 'link-preview-js';

import { isMacOS } from '../../shared/utils';
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
      // allow unmaximize when in full screen mode
      if (w.isFullScreen()) {
        w.setFullScreen(false);
        w.unmaximize();
      } else if (w.isMaximized()) {
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
  getBookmarkDataByLink: async (_, link: string) => {
    const previewData = (await getLinkPreview(link, {
      timeout: 6000,
      headers: {
        'user-agent': 'googlebot',
      },
      followRedirects: 'follow',
    }).catch(() => {
      return {
        title: '',
        siteName: '',
        description: '',
        images: [],
        videos: [],
        contentType: `text/html`,
        favicons: [],
      };
    })) as any;

    return {
      title: previewData.title,
      description: previewData.description,
      icon: previewData.favicons[0],
      image: previewData.images[0],
    };
  },
} satisfies NamespaceHandlers;
