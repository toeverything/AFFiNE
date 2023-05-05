import { getEnvironment } from '@affine/env';
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
  openOnboardingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useAffineLogIn } from '../hooks/affine/use-affine-log-in';
import { useAffineLogOut } from '../hooks/affine/use-affine-log-out';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useAppHelper, useWorkspaces } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';

const WorkspaceListModal = lazy(() =>
  import('../components/pure/workspace-list-modal').then(module => ({
    default: module.WorkspaceListModal,
  }))
);
const CreateWorkspaceModal = lazy(() =>
  import('../components/pure/create-workspace-modal').then(module => ({
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
const OnboardingModalAtom = lazy(() =>
  import('../components/pure/OnboardingModal').then(module => ({
    default: module.OnboardingModal,
  }))
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
  const [openOnboardingModal, setOpenOnboardingModal] = useAtom(
    openOnboardingModalAtom
  );

  const router = useRouter();
  const { jumpToSubPath } = useRouterHelper(router);
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const [, setCurrentWorkspace] = useCurrentWorkspace();
  const { createLocalWorkspace } = useAppHelper();
  const [transitioning, transition] = useTransition();
  const env = getEnvironment();
  const onCloseOnboardingModal = useCallback(() => {
    setOpenOnboardingModal(false);
  }, [setOpenOnboardingModal]);
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
      {env.isDesktop && (
        <Suspense>
          <OnboardingModalAtom
            open={openOnboardingModal}
            onClose={onCloseOnboardingModal}
          />
        </Suspense>
      )}

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
          onCreateWorkspace={useCallback(() => {
            setOpenCreateWorkspaceModal(true);
          }, [setOpenCreateWorkspaceModal])}
        />
      </Suspense>
      <Suspense>
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
