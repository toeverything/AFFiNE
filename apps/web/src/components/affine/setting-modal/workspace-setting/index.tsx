import { usePassiveWorkspaceEffect } from '@toeverything/hooks/use-block-suite-workspace';
import { Suspense, useCallback } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import { useWorkspace } from '../../../../hooks/use-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';

export const WorkspaceSetting = ({ workspaceId }: { workspaceId: string }) => {
  const workspace = useWorkspace(workspaceId);
  usePassiveWorkspaceEffect(workspace.blockSuiteWorkspace);
  const helper = useAppHelper();

  const { NewSettingsDetail } = getUIAdapter(workspace.flavour);

  const onDeleteWorkspace = useCallback(
    async (id: string) => {
      return helper.deleteWorkspace(id);
    },
    [helper]
  );
  const onTransformWorkspace = useOnTransformWorkspace();

  return (
    <Suspense fallback={<div>loading</div>}>
      <NewSettingsDetail
        onTransformWorkspace={onTransformWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        currentWorkspaceId={workspaceId}
      />
    </Suspense>
  );
};
