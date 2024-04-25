import type { WorkspaceMetadata } from './metadata';

export interface WorkspaceOpenOptions {
  metadata: WorkspaceMetadata;
  isSharedMode?: boolean;
}
