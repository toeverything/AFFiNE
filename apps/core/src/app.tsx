import { memo } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Provider } from  'jotai/react'
import { rootStore } from '@toeverything/plugin-infra/manager'

const router = createBrowserRouter([
  {
    path: '/',
    lazy: () => import('./pages/index'),
  },
  {
    path: '/workspace/:workspaceId/:pageId',
    lazy: () => import('./pages/workspace/detail-page'),
  },
]);

export const App = memo(function App() {
  return (
    <Provider store={rootStore}>
      <RouterProvider router={router} />
    </Provider>
  );
});
