import type { WorkspaceMetadata } from '@affine/workspace/metadata';

import { NewWorkspaceSettingDetail } from '../../../../adapters/shared';
import { useIsWorkspaceOwner } from '../../../../hooks/affine/use-is-workspace-owner';

export const WorkspaceSetting = ({
  workspaceMetadata,
}: {
  workspaceMetadata: WorkspaceMetadata;
}) => {
  const isOwner = useIsWorkspaceOwner(workspaceMetadata);
  return (
    <NewWorkspaceSettingDetail
      workspaceMetadata={workspaceMetadata}
      isOwner={isOwner}
    />
  );
};
