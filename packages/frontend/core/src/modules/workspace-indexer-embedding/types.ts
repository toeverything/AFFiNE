export interface PersistedAttachmentFile {
  artifactId: string;
  fileName: string;
  mediaType: string;
  size: number;
  createdAt: string;
  status: 'processing' | 'ready' | 'failed';
}

export interface LocalAttachmentFile {
  localId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: number;
  status: 'uploading' | 'error';
}

export interface UploadingAttachmentFile extends LocalAttachmentFile {
  status: 'uploading';
}

export interface ErrorAttachmentFile extends LocalAttachmentFile {
  status: 'error';
  errorMessage: string;
}

export type AttachmentFile = PersistedAttachmentFile | LocalAttachmentFile;

export interface IgnoredDoc {
  docId: string;
  createdAt: string;
}
