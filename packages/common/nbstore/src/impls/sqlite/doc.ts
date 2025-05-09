import { share } from '../../connection';
import {
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteDocStorage extends DocStorageBase<SqliteNativeDBOptions> {
  static readonly identifier = 'SqliteDocStorage';
  override connection = share(new NativeDBConnection(this.options));

  get db() {
    return this.connection.apis;
  }

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    const timestamp = await this.db.pushUpdate(update.docId, update.bin);

    this.emit(
      'update',
      {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
      },
      origin
    );

    return { docId: update.docId, timestamp };
  }

  override async deleteDoc(docId: string) {
    await this.db.deleteDoc(docId);
  }

  override async getDocTimestamps(after?: Date) {
    const clocks = await this.db.getDocClocks(after);

    return clocks.reduce((ret, cur) => {
      ret[cur.docId] = cur.timestamp;
      return ret;
    }, {} as DocClocks);
  }

  override async getDocTimestamp(docId: string) {
    return this.db.getDocClock(docId);
  }

  protected override async getDocSnapshot(docId: string) {
    const snapshot = await this.db.getDocSnapshot(docId);

    if (!snapshot) {
      return null;
    }

    return snapshot;
  }

  protected override async setDocSnapshot(
    snapshot: DocRecord
  ): Promise<boolean> {
    return this.db.setDocSnapshot({
      docId: snapshot.docId,
      bin: snapshot.bin,
      timestamp: snapshot.timestamp,
    });
  }

  protected override async getDocUpdates(docId: string) {
    return this.db.getDocUpdates(docId);
  }

  protected override markUpdatesMerged(docId: string, updates: DocRecord[]) {
    return this.db.markUpdatesMerged(
      docId,
      updates.map(update => update.timestamp)
    );
  }
}
