import type { DocStorage as NativeDocStorage } from '@affine/native';

import {
  type BlobRecord,
  BlobStorage,
  type BlobStorageOptions,
  type ListedBlobRecord,
} from '../../storage';

interface SqliteBlobStorageOptions extends BlobStorageOptions {
  db: NativeDocStorage;
}

export class SqliteBlobStorage extends BlobStorage<SqliteBlobStorageOptions> {
  get db() {
    return this.options.db;
  }

  protected override doConnect(): Promise<void> {
    return Promise.resolve();
  }
  protected override doDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  override async getBlob(key: string): Promise<BlobRecord | null> {
    const blob = await this.db.getBlob(key);

    if (!blob) {
      return null;
    }

    return {
      ...blob,
      data: blob.data.buffer,
      createdAt: blob.createdAt.getTime(),
    };
  }
  override setBlob(blob: BlobRecord): Promise<void> {
    return this.db.setBlob({
      ...blob,
      data: Buffer.from(blob.data),
    });
  }
  override deleteBlob(key: string, permanently: boolean): Promise<void> {
    return this.db.deleteBlob(key, permanently);
  }
  override releaseBlobs(): Promise<void> {
    return this.db.releaseBlobs();
  }

  override async listBlobs(): Promise<ListedBlobRecord[]> {
    const blobs = await this.db.listBlobs();

    return blobs.map(blob => ({
      ...blob,
      createdAt: blob.createdAt.getTime(),
    }));
  }
}
