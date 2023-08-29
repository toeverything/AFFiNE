import { pushNotificationAtom } from '@affine/component/notification-center';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { usePassiveWorkspaceEffect } from '@toeverything/infra/__internal__/react';
import { useSetAtom } from 'jotai';
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { openSettingModalAtom } from '../../../../atoms';
import { useLeaveWorkspace } from '../../../../hooks/affine/use-leave-workspace';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../hooks/use-navigate-helper';
import { useWorkspace } from '../../../../hooks/use-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';

export const WorkspaceSetting = ({ workspaceId }: { workspaceId: string }) => {
  const t = useAFFiNEI18N();

  const { jumpToSubPath, jumpToIndex } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const workspace = useWorkspace(workspaceId);
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const leaveWorkspace = useLeaveWorkspace();
  usePassiveWorkspaceEffect(workspace.blockSuiteWorkspace);
  const setSettingModal = useSetAtom(openSettingModalAtom);
  const { deleteWorkspace } = useAppHelper();

  const { NewSettingsDetail } = getUIAdapter(workspace.flavour);

  const closeAndJumpOut = useCallback(() => {
    setSettingModal(prev => ({ ...prev, open: false, workspaceId: null }));

    if (currentWorkspace.id === workspaceId) {
      const backWorkspace = workspaces.find(ws => ws.id !== workspaceId);
      // TODO: if there is no workspace, jump to a new page(wait for design)
      if (backWorkspace) {
        jumpToSubPath(
          backWorkspace?.id || '',
          WorkspaceSubPath.ALL,
          RouteLogic.REPLACE
        );
      } else {
        setTimeout(() => {
          jumpToIndex(RouteLogic.REPLACE);
        }, 100);
      }
    }
  }, [
    currentWorkspace.id,
    jumpToIndex,
    jumpToSubPath,
    setSettingModal,
    workspaceId,
    workspaces,
  ]);

  const handleDeleteWorkspace = useCallback(async () => {
    closeAndJumpOut();
    await deleteWorkspace(workspaceId);

    pushNotification({
      title: t['Successfully deleted'](),
      type: 'success',
    });
  }, [closeAndJumpOut, deleteWorkspace, pushNotification, t, workspaceId]);

  const handleLeaveWorkspace = useCallback(async () => {
    closeAndJumpOut();
    await leaveWorkspace(workspaceId);

    pushNotification({
      title: 'Successfully leave',
      type: 'success',
    });
  }, [closeAndJumpOut, leaveWorkspace, pushNotification, workspaceId]);

  const onTransformWorkspace = useOnTransformWorkspace();
  // const handleDelete = useCallback(async () => {
  //   await onDeleteWorkspace();
  //   toast(t['Successfully deleted'](), {
  //     portal: document.body,
  //   });
  //   onClose();
  // }, [onClose, onDeleteWorkspace, t, workspace.id]);

  return (
    <NewSettingsDetail
      onDeleteCloudWorkspace={handleDeleteWorkspace}
      onDeleteLocalWorkspace={handleDeleteWorkspace}
      onLeaveWorkspace={handleLeaveWorkspace}
      onTransformWorkspace={onTransformWorkspace}
      currentWorkspaceId={workspaceId}
    />
  );
};
