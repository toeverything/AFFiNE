import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { NotificationCenter } from '@affine/component/notification-center';
import { WorkspaceFallback } from '@affine/core/components/workspace';
import { GlobalScopeProvider } from '@affine/core/modules/infra-web/global-scope';
import { CloudSessionProvider } from '@affine/core/providers/session-provider';
import { router } from '@affine/core/router';
import {
  performanceLogger,
  performanceRenderLogger,
} from '@affine/core/shared';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { configureWebServices } from '@affine/core/web';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { ServiceCollection } from '@toeverything/infra/di';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

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
  performanceI18nLogger.info('start');

  const i18n = createI18n();
  document.documentElement.lang = i18n.language;

  performanceI18nLogger.info('set up');
  await setUpLanguage(i18n);
  performanceI18nLogger.info('done');
}

let languageLoadingPromise: Promise<void> | null = null;

const services = new ServiceCollection();
configureWebServices(services);
const serviceProvider = services.provider();

export function App() {
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
                <NotificationCenter />
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
}
