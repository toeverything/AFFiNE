import type { WorkspaceMetadata } from '@toeverything/infra';

export interface WorkspaceSettingDetailProps {
  isOwner: boolean;
  workspaceMetadata: WorkspaceMetadata;
}
