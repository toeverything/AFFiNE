import type { Connection } from '../connection';
import type { Storage } from './storage';

export interface BlobSyncStorage extends Storage {
  readonly storageType: 'blobSync';

  setBlobUploadedAt(
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ): Promise<void>;

  getBlobUploadedAt(peer: string, blobId: string): Promise<Date | null>;
}

export abstract class BlobSyncStorageBase implements BlobSyncStorage {
  readonly storageType = 'blobSync';
  abstract readonly connection: Connection;

  abstract setBlobUploadedAt(
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ): Promise<void>;

  abstract getBlobUploadedAt(
    peer: string,
    blobId: string
  ): Promise<Date | null>;
}
