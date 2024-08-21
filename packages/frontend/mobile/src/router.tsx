import { RootRouter } from '@affine/core/router';
import { wrapCreateBrowserRouter } from '@sentry/react';
import type { RouteObject } from 'react-router-dom';
import {
  createBrowserRouter as reactRouterCreateBrowserRouter,
  redirect,
} from 'react-router-dom';

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
        path: '/redirect-proxy',
        lazy: () => import('@affine/core/pages/redirect'),
      },
      {
        path: '*',
        lazy: () => import('./pages/404'),
      },
    ],
  },
] satisfies [RouteObject, ...RouteObject[]];

export const viewRoutes = [
  {
    path: '/all',
    lazy: () => import('./pages/workspace/all'),
  },
  {
    path: '/collection',
    lazy: () => import('./pages/workspace/collection/index'),
  },
  {
    path: '/collection/:collectionId',
    lazy: () => import('./pages/workspace/collection/detail'),
  },
  {
    path: '/tag',
    lazy: () => import('./pages/workspace/tag/index'),
  },
  {
    path: '/tag/:tagId',
    lazy: () => import('./pages/workspace/tag/detail'),
  },
  {
    path: '/trash',
    lazy: () => import('./pages/workspace/trash'),
  },
  {
    path: '/:pageId',
    lazy: () => import('./pages/workspace/detail'),
  },
  {
    path: '*',
    lazy: () => import('./pages/404'),
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
