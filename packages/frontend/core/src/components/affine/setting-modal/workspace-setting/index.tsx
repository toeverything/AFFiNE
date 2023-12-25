import type { WorkspaceMetadata } from '@affine/workspace/metadata';

import { useIsWorkspaceOwner } from '../../../../hooks/affine/use-is-workspace-owner';
import { WorkspaceSettingDetail } from '../../new-workspace-setting-detail';

export const WorkspaceSetting = ({
  workspaceMetadata,
}: {
  workspaceMetadata: WorkspaceMetadata;
}) => {
  const isOwner = useIsWorkspaceOwner(workspaceMetadata);
  return (
    <WorkspaceSettingDetail
      workspaceMetadata={workspaceMetadata}
      isOwner={isOwner}
    />
  );
};
