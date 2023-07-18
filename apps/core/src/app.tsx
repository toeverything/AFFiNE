import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import createEmotionCache from './utils/create-emotion-cache';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom
} from '@toeverything/plugin-infra/manager'
import type { RouterState } from '@remix-run/router'

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

currentWorkspaceIdAtom.onMount = set => {
  const callback = (state: RouterState) => {
    const value = state.location.pathname.split('/')[2];
    if (value) {
      set(value);
      localStorage.setItem('last_workspace_id', value);
    } else {
      set(null);
    }
  };
  callback(router.state);

  const unsubscribe = router.subscribe(callback);
  return () => {
    unsubscribe()
  };
};

currentPageIdAtom.onMount = set => {
  const callback = (state: RouterState) => {
    const value = state.location.pathname.split('/')[2];
    if (value) {
      set(value);
    } else {
      set(null);
    }
  };
  callback(router.state);

  const unsubscribe = router.subscribe(callback);
  return () => {
    unsubscribe()
  };
};

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
