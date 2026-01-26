import { AffineContext } from '@affine/core/components/context';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { router } from '@affine/core/desktop/router';
import { I18nProvider } from '@affine/core/modules/i18n';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { CacheProvider } from '@emotion/react';
import { FrameworkRoot, getCurrentStore } from '@toeverything/infra';
import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { setupEffects, useIsOnBattery } from './effects';
import { DesktopLanguageSync } from './language-sync';
import { DesktopThemeSync } from './theme-sync';

const { frameworkProvider } = setupEffects();

const desktopWhiteList = [
  '/open-app/signin-redirect',
  '/open-app/url',
  '/upgrade-success',
  '/ai-upgrade-success',
  '/share',
  '/oauth',
  '/magic-link',
];
if (
  !BUILD_CONFIG.isElectron &&
  BUILD_CONFIG.debug &&
  desktopWhiteList.every(path => !location.pathname.startsWith(path))
) {
  document.body.innerHTML = `<h1 style="color:red;font-size:5rem;text-align:center;">Don't run electron entry in browser.</h1>`;
  throw new Error('Wrong distribution');
}

const cache = createEmotionCache();

const future = {
  v7_startTransition: true,
} as const;

export function App() {
  const isOnBattery = useIsOnBattery();

  useEffect(() => {
    document.body.classList.toggle('on-battery', isOnBattery);
    return () => {
      document.body.classList.remove('on-battery');
    };
  }, [isOnBattery]);

  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <CacheProvider value={cache}>
          <I18nProvider>
            <AffineContext store={getCurrentStore()}>
              <DesktopThemeSync />
              <DesktopLanguageSync />
              <RouterProvider
                fallbackElement={<AppContainer fallback />}
                router={router}
                future={future}
              />
              {environment.isWindows && (
                <div style={{ position: 'fixed', right: 0, top: 0, zIndex: 5 }}>
                  <WindowsAppControls />
                </div>
              )}
            </AffineContext>
          </I18nProvider>
        </CacheProvider>
      </FrameworkRoot>
    </Suspense>
  );
}
