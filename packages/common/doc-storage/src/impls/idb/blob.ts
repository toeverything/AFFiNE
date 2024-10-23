import {
  type BlobRecord,
  BlobStorage,
  type BlobStorageOptions,
  type ListedBlobRecord,
} from '../../storage';
import { type SpaceIDB } from './db';

export interface IndexedDBBlobStorageOptions extends BlobStorageOptions {
  db: SpaceIDB;
}

export class IndexedDBBlobStorage extends BlobStorage<IndexedDBBlobStorageOptions> {
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
    const trx = this.db.transaction(['blobs', 'blobData'], 'readonly');
    const blob = await trx.objectStore('blobs').get(key);
    const data = await trx.objectStore('blobData').get(key);

    if (!blob || blob.deletedAt || !data) {
      return null;
    }

    return {
      ...blob,
      data: data.data,
    };
  }

  override async setBlob(blob: BlobRecord): Promise<void> {
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite');
    await trx.objectStore('blobs').put({
      key: blob.key,
      mime: blob.mime,
      size: blob.data.byteLength,
      createdAt: Date.now(),
      deletedAt: null,
    });
    await trx.objectStore('blobData').put({
      key: blob.key,
      data: blob.data,
    });
  }

  override async deleteBlob(key: string, permanently = false): Promise<void> {
    if (permanently) {
      const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite');
      await trx.objectStore('blobs').delete(key);
      await trx.objectStore('blobData').delete(key);
    } else {
      const trx = this.db.transaction('blobs', 'readwrite');
      const blob = await trx.store.get(key);
      if (blob) {
        await trx.store.put({
          ...blob,
          deletedAt: Date.now(),
        });
      }
    }
  }

  override async releaseBlobs(): Promise<void> {
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite');

    const it = trx.objectStore('blobs').iterate();

    for await (const item of it) {
      if (item.value.deletedAt) {
        await item.delete();
        await trx.objectStore('blobData').delete(item.value.key);
      }
    }
  }

  override async listBlobs(): Promise<ListedBlobRecord[]> {
    const trx = this.db.transaction('blobs', 'readonly');
    const it = trx.store.iterate();

    const blobs: ListedBlobRecord[] = [];
    for await (const item of it) {
      if (!item.value.deletedAt) {
        blobs.push(item.value);
      }
    }

    return blobs;
  }
}
