import { MainContainer } from '@affine/component/workspace';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { WorkspaceLayout } from '../../layouts/workspace-layout';

export const Component = (): ReactElement => {
  return (
    <WorkspaceLayout>
      <Suspense fallback={<MainContainer />}>
        <Outlet />
      </Suspense>
    </WorkspaceLayout>
  );
};
