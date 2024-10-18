import type { DocStorage as NativeDocStorage } from '@affine/native';

import {
  type DocRecord,
  DocStorage,
  type DocStorageOptions,
  type DocUpdate,
} from '../../storage';

interface SqliteDocStorageOptions extends DocStorageOptions {
  db: NativeDocStorage;
}

export class SqliteDocStorage extends DocStorage<SqliteDocStorageOptions> {
  get name() {
    return 'sqlite';
  }

  get db() {
    return this.options.db;
  }

  constructor(options: SqliteDocStorageOptions) {
    super(options);
  }

  override pushDocUpdates(
    docId: string,
    updates: Uint8Array[]
  ): Promise<number> {
    return this.db.pushUpdates(docId, updates);
  }

  override deleteDoc(docId: string): Promise<void> {
    return this.db.deleteDoc(docId);
  }

  override async deleteSpace(): Promise<void> {
    await this.disconnect();
    // rm this.dbPath
  }

  override async getSpaceDocTimestamps(
    after?: number
  ): Promise<Record<string, number> | null> {
    const clocks = await this.db.getDocClocks(after);

    return clocks.reduce(
      (ret, cur) => {
        ret[cur.docId] = cur.timestamp.getTime();
        return ret;
      },
      {} as Record<string, number>
    );
  }

  protected override async getDocSnapshot(
    docId: string
  ): Promise<DocRecord | null> {
    const snapshot = await this.db.getDocSnapshot(docId);

    if (!snapshot) {
      return null;
    }

    return {
      spaceId: this.spaceId,
      docId,
      bin: snapshot.data,
      timestamp: snapshot.timestamp.getTime(),
    };
  }

  protected override setDocSnapshot(snapshot: DocRecord): Promise<boolean> {
    return this.db.setDocSnapshot({
      docId: snapshot.docId,
      data: Buffer.from(snapshot.bin),
      timestamp: new Date(snapshot.timestamp),
    });
  }

  protected override async getDocUpdates(docId: string): Promise<DocUpdate[]> {
    return this.db.getDocUpdates(docId).then(updates =>
      updates.map(update => ({
        bin: update.data,
        timestamp: update.createdAt.getTime(),
      }))
    );
  }

  protected override markUpdatesMerged(
    docId: string,
    updates: DocUpdate[]
  ): Promise<number> {
    return this.db.markUpdatesMerged(
      docId,
      updates.map(update => new Date(update.timestamp))
    );
  }

  override async listDocHistories() {
    return [];
  }
  override async getDocHistory() {
    return null;
  }

  protected override async createDocHistory(): Promise<boolean> {
    return false;
  }
}
