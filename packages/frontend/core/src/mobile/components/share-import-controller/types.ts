export interface ShareLinkPreview {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  favicons?: string[];
  mediaType?: string;
  provider?: string;
  author?: { name: string; handle?: string; avatar?: string };
  publishedAt?: string;
  durationSeconds?: number;
  transcript?: {
    language?: string;
    segments: {
      text: string;
      startSeconds?: number;
      durationSeconds?: number;
      speaker?: string;
    }[];
    chapters?: { title: string; startSeconds: number }[];
    truncated?: boolean;
  };
}

export interface PendingShareItem {
  id: string;
  documentId: string;
  schemaVersion: 2;
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

export interface ShareInboxProvider {
  listPending(): Promise<ShareInboxEntry[]>;
  updateTarget(itemId: string, target: ShareImportTarget): Promise<void>;
  resolveAttachment(itemId: string): Promise<File | undefined>;
  complete(itemId: string, docId: string): Promise<void>;
  setError(itemId: string, error: string): Promise<void>;
}
