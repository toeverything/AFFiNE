import { WorkspaceFlavour } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  getCurrentStore,
} from '@toeverything/infra/atom';
import { guidCompatibilityFix } from '@toeverything/infra/blocksuite';
import type { ReactElement } from 'react';
import {
  type LoaderFunction,
  Outlet,
  redirect,
  useLoaderData,
} from 'react-router-dom';

import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { performanceLogger, performanceRenderLogger } from '../../shared';

const workspaceLoaderLogger = performanceLogger.namespace('workspace_loader');

export const loader: LoaderFunction = async args => {
  workspaceLoaderLogger.info('start');

  const rootStore = getCurrentStore();
  const meta = await rootStore.get(rootWorkspacesMetadataAtom);
  workspaceLoaderLogger.info('meta loaded');

  const currentMetadata = meta.find(({ id }) => id === args.params.workspaceId);
  if (!currentMetadata) {
    return redirect('/404');
  }
  if (args.params.workspaceId) {
    localStorage.setItem('last_workspace_id', args.params.workspaceId);
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
  }
  if (!args.params.pageId) {
    rootStore.set(currentPageIdAtom, null);
  }
  if (currentMetadata.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    const [workspaceAtom] = getBlockSuiteWorkspaceAtom(currentMetadata.id);
    workspaceLoaderLogger.info('get cloud workspace atom');

    const workspace = await rootStore.get(workspaceAtom);
    return (() => {
      guidCompatibilityFix(workspace.doc);
      const blockVersions = workspace.meta.blockVersions;
      if (!blockVersions) {
        return true;
      }
      for (const [flavour, schema] of workspace.schema.flavourSchemaMap) {
        if (blockVersions[flavour] !== schema.version) {
          return true;
        }
      }
      return false;
    })();
  }

  workspaceLoaderLogger.info('done');
  return null;
};

export const Component = (): ReactElement => {
  performanceRenderLogger.info('WorkspaceLayout');

  const incompatible = useLoaderData();
  return (
    <WorkspaceLayout incompatible={!!incompatible}>
      <Outlet />
    </WorkspaceLayout>
  );
};
