import { useWorkspace } from '@affine/core/hooks/use-workspace';
import { ZipTransformer } from '@blocksuite/blocks';
import type { Workspace } from '@toeverything/infra';
import {
  ServiceProviderContext,
  useLiveData,
  useService,
  WorkspaceListService,
  WorkspaceManager,
} from '@toeverything/infra';
import type { ReactElement } from 'react';
import { Suspense, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceFallback } from '../../components/workspace';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { RightSidebarContainer } from '../../modules/right-sidebar';
import { WorkbenchRoot } from '../../modules/workbench';
import { CurrentWorkspaceService } from '../../modules/workspace/current-workspace';
import { AllWorkspaceModals } from '../../providers/modal-provider';
import { performanceRenderLogger } from '../../shared';
import { PageNotFound } from '../404';

declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: Workspace | undefined;
  // eslint-disable-next-line no-var
  var exportWorkspaceSnapshot: () => Promise<void>;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

export const Component = (): ReactElement => {
  performanceRenderLogger.info('WorkspaceLayout');

  const currentWorkspaceService = useService(CurrentWorkspaceService);

  const params = useParams();

  const { workspaceList, loading: listLoading } = useLiveData(
    useService(WorkspaceListService).status$
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
    window.exportWorkspaceSnapshot = async () => {
      const zip = await ZipTransformer.exportDocs(
        workspace.docCollection,
        Array.from(workspace.docCollection.docs.values()).map(collection =>
          collection.getDoc()
        )
      );
      const url = URL.createObjectURL(zip);
      // download url
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workspace.docCollection.meta.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    };
    window.dispatchEvent(
      new CustomEvent('affine:workspace:change', {
        detail: {
          id: workspace.id,
        },
      })
    );

    localStorage.setItem('last_workspace_id', workspace.id);
  }, [meta, workspaceManager, workspace, currentWorkspaceService]);

  //  avoid doing operation, before workspace is loaded
  const isRootDocReady =
    useLiveData(workspace?.engine.rootDocState$.map(v => v.ready)) ?? false;

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  if (listLoading === false && meta === undefined) {
    return <PageNotFound noPermission />;
  }
  if (!workspace) {
    return <WorkspaceFallback key="workspaceLoading" />;
  }

  if (!isRootDocReady) {
    return (
      <ServiceProviderContext.Provider value={workspace.services}>
        <WorkspaceFallback key="workspaceLoading" />
        <AllWorkspaceModals />
      </ServiceProviderContext.Provider>
    );
  }

  return (
    <ServiceProviderContext.Provider value={workspace.services}>
      <Suspense fallback={<WorkspaceFallback key="workspaceFallback" />}>
        <AffineErrorBoundary height="100vh">
          <WorkspaceLayout>
            <WorkbenchRoot />
            <RightSidebarContainer />
          </WorkspaceLayout>
        </AffineErrorBoundary>
      </Suspense>
    </ServiceProviderContext.Provider>
  );
};
