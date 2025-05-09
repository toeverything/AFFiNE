import { notify } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { ConfirmModal } from '@affine/component/ui/modal';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import {
  WorkspaceService,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../../../components/hooks/use-navigate-helper';
import { WorkspaceDeleteModal } from './delete';

export const DeleteLeaveWorkspace = ({
  onCloseSetting,
}: {
  onCloseSetting?: () => void;
}) => {
  const {
    workspaceService,
    globalContextService,
    workspacePermissionService,
    workspacesService,
  } = useServices({
    WorkspaceService,
    GlobalContextService,
    WorkspacePermissionService,
    WorkspacesService,
  });
  const t = useI18n();
  const workspace = workspaceService.workspace;
  const { jumpToPage, jumpToIndex } = useNavigateHelper();
  // fixme: cloud regression
  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const workspaceList = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = useLiveData(
    globalContextService.globalContext.workspaceId.$
  );

  const isOwner = useLiveData(workspacePermissionService.permission.isOwner$);
  useEffect(() => {
    workspacePermissionService.permission.revalidate();
  }, [workspacePermissionService]);

  const onLeaveOrDelete = useCallback(() => {
    if (isOwner !== null) {
      if (isOwner) {
        setShowDelete(true);
      } else {
        setShowLeave(true);
      }
    }
  }, [isOwner]);

  const onDeleteConfirm = useAsyncCallback(async () => {
    onCloseSetting?.();

    if (currentWorkspaceId === workspace.id) {
      const backWorkspace = workspaceList.find(
        ws => ws.id !== currentWorkspaceId
      );
      // TODO(@eyhn): if there is no workspace, jump to a new page(wait for design)
      if (backWorkspace) {
        jumpToPage(backWorkspace?.id || '', 'all', RouteLogic.REPLACE);
      } else {
        jumpToIndex(RouteLogic.REPLACE);
      }
    }

    if (isOwner) {
      await workspacesService.deleteWorkspace(workspace.meta);
    } else {
      await workspacePermissionService.leaveWorkspace();
    }
    notify.success({ title: t['Successfully deleted']() });
  }, [
    onCloseSetting,
    currentWorkspaceId,
    workspace.id,
    workspace.meta,
    isOwner,
    t,
    workspaceList,
    jumpToPage,
    jumpToIndex,
    workspacesService,
    workspacePermissionService,
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
          workspaceMetadata={workspace.meta}
        />
      ) : (
        <ConfirmModal
          open={showLeave}
          cancelText={t['com.affine.confirmModal.button.cancel']()}
          onConfirm={onDeleteConfirm}
          onOpenChange={setShowLeave}
          title={`${t['com.affine.deleteLeaveWorkspace.leave']()}?`}
          description={t['com.affine.deleteLeaveWorkspace.leaveDescription']()}
          confirmText={t['Leave']()}
          confirmButtonOptions={{
            variant: 'error',
          }}
        />
      )}
    </>
  );
};
