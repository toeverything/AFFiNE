import { app, nativeTheme } from 'electron';
import { getLinkPreview } from 'link-preview-js';

import { isMacOS } from '../../shared/utils';
import { logger } from '../logger';
import { getMainWindow } from '../main-window';
import type { NamespaceHandlers } from '../type';
import { getChallengeResponse } from './challenge';
import { getGoogleOauthCode } from './google-auth';

export const uiHandlers = {
  handleThemeChange: async (_, theme: (typeof nativeTheme)['themeSource']) => {
    nativeTheme.themeSource = theme;
  },
  handleSidebarVisibilityChange: async (_, visible: boolean) => {
    if (isMacOS()) {
      const window = await getMainWindow();
      window?.setWindowButtonVisibility(visible);
    }
  },
  handleMinimizeApp: async () => {
    const window = await getMainWindow();
    window?.minimize();
  },
  handleMaximizeApp: async () => {
    const window = await getMainWindow();
    if (!window) {
      return;
    }
    // allow unmaximize when in full screen mode
    if (window.isFullScreen()) {
      window.setFullScreen(false);
      window.unmaximize();
    } else if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  },
  handleCloseApp: async () => {
    app.quit();
  },
  getGoogleOauthCode: async () => {
    return getGoogleOauthCode();
  },
  getChallengeResponse: async (_, challenge: string) => {
    return getChallengeResponse(challenge);
  },
  getBookmarkDataByLink: async (_, link: string) => {
    if (
      (link.startsWith('https://x.com/') ||
        link.startsWith('https://www.x.com/') ||
        link.startsWith('https://www.twitter.com/') ||
        link.startsWith('https://twitter.com/')) &&
      link.includes('/status/')
    ) {
      // use api.fxtwitter.com
      link =
        'https://api.fxtwitter.com/status/' + /\/status\/(.*)/.exec(link)?.[1];
      try {
        const { tweet } = await fetch(link).then(res => res.json());
        return {
          title: tweet.author.name,
          icon: tweet.author.avatar_url,
          description: tweet.text,
          image: tweet.media?.photos[0].url || tweet.author.banner_url,
        };
      } catch (err) {
        logger.error('getBookmarkDataByLink', err);
        return {
          title: undefined,
          description: undefined,
          icon: undefined,
          image: undefined,
        };
      }
    } else {
      const previewData = (await getLinkPreview(link, {
        timeout: 6000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
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
    }
  },
} satisfies NamespaceHandlers;
