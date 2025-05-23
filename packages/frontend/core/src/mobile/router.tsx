import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
import { ROUTES } from '@affine/routes';
import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { useEffect, useState } from 'react';
import type { RouteObject } from 'react-router';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  redirect,
  useNavigate,
} from 'react-router';

import { AppFallback } from './components/app-fallback';
import { RootWrapper } from './pages/root';

function RootRouter() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // a hack to make sure router is ready
    setReady(true);
  }, []);

  return (
    ready && (
      <NavigateContext.Provider value={navigate}>
        <RootWrapper />
      </NavigateContext.Provider>
    )
  );
}

export const topLevelRoutes = [
  {
    element: <RootRouter />,
    hydrateFallbackElement: <AppFallback />,
    children: [
      {
        path: ROUTES.index,
        lazy: async () => await import('./pages/index'),
      },
      {
        path: `${ROUTES.workspace.index}/*`,
        lazy: async () => await import('./pages/workspace/index'),
      },
      {
        path: ROUTES.share,
        loader: async ({ params }) => {
          return redirect(
            `/workspaces/${params.workspaceId}/docs/${params.pageId}`
          );
        },
      },
      {
        path: ROUTES.notFound,
        lazy: async () => await import('./pages/404'),
      },
      {
        path: ROUTES.auth,
        lazy: async () => await import('./pages/auth'),
      },
      {
        path: ROUTES.signIn,
        lazy: async () => await import('./pages/sign-in'),
      },
      {
        path: ROUTES.magicLink,
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/magic-link'
          ),
      },
      {
        path: ROUTES.oauth.login,
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-login'
          ),
      },
      {
        path: ROUTES.oauth.callback,
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-callback'
          ),
      },
      {
        path: ROUTES.redirect,
        lazy: async () => await import('@affine/core/desktop/pages/redirect'),
      },
      {
        path: ROUTES.openApp,
        lazy: async () => await import('@affine/core/desktop/pages/open-app'),
      },
      {
        path: '*',
        lazy: async () => await import('./pages/404'),
      },
    ],
  },
] satisfies [RouteObject, ...RouteObject[]];

const createBrowserRouter = wrapCreateBrowserRouterV7(
  reactRouterCreateBrowserRouter
);
export const router = (
  window.SENTRY_RELEASE ? createBrowserRouter : reactRouterCreateBrowserRouter
)(topLevelRoutes);
