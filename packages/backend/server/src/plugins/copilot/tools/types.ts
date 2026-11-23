export type { CopilotChatOptions } from '../providers/types';

export type DocumentScope = {
  mode: 'selected';
  allowedDocIds: readonly string[];
};

export function isDocumentInScope(
  scope: DocumentScope | undefined,
  docId: string
) {
  return !scope || scope.allowedDocIds.includes(docId);
}

export type DocSource = {
  type: 'document';
  workspace_id: string;
  doc_id: string;
  title: string;
  revision?: string;
  visibility?: 'page' | 'edgeless' | 'both';
  block_id?: string;
  element_id?: string;
  frame_id?: string;
};

export type ArtifactSource = {
  type: 'artifact';
  workspace_id: string;
  artifact_id: string;
  name?: string;
  mime_type?: string;
  revision?: string;
};
