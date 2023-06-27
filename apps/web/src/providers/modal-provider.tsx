import { WorkspaceSubPath } from '@affine/env/workspace';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { arrayMove } from '@dnd-kit/sortable';
import { useAtom, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback, useTransition } from 'react';

import {
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openOnboardingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useAffineLogIn } from '../hooks/affine/use-affine-log-in';
import { useAffineLogOut } from '../hooks/affine/use-affine-log-out';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces } from '../hooks/use-workspaces';

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

const OnboardingModal = lazy(() =>
  import('../components/pure/onboarding-modal').then(module => ({
    default: module.OnboardingModal,
  }))
);

export function CurrentWorkspaceModals() {
  const [openDisableCloudAlertModal, setOpenDisableCloudAlertModal] = useAtom(
    openDisableCloudAlertModalAtom
  );
  const [openOnboardingModal, setOpenOnboardingModal] = useAtom(
    openOnboardingModalAtom
  );

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
      {environment.isDesktop && (
        <Suspense>
          <OnboardingModal
            open={openOnboardingModal}
            onClose={onCloseOnboardingModal}
          />
        </Suspense>
      )}
    </>
  );
}

export const AllWorkspaceModals = (): ReactElement => {
  const [openWorkspacesModal, setOpenWorkspacesModal] = useAtom(
    openWorkspacesModalAtom
  );
  const [isOpenCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const router = useRouter();
  const { jumpToSubPath } = useRouterHelper(router);
  const user = useCurrentUser();
  const workspaces = useWorkspaces();
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const [transitioning, transition] = useTransition();
  return (
    <>
      <Suspense>
        <WorkspaceListModal
          disabled={transitioning}
          user={user}
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          open={
            (openWorkspacesModal || workspaces.length === 0) &&
            isOpenCreateWorkspaceModal === false
          }
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
              setCurrentWorkspaceId(workspace.id);
              jumpToSubPath(workspace.id, WorkspaceSubPath.ALL).catch(error => {
                console.error(error);
              });
            },
            [jumpToSubPath, setCurrentWorkspaceId, setOpenWorkspacesModal]
          )}
          onClickWorkspaceSetting={useCallback(
            workspace => {
              setOpenWorkspacesModal(false);
              setCurrentWorkspaceId(workspace.id);
              jumpToSubPath(workspace.id, WorkspaceSubPath.SETTING).catch(
                error => {
                  console.error(error);
                }
              );
            },
            [jumpToSubPath, setCurrentWorkspaceId, setOpenWorkspacesModal]
          )}
          onClickLogin={useAffineLogIn()}
          onClickLogout={useAffineLogOut()}
          onNewWorkspace={useCallback(() => {
            setOpenCreateWorkspaceModal('new');
          }, [setOpenCreateWorkspaceModal])}
          onAddWorkspace={useCallback(async () => {
            setOpenCreateWorkspaceModal('add');
          }, [setOpenCreateWorkspaceModal])}
        />
      </Suspense>
      <Suspense>
        <CreateWorkspaceModal
          mode={isOpenCreateWorkspaceModal}
          onClose={useCallback(() => {
            setOpenCreateWorkspaceModal(false);
          }, [setOpenCreateWorkspaceModal])}
          onCreate={useCallback(
            async id => {
              setOpenCreateWorkspaceModal(false);
              setOpenWorkspacesModal(false);
              setCurrentWorkspaceId(id);
              return jumpToSubPath(id, WorkspaceSubPath.ALL);
            },
            [
              jumpToSubPath,
              setCurrentWorkspaceId,
              setOpenCreateWorkspaceModal,
              setOpenWorkspacesModal,
            ]
          )}
        />
      </Suspense>
    </>
  );
};
