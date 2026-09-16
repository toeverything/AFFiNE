import type { LinkPreviewResponseData } from '@blocksuite/affine/shared/services';

export type ShareLinkPreview = LinkPreviewResponseData;

export interface PendingShareItem {
  id: string;
  documentId: string;
  schemaVersion: 2;
  previewRoute?: 'official' | 'deferred';
  importAttemptId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image' | 'pdf';
    url?: string;
    text?: string;
  };
  target?: ShareImportTarget;
  attachments?: { fileName: string; mimeType: string }[];
  lastError?: string;
}

export type ShareInboxEntry =
  | { status: 'ready'; item: PendingShareItem }
  | { status: 'unsupported-version'; id: string; schemaVersion: number };

export interface ShareImportTarget {
  workspaceId: string;
  workspaceFlavour: string;
  tagIds: string[];
  collectionId?: string;
}

export type ShareWorkspaceMode =
  | 'selfHostedPresent'
  | 'cloudOnly'
  | 'signedOut'
  | 'unknown';

export interface ShareInboxProvider {
  updateWorkspaceMode(mode: ShareWorkspaceMode): Promise<void>;
  listPending(): Promise<ShareInboxEntry[]>;
  updateTarget(itemId: string, target: ShareImportTarget): Promise<void>;
  resolveAttachment(itemId: string): Promise<File | undefined>;
  complete(itemId: string, docId: string): Promise<void>;
  setError(itemId: string, error: string): Promise<void>;
}
