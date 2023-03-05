import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import {
  currentWorkspaceIdAtom,
  openCreateWorkspaceModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { CreateWorkspaceModal } from '../components/pure/create-workspace-modal';
import { WorkspaceListModal } from '../components/pure/workspace-list-modal';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useWorkspaces, useWorkspacesHelper } from '../hooks/use-workspaces';
import { apis } from '../shared/apis';

export function Modals() {
  const [openWorkspacesModal, setOpenWorkspacesModal] = useAtom(
    openWorkspacesModalAtom
  );
  const [openCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const router = useRouter();
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const setCurrentWorkspace = useSetAtom(currentWorkspaceIdAtom);
  const { createLocalWorkspace } = useWorkspacesHelper();

  return (
    <>
      <WorkspaceListModal
        user={user}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        open={openWorkspacesModal}
        onClose={useCallback(() => {
          setOpenWorkspacesModal(false);
        }, [setOpenWorkspacesModal])}
        onClickWorkspace={useCallback(
          workspace => {
            setOpenWorkspacesModal(false);
            setCurrentWorkspace(workspace.id);
            router.push({
              pathname: `/workspace/[workspaceId]/all`,
              query: {
                workspaceId: workspace.id,
              },
            });
          },
          [router, setCurrentWorkspace, setOpenWorkspacesModal]
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
            return router.push({
              pathname: '/workspace/[workspaceId]/all',
              query: {
                workspaceId: id,
              },
            });
          },
          [
            createLocalWorkspace,
            router,
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
