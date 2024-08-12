import { app, nativeTheme, shell } from 'electron';
import { getLinkPreview } from 'link-preview-js';

import { persistentConfig } from '../config-storage/persist';
import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';
import {
  activateView,
  addTab,
  closeTab,
  getMainWindow,
  getOnboardingWindow,
  getTabsStatus,
  getTabViewsMeta,
  getWorkbenchMeta,
  handleWebContentsResize,
  initAndShowMainWindow,
  isActiveTab,
  launchStage,
  moveTab,
  pingAppLayoutReady,
  showDevTools,
  showTab,
  updateWorkbenchMeta,
  updateWorkbenchViewMeta,
} from '../windows-manager';
import { showTabContextMenu } from '../windows-manager/context-menu';
import { getOrCreateCustomThemeWindow } from '../windows-manager/custom-theme-window';
import { getChallengeResponse } from './challenge';
import { uiSubjects } from './subject';

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
  handleWindowResize: async e => {
    await handleWebContentsResize(e.sender);
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
  isActiveTab: async e => {
    return isActiveTab(e.sender);
  },
  getWorkbenchMeta: async (_, ...args: Parameters<typeof getWorkbenchMeta>) => {
    return getWorkbenchMeta(...args);
  },
  updateWorkbenchMeta: async (
    _,
    ...args: Parameters<typeof updateWorkbenchMeta>
  ) => {
    return updateWorkbenchMeta(...args);
  },
  updateWorkbenchViewMeta: async (
    _,
    ...args: Parameters<typeof updateWorkbenchViewMeta>
  ) => {
    return updateWorkbenchViewMeta(...args);
  },
  getTabViewsMeta: async () => {
    return getTabViewsMeta();
  },
  getTabsStatus: async () => {
    return getTabsStatus();
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
  activateView: async (_, ...args: Parameters<typeof activateView>) => {
    await activateView(...args);
  },
  moveTab: async (_, ...args: Parameters<typeof moveTab>) => {
    moveTab(...args);
  },
  toggleRightSidebar: async (_, tabId?: string) => {
    tabId ??= getTabViewsMeta().activeWorkbenchId;
    if (tabId) {
      uiSubjects.onToggleRightSidebar$.next(tabId);
    }
  },
  pingAppLayoutReady: async e => {
    pingAppLayoutReady(e.sender);
  },
  showDevTools: async (_, ...args: Parameters<typeof showDevTools>) => {
    return showDevTools(...args);
  },
  showTabContextMenu: async (_, tabKey: string, viewIndex: number) => {
    return showTabContextMenu(tabKey, viewIndex);
  },
  openThemeEditor: async () => {
    const win = await getOrCreateCustomThemeWindow();
    win.show();
    win.focus();
  },
} satisfies NamespaceHandlers;
