import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { AffineContext } from '@affine/component/context';
import { WorkspaceFallback } from '@affine/component/workspace';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { CacheProvider } from '@emotion/react';
import type { RouterState } from '@remix-run/router';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/plugin-infra/manager';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, memo, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { historyBaseAtom, MAX_HISTORY } from './atoms/history';
import createEmotionCache from './utils/create-emotion-cache';

const router = createBrowserRouter([
  {
    path: '/',
    lazy: () => import('./pages/index'),
  },
  {
    path: '/404',
    lazy: () => import('./pages/404'),
  },
  {
    path: '/workspace/:workspaceId/all',
    lazy: () => import('./pages/workspace/all-page'),
  },
  {
    path: '/workspace/:workspaceId/trash',
    lazy: () => import('./pages/workspace/trash-page'),
  },
  {
    path: '/workspace/:workspaceId/:pageId',
    lazy: () => import('./pages/workspace/detail-page'),
  },
]);

//#region atoms bootstrap

currentWorkspaceIdAtom.onMount = set => {
  const callback = (state: RouterState) => {
    const value = state.location.pathname.split('/')[2];
    if (value) {
      set(value);
      localStorage.setItem('last_workspace_id', value);
    }
  };
  callback(router.state);

  const unsubscribe = router.subscribe(callback);
  return () => {
    unsubscribe();
  };
};

currentPageIdAtom.onMount = set => {
  const callback = (state: RouterState) => {
    const value = state.location.pathname.split('/')[3];
    if (value) {
      set(value);
    }
  };
  callback(router.state);

  const unsubscribe = router.subscribe(callback);
  return () => {
    unsubscribe();
  };
};

historyBaseAtom.onMount = set => {
  const unsubscribe = router.subscribe(state => {
    set(prev => {
      const url = state.location.pathname;
      console.log('push', url, prev.skip, prev.stack.length, prev.current);
      if (prev.skip) {
        return {
          stack: [...prev.stack],
          current: prev.current,
          skip: false,
        };
      } else {
        if (prev.current < prev.stack.length - 1) {
          const newStack = prev.stack.slice(0, prev.current);
          newStack.push(url);
          if (newStack.length > MAX_HISTORY) {
            newStack.shift();
          }
          return {
            stack: newStack,
            current: newStack.length - 1,
            skip: false,
          };
        } else {
          const newStack = [...prev.stack, url];
          if (newStack.length > MAX_HISTORY) {
            newStack.shift();
          }
          return {
            stack: newStack,
            current: newStack.length - 1,
            skip: false,
          };
        }
      }
    });
  });
  return () => {
    unsubscribe();
  };
};
//#endregion

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
