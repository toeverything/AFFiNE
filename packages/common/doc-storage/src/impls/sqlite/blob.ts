import type { DocStorage as NativeDocStorage } from '@affine/native';

import {
  type Blob,
  BlobStorage,
  type BlobStorageOptions,
  type ListedBlob,
} from '../../storage';

interface SqliteBlobStorageOptions extends BlobStorageOptions {
  db: NativeDocStorage;
}

export class SqliteBlobStorage extends BlobStorage<SqliteBlobStorageOptions> {
  get db() {
    return this.options.db;
  }

  override getBlob(key: string): Promise<Blob | null> {
    return this.db.getBlob(key);
  }
  override setBlob(blob: Blob): Promise<void> {
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
  override listBlobs(): Promise<ListedBlob[]> {
    return this.db.listBlobs();
  }
}
