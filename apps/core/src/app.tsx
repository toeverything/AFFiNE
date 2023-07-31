import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import { use } from 'foxact/use';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { router } from './router';
import createEmotionCache from './utils/create-emotion-cache';

const i18n = createI18n();
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

const languageLoadingPromise = new Promise<void>(resolve => {
  if (environment.isBrowser) {
    document.documentElement.lang = i18n.language;
    setUpLanguage(i18n)
      .then(() => resolve())
      .catch(error => {
        console.error(error);
      });
  } else {
    resolve();
  }
});

export const App = memo(function App() {
  use(languageLoadingPromise);
  return (
    <CacheProvider value={cache}>
      <AffineContext>
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
