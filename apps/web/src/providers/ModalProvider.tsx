import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { arrayMove } from '@dnd-kit/sortable';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback, useTransition } from 'react';

import {
  currentWorkspaceIdAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useAffineLogIn } from '../hooks/affine/use-affine-log-in';
import { useAffineLogOut } from '../hooks/affine/use-affine-log-out';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';

const WorkspaceListModal = lazy(() =>
  import('../components/pure/workspace-list-modal').then(module => ({
    default: module.WorkspaceListModal,
  }))
);
const CreateWorkspaceModal = lazy(() =>
  import('../components/affine/create-workspace-modal').then(module => ({
    default: module.CreateWorkspaceModal,
  }))
);

const TmpDisableAffineCloudModal = lazy(() =>
  import('../components/affine/tmp-disable-affine-cloud-modal').then(
    module => ({
      default: module.TmpDisableAffineCloudModal,
    })
  )
);

export function Modals() {
  const [openWorkspacesModal, setOpenWorkspacesModal] = useAtom(
    openWorkspacesModalAtom
  );
  const [openCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const [openDisableCloudAlertModal, setOpenDisableCloudAlertModal] = useAtom(
    openDisableCloudAlertModalAtom
  );

  const router = useRouter();
  const { jumpToSubPath } = useRouterHelper(router);
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const [, setCurrentWorkspace] = useCurrentWorkspace();
  const [transitioning, transition] = useTransition();

  return (
    <>
      <Suspense>
        <TmpDisableAffineCloudModal
          open={openDisableCloudAlertModal}
          onClose={useCallback(() => {
            setOpenDisableCloudAlertModal(false);
          }, [setOpenDisableCloudAlertModal])}
        />
      </Suspense>
      <Suspense>
        <WorkspaceListModal
          disabled={transitioning}
          user={user}
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          open={openWorkspacesModal || workspaces.length === 0}
          onClose={useCallback(() => {
            setOpenWorkspacesModal(false);
          }, [setOpenWorkspacesModal])}
          onMoveWorkspace={useCallback(
            (activeId, overId) => {
              const oldIndex = workspaces.findIndex(w => w.id === activeId);
              const newIndex = workspaces.findIndex(w => w.id === overId);
              transition(() =>
                setWorkspaces(workspaces =>
                  arrayMove(workspaces, oldIndex, newIndex)
                )
              );
            },
            [setWorkspaces, workspaces]
          )}
          onClickWorkspace={useCallback(
            workspace => {
              setOpenWorkspacesModal(false);
              setCurrentWorkspace(workspace.id);
              jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
            },
            [jumpToSubPath, setCurrentWorkspace, setOpenWorkspacesModal]
          )}
          onClickWorkspaceSetting={useCallback(
            workspace => {
              setOpenWorkspacesModal(false);
              setCurrentWorkspace(workspace.id);
              jumpToSubPath(workspace.id, WorkspaceSubPath.SETTING);
            },
            [jumpToSubPath, setCurrentWorkspace, setOpenWorkspacesModal]
          )}
          onClickLogin={useAffineLogIn()}
          onClickLogout={useAffineLogOut()}
          onNewWorkspace={useCallback(() => {
            setOpenCreateWorkspaceModal('new');
          }, [setOpenCreateWorkspaceModal])}
          onAddWorkspace={useCallback(async () => {
            setOpenCreateWorkspaceModal('add');
          }, [setOpenCreateWorkspaceModal])}
          // onImportWorkspace={async () => {
          //   if (!window.apis) {
          //     return;
          //   }
          //   const { workspaceId } = await window.apis.dialog.loadDBFile();
          //   if (workspaceId) {
          //     await importLocalWorkspace(workspaceId);
          //     setOpenWorkspacesModal(false);
          //     setCurrentWorkspace(workspaceId);
          //     return jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
          //   }
          // }}
        />
      </Suspense>
      <Suspense>
        <CreateWorkspaceModal
          mode={openCreateWorkspaceModal}
          onClose={useCallback(() => {
            setOpenCreateWorkspaceModal(false);
          }, [setOpenCreateWorkspaceModal])}
          onCreate={useCallback(
            async id => {
              setOpenCreateWorkspaceModal(false);
              setOpenWorkspacesModal(false);
              setCurrentWorkspace(id);
              return jumpToSubPath(id, WorkspaceSubPath.SETTING);
            },
            [
              jumpToSubPath,
              setCurrentWorkspace,
              setOpenCreateWorkspaceModal,
              setOpenWorkspacesModal,
            ]
          )}
        />
      </Suspense>
    </>
  );
}

export const ModalProvider = (): ReactElement => {
  return (
    <>
      <Modals />
    </>
  );
};
