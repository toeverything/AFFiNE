import { Suspense, useCallback } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';
import type { AllWorkspace } from '../../../../shared';

export const WorkSpaceSetting = ({
  workspace,
}: {
  workspace: AllWorkspace;
}) => {
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
        currentWorkspace={workspace}
      />
    </Suspense>
  );
};
