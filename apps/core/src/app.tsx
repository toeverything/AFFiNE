import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@toeverything/components/style.css';

import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { CacheProvider } from '@emotion/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { use } from 'foxact/use';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { router } from './router';
import createEmotionCache from './utils/create-emotion-cache';

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
    const { createI18n, setUpLanguage } = await import('@affine/i18n');
    const i18n = createI18n();
    document.documentElement.lang = i18n.language;
    await setUpLanguage(i18n);
  }
}

const languageLoadingPromise = loadLanguage().catch(console.error);

export const App = memo(function App() {
  use(languageLoadingPromise);
  return (
    <CacheProvider value={cache}>
      <AffineContext store={getCurrentStore()}>
        <DebugProvider>
          <RouterProvider
            fallbackElement={<WorkspaceFallback key="RouterFallback" />}
            router={router}
            future={future}
          />
        </DebugProvider>
      </AffineContext>
    </CacheProvider>
  );
});
