export interface ClipperInput {
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  attachments: Record<string, Blob>;
  workspace?: 'select-by-user' | 'last-open-workspace';
}

export interface ShareImportInput {
  documentId: string;
  importAttemptId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image' | 'pdf';
    url?: string;
    text?: string;
  };
  attachment?: File;
  tagIds: string[];
  collectionId?: string;
}

export type ShareImportResult =
  | { status: 'imported'; docId: string; warning?: 'destination-not-found' }
  | { status: 'committed-replay'; docId: string }
  | { status: 'import-conflict' }
  | {
      status:
        | 'workspace-not-found'
        | 'permission-denied'
        | 'destination-not-found'
        | 'offline-confirmation-required'
        | 'attachment-missing'
        | 'attachment-too-large'
        | 'attachment-write-failed';
      missingTagIds?: string[];
    };

export interface ShareDestinationOptions {
  verification: 'confirmed' | 'unavailable';
  tags: { id: string; name: string; color: string }[];
  collections: { id: string; name: string }[];
}
