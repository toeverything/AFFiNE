import { Toaster } from '@affine/admin/components/ui/sonner';
import { lazy, ROUTES } from '@affine/routes';
import { withSentryReactRouterV7Routing } from '@sentry/react';
import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes as ReactRouterRoutes,
  useLocation,
} from 'react-router-dom';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';

import { TooltipProvider } from './components/ui/tooltip';
import { isAdmin, useCurrentUser, useServerConfig } from './modules/common';
import { Layout } from './modules/layout';

export const Setup = lazy(
  () => import(/* webpackChunkName: "setup" */ './modules/setup')
);
export const Accounts = lazy(
  () => import(/* webpackChunkName: "accounts" */ './modules/accounts')
);
export const Workspaces = lazy(
  () => import(/* webpackChunkName: "workspaces" */ './modules/workspaces')
);
export const Queue = lazy(
  () => import(/* webpackChunkName: "queue" */ './modules/queue')
);
export const AI = lazy(
  () => import(/* webpackChunkName: "ai" */ './modules/ai')
);
export const About = lazy(
  () => import(/* webpackChunkName: "about" */ './modules/about')
);
export const Settings = lazy(
  () => import(/* webpackChunkName: "settings" */ './modules/settings')
);
export const Auth = lazy(
  () => import(/* webpackChunkName: "auth" */ './modules/auth')
);

const Routes = window.SENTRY_RELEASE
  ? withSentryReactRouterV7Routing(ReactRouterRoutes)
  : ReactRouterRoutes;

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

export const App = () => {
  return (
    <TooltipProvider>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnMount: false,
        }}
      >
        <BrowserRouter basename={environment.subPath}>
          <Routes>
            <Route path={ROUTES.admin.index} element={<RootRoutes />}>
              <Route path={ROUTES.admin.auth} element={<Auth />} />
              <Route path={ROUTES.admin.setup} element={<Setup />} />
              <Route element={<AuthenticatedRoutes />}>
                <Route path={ROUTES.admin.accounts} element={<Accounts />} />
                <Route
                  path={ROUTES.admin.workspaces}
                  element={
                    environment.isSelfHosted ? (
                      <Navigate to={ROUTES.admin.accounts} replace />
                    ) : (
                      <Workspaces />
                    )
                  }
                />
                <Route path={`${ROUTES.admin.queue}/*`} element={<Queue />} />
                <Route path={ROUTES.admin.ai} element={<AI />} />
                <Route path={ROUTES.admin.about} element={<About />} />
                <Route
                  path={ROUTES.admin.settings.index}
                  element={<Settings />}
                >
                  <Route
                    path={ROUTES.admin.settings.module}
                    element={<Settings />}
                  />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </SWRConfig>
      <Toaster />
    </TooltipProvider>
  );
};
