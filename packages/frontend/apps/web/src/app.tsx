import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { Telemetry } from '@affine/core/components/telemetry';
import { router } from '@affine/core/desktop/router';
import { configureCommonModules } from '@affine/core/modules';
import { configureLocalStorageStateStorageImpls } from '@affine/core/modules/storage';
import { CustomThemeModifier } from '@affine/core/modules/theme-editor';
import { configureIndexedDBUserspaceStorageProvider } from '@affine/core/modules/userspace';
import { configureBrowserWorkbenchModule } from '@affine/core/modules/workbench';
import {
  configureBrowserWorkspaceFlavours,
  configureIndexedDBWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import {
  Framework,
  FrameworkRoot,
  getCurrentStore,
  LifecycleService,
} from '@toeverything/infra';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

const cache = createEmotionCache();

const future = {
  v7_startTransition: true,
} as const;

async function loadLanguage() {
  const i18n = createI18n();
  document.documentElement.lang = i18n.language;

  await setUpLanguage(i18n);
}

let languageLoadingPromise: Promise<void> | null = null;

const framework = new Framework();
configureCommonModules(framework);
configureBrowserWorkbenchModule(framework);
configureLocalStorageStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureIndexedDBWorkspaceEngineStorageProvider(framework);
configureIndexedDBUserspaceStorageProvider(framework);
const frameworkProvider = framework.provider();

// setup application lifecycle events, and emit application start event
window.addEventListener('focus', () => {
  frameworkProvider.get(LifecycleService).applicationFocus();
});
frameworkProvider.get(LifecycleService).applicationStart();

export function App() {
  if (!languageLoadingPromise) {
    languageLoadingPromise = loadLanguage().catch(console.error);
  }

  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <CacheProvider value={cache}>
          <AffineContext store={getCurrentStore()}>
            <Telemetry />
            <CustomThemeModifier />
            <GlobalLoading />
            <RouterProvider
              fallbackElement={<AppFallback key="RouterFallback" />}
              router={router}
              future={future}
            />
          </AffineContext>
        </CacheProvider>
      </FrameworkRoot>
    </Suspense>
  );
}
