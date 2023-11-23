import { ScrollableContainer } from '@affine/component';
import { WorkspaceList } from '@affine/component/workspace-list';
import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Divider } from '@toeverything/components/divider';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtom, useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useMemo, useTransition } from 'react';

import {
  openCreateWorkspaceModalAtom,
  openSettingModalAtom,
} from '../../../../../atoms';
import type { AllWorkspace } from '../../../../../shared';
import { useIsWorkspaceOwner } from '../.././../../../hooks/affine/use-is-workspace-owner';
import { useNavigateHelper } from '../.././../../../hooks/use-navigate-helper';
import * as styles from './index.css';
interface WorkspaceModalProps {
  disabled?: boolean;
  workspaces: (AffineCloudWorkspace | LocalWorkspace)[];
  currentWorkspaceId: AllWorkspace['id'] | null;
  onClickWorkspace: (workspace: RootWorkspaceMetadata['id']) => void;
  onClickWorkspaceSetting: (workspace: RootWorkspaceMetadata['id']) => void;
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
      />
    </div>
  );
};

export const AFFiNEWorkspaceList = ({
  workspaces,
  onEventEnd,
}: {
  workspaces: RootWorkspaceMetadata[];
  onEventEnd?: () => void;
}) => {
  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const { jumpToSubPath } = useNavigateHelper();

  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    currentWorkspaceIdAtom
  );

  const setCurrentPageId = useSetAtom(currentPageIdAtom);

  const [, startCloseTransition] = useTransition();

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  // TODO: AFFiNE Cloud support
  const { status } = useSession();

  const isAuthenticated = useMemo(() => status === 'authenticated', [status]);

  const cloudWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.AFFINE_CLOUD
      ) as (AffineCloudWorkspace | LocalWorkspace)[],
    [workspaces]
  );

  const localWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.LOCAL
      ) as (AffineCloudWorkspace | LocalWorkspace)[],
    [workspaces]
  );

  const onClickWorkspaceSetting = useCallback(
    (workspaceId: string) => {
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace',
        workspaceId,
      });
      onEventEnd?.();
    },
    [onEventEnd, setOpenSettingModalAtom]
  );

  const onMoveWorkspace = useCallback(
    (activeId: string, overId: string) => {
      const oldIndex = workspaces.findIndex(w => w.id === activeId);

      const newIndex = workspaces.findIndex(w => w.id === overId);
      startTransition(() => {
        setWorkspaces(workspaces => arrayMove(workspaces, oldIndex, newIndex));
      });
    },
    [setWorkspaces, workspaces]
  );

  const onClickWorkspace = useCallback(
    (workspaceId: string) => {
      startCloseTransition(() => {
        setCurrentWorkspaceId(workspaceId);
        setCurrentPageId(null);
        jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
      });
      onEventEnd?.();
    },
    [jumpToSubPath, onEventEnd, setCurrentPageId, setCurrentWorkspaceId]
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
            currentWorkspaceId={currentWorkspaceId}
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
        currentWorkspaceId={currentWorkspaceId}
        onDragEnd={onDragEnd}
      />
    </ScrollableContainer>
  );
};
