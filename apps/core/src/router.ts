import type { RouteObject } from 'react-router-dom';
import { createBrowserRouter } from 'react-router-dom';

export const routes = [
  {
    path: '/',
    lazy: () => import('./pages/index'),
  },
  {
    path: '/workspace/:workspaceId',
    lazy: () => import('./pages/workspace/index'),
    children: [
      {
        path: 'all',
        lazy: () => import('./pages/workspace/all-page'),
      },
      {
        path: 'trash',
        lazy: () => import('./pages/workspace/trash-page'),
      },
      {
        path: ':pageId',
        lazy: () => import('./pages/workspace/detail-page'),
      },
    ],
  },
  {
    path: '/share/:workspaceId/:pageId',
    lazy: () => import('./pages/share/detail-page'),
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
    path: '/expired',
    lazy: () => import('./pages/expired'),
  },
  {
    path: '/invite/:inviteId',
    lazy: () => import('./pages/invite'),
  },
  {
    path: '/signIn',
    lazy: () => import('./pages/sign-in'),
  },
  {
    path: '/open-app/:action',
    lazy: () => import('./pages/open-app'),
  },
  {
    path: '/desktop-signin',
    lazy: () => import('./pages/desktop-signin'),
  },
  {
    path: '*',
    lazy: () => import('./pages/404'),
  },
] satisfies [RouteObject, ...RouteObject[]];

export const router = createBrowserRouter(routes, {
  future: {
    v7_normalizeFormMethod: true,
  },
});
