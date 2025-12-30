import { share } from '../../connection';
import {
  type DocIndexedClock,
  IndexerSyncStorageBase,
} from '../../storage/indexer-sync';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteIndexerSyncStorage extends IndexerSyncStorageBase {
  static readonly identifier = 'SqliteIndexerSyncStorage';

  override connection = share(new NativeDBConnection(this.options));

  constructor(private readonly options: SqliteNativeDBOptions) {
    super();
  }

  private get db() {
    return this.connection.apis;
  }

  override async getDocIndexedClock(
    docId: string
  ): Promise<DocIndexedClock | null> {
    return this.db.getDocIndexedClock(docId);
  }

  override async setDocIndexedClock(clock: DocIndexedClock): Promise<void> {
    await this.db.setDocIndexedClock(
      clock.docId,
      clock.timestamp,
      clock.indexerVersion
    );
  }

  override async clearDocIndexedClock(docId: string): Promise<void> {
    await this.db.clearDocIndexedClock(docId);
  }
}
