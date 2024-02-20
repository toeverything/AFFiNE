import { Menu } from '@affine/component/ui/menu';
import { WorkspaceFallback } from '@affine/component/workspace';
import { WorkspaceManager } from '@toeverything/infra';
import { WorkspaceListService } from '@toeverything/infra';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { lazy, useEffect, useLayoutEffect, useState } from 'react';
import { type LoaderFunction, redirect } from 'react-router-dom';

import { createFirstAppData } from '../bootstrap/first-app-data';
import { UserWithWorkspaceList } from '../components/pure/workspace-slider-bar/user-with-workspace-list';
import { appConfigStorage } from '../hooks/use-app-config-storage';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { WorkspaceSubPath } from '../shared';

const AllWorkspaceModals = lazy(() =>
  import('../providers/modal-provider').then(({ AllWorkspaceModals }) => ({
    default: AllWorkspaceModals,
  }))
);

export const loader: LoaderFunction = async () => {
  if (!environment.isDesktop && appConfigStorage.get('onBoarding')) {
    return redirect('/onboarding');
  }
  return null;
};

export const Component = () => {
  // navigating and creating may be slow, to avoid flickering, we show workspace fallback
  const [navigating, setNavigating] = useState(false);
  const [creating, setCreating] = useState(false);

  const list = useLiveData(useService(WorkspaceListService).workspaceList);
  const { openPage } = useNavigateHelper();

  useLayoutEffect(() => {
    if (list.length === 0) {
      return;
    }

    // open last workspace
    const lastId = localStorage.getItem('last_workspace_id');
    const openWorkspace = list.find(w => w.id === lastId) ?? list[0];
    openPage(openWorkspace.id, WorkspaceSubPath.ALL);
    setNavigating(true);
  }, [list, openPage]);

  const workspaceManager = useService(WorkspaceManager);

  useEffect(() => {
    setCreating(true);
    createFirstAppData(workspaceManager)
      .catch(err => {
        console.error('Failed to create first app data', err);
      })
      .finally(() => {
        setCreating(false);
      });
  }, [workspaceManager]);

  if (navigating || creating) {
    return <WorkspaceFallback></WorkspaceFallback>;
  }

  // TODO: We need a no workspace page
  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
        }}
      >
        <Menu
          rootOptions={{
            open: true,
          }}
          items={<UserWithWorkspaceList />}
          contentOptions={{
            style: {
              width: 300,
              transform: 'translate(-50%, -50%)',
              borderRadius: '8px',
              boxShadow: 'var(--affine-shadow-2)',
              backgroundColor: 'var(--affine-background-overlay-panel-color)',
              padding: '16px 12px',
            },
          }}
        >
          <div></div>
        </Menu>
      </div>
      <AllWorkspaceModals />
    </>
  );
};
