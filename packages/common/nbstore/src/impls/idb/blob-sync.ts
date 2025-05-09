import { share } from '../../connection';
import { BlobSyncStorageBase } from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';

export class IndexedDBBlobSyncStorage extends BlobSyncStorageBase {
  static readonly identifier = 'IndexedDBBlobSyncStorage';

  readonly connection = share(new IDBConnection(this.options));

  constructor(private readonly options: IDBConnectionOptions) {
    super();
  }

  get db() {
    return this.connection;
  }

  async setBlobUploadedAt(
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ): Promise<void> {
    const trx = this.db.inner.db.transaction('blobSync', 'readwrite');
    await trx.store.put({
      peer,
      key: blobId,
      uploadedAt,
    });
  }

  async getBlobUploadedAt(peer: string, blobId: string): Promise<Date | null> {
    const trx = this.db.inner.db.transaction('blobSync', 'readonly');
    const record = await trx.store.get([peer, blobId]);
    return record?.uploadedAt ?? null;
  }
}
