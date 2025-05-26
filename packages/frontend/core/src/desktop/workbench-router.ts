import type { RouteObject } from 'react-router';

export const workbenchRoutes = [
  {
    path: '/all',
    lazy: async () => await import('./pages/workspace/all-page/all-page'),
  },
  {
    path: '/all-old',
    lazy: async () => await import('./pages/workspace/all-page-old/all-page'),
  },
  {
    path: '/collection',
    lazy: async () => await import('./pages/workspace/all-collection'),
  },
  {
    path: '/collection/:collectionId',
    lazy: async () => await import('./pages/workspace/collection/index'),
  },
  {
    path: '/tag',
    lazy: async () => await import('./pages/workspace/all-tag'),
  },
  {
    path: '/tag/:tagId',
    lazy: async () => await import('./pages/workspace/tag'),
  },
  {
    path: '/trash',
    lazy: async () => await import('./pages/workspace/trash-page'),
  },
  {
    path: '/:pageId',
    lazy: async () => await import('./pages/workspace/detail-page/detail-page'),
  },
  {
    path: '/:pageId/attachments/:attachmentId',
    lazy: async () => await import('./pages/workspace/attachment/index'),
  },
  {
    path: '/journals',
    lazy: async () => await import('./pages/journals'),
  },
  {
    path: '/settings',
    lazy: async () => await import('./pages/workspace/settings'),
  },
  {
    path: '*',
    lazy: async () => await import('./pages/404'),
  },
] satisfies RouteObject[];
