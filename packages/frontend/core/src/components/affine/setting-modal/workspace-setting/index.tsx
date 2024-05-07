import type { WorkspaceMetadata } from '@toeverything/infra';

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
  switch (subTab) {
    case 'preference':
      return <WorkspaceSettingDetail workspaceMetadata={workspaceMetadata} />;
    case 'experimental-features':
      return <ExperimentalFeatures />;
    case 'properties':
      return (
        <WorkspaceSettingProperties workspaceMetadata={workspaceMetadata} />
      );
  }
};
