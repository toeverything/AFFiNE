import { app, nativeTheme, shell } from 'electron';
import { getLinkPreview } from 'link-preview-js';

import { isMacOS } from '../../shared/utils';
import { persistentConfig } from '../config-storage/persist';
import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';
import {
  addTab,
  closeTab,
  getMainWindow,
  getOnboardingWindow,
  getTabViewsMeta,
  handleWebContentsResize,
  initAndShowMainWindow,
  isActiveTab,
  launchStage,
  showDevTools,
  showTab,
  showTabContextMenu,
  updateTabsBoundingRect,
  updateWorkbenchMeta,
} from '../windows-manager';
import { getChallengeResponse } from './challenge';

export let isOnline = true;

export const uiHandlers = {
  isMaximized: async () => {
    const window = await getMainWindow();
    return window?.isMaximized();
  },
  isFullScreen: async () => {
    const window = await getMainWindow();
    return window?.isFullScreen();
  },
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
  handleWindowResize: async () => {
    await handleWebContentsResize();
  },
  handleCloseApp: async () => {
    app.quit();
  },
  handleNetworkChange: async (_, _isOnline: boolean) => {
    isOnline = _isOnline;
  },
  getChallengeResponse: async (_, challenge: string) => {
    return getChallengeResponse(challenge);
  },
  handleOpenMainApp: async () => {
    if (launchStage.value === 'onboarding') {
      launchStage.value = 'main';
      persistentConfig.patch('onBoarding', false);
    }

    try {
      const onboarding = await getOnboardingWindow();
      onboarding?.hide();
      await initAndShowMainWindow();
      // need to destroy onboarding window after main window is ready
      // otherwise the main window will be closed as well
      onboarding?.destroy();
    } catch (err) {
      logger.error('handleOpenMainApp', err);
    }
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
  openExternal(_, url: string) {
    return shell.openExternal(url);
  },

  // tab handlers
  isActiveTab: async (_, tabKey: string) => {
    return isActiveTab(tabKey);
  },

  addTab: async (_, ...args: Parameters<typeof addTab>) => {
    await addTab(...args);
  },
  showTab: async (_, ...args: Parameters<typeof showTab>) => {
    await showTab(...args);
  },
  closeTab: async (_, ...args: Parameters<typeof closeTab>) => {
    await closeTab(...args);
  },
  getTabViewsMeta: async () => {
    return getTabViewsMeta();
  },
  updateWorkbenchMeta: async (
    _,
    ...args: Parameters<typeof updateWorkbenchMeta>
  ) => {
    return updateWorkbenchMeta(...args);
  },
  updateTabsBoundingRect: async (
    _,
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    return updateTabsBoundingRect(rect);
  },
  showDevTools: async (_, ...args: Parameters<typeof showDevTools>) => {
    return showDevTools(...args);
  },
  showTabContextMenu: async (_, tabKey: string, viewIndex: number) => {
    return showTabContextMenu(tabKey, viewIndex);
  },
} satisfies NamespaceHandlers;
