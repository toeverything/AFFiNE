import { useLiveData } from '@toeverything/infra/livedata';
import { useEffect, useMemo } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router-dom';

import { viewRoutes } from '../../../router';
import type { View } from './view';

export const ViewRoot = ({ view }: { view: View }) => {
  const viewRouter = useMemo(() => createMemoryRouter(viewRoutes), []);

  const location = useLiveData(view.location);

  useEffect(() => {
    viewRouter.navigate(location).catch(err => {
      console.error('navigate error', err);
    });
  }, [location, view, viewRouter]);

  // https://github.com/remix-run/react-router/issues/7375#issuecomment-975431736
  return (
    <UNSAFE_LocationContext.Provider value={null as any}>
      <UNSAFE_RouteContext.Provider
        value={{
          outlet: null,
          matches: [],
          isDataRoute: false,
        }}
      >
        <RouterProvider router={viewRouter} />
      </UNSAFE_RouteContext.Provider>
    </UNSAFE_LocationContext.Provider>
  );
};
