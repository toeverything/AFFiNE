import { ConfirmModal, notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceDeleteModal } from '@affine/core/components/workspace-delete-modal';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import {
  WorkspaceService,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useState } from 'react';

import { RowLayout } from '../row.layout';

export const DeleteLeaveWorkspace = () => {
  const {
    workspaceService,
    workspacesService,
    workspacePermissionService,
    globalContextService,
  } = useServices({
    WorkspaceService,
    WorkspacesService,
    WorkspacePermissionService,
    GlobalContextService,
  });
  const t = useI18n();
  const workspace = workspaceService.workspace;
  const { jumpToPage, jumpToIndex } = useNavigateHelper();
  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const workspaceList = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = useLiveData(
    globalContextService.globalContext.workspaceId.$
  );
  const isOwner = useLiveData(workspacePermissionService.permission.isOwner$);

  const onLeaveOrDelete = useCallback(() => {
    if (isOwner) {
      setShowDelete(true);
    } else {
      setShowLeave(true);
    }
  }, [isOwner]);

  const onConfirm = useAsyncCallback(async () => {
    if (currentWorkspaceId === workspace.id) {
      const backWorkspace = workspaceList.find(
        ws => ws.id !== currentWorkspaceId
      );
      if (backWorkspace) {
        jumpToPage(backWorkspace.id, 'all', RouteLogic.REPLACE);
      } else {
        jumpToIndex(RouteLogic.REPLACE);
      }
    }

    try {
      if (isOwner) {
        await workspacesService.deleteWorkspace(workspace.meta);
      } else {
        await workspacePermissionService.leaveWorkspace();
      }
    } catch (error) {
      console.error(error);
      notify.error({ title: t['com.affine.error.unexpected-error.title']() });
      return;
    }
    notify.success({ title: t['Successfully deleted']() });
  }, [
    currentWorkspaceId,
    isOwner,
    jumpToIndex,
    jumpToPage,
    t,
    workspace.id,
    workspace.meta,
    workspaceList,
    workspacePermissionService,
    workspacesService,
  ]);

  if (isOwner === null) {
    return null;
  }

  return (
    <>
      <RowLayout
        label={
          <span style={{ color: cssVarV2('status/error') }}>
            {isOwner
              ? t['com.affine.workspaceDelete.title']()
              : t['com.affine.deleteLeaveWorkspace.leave']()}
          </span>
        }
        onClick={onLeaveOrDelete}
      >
        <ArrowRightSmallIcon fontSize={22} />
      </RowLayout>
      {isOwner ? (
        <WorkspaceDeleteModal
          open={showDelete}
          onOpenChange={setShowDelete}
          onConfirm={onConfirm}
          workspaceMetadata={workspace.meta}
        />
      ) : (
        <ConfirmModal
          open={showLeave}
          onOpenChange={setShowLeave}
          onConfirm={onConfirm}
          title={`${t['com.affine.deleteLeaveWorkspace.leave']()}?`}
          description={t['com.affine.deleteLeaveWorkspace.leaveDescription']()}
          cancelText={t['com.affine.confirmModal.button.cancel']()}
          confirmText={t['Leave']()}
          confirmButtonOptions={{
            variant: 'error',
          }}
        />
      )}
    </>
  );
};
