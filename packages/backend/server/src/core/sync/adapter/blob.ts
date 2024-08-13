import { Connection } from './connection';

export interface WorkspaceBlobStorageOptions {}

export interface Blob {
  key: string;
  bin: Uint8Array;
  mimeType: string;
}

export abstract class WorkspaceBlobStorageAdapter extends Connection {
  abstract getBlob(workspaceId: string, key: string): Promise<Blob | null>;
  abstract setBlob(workspaceId: string, blob: Blob): Promise<string>;
  abstract deleteBlob(workspaceId: string, key: string): Promise<boolean>;
  abstract listBlobs(workspaceId: string): Promise<Blob>;
}
