import { share } from '../../../connection';
import { BlobStorageBase, type ListedBlobRecord } from '../../../storage';
import { BlobIDBConnection, type BlobIDBConnectionOptions } from './db';

/**
 * @deprecated readonly
 */
export class IndexedDBV1BlobStorage extends BlobStorageBase {
  static readonly identifier = 'IndexedDBV1BlobStorage';
  override readonly isReadonly = true;

  constructor(private readonly options: BlobIDBConnectionOptions) {
    super();
  }

  readonly connection = share(new BlobIDBConnection(this.options));

  get db() {
    return this.connection.inner;
  }

  override async get(key: string) {
    if (!this.db) {
      return null;
    }
    const trx = this.db.transaction('blob', 'readonly');
    const blob = await trx.store.get(key);
    if (!blob) {
      return null;
    }

    return {
      key,
      mime: '',
      createdAt: new Date(),
      data: new Uint8Array(blob),
    };
  }

  override async delete(key: string, permanently: boolean) {
    if (!this.db) {
      return;
    }
    if (permanently) {
      const trx = this.db.transaction('blob', 'readwrite');
      await trx.store.delete(key);
    }
  }

  override async list() {
    if (!this.db) {
      return [];
    }
    const trx = this.db.transaction('blob', 'readonly');
    const it = trx.store.iterate();

    const records: ListedBlobRecord[] = [];

    for await (const { key, value } of it) {
      records.push({
        key,
        mime: '',
        size: value.byteLength,
        createdAt: new Date(),
      });
    }

    return records;
  }

  override async set() {
    // no more writes
  }

  override async release() {
    // no more writes
  }
}
