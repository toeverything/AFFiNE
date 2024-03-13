import { ScrollableContainer } from '@affine/component';
import { Divider } from '@affine/component/ui/divider';
import { WorkspaceList } from '@affine/component/workspace-list';
import { useSession } from '@affine/core/hooks/affine/use-current-user';
import {
  useWorkspaceAvatar,
  useWorkspaceName,
} from '@affine/core/hooks/use-workspace-info';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DragEndEvent } from '@dnd-kit/core';
import { WorkspaceManager, type WorkspaceMetadata } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import {
  openCreateWorkspaceModalAtom,
  openSettingModalAtom,
} from '../../../../../atoms';
import { CurrentWorkspaceService } from '../../../../../modules/workspace/current-workspace';
import { WorkspaceSubPath } from '../../../../../shared';
import { useIsWorkspaceOwner } from '../.././../../../hooks/affine/use-is-workspace-owner';
import { useNavigateHelper } from '../.././../../../hooks/use-navigate-helper';
import * as styles from './index.css';
interface WorkspaceModalProps {
  disabled?: boolean;
  workspaces: WorkspaceMetadata[];
  currentWorkspaceId?: string | null;
  onClickWorkspace: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickWorkspaceSetting: (workspaceMetadata: WorkspaceMetadata) => void;
  onNewWorkspace: () => void;
  onAddWorkspace: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

const CloudWorkSpaceList = ({
  disabled,
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  currentWorkspaceId,
  onDragEnd,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();
  if (workspaces.length === 0) {
    return null;
  }
  return (
    <div className={styles.workspaceListWrapper}>
      <div className={styles.workspaceType}>
        {t['com.affine.workspaceList.workspaceListType.cloud']()}
      </div>
      <WorkspaceList
        disabled={disabled}
        items={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onClick={onClickWorkspace}
        onSettingClick={onClickWorkspaceSetting}
        onDragEnd={onDragEnd}
        useIsWorkspaceOwner={useIsWorkspaceOwner}
        useWorkspaceName={useWorkspaceName}
        useWorkspaceAvatar={useWorkspaceAvatar}
      />
    </div>
  );
};

const LocalWorkspaces = ({
  disabled,
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  currentWorkspaceId,
  onDragEnd,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();
  if (workspaces.length === 0) {
    return null;
  }
  return (
    <div className={styles.workspaceListWrapper}>
      <div className={styles.workspaceType}>
        {t['com.affine.workspaceList.workspaceListType.local']()}
      </div>
      <WorkspaceList
        disabled={disabled}
        items={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onClick={onClickWorkspace}
        onSettingClick={onClickWorkspaceSetting}
        onDragEnd={onDragEnd}
        useIsWorkspaceOwner={useIsWorkspaceOwner}
        useWorkspaceName={useWorkspaceName}
        useWorkspaceAvatar={useWorkspaceAvatar}
      />
    </div>
  );
};

export const AFFiNEWorkspaceList = ({
  onEventEnd,
}: {
  onEventEnd?: () => void;
}) => {
  const workspaces = useLiveData(
    useService(WorkspaceManager).list.workspaceList
  );

  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const { jumpToSubPath } = useNavigateHelper();

  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const { status } = useSession();

  const isAuthenticated = status === 'authenticated';

  const cloudWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.AFFINE_CLOUD
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const localWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.LOCAL
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const onClickWorkspaceSetting = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace:preference',
        workspaceMetadata,
      });
      onEventEnd?.();
    },
    [onEventEnd, setOpenSettingModalAtom]
  );

  const onMoveWorkspace = useCallback((_activeId: string, _overId: string) => {
    // TODO: order
    // const oldIndex = workspaces.findIndex(w => w.id === activeId);
    // const newIndex = workspaces.findIndex(w => w.id === overId);
    // startTransition(() => {
    //   setWorkspaces(workspaces => arrayMove(workspaces, oldIndex, newIndex));
    // });
  }, []);

  const onClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      jumpToSubPath(workspaceMetadata.id, WorkspaceSubPath.ALL);
      onEventEnd?.();
    },
    [jumpToSubPath, onEventEnd]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        onMoveWorkspace(active.id as string, over?.id as string);
      }
    },
    [onMoveWorkspace]
  );

  const onNewWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const onAddWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  return (
    <ScrollableContainer
      className={styles.workspaceListsWrapper}
      scrollBarClassName={styles.scrollbar}
    >
      {isAuthenticated ? (
        <div>
          <CloudWorkSpaceList
            workspaces={cloudWorkspaces}
            onClickWorkspace={onClickWorkspace}
            onClickWorkspaceSetting={onClickWorkspaceSetting}
            onNewWorkspace={onNewWorkspace}
            onAddWorkspace={onAddWorkspace}
            currentWorkspaceId={currentWorkspace?.id}
            onDragEnd={onDragEnd}
          />
          {localWorkspaces.length > 0 && cloudWorkspaces.length > 0 ? (
            <Divider size="thinner" />
          ) : null}
        </div>
      ) : null}
      <LocalWorkspaces
        workspaces={localWorkspaces}
        onClickWorkspace={onClickWorkspace}
        onClickWorkspaceSetting={onClickWorkspaceSetting}
        onNewWorkspace={onNewWorkspace}
        onAddWorkspace={onAddWorkspace}
        currentWorkspaceId={currentWorkspace?.id}
        onDragEnd={onDragEnd}
      />
    </ScrollableContainer>
  );
};
