import { useWorkspace } from '@affine/core/hooks/use-workspace';
import {
  Workspace,
  WorkspaceListService,
  WorkspaceManager,
} from '@toeverything/infra';
import {
  ServiceProviderContext,
  useService,
  useServiceOptional,
} from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { type ReactElement, Suspense, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { HubIsland } from '../../components/affine/hub-island';
import { WorkspaceFallback } from '../../components/workspace';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { RightSidebarContainer } from '../../modules/right-sidebar';
import { WorkbenchRoot } from '../../modules/workbench';
import { CurrentWorkspaceService } from '../../modules/workspace/current-workspace';
import { performanceRenderLogger } from '../../shared';
import { PageNotFound } from '../404';

declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: Workspace | undefined;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

export const Component = (): ReactElement => {
  performanceRenderLogger.info('WorkspaceLayout');

  const currentWorkspaceService = useService(CurrentWorkspaceService);

  const params = useParams();

  const { workspaceList, loading: listLoading } = useLiveData(
    useService(WorkspaceListService).status
  );
  const workspaceManager = useService(WorkspaceManager);

  const meta = useMemo(() => {
    return workspaceList.find(({ id }) => id === params.workspaceId);
  }, [workspaceList, params.workspaceId]);

  const workspace = useWorkspace(meta);

  useEffect(() => {
    if (!workspace) {
      currentWorkspaceService.closeWorkspace();
      return undefined;
    }
    currentWorkspaceService.openWorkspace(workspace ?? null);

    // for debug purpose
    window.currentWorkspace = workspace;
    window.dispatchEvent(
      new CustomEvent('affine:workspace:change', {
        detail: {
          id: workspace.id,
        },
      })
    );

    localStorage.setItem('last_workspace_id', workspace.id);
  }, [meta, workspaceManager, workspace, currentWorkspaceService]);

  const currentWorkspace = useServiceOptional(Workspace);

  //  avoid doing operation, before workspace is loaded
  const isRootDocLoaded = useLiveData(workspace?.engine.sync.isRootDocLoaded);

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  if (listLoading === false && meta === undefined) {
    return <PageNotFound />;
  }

  if (!currentWorkspace || !isRootDocLoaded) {
    return <WorkspaceFallback key="workspaceLoading" />;
  }

  return (
    <ServiceProviderContext.Provider value={currentWorkspace.services}>
      <Suspense fallback={<WorkspaceFallback key="workspaceFallback" />}>
        <AffineErrorBoundary height="100vh">
          <WorkspaceLayout>
            <WorkbenchRoot />
            <RightSidebarContainer />
            <HubIsland />
          </WorkspaceLayout>
        </AffineErrorBoundary>
      </Suspense>
    </ServiceProviderContext.Provider>
  );
};
