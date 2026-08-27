export interface PendingShareItem {
  id: string;
  documentId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image';
    url?: string;
    text?: string;
  };
  target?: ShareImportTarget;
  previewText?: string;
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
  listPending(): Promise<PendingShareItem[]>;
  updateTarget(itemId: string, target: ShareImportTarget): Promise<void>;
  resolveAttachment(itemId: string): Promise<string | undefined>;
  complete(itemId: string, docId: string): Promise<void>;
  setError(itemId: string, error: string): Promise<void>;
}
