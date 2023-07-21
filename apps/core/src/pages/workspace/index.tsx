import type { ReactElement } from 'react';
import { Outlet } from 'react-router-dom';

import { WorkspaceLayout } from '../../layouts/workspace-layout';

export const Component = (): ReactElement => {
  return (
    <WorkspaceLayout>
      <Outlet />
    </WorkspaceLayout>
  );
};
