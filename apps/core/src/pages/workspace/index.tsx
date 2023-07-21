import {
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/manager';
import type { ReactElement } from 'react';
import { type LoaderFunction, Outlet } from 'react-router-dom';

import { WorkspaceLayout } from '../../layouts/workspace-layout';

export const loader: LoaderFunction = args => {
  if (args.params.workspaceId) {
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
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
