import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  getCurrentStore,
} from '@toeverything/infra/atom';
import type { ReactElement } from 'react';
import { type LoaderFunction, Outlet, redirect } from 'react-router-dom';

import { WorkspaceLayout } from '../../layouts/workspace-layout';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  const meta = await rootStore.get(rootWorkspacesMetadataAtom);
  if (!meta.some(({ id }) => id === args.params.workspaceId)) {
    return redirect('/404');
  }
  if (args.params.workspaceId) {
    localStorage.setItem('last_workspace_id', args.params.workspaceId);
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
  }
  if (!args.params.pageId) {
    rootStore.set(currentPageIdAtom, null);
  }
  return null;
};

export const Component = (): ReactElement => {
  return (
    <WorkspaceLayout>
      <Outlet />
    </WorkspaceLayout>
  );
};
