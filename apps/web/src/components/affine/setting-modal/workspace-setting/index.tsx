import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback, useMemo } from 'react';

import { getUIAdapter } from '../../../../adapters/workspace';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import { useAppHelper } from '../../../../hooks/use-workspaces';

export const WorkspaceSetting = ({ workspaceId }: { workspaceId: string }) => {
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const flavour = useMemo(
    () => metadata.find(({ id }) => id === workspaceId)?.flavour,
    [metadata, workspaceId]
  );
  assertExists(flavour);
  const helper = useAppHelper();
  const { NewSettingsDetail } = getUIAdapter(flavour);

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
