import type { ShareLinkPreview } from '../../../modules/import-clipper';

export type { ShareLinkPreview };

export interface PendingShareItem {
  id: string;
  documentId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image';
    url?: string;
    text?: string;
  };
  previewRoute?: 'official' | 'deferred';
  target?: ShareImportTarget;
  attachments?: { fileName: string; mimeType: string }[];
  lastError?: string;
}

export interface ShareImportTarget {
  workspaceId: string;
  workspaceFlavour: string;
  tagIds: string[];
  collectionId?: string;
}

export interface ShareInboxProvider {
  updateWorkspaceMode(
    mode: 'selfHostedPresent' | 'cloudOnly' | 'signedOut' | 'unknown'
  ): Promise<void>;
  listPending(): Promise<PendingShareItem[]>;
  updateTarget(itemId: string, target: ShareImportTarget): Promise<void>;
  resolveAttachment(itemId: string): Promise<string | undefined>;
  complete(itemId: string, docId: string): Promise<void>;
  setError(itemId: string, error: string): Promise<void>;
}
