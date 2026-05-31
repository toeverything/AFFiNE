import { FrameworkScope, useLiveData } from '@toeverything/infra';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RouteObject } from 'react-router-dom';
import {
  createMemoryRouter,
  RouterProvider,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router-dom';

import { withPageFlipTransition } from '../../../components/page-transition';
import type { View } from '../entities/view';

export const ViewRoot = ({
  view,
  routes,
}: {
  view: View;
  routes: RouteObject[];
}) => {
  const viewRouter = useMemo(() => createMemoryRouter(routes), [routes]);
  const routeContextValue = useMemo(
    () => ({ outlet: null, matches: [], isDataRoute: false }),
    []
  );

  const location = useLiveData(view.location$);
  const firstNavigationRef = useRef(true);

  useLayoutEffect(() => {
    const doNavigate = () => {
      viewRouter.navigate(location).catch(err => {
        console.error('navigate error', err);
      });
    };

    if (firstNavigationRef.current) {
      firstNavigationRef.current = false;
      doNavigate();
    } else {
      withPageFlipTransition(doNavigate);
    }
  }, [location, view, viewRouter]);

  // https://github.com/remix-run/react-router/issues/7375#issuecomment-975431736
  return (
    <FrameworkScope scope={view.scope}>
      <UNSAFE_LocationContext.Provider value={null as any}>
        <UNSAFE_RouteContext.Provider value={routeContextValue}>
          <RouterProvider router={viewRouter} />
        </UNSAFE_RouteContext.Provider>
      </UNSAFE_LocationContext.Provider>
    </FrameworkScope>
  );
};
