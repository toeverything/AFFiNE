import { pushNotificationAtom } from '@affine/component/notification-center';
import { SettingRow } from '@affine/component/setting-components';
import { ConfirmModal } from '@affine/component/ui/modal';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { Workspace, WorkspaceManager } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { openSettingModalAtom } from '../../../../../../atoms';
import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../../../hooks/use-navigate-helper';
import { WorkspaceSubPath } from '../../../../../../shared';
import type { WorkspaceSettingDetailProps } from '../types';
import { WorkspaceDeleteModal } from './delete';

export interface DeleteLeaveWorkspaceProps
  extends WorkspaceSettingDetailProps {}

export const DeleteLeaveWorkspace = ({
  workspaceMetadata,
  isOwner,
}: DeleteLeaveWorkspaceProps) => {
  const t = useAFFiNEI18N();
  const { jumpToSubPath, jumpToIndex } = useNavigateHelper();
  // fixme: cloud regression
  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const setSettingModal = useSetAtom(openSettingModalAtom);

  const workspaceManager = useService(WorkspaceManager);
  const workspaceList = useLiveData(workspaceManager.list.workspaceList);
  const currentWorkspace = useService(Workspace);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const onLeaveOrDelete = useCallback(() => {
    if (isOwner) {
      setShowDelete(true);
    } else {
      setShowLeave(true);
    }
  }, [isOwner]);

  const onDeleteConfirm = useAsyncCallback(async () => {
    setSettingModal(prev => ({ ...prev, open: false, workspaceId: null }));

    if (currentWorkspace?.id === workspaceMetadata.id) {
      const backWorkspace = workspaceList.find(
        ws => ws.id !== workspaceMetadata.id
      );
      // TODO: if there is no workspace, jump to a new page(wait for design)
      if (backWorkspace) {
        jumpToSubPath(
          backWorkspace?.id || '',
          WorkspaceSubPath.ALL,
          RouteLogic.REPLACE
        );
      } else {
        jumpToIndex(RouteLogic.REPLACE);
      }
    }

    await workspaceManager.deleteWorkspace(workspaceMetadata);
    pushNotification({
      title: t['Successfully deleted'](),
      type: 'success',
    });
  }, [
    currentWorkspace?.id,
    jumpToIndex,
    jumpToSubPath,
    pushNotification,
    setSettingModal,
    t,
    workspaceList,
    workspaceManager,
    workspaceMetadata,
  ]);

  return (
    <>
      <SettingRow
        name={
          <span style={{ color: 'var(--affine-error-color)' }}>
            {isOwner
              ? t['com.affine.workspaceDelete.title']()
              : t['com.affine.deleteLeaveWorkspace.leave']()}
          </span>
        }
        desc={t['com.affine.deleteLeaveWorkspace.description']()}
        style={{ cursor: 'pointer' }}
        onClick={onLeaveOrDelete}
        data-testid="delete-workspace-button"
      >
        <ArrowRightSmallIcon />
      </SettingRow>
      {isOwner ? (
        <WorkspaceDeleteModal
          onConfirm={onDeleteConfirm}
          open={showDelete}
          onOpenChange={setShowDelete}
          workspaceMetadata={workspaceMetadata}
        />
      ) : (
        <ConfirmModal
          open={showLeave}
          cancelText={t['com.affine.confirmModal.button.cancel']()}
          onConfirm={onDeleteConfirm}
          onOpenChange={setShowLeave}
          title={`${t['com.affine.deleteLeaveWorkspace.leave']()}?`}
          description={t['com.affine.deleteLeaveWorkspace.leaveDescription']()}
          confirmButtonOptions={{
            type: 'warning',
            children: t['Leave'](),
          }}
        />
      )}
    </>
  );
};
