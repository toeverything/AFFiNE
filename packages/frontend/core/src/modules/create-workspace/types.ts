import type { WorkspaceMetadata } from '@toeverything/infra';

export type CreateWorkspaceMode = 'add' | 'new';
export type CreateWorkspaceCallbackPayload = {
  meta: WorkspaceMetadata;
  defaultDocId?: string;
};
