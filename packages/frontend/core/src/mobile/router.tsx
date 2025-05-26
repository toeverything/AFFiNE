import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
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
        path: '/',
        lazy: async () => await import('./pages/index'),
      },
      {
        path: '/workspace/:workspaceId/*',
        lazy: async () => await import('./pages/workspace/index'),
      },
      {
        path: '/share/:workspaceId/:pageId',
        loader: async ({ params }) => {
          return redirect(`/workspace/${params.workspaceId}/${params.pageId}`);
        },
      },
      {
        path: '/404',
        lazy: async () => await import('./pages/404'),
      },
      {
        path: '/auth/:authType',
        lazy: async () => await import('./pages/auth'),
      },
      {
        path: '/sign-in',
        lazy: async () => await import('./pages/sign-in'),
      },
      {
        path: '/magic-link',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/magic-link'
          ),
      },
      {
        path: '/oauth/login',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-login'
          ),
      },
      {
        path: '/oauth/callback',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-callback'
          ),
      },
      {
        path: '/redirect-proxy',
        lazy: async () => await import('@affine/core/desktop/pages/redirect'),
      },
      {
        path: '/open-app/:action',
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
