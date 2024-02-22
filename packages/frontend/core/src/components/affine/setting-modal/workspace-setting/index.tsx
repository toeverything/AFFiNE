import type { WorkspaceMetadata } from '@toeverything/infra';

import { useIsWorkspaceOwner } from '../../../../hooks/affine/use-is-workspace-owner';
import { ExperimentalFeatures } from './experimental-features';
import { WorkspaceSettingDetail } from './new-workspace-setting-detail';
import { WorkspaceSettingProperties } from './properties';

export const WorkspaceSetting = ({
  workspaceMetadata,
  subTab,
}: {
  workspaceMetadata: WorkspaceMetadata;
  subTab: 'preference' | 'experimental-features' | 'properties';
}) => {
  const isOwner = useIsWorkspaceOwner(workspaceMetadata);

  switch (subTab) {
    case 'preference':
      return (
        <WorkspaceSettingDetail
          workspaceMetadata={workspaceMetadata}
          isOwner={isOwner}
        />
      );
    case 'experimental-features':
      return <ExperimentalFeatures workspaceMetadata={workspaceMetadata} />;
    case 'properties':
      return (
        <WorkspaceSettingProperties workspaceMetadata={workspaceMetadata} />
      );
  }
};
