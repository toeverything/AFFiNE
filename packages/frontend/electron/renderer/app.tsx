import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { NotificationCenter } from '@affine/component';
import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { registerAffineCommand } from '@affine/core/commands';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { configureCommonModules } from '@affine/core/modules';
import { configureElectronStateStorageImpls } from '@affine/core/modules/storage';
import { configureDesktopTabViewsModule } from '@affine/core/modules/workbench';
import {
  configureBrowserWorkspaceFlavours,
  configureSqliteWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import { router } from '@affine/core/router';
import {
  performanceLogger,
  performanceRenderLogger,
} from '@affine/core/shared';
import { Telemetry } from '@affine/core/telemetry';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { SettingsIcon } from '@blocksuite/icons/rc';
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

const desktopWhiteList = [
  '/desktop-signin',
  '/open-app/signin-redirect',
  '/open-app/url',
  '/upgrade-success',
  '/ai-upgrade-success',
  '/share',
];
if (
  !environment.isDesktop &&
  environment.isDebug &&
  desktopWhiteList.every(path => !location.pathname.startsWith(path))
) {
  document.body.innerHTML = `<h1 style="color:red;font-size:5rem;text-align:center;">Don't run electron entry in browser.</h1>`;
  throw new Error('Wrong distribution');
}

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
configureElectronStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureSqliteWorkspaceEngineStorageProvider(framework);
configureDesktopTabViewsModule(framework);
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
        <CacheProvider value={cache}>
          <AffineContext store={getCurrentStore()}>
            <Telemetry />
            <DebugProvider>
              <GlobalLoading />
              <NotificationCenter />
              <RouterProvider
                fallbackElement={<AppFallback key="RouterFallback" />}
                router={router}
                future={future}
              />
            </DebugProvider>
          </AffineContext>
        </CacheProvider>
      </FrameworkRoot>
    </Suspense>
  );
}

registerAffineCommand({
  id: 'affine:reload',
  category: 'affine:general',
  label: 'Reload current tab',
  icon: <SettingsIcon />,
  keyBinding: '$mod+R',
  run() {
    // fixme(@pengx17): reload will break the app from loading correctly!
    location.reload();
  },
});
