import type { WorkspaceMetadata } from '@toeverything/infra';

import type { WorkspaceSubTab } from '../types';
import { WorkspaceSettingDetail } from './new-workspace-setting-detail';
import { WorkspaceSettingProperties } from './properties';

export const WorkspaceSetting = ({
  workspaceMetadata,
  subTab,
}: {
  workspaceMetadata: WorkspaceMetadata;
  subTab: WorkspaceSubTab;
}) => {
  switch (subTab) {
    case 'preference':
      return <WorkspaceSettingDetail workspaceMetadata={workspaceMetadata} />;
    case 'properties':
      return (
        <WorkspaceSettingProperties workspaceMetadata={workspaceMetadata} />
      );
  }
};
