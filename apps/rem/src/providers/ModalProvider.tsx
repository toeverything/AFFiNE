import { useAtom } from 'jotai';
import React, { useCallback } from 'react';

import { openWorkspacesModalAtom } from '../atoms';
import { WorkspaceListModal } from '../components/pure/workspace-list-modal';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useWorkspaces } from '../hooks/use-workspaces';
import { RemWorkspace } from '../shared';

export function Modals() {
  const [openWorkspacesModal, setOpenWorkspacesModal] = useAtom(
    openWorkspacesModalAtom
  );
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const [currentWorkspace] = useCurrentWorkspace();
  return (
    <>
      <WorkspaceListModal
        user={user}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspace?.id ?? null}
        open={openWorkspacesModal}
        onClose={useCallback(() => {
          setOpenWorkspacesModal(false);
        }, [])}
        onClickWorkspace={function (workspace: RemWorkspace): void {
          throw new Error('Function not implemented.');
        }}
        onClickLogin={function (): void {
          throw new Error('Function not implemented.');
        }}
        onClickLogout={function (): void {
          throw new Error('Function not implemented.');
        }}
        onCreateWorkspace={function (): void {
          throw new Error('Function not implemented.');
        }}
      />
    </>
  );
}

export const ModalProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  return (
    <>
      <Modals />
      {children}
    </>
  );
};
