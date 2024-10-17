import { type Blob, BlobStorage, type ListedBlob } from '../../storage';
import { type SpaceIDB, SpaceIndexedDbManager } from './db';

export class IndexedDBBlobStorage extends BlobStorage {
  private db!: SpaceIDB;

  override async connect(): Promise<void> {
    this.db = await SpaceIndexedDbManager.open(
      `${this.spaceType}:${this.spaceId}`
    );
  }

  override async getBlob(key: string): Promise<Blob | null> {
    const trx = this.db.transaction('blobs', 'readonly');
    const blob = await trx.store.get(key);

    if (!blob || blob.deletedAt) {
      return null;
    }

    return blob;
  }

  override async setBlob(blob: Blob): Promise<void> {
    const trx = this.db.transaction('blobs', 'readwrite');
    await trx.store.put({
      ...blob,
      size: blob.data.length,
      createdAt: new Date(),
      deletedAt: null,
    });
  }

  override async deleteBlob(key: string, permanently = false): Promise<void> {
    const trx = this.db.transaction('blobs', 'readwrite');
    if (permanently) {
      await trx.store.delete(key);
    } else {
      const blob = await trx.store.get(key);
      if (blob) {
        await trx.store.put({
          ...blob,
          deletedAt: new Date(),
        });
      }
    }
  }

  override async releaseBlobs(): Promise<void> {
    const trx = this.db.transaction('blobs', 'readwrite');

    const it = trx.store.iterate();

    for await (const item of it) {
      if (item.value.deletedAt) {
        await item.delete();
      }
    }
  }

  override async listBlobs(): Promise<ListedBlob[]> {
    const trx = this.db.transaction('blobs', 'readonly');
    const it = trx.store.iterate();

    const blobs: ListedBlob[] = [];
    for await (const item of it) {
      if (!item.value.deletedAt) {
        blobs.push({ key: item.value.key, size: item.value.size });
      }
    }

    return blobs;
  }
}
