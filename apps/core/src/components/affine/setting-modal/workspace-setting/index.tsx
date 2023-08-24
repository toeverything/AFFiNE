import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
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
  const { jumpToSubPath } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const workspace = useWorkspace(workspaceId);
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);

  const leaveWorkspace = useLeaveWorkspace();
  usePassiveWorkspaceEffect(workspace.blockSuiteWorkspace);
  const setSettingModal = useSetAtom(openSettingModalAtom);
  const helper = useAppHelper();

  const { NewSettingsDetail } = getUIAdapter(workspace.flavour);

  // This function mey not need id param
  const onDeleteWorkspace = useCallback(
    async (id: string) => {
      setSettingModal(prev => ({ ...prev, open: false, workspaceId: null }));

      if (currentWorkspace.id === workspaceId) {
        const backWorkspace = workspaces.find(ws => ws.id !== workspaceId);
        // TODO: if there is no workspace, jump to a new page(wait for design)

        jumpToSubPath(
          backWorkspace?.id || '',
          WorkspaceSubPath.ALL,
          RouteLogic.REPLACE
        );
      }

      if (workspace.flavour === WorkspaceFlavour.LOCAL) {
        await helper.deleteWorkspace(id);
      }
      if (workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
        await leaveWorkspace(id);
      }
    },
    [
      currentWorkspace.id,
      helper,
      jumpToSubPath,
      leaveWorkspace,
      setSettingModal,
      workspace.flavour,
      workspaceId,
      workspaces,
    ]
  );

  const onTransformWorkspace = useOnTransformWorkspace();

  return (
    <NewSettingsDetail
      onTransformWorkspace={onTransformWorkspace}
      onDeleteWorkspace={onDeleteWorkspace}
      currentWorkspaceId={workspaceId}
    />
  );
};
