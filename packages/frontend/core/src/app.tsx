import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { NotificationCenter } from '@affine/component/notification-center';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { ServiceCollection } from '@toeverything/infra/di';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { WorkspaceFallback } from './components/workspace';
import { GlobalScopeProvider } from './modules/infra-web/global-scope';
import { CloudSessionProvider } from './providers/session-provider';
import { router } from './router';
import { performanceLogger, performanceRenderLogger } from './shared';
import createEmotionCache from './utils/create-emotion-cache';
import { configureWebServices } from './web';

const performanceI18nLogger = performanceLogger.namespace('i18n');
const cache = createEmotionCache();

const DevTools = lazy(() =>
  import('jotai-devtools').then(m => ({ default: m.DevTools }))
);

const DebugProvider = ({ children }: PropsWithChildren): ReactElement => {
  return (
    <>
      <Suspense>{process.env.DEBUG_JOTAI === 'true' && <DevTools />}</Suspense>
      {children}
    </>
  );
};

const future = {
  v7_startTransition: true,
} as const;

async function loadLanguage() {
  if (environment.isBrowser) {
    performanceI18nLogger.info('start');

    const i18n = createI18n();
    document.documentElement.lang = i18n.language;

    performanceI18nLogger.info('set up');
    await setUpLanguage(i18n);
    performanceI18nLogger.info('done');
  }
}

let languageLoadingPromise: Promise<void> | null = null;

const services = new ServiceCollection();
configureWebServices(services);
const serviceProvider = services.provider();

export const App = memo(function App() {
  performanceRenderLogger.info('App');

  if (!languageLoadingPromise) {
    languageLoadingPromise = loadLanguage().catch(console.error);
  }

  return (
    <Suspense>
      <GlobalScopeProvider provider={serviceProvider}>
        <CacheProvider value={cache}>
          <AffineContext store={getCurrentStore()}>
            <CloudSessionProvider>
              <DebugProvider>
                <GlobalLoading />
                {runtimeConfig.enableNotificationCenter && (
                  <NotificationCenter />
                )}
                <RouterProvider
                  fallbackElement={<WorkspaceFallback key="RouterFallback" />}
                  router={router}
                  future={future}
                />
              </DebugProvider>
            </CloudSessionProvider>
          </AffineContext>
        </CacheProvider>
      </GlobalScopeProvider>
    </Suspense>
  );
});
