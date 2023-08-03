import { WorkspaceSubPath } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { arrayMove } from '@dnd-kit/sortable';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
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
import { useNavigateHelper } from '../hooks/use-navigate-helper';

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

  const { jumpToSubPath } = useNavigateHelper();
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    currentWorkspaceIdAtom
  );
  const setCurrentPageId = useSetAtom(currentPageIdAtom);
  const [isPending, startTransition] = useTransition();
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
          disabled={isPending}
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
              startTransition(() => {
                setWorkspaces(workspaces =>
                  arrayMove(workspaces, oldIndex, newIndex)
                );
              });
            },
            [setWorkspaces, workspaces]
          )}
          onClickWorkspace={useCallback(
            workspaceId => {
              setOpenWorkspacesModal(false);
              setCurrentWorkspaceId(workspaceId);
              setCurrentPageId(null);
              jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
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
            id => {
              startTransition(() => {
                setOpenCreateWorkspaceModal(false);
                setOpenWorkspacesModal(false);
                setCurrentWorkspaceId(id);
                jumpToSubPath(id, WorkspaceSubPath.ALL);
              });
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
