import type { ShareLinkPreview } from '../../../modules/import-clipper';

export type { ShareLinkPreview };

export interface PendingShareItem {
  id: string;
  documentId: string;
  schemaVersion: 2;
  importAttemptId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image';
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

export interface ShareInboxProvider {
  updateWorkspaceMode(
    mode: 'selfHostedPresent' | 'cloudOnly' | 'signedOut' | 'unknown'
  ): Promise<void>;
  listPending(): Promise<ShareInboxEntry[]>;
  updateTarget(itemId: string, target: ShareImportTarget): Promise<void>;
  resolveAttachment(itemId: string): Promise<string | undefined>;
  complete(itemId: string, docId: string): Promise<void>;
  setError(itemId: string, error: string): Promise<void>;
}
