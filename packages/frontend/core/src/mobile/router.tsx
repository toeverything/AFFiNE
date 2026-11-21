import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
import { wrapCreateBrowserRouterV6 } from '@sentry/react';
import { useEffect, useState } from 'react';
import type { RouteObject } from 'react-router-dom';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  redirect,
  useNavigate,
} from 'react-router-dom';

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
    children: [
      {
        path: '/',
        lazy: () => import('./pages/index'),
      },
      {
        path: '/workspace/:workspaceId/*',
        lazy: () => import('./pages/workspace/index'),
      },
      {
        path: '/share/:workspaceId/:pageId',
        loader: ({ params, request }) => {
          // keep `server` and doc params, e.g. from `affine://` deep links
          const { search } = new URL(request.url);
          return redirect(
            `/workspace/${params.workspaceId}/${params.pageId}${search}`
          );
        },
      },
      {
        path: '/404',
        lazy: () => import('./pages/404'),
      },
      {
        path: '/auth/:authType',
        lazy: () => import('./pages/auth'),
      },
      {
        path: '/sign-in',
        lazy: () => import('./pages/sign-in'),
      },
      {
        path: '/magic-link',
        lazy: () =>
          import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/magic-link'
          ),
      },
      {
        path: '/oauth/login',
        lazy: () =>
          import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-login'
          ),
      },
      {
        path: '/oauth/callback',
        lazy: () =>
          import(
            /* webpackChunkName: "auth" */ '@affine/core/desktop/pages/auth/oauth-callback'
          ),
      },
      {
        path: '/redirect-proxy',
        lazy: () => import('@affine/core/desktop/pages/redirect'),
      },
      {
        path: '/open-app/:action',
        lazy: () => import('@affine/core/desktop/pages/open-app'),
      },
      {
        path: '*',
        lazy: () => import('./pages/404'),
      },
    ],
  },
] satisfies [RouteObject, ...RouteObject[]];

const createBrowserRouter = wrapCreateBrowserRouterV6(
  reactRouterCreateBrowserRouter
);
export const router = (
  window.SENTRY_RELEASE ? createBrowserRouter : reactRouterCreateBrowserRouter
)(topLevelRoutes, {
  future: {
    v7_normalizeFormMethod: true,
  },
});
