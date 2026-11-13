import { share } from '../../connection';
import {
  type DocClock,
  type DocClocks,
  DocSyncStorageBase,
  type PeerWorkspaceState,
  type WorkspaceState,
} from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';
import { createPeerClock } from './schema';

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
        ...record,
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
        ...record,
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
        ...record,
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

    for (const record of await trx.store.getAll()) {
      if (
        !record.inventoryKind &&
        !record.pendingCreate &&
        !record.inventoryReady &&
        !record.cacheToken
      ) {
        await trx.store.delete([record.peer, record.docId]);
      } else {
        await trx.store.put({
          ...record,
          clock: record.inventoryKind ? record.clock : new Date(0),
          pulledClock: new Date(0),
          pushedClock: new Date(0),
          cacheToken: (record.cacheToken ?? 0) + 1,
        });
      }
    }
    await trx.done;
  }
  override async getPeerWorkspaceState(
    peer: string,
    rootDocId: string
  ): Promise<PeerWorkspaceState> {
    const trx = this.db.transaction('peerClocks', 'readonly');
    const records = await trx.store.index('peer').getAll(peer);
    const root = records.find(record => record.docId === rootDocId);
    return {
      cacheToken: root?.cacheToken ?? 0,
      ready: root?.inventoryReady ?? false,
      docs: records
        .filter(
          record => record.inventoryKind === 'doc' || record.pendingCreate
        )
        .map(record => ({
          docId: record.docId,
          timestamp: record.clock.getTime(),
          lifecycle: record.lifecycle ?? null,
          lifecycleChangedAt: record.lifecycleChangedAt ?? null,
          pendingCreate: record.pendingCreate ?? false,
        })),
      clocks: Object.fromEntries(
        records
          .filter(record => record.inventoryKind === 'reserved')
          .map(record => [record.docId, record.clock.getTime()])
      ),
    };
  }

  override async invalidatePeerWorkspaceState(peer: string, rootDocId: string) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const root =
      (await trx.store.get([peer, rootDocId])) ??
      createPeerClock(peer, rootDocId);
    await trx.store.put({ ...root, cacheToken: (root.cacheToken ?? 0) + 1 });
    await trx.done;
  }

  override async installPeerWorkspaceState(
    peer: string,
    rootDocId: string,
    cacheToken: number,
    state: WorkspaceState
  ) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const root =
      (await trx.store.get([peer, rootDocId])) ??
      createPeerClock(peer, rootDocId);
    if ((root.cacheToken ?? 0) !== cacheToken) return false;
    const records = await trx.store.index('peer').getAll(peer);
    const previous = new Map(records.map(record => [record.docId, record]));
    for (const record of records) {
      await trx.store.put({
        ...record,
        inventoryKind: undefined,
        lifecycle: null,
        lifecycleChangedAt: null,
      });
    }
    for (const [docId, timestamp] of Object.entries(state.clocks)) {
      await trx.store.put({
        ...(previous.get(docId) ?? createPeerClock(peer, docId)),
        inventoryKind: 'reserved',
        clock: new Date(
          Math.max(timestamp, previous.get(docId)?.clock.getTime() ?? 0)
        ),
      });
    }
    for (const doc of state.docs) {
      await trx.store.put({
        ...(previous.get(doc.docId) ?? createPeerClock(peer, doc.docId)),
        inventoryKind: 'doc',
        clock: new Date(
          Math.max(doc.timestamp, previous.get(doc.docId)?.clock.getTime() ?? 0)
        ),
        lifecycle: doc.lifecycle,
        lifecycleChangedAt: doc.lifecycleChangedAt,
      });
    }
    const installedRoot = (await trx.store.get([peer, rootDocId])) ?? root;
    await trx.store.put({
      ...installedRoot,
      inventoryReady: true,
      cacheToken: cacheToken + 1,
    });
    await trx.done;
    return true;
  }

  override async confirmPeerDocCreate(peer: string, docId: string) {
    const trx = this.db.transaction('peerClocks', 'readwrite');
    const record = await trx.store.get([peer, docId]);
    if (record?.pendingCreate) {
      await trx.store.put({ ...record, pendingCreate: false });
      const root =
        (await trx.store.get([peer, this.options.id])) ??
        createPeerClock(peer, this.options.id);
      await trx.store.put({ ...root, cacheToken: (root.cacheToken ?? 0) + 1 });
    }
    await trx.done;
  }
}
