import { SyncStorage, type SyncStorageOptions } from '../../storage';
import type { NativeDocStorage } from './db';

export interface SqliteSyncStorageOptions extends SyncStorageOptions {
  db: NativeDocStorage;
}

export class SqliteDBSyncStorage extends SyncStorage<SqliteSyncStorageOptions> {
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
    const records = await this.db.getPeerClocks(peer);
    return records.reduce(
      (clocks, { docId, timestamp }) => {
        clocks[docId] = timestamp.getTime();
        return clocks;
      },
      {} as Record<string, number>
    );
  }

  override async setPeerClock(peer: string, docId: string, clock: number) {
    await this.db.setPeerClock(peer, docId, new Date(clock));
  }

  override async getPeerPushedClocks(peer: string) {
    const records = await this.db.getPeerPushedClocks(peer);
    return records.reduce(
      (clocks, { docId, timestamp }) => {
        clocks[docId] = timestamp.getTime();
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
    await this.db.setPeerPushedClock(peer, docId, new Date(clock));
  }
}
