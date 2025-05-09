import { share } from '../../connection';
import { BlobSyncStorageBase } from '../../storage';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteBlobSyncStorage extends BlobSyncStorageBase {
  static readonly identifier = 'SqliteBlobSyncStorage';

  override connection = share(new NativeDBConnection(this.options));

  constructor(private readonly options: SqliteNativeDBOptions) {
    super();
  }

  get db() {
    return this.connection.apis;
  }

  override async setBlobUploadedAt(
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ): Promise<void> {
    await this.db.setBlobUploadedAt(peer, blobId, uploadedAt);
  }

  override async getBlobUploadedAt(
    peer: string,
    blobId: string
  ): Promise<Date | null> {
    return this.db.getBlobUploadedAt(peer, blobId);
  }
}
