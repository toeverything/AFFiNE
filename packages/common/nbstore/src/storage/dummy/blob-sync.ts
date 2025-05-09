import { type Connection, DummyConnection } from '../../connection';
import type { BlobSyncStorage } from '../blob-sync';

export class DummyBlobSyncStorage implements BlobSyncStorage {
  storageType = 'blobSync' as const;
  connection: Connection<any> = new DummyConnection();

  setBlobUploadedAt(): Promise<void> {
    return Promise.resolve();
  }
  getBlobUploadedAt(): Promise<Date | null> {
    return Promise.resolve(new Date());
  }
}
