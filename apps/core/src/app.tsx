import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense, useEffect } from 'react';
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

export const App = memo(function App() {
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    // todo(himself65): this is a hack, we should use a better way to set the language
    setUpLanguage(i18n)?.catch(error => {
      console.error(error);
    });
  }, []);
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
