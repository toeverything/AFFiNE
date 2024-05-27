import { Menu } from '@affine/component';
import { useService, WorkspacesService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { openWorkspaceListModalAtom } from '../../atoms';
import { mixpanel } from '../../utils';
import { UserWithWorkspaceList } from '../pure/workspace-slider-bar/user-with-workspace-list';
import { WorkspaceCard } from '../pure/workspace-slider-bar/workspace-card';

export const WorkspaceSelector = () => {
  const [isUserWorkspaceListOpened, setOpenUserWorkspaceList] = useAtom(
    openWorkspaceListModalAtom
  );
  const closeUserWorkspaceList = useCallback(() => {
    setOpenUserWorkspaceList(false);
  }, [setOpenUserWorkspaceList]);
  const openUserWorkspaceList = useCallback(() => {
    mixpanel.track('Button', {
      resolve: 'OpenWorkspaceList',
    });
    setOpenUserWorkspaceList(true);
  }, [setOpenUserWorkspaceList]);

  const workspaceManager = useService(WorkspacesService);

  // revalidate workspace list when open workspace list
  useEffect(() => {
    if (isUserWorkspaceListOpened) {
      workspaceManager.list.revalidate();
    }
  }, [workspaceManager, isUserWorkspaceListOpened]);

  return (
    <Menu
      rootOptions={{
        open: isUserWorkspaceListOpened,
      }}
      items={<UserWithWorkspaceList onEventEnd={closeUserWorkspaceList} />}
      contentOptions={{
        // hide trigger
        sideOffset: -58,
        onInteractOutside: closeUserWorkspaceList,
        onEscapeKeyDown: closeUserWorkspaceList,
        style: {
          width: '300px',
        },
      }}
    >
      <WorkspaceCard onClick={openUserWorkspaceList} />
    </Menu>
  );
};
