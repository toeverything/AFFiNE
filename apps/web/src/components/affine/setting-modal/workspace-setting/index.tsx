import { assertExists } from '@blocksuite/global/utils';
import React, { Suspense, useCallback } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';
import type { Workspace } from '../type';

export const WorkSpaceSetting = ({ workspace }: { workspace: Workspace }) => {
  const helper = useAppHelper();
  const { NewSettingsDetail } = getUIAdapter(workspace.flavour);

  const onDeleteWorkspace = useCallback(async () => {
    assertExists(currentWorkspace);
    const workspaceId = currentWorkspace.id;
    return helper.deleteWorkspace(workspaceId);
  }, [helper]);
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
