import { WorkspaceSubPath } from '@affine/env/workspace';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { arrayMove } from '@dnd-kit/sortable';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import type { FC, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useTransition } from 'react';

import type { SettingAtom } from '../atoms';
import {
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';

const SettingModal = lazy(() =>
  import('../components/affine/setting-modal').then(module => ({
    default: module.SettingModal,
  }))
);

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
  import('../components/affine/onboarding-modal').then(module => ({
    default: module.OnboardingModal,
  }))
);

export const Setting: FC = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [{ open, workspaceId, activeTab }, setOpenSettingModalAtom] =
    useAtom(openSettingModalAtom);
  assertExists(currentWorkspace);

  const onSettingClick = useCallback(
    ({
      activeTab,
      workspaceId,
    }: Pick<SettingAtom, 'activeTab' | 'workspaceId'>) => {
      setOpenSettingModalAtom(prev => ({ ...prev, activeTab, workspaceId }));
    },
    [setOpenSettingModalAtom]
  );

  return (
    <SettingModal
      open={open}
      activeTab={activeTab}
      workspaceId={workspaceId}
      onSettingClick={onSettingClick}
      setOpen={useCallback(
        open => {
          setOpenSettingModalAtom(prev => ({ ...prev, open }));
        },
        [setOpenSettingModalAtom]
      )}
    />
  );
};

export function CurrentWorkspaceModals() {
  const [currentWorkspace] = useCurrentWorkspace();
  const [openDisableCloudAlertModal, setOpenDisableCloudAlertModal] = useAtom(
    openDisableCloudAlertModalAtom
  );
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
          <OnboardingModal />
        </Suspense>
      )}
      {currentWorkspace && <Setting />}
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
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  const [transitioning, transition] = useTransition();
  const [, setOpenSettingModalAtom] = useAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(
    (workspaceId: string) => {
      setOpenWorkspacesModal(false);

      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace',
        workspaceId,
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
            workspaceId => {
              setOpenWorkspacesModal(false);
              setCurrentWorkspaceId(workspaceId);
              setCurrentPageId(null);
              jumpToSubPath(workspaceId, WorkspaceSubPath.ALL).catch(error => {
                console.error(error);
              });
            },
            [
              jumpToSubPath,
              setCurrentPageId,
              setCurrentWorkspaceId,
              setOpenWorkspacesModal,
            ]
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
