import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  getCurrentStore,
} from '@toeverything/infra/atom';
import type { MigrationPoint } from '@toeverything/infra/blocksuite';
import {
  checkWorkspaceCompatibility,
  guidCompatibilityFix,
} from '@toeverything/infra/blocksuite';
import { useSetAtom } from 'jotai';
import { type ReactElement, useEffect } from 'react';
import {
  type LoaderFunction,
  Outlet,
  redirect,
  useLoaderData,
  useParams,
} from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { performanceLogger, performanceRenderLogger } from '../../shared';

const workspaceLoaderLogger = performanceLogger.namespace('workspace_loader');

export const loader: LoaderFunction = async args => {
  workspaceLoaderLogger.info('start');

  const rootStore = getCurrentStore();

  if (args.params.workspaceId) {
    localStorage.setItem('last_workspace_id', args.params.workspaceId);
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
  }

  const meta = await rootStore.get(rootWorkspacesMetadataAtom);
  workspaceLoaderLogger.info('meta loaded');

  const currentMetadata = meta.find(({ id }) => id === args.params.workspaceId);
  if (!currentMetadata) {
    return redirect('/404');
  }

  if (!args.params.pageId) {
    rootStore.set(currentPageIdAtom, null);
  }
  const [workspaceAtom] = getBlockSuiteWorkspaceAtom(currentMetadata.id);
  workspaceLoaderLogger.info('get cloud workspace atom');

  const workspace = await rootStore.get(workspaceAtom);
  workspaceLoaderLogger.info('workspace loaded');

  guidCompatibilityFix(workspace.doc);
  return checkWorkspaceCompatibility(workspace);
};

export const Component = (): ReactElement => {
  performanceRenderLogger.info('WorkspaceLayout');

  const setCurrentWorkspaceId = useSetAtom(currentWorkspaceIdAtom);

  const params = useParams();

  useEffect(() => {
    if (params.workspaceId) {
      localStorage.setItem('last_workspace_id', params.workspaceId);
      setCurrentWorkspaceId(params.workspaceId);
    }
  }, [params, setCurrentWorkspaceId]);

  const migration = useLoaderData() as MigrationPoint | undefined;
  return (
    <AffineErrorBoundary height="100vh">
      <WorkspaceLayout migration={migration}>
        <Outlet />
      </WorkspaceLayout>
    </AffineErrorBoundary>
  );
};
