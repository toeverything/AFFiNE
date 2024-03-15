import { Menu } from '@affine/component';
import { useAtom } from 'jotai';
import { Suspense, useCallback } from 'react';

import { openWorkspaceListModalAtom } from '../../atoms';
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
    setOpenUserWorkspaceList(true);
  }, [setOpenUserWorkspaceList]);

  return (
    <Menu
      rootOptions={{
        open: isUserWorkspaceListOpened,
      }}
      items={
        <Suspense>
          <UserWithWorkspaceList onEventEnd={closeUserWorkspaceList} />
        </Suspense>
      }
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
