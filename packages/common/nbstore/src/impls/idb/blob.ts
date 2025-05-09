import { share } from '../../connection';
import {
  type BlobRecord,
  BlobStorageBase,
  type ListedBlobRecord,
} from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';

export class IndexedDBBlobStorage extends BlobStorageBase {
  static readonly identifier = 'IndexedDBBlobStorage';
  override readonly isReadonly = false;

  readonly connection = share(new IDBConnection(this.options));

  constructor(private readonly options: IDBConnectionOptions) {
    super();
  }

  get db() {
    return this.connection.inner.db;
  }

  override async get(key: string) {
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

  override async set(blob: BlobRecord) {
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite');
    await trx.objectStore('blobs').put({
      key: blob.key,
      mime: blob.mime,
      size: blob.data.byteLength,
      createdAt: new Date(),
      deletedAt: null,
    });
    await trx.objectStore('blobData').put({
      key: blob.key,
      data: blob.data,
    });
  }

  override async delete(key: string, permanently: boolean) {
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
          deletedAt: new Date(),
        });
      }
    }
  }

  override async release() {
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite');

    const it = trx.objectStore('blobs').iterate();

    for await (const item of it) {
      if (item.value.deletedAt) {
        await item.delete();
        await trx.objectStore('blobData').delete(item.value.key);
      }
    }
  }

  override async list() {
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
