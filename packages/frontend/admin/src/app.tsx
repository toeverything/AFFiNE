import { Toaster } from '@affine/admin/components/ui/sonner';
import { FACTORIES, lazy, RELATIVE_ROUTES } from '@affine/routes';
import { withSentryReactRouterV7Routing } from '@sentry/react';
import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes as ReactRouterRoutes,
  useLocation,
} from 'react-router';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';

import { TooltipProvider } from './components/ui/tooltip';
import { isAdmin, useCurrentUser, useServerConfig } from './modules/common';
import { Layout } from './modules/layout';

export const Setup = lazy(
  async () => await import(/* webpackChunkName: "setup" */ './modules/setup')
);
export const Accounts = lazy(
  async () =>
    await import(/* webpackChunkName: "accounts" */ './modules/accounts')
);
export const AI = lazy(
  async () => await import(/* webpackChunkName: "ai" */ './modules/ai')
);
export const About = lazy(
  async () => await import(/* webpackChunkName: "about" */ './modules/about')
);
export const Settings = lazy(
  async () =>
    await import(/* webpackChunkName: "settings" */ './modules/settings')
);
export const Auth = lazy(
  async () => await import(/* webpackChunkName: "auth" */ './modules/auth')
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
    return <Navigate to={FACTORIES.admin.auth()} />;
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
            <Route path={RELATIVE_ROUTES.admin.index}>
              <Route index element={<RootRoutes />} />
              <Route path={RELATIVE_ROUTES.admin.auth} element={<Auth />} />
              <Route path={RELATIVE_ROUTES.admin.setup} element={<Setup />} />
              <Route element={<AuthenticatedRoutes />}>
                <Route
                  path={RELATIVE_ROUTES.admin.accounts}
                  element={<Accounts />}
                />
                <Route path={RELATIVE_ROUTES.admin.ai} element={<AI />} />
                <Route path={RELATIVE_ROUTES.admin.about} element={<About />} />
                <Route path={RELATIVE_ROUTES.admin.settings.index}>
                  <Route index element={<Settings />} />
                  <Route
                    path={RELATIVE_ROUTES.admin.settings.module}
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
