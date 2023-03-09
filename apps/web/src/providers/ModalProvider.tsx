import { useAtom, useAtomValue } from 'jotai';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import {
  currentWorkspaceIdAtom,
  openCreateWorkspaceModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces, useWorkspacesHelper } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';
import { apis } from '../shared/apis';

const WorkspaceListModal = dynamic(
  async () =>
    (await import('../components/pure/workspace-list-modal')).WorkspaceListModal
);
const CreateWorkspaceModal = dynamic(
  async () =>
    (await import('../components/pure/create-workspace-modal'))
      .CreateWorkspaceModal
);

export function Modals() {
  const [openWorkspacesModal, setOpenWorkspacesModal] = useAtom(
    openWorkspacesModalAtom
  );
  const [openCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const router = useRouter();
  const { jumpToSubPath } = useRouterHelper(router);
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const [, setCurrentWorkspace] = useCurrentWorkspace();
  const { createLocalWorkspace } = useWorkspacesHelper();

  return (
    <>
      <WorkspaceListModal
        user={user}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        open={openWorkspacesModal || workspaces.length === 0}
        onClose={useCallback(() => {
          setOpenWorkspacesModal(false);
        }, [setOpenWorkspacesModal])}
        onClickWorkspace={useCallback(
          workspace => {
            setOpenWorkspacesModal(false);
            setCurrentWorkspace(workspace.id);
            jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
          },
          [jumpToSubPath, setCurrentWorkspace, setOpenWorkspacesModal]
        )}
        onClickLogin={useCallback(() => {
          apis.signInWithGoogle().then(() => {
            router.reload();
          });
        }, [router])}
        onClickLogout={useCallback(() => {
          apis.auth.clear();
          router.reload();
        }, [router])}
        onCreateWorkspace={useCallback(() => {
          setOpenCreateWorkspaceModal(true);
        }, [setOpenCreateWorkspaceModal])}
      />
      <CreateWorkspaceModal
        open={openCreateWorkspaceModal}
        onClose={useCallback(() => {
          setOpenCreateWorkspaceModal(false);
        }, [setOpenCreateWorkspaceModal])}
        onCreate={useCallback(
          async name => {
            const id = await createLocalWorkspace(name);
            setOpenCreateWorkspaceModal(false);
            setOpenWorkspacesModal(false);
            setCurrentWorkspace(id);
            return jumpToSubPath(id, WorkspaceSubPath.ALL);
          },
          [
            createLocalWorkspace,
            jumpToSubPath,
            setCurrentWorkspace,
            setOpenCreateWorkspaceModal,
            setOpenWorkspacesModal,
          ]
        )}
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
