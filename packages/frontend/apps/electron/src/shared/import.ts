export type NativeImportFormat =
  | 'markdownZip'
  | 'notionZip'
  | 'obsidian'
  | 'bearZip';

export type NativeImportBrowserSource =
  | { kind: 'file'; file: File }
  | { kind: 'directory'; files: File[] };

export type CreateImportSessionFromSourceOptions = {
  format: NativeImportFormat;
  source: NativeImportBrowserSource;
  batchLimits?: {
    maxDocs?: number;
    maxBlobs?: number;
    maxBlobBytes?: number;
  };
};

export type NativeImportSessionHandlers = {
  createImportSession(
    options: CreateImportSessionFromSourceOptions
  ): Promise<string> | string;
  nextImportBatch(sessionId: string): Promise<string | null> | string | null;
  cancelImportSession(sessionId: string): Promise<void> | void;
  disposeImportSession(sessionId: string): Promise<void> | void;
};
