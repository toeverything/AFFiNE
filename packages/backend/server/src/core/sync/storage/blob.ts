import { Connection } from './connection';

export interface BlobStorageOptions {}

export interface Blob {
  key: string;
  bin: Uint8Array;
  mimeType: string;
}

export abstract class BlobStorageAdapter extends Connection {
  abstract getBlob(spaceId: string, key: string): Promise<Blob | null>;
  abstract setBlob(spaceId: string, blob: Blob): Promise<string>;
  abstract deleteBlob(spaceId: string, key: string): Promise<boolean>;
  abstract listBlobs(spaceId: string): Promise<Blob>;
}
