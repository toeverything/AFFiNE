import { type DocRecord, DocStorage, type DocUpdate } from '../../storage';
import { type SpaceIDB, SpaceIndexedDbManager } from './db';

export class IndexedDBDocStorage extends DocStorage {
  private db!: SpaceIDB;

  get name() {
    return 'idb';
  }

  override async connect(): Promise<void> {
    this.db = await SpaceIndexedDbManager.open(
      `${this.spaceType}:${this.spaceId}`
    );
  }

  override async disconnect(): Promise<void> {
    this.db.close();
  }

  override async pushDocUpdates(
    docId: string,
    updates: Uint8Array[]
  ): Promise<number> {
    if (!updates.length) {
      return 0;
    }

    const trx = this.db.transaction(['updates', 'clocks'], 'readwrite');

    const timestamp = Date.now();
    await Promise.all(
      updates.map(async (update, i) => {
        await trx.objectStore('updates').add({
          docId,
          bin: update,
          createdAt: timestamp + i,
        });
      })
    );

    await trx
      .objectStore('clocks')
      .put({ docId, timestamp: timestamp + updates.length - 1 });
    trx.commit();

    return updates.length;
  }

  protected override async getDocSnapshot(
    docId: string
  ): Promise<DocRecord | null> {
    const trx = this.db.transaction('snapshots', 'readonly');
    const record = await trx.store.get(docId);
    trx.commit();

    if (!record) {
      return null;
    }

    return {
      spaceId: this.spaceId,
      docId,
      bin: record.bin,
      timestamp: record.updatedAt,
    };
  }

  override async deleteDoc(docId: string): Promise<void> {
    const trx = this.db.transaction(
      ['snapshots', 'updates', 'clocks'],
      'readwrite'
    );

    const idx = trx.objectStore('updates').index('docId');
    const iter = idx.iterate(IDBKeyRange.only(docId));

    for await (const { value } of iter) {
      await trx.objectStore('updates').delete([value.docId, value.createdAt]);
    }

    await trx.objectStore('snapshots').delete(docId);
    await trx.objectStore('clocks').delete(docId);
    trx.commit();
  }

  override async deleteSpace(): Promise<void> {
    for (const name of this.db.objectStoreNames) {
      await this.db.clear(name);
    }
  }

  override async getSpaceDocTimestamps(
    after: number = 0
  ): Promise<Record<string, number>> {
    const trx = this.db.transaction('clocks', 'readonly');
    const record: Record<string, number> = {};

    const iter = trx.store.iterate(IDBKeyRange.lowerBound(after));

    for await (const { value } of iter) {
      record[value.docId] = value.timestamp;
    }

    trx.commit();
    return record;
  }

  protected override async setDocSnapshot(
    snapshot: DocRecord
  ): Promise<boolean> {
    const trx = this.db.transaction('snapshots', 'readwrite');
    const record = await trx.store.get(snapshot.docId);

    if (record && record.updatedAt < snapshot.timestamp) {
      await trx.store.put({
        docId: snapshot.docId,
        bin: snapshot.bin,
        createdAt: record?.createdAt ?? snapshot.timestamp,
        updatedAt: snapshot.timestamp,
      });
    }

    trx.commit();
    return true;
  }

  protected override async getDocUpdates(docId: string): Promise<DocUpdate[]> {
    const trx = this.db.transaction('updates', 'readonly');
    const updates = await trx.store.index('docId').getAll(docId);

    trx.commit();

    return updates.map(update => ({
      bin: update.bin,
      timestamp: update.createdAt,
    }));
  }

  protected override async markUpdatesMerged(
    docId: string,
    updates: DocUpdate[]
  ): Promise<number> {
    const trx = this.db.transaction('updates', 'readwrite');

    await Promise.all(
      updates.map(update => trx.store.delete([docId, update.timestamp]))
    );

    trx.commit();
    return updates.length;
  }

  // history is not supported by idb yet
  override listDocHistories() {
    return Promise.resolve([]);
  }
  override getDocHistory() {
    return Promise.resolve(null);
  }
  override rollbackDoc() {
    return Promise.resolve();
  }
  protected override createDocHistory() {
    return Promise.resolve(false);
  }
}
