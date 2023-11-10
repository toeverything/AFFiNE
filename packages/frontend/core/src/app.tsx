import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@toeverything/components/style.css';

import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { NotificationCenter } from '@affine/component/notification-center';
import { WorkspaceFallback } from '@affine/component/workspace';
import { CacheProvider } from '@emotion/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { use } from 'foxact/use';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { CloudSessionProvider } from './providers/session-provider';
import { router } from './router';
import { performanceLogger, performanceRenderLogger } from './shared';
import createEmotionCache from './utils/create-emotion-cache';

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

    const { createI18n, setUpLanguage } = await import('@affine/i18n');
    const i18n = createI18n();
    document.documentElement.lang = i18n.language;

    performanceI18nLogger.info('set up');
    await setUpLanguage(i18n);
    performanceI18nLogger.info('done');
  }
}

const languageLoadingPromise = loadLanguage().catch(console.error);

export const App = memo(function App() {
  performanceRenderLogger.info('App');

  use(languageLoadingPromise);
  return (
    <CacheProvider value={cache}>
      <AffineContext store={getCurrentStore()}>
        <CloudSessionProvider>
          <DebugProvider>
            <GlobalLoading />
            {runtimeConfig.enableNotificationCenter && <NotificationCenter />}
            <RouterProvider
              fallbackElement={<WorkspaceFallback key="RouterFallback" />}
              router={router}
              future={future}
            />
          </DebugProvider>
        </CloudSessionProvider>
      </AffineContext>
    </CacheProvider>
  );
});
