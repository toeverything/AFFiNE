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
  openSettingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces } from '../hooks/use-workspaces';
import type { AllWorkspace } from '../shared';

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
  const workspaces = useWorkspaces();
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const [transitioning, transition] = useTransition();
  const [, setOpenSettingModalAtom] = useAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(
    (workspace: AllWorkspace) => {
      setOpenWorkspacesModal(false);

      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace',
        workspace,
      });
    },
    [setOpenSettingModalAtom, setOpenWorkspacesModal]
  );
  return (
    <>
      <Suspense>
        <WorkspaceListModal
          disabled={transitioning}
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
              transition(() => {
                setWorkspaces(workspaces =>
                  arrayMove(workspaces, oldIndex, newIndex)
                ).catch(console.error);
              });
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
          onClickWorkspaceSetting={handleOpenSettingModal}
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
