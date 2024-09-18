import './setup';

import { appConfigProxy } from '@affine/core/components/hooks/use-app-config-storage';
import { apis, appInfo, events } from '@affine/electron-api';
import {
  init,
  reactRouterV6BrowserTracingIntegration,
  setTags,
} from '@sentry/react';
import { debounce } from 'lodash-es';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import { App } from './app';

function main() {
  // load persistent config for electron
  // TODO(@Peng): should be sync, but it's not necessary for now
  appConfigProxy
    .getSync()
    .catch(() => console.error('failed to load app config'));

  // skip bootstrap setup for desktop onboarding
  if (
    !(
      appInfo?.windowName === 'onboarding' ||
      appInfo?.windowName === 'theme-editor'
    )
  ) {
    if (BUILD_CONFIG.debug || window.SENTRY_RELEASE) {
      // https://docs.sentry.io/platforms/javascript/guides/electron/
      init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.BUILD_TYPE ?? 'development',
        integrations: [
          reactRouterV6BrowserTracingIntegration({
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes,
          }),
        ],
      });
      setTags({
        appVersion: BUILD_CONFIG.appVersion,
        editorVersion: BUILD_CONFIG.editorVersion,
      });

      apis?.ui.handleNetworkChange(navigator.onLine);
      window.addEventListener('offline', () => {
        apis?.ui.handleNetworkChange(false);
      });
      window.addEventListener('online', () => {
        apis?.ui.handleNetworkChange(true);
      });
    }

    const handleMaximized = (maximized: boolean | undefined) => {
      document.documentElement.dataset.maximized = String(maximized);
    };
    const handleFullscreen = (fullscreen: boolean | undefined) => {
      document.documentElement.dataset.fullscreen = String(fullscreen);
    };
    apis?.ui.isMaximized().then(handleMaximized).catch(console.error);
    apis?.ui.isFullScreen().then(handleFullscreen).catch(console.error);
    events?.ui.onMaximized(handleMaximized);
    events?.ui.onFullScreen(handleFullscreen);

    const tabId = appInfo?.viewId;
    const handleActiveTabChange = (active: boolean) => {
      document.documentElement.dataset.active = String(active);
    };

    if (tabId) {
      apis?.ui
        .isActiveTab()
        .then(active => {
          handleActiveTabChange(active);
          events?.ui.onActiveTabChanged(id => {
            handleActiveTabChange(id === tabId);
          });
        })
        .catch(console.error);
    }

    const handleResize = debounce(() => {
      apis?.ui.handleWindowResize().catch(console.error);
    }, 50);
    window.addEventListener('resize', handleResize);
    window.addEventListener('dragstart', () => {
      document.documentElement.dataset.dragging = 'true';
    });
    window.addEventListener('dragend', () => {
      document.documentElement.dataset.dragging = 'false';
    });
  }

  mountApp();
}

function mountApp() {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const root = document.getElementById('app')!;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

try {
  main();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}
