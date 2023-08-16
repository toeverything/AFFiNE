import { createBrowserRouter } from 'react-router-dom';

export const routes = [
  {
    path: '/',
    lazy: () => import('./pages/index'),
  },
  {
    path: '/invite',
    lazy: () => import('./pages/invite'),
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
    path: '/auth/:authType',
    lazy: () => import('./pages/auth'),
  },
  {
    path: '/404',
    lazy: () => import('./pages/404'),
  },
  {
    path: '/expired',
    lazy: () => import('./pages/expired'),
  },
  {
    path: '*',
    lazy: () => import('./pages/404'),
  },
];

export const router = createBrowserRouter(routes, {
  future: {
    v7_normalizeFormMethod: true,
  },
});
