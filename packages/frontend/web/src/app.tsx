import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { NotificationCenter } from '@affine/component';
import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { WorkspaceFallback } from '@affine/core/components/workspace';
import { GlobalScopeProvider } from '@affine/core/modules/infra-web/global-scope';
import { CloudSessionProvider } from '@affine/core/providers/session-provider';
import { router } from '@affine/core/router';
import {
  performanceLogger,
  performanceRenderLogger,
} from '@affine/core/shared';
import { Telemetry } from '@affine/core/telemetry';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { configureWebServices } from '@affine/core/web';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import { getCurrentStore, ServiceCollection } from '@toeverything/infra';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('Key pressed:', e.key);
      if (
        e.key === 's' &&
        (navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey)
      ) {
        e.preventDefault();
        toast.success('Save');
      }
    };

    try {
      document.addEventListener('keydown', handleKeyDown, false);
    } catch (error) {
      console.error('Error attaching event listener:', error);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []);

  return (
    <Suspense>
      <GlobalScopeProvider provider={serviceProvider}>
        <CacheProvider value={cache}>
          <AffineContext store={getCurrentStore()}>
            <CloudSessionProvider>
              <Telemetry />
              <Toaster position="bottom-right" />
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
