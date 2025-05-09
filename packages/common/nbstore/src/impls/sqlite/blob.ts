import { share } from '../../connection';
import { type BlobRecord, BlobStorageBase } from '../../storage';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteBlobStorage extends BlobStorageBase {
  static readonly identifier = 'SqliteBlobStorage';
  override readonly isReadonly = false;

  override connection = share(new NativeDBConnection(this.options));

  constructor(private readonly options: SqliteNativeDBOptions) {
    super();
  }

  get db() {
    return this.connection.apis;
  }

  override async get(key: string) {
    return this.db.getBlob(key);
  }

  override async set(blob: BlobRecord) {
    await this.db.setBlob(blob);
  }

  override async delete(key: string, permanently: boolean) {
    await this.db.deleteBlob(key, permanently);
  }

  override async release() {
    await this.db.releaseBlobs();
  }

  override async list() {
    return this.db.listBlobs();
  }
}
