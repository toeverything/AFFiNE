import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import {
  memo,
  PropsWithChildren,
  ReactElement,
  Suspense,
  useEffect,
} from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import createEmotionCache from './utils/create-emotion-cache';
import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { DevTools } from 'jotai-devtools';

const router = createBrowserRouter([
  {
    path: '/',
    lazy: () => import('./pages/index'),
  },
  {
    path: '/workspace/:workspaceId/:pageId',
    lazy: () => import('./pages/workspace/detail-page'),
  },
]);

const i18n = createI18n();
const cache = createEmotionCache();

const DebugProvider = ({ children }: PropsWithChildren): ReactElement => {
  return (
    <>
      <Suspense>{process.env.DEBUG_JOTAI === 'true' && <DevTools />}</Suspense>
      {children}
    </>
  );
};

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
          <Suspense fallback={<WorkspaceFallback key="RootPageLoading" />}>
            <RouterProvider router={router} />
          </Suspense>
        </DebugProvider>
      </AffineContext>
    </CacheProvider>
  );
});
