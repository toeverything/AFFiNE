import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { useEffect, useState } from 'react';
import type { RouteObject } from 'react-router';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  redirect,
  useNavigate,
} from 'react-router';

import { AffineErrorComponent } from '../components/affine/affine-error-boundary/affine-error-fallback';
import { NavigateContext } from '../components/hooks/use-navigate-helper';
import { RootWrapper } from './pages/root';

export function RootRouter() {
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
    errorElement: <AffineErrorComponent />,
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
        loader: ({ params }) => {
          return redirect(`/workspace/${params.workspaceId}/${params.pageId}`);
        },
      },
      {
        path: '/404',
        lazy: async () => await import('./pages/404'),
      },
      {
        path: '/expired',
        lazy: async () => await import('./pages/expired'),
      },
      {
        path: '/invite/:inviteId',
        lazy: async () => await import('./pages/invite'),
      },
      {
        path: '/upgrade-success',
        lazy: async () => await import('./pages/upgrade-success'),
      },
      {
        path: '/upgrade-success/team',
        lazy: async () => await import('./pages/upgrade-success/team'),
      },
      {
        path: '/upgrade-success/self-hosted-team',
        lazy: async () =>
          await import('./pages/upgrade-success/self-host-team'),
      },
      {
        path: '/ai-upgrade-success',
        lazy: async () => await import('./pages/ai-upgrade-success'),
      },
      {
        path: '/onboarding',
        lazy: async () => await import('./pages/onboarding'),
      },
      {
        path: '/redirect-proxy',
        lazy: async () => await import('./pages/redirect'),
      },
      {
        path: '/subscribe',
        lazy: async () => await import('./pages/subscribe'),
      },
      {
        path: '/upgrade-to-team',
        lazy: async () => await import('./pages/upgrade-to-team'),
      },
      {
        path: '/try-cloud',
        loader: () => {
          return redirect(
            `/sign-in?redirect_uri=${encodeURIComponent('/?initCloud=true')}`
          );
        },
      },
      {
        path: '/theme-editor',
        lazy: async () => await import('./pages/theme-editor'),
      },
      {
        path: '/clipper/import',
        lazy: async () => await import('./pages/import-clipper'),
      },
      {
        path: '/template/import',
        lazy: async () => await import('./pages/import-template'),
      },
      {
        path: '/template/preview',
        loader: ({ request }) => {
          const url = new URL(request.url);
          const workspaceId = url.searchParams.get('workspaceId');
          const docId = url.searchParams.get('docId');
          const templateName = url.searchParams.get('name');
          const templateMode = url.searchParams.get('mode');
          const snapshotUrl = url.searchParams.get('snapshotUrl');

          return redirect(
            `/workspace/${workspaceId}/${docId}?${new URLSearchParams({
              isTemplate: 'true',
              templateName: templateName ?? '',
              snapshotUrl: snapshotUrl ?? '',
              mode: templateMode ?? 'page',
            }).toString()}`
          );
        },
      },
      {
        path: '/auth/:authType',
        lazy: async () =>
          await import(/* webpackChunkName: "auth" */ './pages/auth/auth'),
      },
      {
        path: '/sign-In',
        lazy: async () =>
          await import(/* webpackChunkName: "auth" */ './pages/auth/sign-in'),
      },
      {
        path: '/magic-link',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ './pages/auth/magic-link'
          ),
      },
      {
        path: '/oauth/login',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ './pages/auth/oauth-login'
          ),
      },
      {
        path: '/oauth/callback',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ './pages/auth/oauth-callback'
          ),
      },
      // deprecated, keep for old client compatibility
      // TODO(@forehalo): remove
      {
        path: '/desktop-signin',
        lazy: async () =>
          await import(
            /* webpackChunkName: "auth" */ './pages/auth/oauth-login'
          ),
      },
      // deprecated, keep for old client compatibility
      // use '/sign-in'
      // TODO(@forehalo): remove
      {
        path: '/signIn',
        lazy: async () =>
          await import(/* webpackChunkName: "auth" */ './pages/auth/sign-in'),
      },
      {
        path: '/open-app/:action',
        lazy: async () => await import('./pages/open-app'),
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
)(topLevelRoutes, {
  basename: environment.subPath,
});
