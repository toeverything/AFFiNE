import { AppFallback } from '@affine/core/components/affine/app-container';
import { useWorkspace } from '@affine/core/hooks/use-workspace';
import { ZipTransformer } from '@blocksuite/blocks';
import type { Workspace } from '@toeverything/infra';
import {
  FrameworkScope,
  GlobalContextService,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { WorkbenchRoot } from '../../modules/workbench';
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
  var exportWorkspaceSnapshot: (docs?: string[]) => Promise<void>;
  // eslint-disable-next-line no-var
  var importWorkspaceSnapshot: () => Promise<void>;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

export const Component = (): ReactElement => {
  performanceRenderLogger.debug('WorkspaceLayout');

  const params = useParams();

  const [showNotFound, setShowNotFound] = useState(false);
  const workspacesService = useService(WorkspacesService);
  const listLoading = useLiveData(workspacesService.list.isLoading$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);

  const meta = useMemo(() => {
    return workspaces.find(({ id }) => id === params.workspaceId);
  }, [workspaces, params.workspaceId]);

  const workspace = useWorkspace(meta);
  const globalContext = useService(GlobalContextService).globalContext;

  useEffect(() => {
    workspacesService.list.revalidate();
  }, [workspacesService]);

  useEffect(() => {
    if (workspace) {
      // for debug purpose
      window.currentWorkspace = workspace ?? undefined;
      window.dispatchEvent(
        new CustomEvent('affine:workspace:change', {
          detail: {
            id: workspace.id,
          },
        })
      );
      window.exportWorkspaceSnapshot = async (docs?: string[]) => {
        const zip = await ZipTransformer.exportDocs(
          workspace.docCollection,
          Array.from(workspace.docCollection.docs.values())
            .filter(doc => (docs ? docs.includes(doc.id) : true))
            .map(doc => doc.getDoc())
        );
        const url = URL.createObjectURL(zip);
        // download url
        const a = document.createElement('a');
        a.href = url;
        a.download = `${workspace.docCollection.meta.name}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      };
      window.importWorkspaceSnapshot = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = async () => {
          if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const blob = new Blob([file], { type: 'application/zip' });
            const newDocs = await ZipTransformer.importDocs(
              workspace.docCollection,
              blob
            );
            console.log(
              'imported docs',
              newDocs.map(doc => ({
                id: doc.id,
                title: doc.meta?.title,
              }))
            );
          }
        };
        input.click();
      };
      localStorage.setItem('last_workspace_id', workspace.id);
      globalContext.workspaceId.set(workspace.id);
      return () => {
        window.currentWorkspace = undefined;
        globalContext.workspaceId.set(null);
      };
    }
    return;
  }, [globalContext, meta, workspace]);

  //  avoid doing operation, before workspace is loaded
  const isRootDocReady =
    useLiveData(workspace?.engine.rootDocState$.map(v => v.ready)) ?? false;

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      setShowNotFound(true);
    }
    if (meta) {
      setShowNotFound(false);
    }
  }, [listLoading, meta, workspacesService]);

  useEffect(() => {
    if (showNotFound) {
      const timer = setInterval(() => {
        workspacesService.list.revalidate();
      }, 3000);
      return () => {
        clearInterval(timer);
      };
    }
    return;
  }, [showNotFound, workspacesService]);

  if (showNotFound) {
    return <PageNotFound noPermission />;
  }
  if (!workspace) {
    return <AppFallback key="workspaceLoading" />;
  }

  if (!isRootDocReady) {
    return (
      <FrameworkScope scope={workspace.scope}>
        <AppFallback key="workspaceLoading" />
        <AllWorkspaceModals />
      </FrameworkScope>
    );
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <AffineErrorBoundary height="100vh">
        <WorkspaceLayout>
          <WorkbenchRoot />
        </WorkspaceLayout>
      </AffineErrorBoundary>
    </FrameworkScope>
  );
};
