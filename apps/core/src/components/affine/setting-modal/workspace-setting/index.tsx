import { WorkspaceDetailSkeleton } from '@affine/component/setting-components';
import { usePassiveWorkspaceEffect } from '@toeverything/plugin-infra/__internal__/react';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { openSettingModalAtom } from '../../../../atoms';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../hooks/use-navigate-helper';
import { useWorkspace } from '../../../../hooks/use-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';

export const WorkspaceSetting = ({ workspaceId }: { workspaceId: string }) => {
  const workspace = useWorkspace(workspaceId);
  usePassiveWorkspaceEffect(workspace.blockSuiteWorkspace);
  const setSettingModal = useSetAtom(openSettingModalAtom);
  const helper = useAppHelper();
  const { jumpToIndex } = useNavigateHelper();

  const { NewSettingsDetail } = getUIAdapter(workspace.flavour);

  const onDeleteWorkspace = useCallback(
    async (id: string) => {
      await helper.deleteWorkspace(id);
      setSettingModal(prev => ({ ...prev, open: false, workspaceId: null }));
      jumpToIndex(RouteLogic.REPLACE);
    },
    [helper, jumpToIndex, setSettingModal]
  );
  const onTransformWorkspace = useOnTransformWorkspace();

  return (
    <Suspense fallback={<WorkspaceDetailSkeleton />}>
      <NewSettingsDetail
        onTransformWorkspace={onTransformWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        currentWorkspaceId={workspaceId}
      />
    </Suspense>
  );
};
