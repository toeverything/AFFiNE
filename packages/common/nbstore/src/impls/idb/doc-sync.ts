import { share } from '../../connection';
import {
  type DocClock,
  type DocClocks,
  DocSyncStorageBase,
} from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';

export class IndexedDBDocSyncStorage extends DocSyncStorageBase {
  static readonly identifier = 'IndexedDBDocSyncStorage';

  constructor(private readonly options: IDBConnectionOptions) {
    super();
  }

  readonly connection = share(new IDBConnection(this.options));

  get db() {
    return this.connection.inner.db;
  }

  override async getPeerRemoteClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null> {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const record = await trx.store.get([peer, docId]);

    return record
      ? {
          docId: record.docId,
          timestamp: record.clock,
        }
      : null;
  }
  override async getPeerRemoteClocks(peer: string) {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const records = await trx.store.index('peer').getAll(peer);

    return records.reduce((clocks, { docId, clock }) => {
      clocks[docId] = clock;
      return clocks;
    }, {} as DocClocks);
  }

  override async setPeerRemoteClock(peer: string, clock: DocClock) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, clock.docId]);

    if (!record || record.clock < clock.timestamp) {
      await trx.store.put({
        peer,
        docId: clock.docId,
        clock: clock.timestamp,
        pulledClock: record?.pulledClock ?? new Date(0),
        pushedClock: record?.pushedClock ?? new Date(0),
      });
    }
  }

  override async getPeerPulledRemoteClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null> {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const record = await trx.store.get([peer, docId]);

    return record
      ? {
          docId: record.docId,
          timestamp: record.pulledClock,
        }
      : null;
  }
  override async getPeerPulledRemoteClocks(peer: string) {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const records = await trx.store.index('peer').getAll(peer);

    return records.reduce((clocks, { docId, pulledClock }) => {
      clocks[docId] = pulledClock;
      return clocks;
    }, {} as DocClocks);
  }
  override async setPeerPulledRemoteClock(peer: string, clock: DocClock) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, clock.docId]);

    if (!record || record.pulledClock < clock.timestamp) {
      await trx.store.put({
        peer,
        docId: clock.docId,
        clock: record?.clock ?? new Date(0),
        pulledClock: clock.timestamp,
        pushedClock: record?.pushedClock ?? new Date(0),
      });
    }
  }

  override async getPeerPushedClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null> {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const record = await trx.store.get([peer, docId]);

    return record
      ? {
          docId: record.docId,
          timestamp: record.pushedClock,
        }
      : null;
  }
  override async getPeerPushedClocks(peer: string) {
    const trx = this.db.transaction('peerClocks', 'readonly');

    const records = await trx.store.index('peer').getAll(peer);

    return records.reduce((clocks, { docId, pushedClock }) => {
      clocks[docId] = pushedClock;
      return clocks;
    }, {} as DocClocks);
  }

  override async setPeerPushedClock(peer: string, clock: DocClock) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, clock.docId]);

    if (!record || record.pushedClock < clock.timestamp) {
      await trx.store.put({
        peer,
        docId: clock.docId,
        clock: record?.clock ?? new Date(0),
        pushedClock: clock.timestamp,
        pulledClock: record?.pulledClock ?? new Date(0),
      });
    }
  }

  override async clearClocks() {
    const trx = this.db.transaction('peerClocks', 'readwrite');

    await trx.store.clear();
  }
}
