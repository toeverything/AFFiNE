import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { NotificationCenter } from '@affine/component';
import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { WorkspaceFallback } from '@affine/core/components/workspace';
import { configureCommonModules } from '@affine/core/modules';
import { configureBrowserStorageImpls } from '@affine/core/modules/storage';
import {
  configureBrowserWorkspaceFlavours,
  configureIndexedDBWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import { CloudSessionProvider } from '@affine/core/providers/session-provider';
import { router } from '@affine/core/router';
import {
  performanceLogger,
  performanceRenderLogger,
} from '@affine/core/shared';
import { Telemetry } from '@affine/core/telemetry';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import {
  Framework,
  FrameworkRoot,
  getCurrentStore,
  LifecycleService,
} from '@toeverything/infra';
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

const framework = new Framework();
configureCommonModules(framework);
configureBrowserStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureIndexedDBWorkspaceEngineStorageProvider(framework);
const frameworkProvider = framework.provider();

frameworkProvider.get(LifecycleService).applicationStart();

export function App() {
  performanceRenderLogger.info('App');

  if (!languageLoadingPromise) {
    languageLoadingPromise = loadLanguage().catch(console.error);
  }

  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <CacheProvider value={cache}>
          <AffineContext store={getCurrentStore()}>
            <CloudSessionProvider>
              <Telemetry />
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
      </FrameworkRoot>
    </Suspense>
  );
}
