import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
import { wrapCreateBrowserRouter } from '@sentry/react';
import { useEffect, useState } from 'react';
import type { RouteObject } from 'react-router-dom';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  Outlet,
  redirect,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  useNavigate,
} from 'react-router-dom';

import { AllWorkspaceModals } from './provider/model-provider';

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
        <AllWorkspaceModals />
        <Outlet />
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
        loader: ({ params }) => {
          return redirect(`/workspace/${params.workspaceId}/${params.pageId}`);
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
        path: '*',
        lazy: () => import('./pages/404'),
      },
    ],
  },
] satisfies [RouteObject, ...RouteObject[]];

const createBrowserRouter = wrapCreateBrowserRouter(
  reactRouterCreateBrowserRouter
);
export const router = (
  window.SENTRY_RELEASE ? createBrowserRouter : reactRouterCreateBrowserRouter
)(topLevelRoutes, {
  future: {
    v7_normalizeFormMethod: true,
  },
});
