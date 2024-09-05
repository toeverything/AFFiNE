import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import './styles/mobile.css';

import { AffineContext } from '@affine/component/context';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { configureCommonModules } from '@affine/core/modules';
import { configureLocalStorageStateStorageImpls } from '@affine/core/modules/storage';
import { configureBrowserWorkbenchModule } from '@affine/core/modules/workbench';
import {
  configureBrowserWorkspaceFlavours,
  configureIndexedDBWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import {
  performanceLogger,
  performanceRenderLogger,
} from '@affine/core/shared';
import { Telemetry } from '@affine/core/telemetry';
import { createI18n, setUpLanguage } from '@affine/i18n';
import {
  Framework,
  FrameworkRoot,
  getCurrentStore,
  LifecycleService,
} from '@toeverything/infra';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { configureMobileModules } from './modules';
import { router } from './router';

if (environment.isElectron && environment.isDebug) {
  document.body.innerHTML = `<h1 style="color:red;font-size:5rem;text-align:center;">Don't run web entry in electron.</h1>`;
  throw new Error('Wrong distribution');
}

const future = {
  v7_startTransition: true,
} as const;

const performanceI18nLogger = performanceLogger.namespace('i18n');

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
configureBrowserWorkbenchModule(framework);
configureLocalStorageStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureIndexedDBWorkspaceEngineStorageProvider(framework);
configureMobileModules(framework);
const frameworkProvider = framework.provider();

// setup application lifecycle events, and emit application start event
window.addEventListener('focus', () => {
  frameworkProvider.get(LifecycleService).applicationFocus();
});
frameworkProvider.get(LifecycleService).applicationStart();

export function App() {
  performanceRenderLogger.debug('App');

  if (!languageLoadingPromise) {
    languageLoadingPromise = loadLanguage().catch(console.error);
  }

  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <AffineContext store={getCurrentStore()}>
          <Telemetry />
          <RouterProvider
            fallbackElement={<AppFallback />}
            router={router}
            future={future}
          />
        </AffineContext>
      </FrameworkRoot>
    </Suspense>
  );
}
