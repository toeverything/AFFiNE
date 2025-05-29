import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { AffineErrorComponent } from '@affine/core/components/affine/affine-error-boundary/affine-error-fallback';
import { PageNotFound } from '@affine/core/desktop/pages/404';
import { SharePage } from '@affine/core/desktop/pages/workspace/share/share-page';
import { workbenchRoutes } from '@affine/core/mobile/workbench-router';
import { ServersService } from '@affine/core/modules/cloud';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { FrameworkScope, useLiveData, useServices } from '@toeverything/infra';
import {
  lazy as reactLazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  matchPath,
  type RouteObject,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { WorkspaceLayout } from './layout';
import { MobileWorkbenchRoot } from './workbench-root';

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

const warpedRoutes = workbenchRoutes.map((originalRoute: RouteObject) => {
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
    errorElement: <AffineErrorComponent />,
  };
});

export const Component = () => {
  const { workspacesService, serversService } = useServices({
    WorkspacesService,
    ServersService,
  });

  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();

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
      workbenchRoutes.find(route =>
        matchPath(route.path, '/' + match.params.docId)
      )?.path === '/:pageId'
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

  // if workspace is not found, we should retry
  const retryTimesRef = useRef(3);
  useEffect(() => {
    retryTimesRef.current = 3; // reset retry times
    workspacesService.list.revalidate();
  }, [params.workspaceId, workspacesService.list]);
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      const timer = setInterval(() => {
        if (retryTimesRef.current > 0) {
          workspacesService.list.revalidate();
          retryTimesRef.current--;
        }
      }, 5000);
      return () => clearInterval(timer);
    }
    return;
  }, [listLoading, meta, workspaceNotFound, workspacesService]);

  // server search params
  const serverFromSearchParams = useLiveData(
    searchParams.has('server')
      ? serversService.serverByBaseUrl$(searchParams.get('server') as string)
      : undefined
  );
  // server from workspace
  const serverFromWorkspace = useLiveData(
    meta?.flavour && meta.flavour !== 'local'
      ? serversService.server$(meta?.flavour)
      : undefined
  );
  const server = serverFromWorkspace ?? serverFromSearchParams;

  if (workspaceNotFound) {
    if (
      BUILD_CONFIG.isMobileWeb /* only browser has share page */ &&
      detailDocRoute
    ) {
      return (
        <FrameworkScope scope={server?.scope}>
          <SharePage
            docId={detailDocRoute.docId}
            workspaceId={detailDocRoute.workspaceId}
          />
        </FrameworkScope>
      );
    }
    return <PageNotFound noPermission />;
  }
  if (!meta) {
    return;
  }
  return (
    <WorkspaceLayout meta={meta}>
      <MobileWorkbenchRoot routes={warpedRoutes} />
    </WorkspaceLayout>
  );
};
