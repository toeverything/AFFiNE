import { SyncStorage, type SyncStorageOptions } from '../../storage';
import type { SpaceIDB } from './db';

export interface IndexedDBSyncStorageOptions extends SyncStorageOptions {
  db: SpaceIDB;
}

export class IndexedDBSyncStorage extends SyncStorage<IndexedDBSyncStorageOptions> {
  get db() {
    return this.options.db;
  }

  protected override doConnect(): Promise<void> {
    return Promise.resolve();
  }

  protected override doDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  override async getPeerClocks(peer: string) {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const records = await trx.store.index('peer').getAll(peer);

    return records.reduce(
      (clocks, { docId, clock }) => {
        clocks[docId] = clock;
        return clocks;
      },
      {} as Record<string, number>
    );
  }

  override async setPeerClock(peer: string, docId: string, clock: number) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, docId]);

    await trx.store.put({
      peer,
      docId,
      clock: Math.max(record?.clock ?? 0, clock),
      pushedClock: record?.pushedClock ?? 0,
    });
  }

  override async getPeerPushedClocks(peer: string) {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const records = await trx.store.index('peer').getAll(peer);

    return records.reduce(
      (clocks, { docId, pushedClock }) => {
        clocks[docId] = pushedClock;
        return clocks;
      },
      {} as Record<string, number>
    );
  }

  override async setPeerPushedClock(
    peer: string,
    docId: string,
    clock: number
  ) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, docId]);

    await trx.store.put({
      peer,
      docId,
      clock: record?.clock ?? 0,
      pushedClock: Math.max(record?.pushedClock ?? 0, clock),
    });
  }
}
