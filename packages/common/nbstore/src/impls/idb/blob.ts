import { share } from '../../connection';
import { type BlobRecord, BlobStorageBase } from '../../storage';
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
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite', {
      durability: 'relaxed',
    });
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
      const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite', {
        durability: 'relaxed',
      });
      await trx.objectStore('blobs').delete(key);
      await trx.objectStore('blobData').delete(key);
    } else {
      const trx = this.db.transaction('blobs', 'readwrite', {
        durability: 'relaxed',
      });
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
    const trx = this.db.transaction(['blobs', 'blobData'], 'readwrite', {
      durability: 'relaxed',
    });

    const store = trx.objectStore('blobs');
    const getAllRecords = store.getAllRecords?.bind(store);
    const blobs =
      typeof getAllRecords === 'function'
        ? (await getAllRecords()).map(record => record.value)
        : await store.getAll();

    const deleted = blobs.filter(blob => blob.deletedAt);

    await Promise.all(
      deleted.map(blob =>
        Promise.all([
          store.delete(blob.key),
          trx.objectStore('blobData').delete(blob.key),
        ])
      )
    );
  }

  override async list() {
    const trx = this.db.transaction('blobs', 'readonly');
    const getAllRecords = trx.store.getAllRecords?.bind(trx.store);
    const blobs =
      typeof getAllRecords === 'function'
        ? (await getAllRecords()).map(record => record.value)
        : await trx.store.getAll();

    return blobs.filter(blob => !blob.deletedAt);
  }
}
