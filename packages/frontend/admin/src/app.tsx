import { Toaster } from '@affine/admin/components/ui/sonner';
import { wrapCreateBrowserRouter } from '@sentry/react';
import { useEffect } from 'react';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';

import { TooltipProvider } from './components/ui/tooltip';
import { isAdmin, useCurrentUser, useServerConfig } from './modules/common';
import { Layout } from './modules/layout';

const createBrowserRouter = wrapCreateBrowserRouter(
  reactRouterCreateBrowserRouter
);

const _createBrowserRouter = window.SENTRY_RELEASE
  ? createBrowserRouter
  : reactRouterCreateBrowserRouter;

function AuthenticatedRoutes() {
  const user = useCurrentUser();

  useEffect(() => {
    if (user && !isAdmin(user)) {
      toast.error('You are not an admin, please login the admin account.');
    }
  }, [user]);

  if (!user || !isAdmin(user)) {
    return <Navigate to="/admin/auth" />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RootRoutes() {
  const config = useServerConfig();
  const location = useLocation();

  if (!config.initialized && location.pathname !== '/admin/setup') {
    return <Navigate to="/admin/setup" />;
  }

  if (/^\/admin\/?$/.test(location.pathname)) {
    return <Navigate to="/admin/accounts" />;
  }

  return <Outlet />;
}

export const router = _createBrowserRouter(
  [
    {
      path: '/admin',
      element: <RootRoutes />,
      children: [
        {
          path: '/admin/auth',
          lazy: () => import('./modules/auth'),
        },
        {
          path: '/admin/setup',
          lazy: () => import('./modules/setup'),
        },
        {
          path: '/admin/*',
          element: <AuthenticatedRoutes />,
          children: [
            {
              path: 'accounts',
              lazy: () => import('./modules/accounts'),
            },
            // {
            //   path: 'ai',
            //   lazy: () => import('./modules/ai'),
            // },
            {
              path: 'config',
              lazy: () => import('./modules/config'),
            },
            {
              path: 'settings',
              children: [
                {
                  path: '*',
                  lazy: () => import('./modules/settings'),
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  {
    future: {
      v7_normalizeFormMethod: true,
    },
  }
);

export const App = () => {
  return (
    <TooltipProvider>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnMount: false,
        }}
      >
        <RouterProvider router={router} />
      </SWRConfig>
      <Toaster />
    </TooltipProvider>
  );
};
