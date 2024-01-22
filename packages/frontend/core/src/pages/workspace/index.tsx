import { WorkspaceFallback } from '@affine/component/workspace';
import { useWorkspace } from '@affine/core/hooks/use-workspace';
import {
  currentWorkspaceAtom,
  workspaceListAtom,
  workspaceListLoadingStatusAtom,
  workspaceManagerAtom,
} from '@affine/core/modules/workspace';
import { type Workspace } from '@affine/workspace';
import { useAtom, useAtomValue } from 'jotai';
import { type ReactElement, Suspense, useEffect, useMemo } from 'react';
import { Outlet, useParams } from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
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

  const [
    _ /* read this atom here to make sure children refresh when currentWorkspace changed */,
    setCurrentWorkspace,
  ] = useAtom(currentWorkspaceAtom);

  const params = useParams();

  const list = useAtomValue(workspaceListAtom);
  const listLoading = useAtomValue(workspaceListLoadingStatusAtom);
  const workspaceManager = useAtomValue(workspaceManagerAtom);

  const meta = useMemo(() => {
    return list.find(({ id }) => id === params.workspaceId);
  }, [list, params.workspaceId]);

  const workspace = useWorkspace(meta);

  useEffect(() => {
    if (!workspace) {
      setCurrentWorkspace(null);
      return undefined;
    }
    setCurrentWorkspace(workspace);

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
  }, [setCurrentWorkspace, meta, workspaceManager, workspace]);

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  if (listLoading === false && meta === undefined) {
    return <PageNotFound />;
  }

  if (!workspace) {
    return <WorkspaceFallback key="workspaceLoading" />;
  }

  return (
    <Suspense fallback={<WorkspaceFallback key="workspaceFallback" />}>
      <AffineErrorBoundary height="100vh">
        <WorkspaceLayout>
          <Outlet />
        </WorkspaceLayout>
      </AffineErrorBoundary>
    </Suspense>
  );
};
