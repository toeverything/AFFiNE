import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { PageNotFound } from '@affine/core/pages/404';
import { MobileWorkbenchRoot } from '@affine/core/pages/workspace/workbench-root';
import {
  useLiveData,
  useServices,
  WorkspacesService,
} from '@toeverything/infra';
import {
  lazy as reactLazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  matchPath,
  type RouteObject,
  useLocation,
  useParams,
} from 'react-router-dom';

import { viewRoutes } from '../../router';
import { WorkspaceLayout } from './layout';

type Route = { Component: React.ComponentType };
/**
 * Source: core/src/modules/workbench/view/route-container.tsx
 **/
const MobileRouteContainer = ({ route }: { route: Route }) => {
  return (
    <AffineErrorBoundary>
      <Suspense>
        <route.Component />
      </Suspense>
    </AffineErrorBoundary>
  );
};

const warpedRoutes = viewRoutes.map((originalRoute: RouteObject) => {
  if (originalRoute.Component || !originalRoute.lazy) {
    return originalRoute;
  }

  const { path, lazy } = originalRoute;

  const Component = reactLazy(() =>
    lazy().then(m => ({
      default: m.Component as React.ComponentType,
    }))
  );
  const route = {
    Component,
  };

  return {
    path,
    Component: () => {
      return <MobileRouteContainer route={route} />;
    },
  };
});

export const Component = () => {
  const { workspacesService } = useServices({
    WorkspacesService,
  });

  const params = useParams();
  const location = useLocation();

  // todo(pengx17): dedupe the code with core
  // check if we are in detail doc route, if so, maybe render share page
  const detailDocRoute = useMemo(() => {
    const match = matchPath(
      '/workspace/:workspaceId/:docId',
      location.pathname
    );
    if (
      match &&
      match.params.docId &&
      match.params.workspaceId &&
      // TODO(eyhn): need a better way to check if it's a docId
      viewRoutes.find(route => matchPath(route.path, '/' + match.params.docId))
        ?.path === '/:pageId'
    ) {
      return {
        docId: match.params.docId,
        workspaceId: match.params.workspaceId,
      };
    } else {
      return null;
    }
  }, [location.pathname]);

  const [workspaceNotFound, setWorkspaceNotFound] = useState(false);
  const listLoading = useLiveData(workspacesService.list.isRevalidating$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const meta = useMemo(() => {
    return workspaces.find(({ id }) => id === params.workspaceId);
  }, [workspaces, params.workspaceId]);

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      setWorkspaceNotFound(true);
    }
    if (meta) {
      setWorkspaceNotFound(false);
    }
  }, [listLoading, meta, workspacesService]);

  // if workspace is not found, we should revalidate in interval
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      const timer = setInterval(
        () => workspacesService.list.revalidate(),
        5000
      );
      return () => clearInterval(timer);
    }
    return;
  }, [listLoading, meta, workspaceNotFound, workspacesService]);

  if (workspaceNotFound) {
    if (
      BUILD_CONFIG.isDesktopEdition /* only browser has share page */ &&
      detailDocRoute
    ) {
      return <div>TODO: share page</div>;
    }
    return <PageNotFound noPermission />;
  }
  if (!meta) {
    return <AppFallback key="workspaceLoading" />;
  }
  return (
    <WorkspaceLayout meta={meta}>
      <MobileWorkbenchRoot routes={warpedRoutes} />
    </WorkspaceLayout>
  );
};
