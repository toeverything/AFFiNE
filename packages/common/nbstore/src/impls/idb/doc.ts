import { isEqual } from 'lodash-es';

import { share } from '../../connection';
import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';
import { createPeerClock } from './schema';

type ChannelMessage =
  | { type: 'delete'; docId: string }
  | {
      type: 'update';
      update: DocRecord;
      origin?: string;
    };

export class IndexedDBDocStorage extends DocStorageBase<IDBConnectionOptions> {
  static readonly identifier = 'IndexedDBDocStorage';

  readonly connection = share(new IDBConnection(this.options));

  get db() {
    return this.connection.inner.db;
  }

  get channel() {
    return this.connection.inner.channel;
  }

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    const createForPeer =
      update.createForPeer ??
      (update.intent === 'create' ? this.options.creationPeer : undefined);
    const trx = this.db.transaction(
      ['updates', 'clocks', 'peerClocks'],
      'readwrite'
    );
    let timestamp: Date;
    try {
      const previous = await trx.objectStore('clocks').get(update.docId);
      timestamp = new Date(
        Math.max(Date.now(), (previous?.timestamp.getTime() ?? 0) + 1)
      );
      await trx.objectStore('updates').add({
        ...update,
        createdAt: timestamp,
      });
      await trx.objectStore('clocks').put({ docId: update.docId, timestamp });
      if (createForPeer) {
        const peers = trx.objectStore('peerClocks');
        const record =
          (await peers.get([createForPeer, update.docId])) ??
          createPeerClock(createForPeer, update.docId);
        await peers.put({ ...record, pendingCreate: true });
        const root =
          (await peers.get([createForPeer, this.spaceId])) ??
          createPeerClock(createForPeer, this.spaceId);
        await peers.put({ ...root, cacheToken: (root.cacheToken ?? 0) + 1 });
      }
      trx.commit();
      await trx.done;
    } catch (error) {
      await trx.done.catch(() => {});
      throw error;
    }

    this.emit(
      'update',
      {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
        createForPeer: createForPeer,
      },
      origin
    );

    this.channel.postMessage({
      type: 'update',
      update: {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
        createForPeer: createForPeer,
      },
      origin,
    } satisfies ChannelMessage);

    return { docId: update.docId, timestamp };
  }

  override async getDoc(docId: string): Promise<DocRecord | null> {
    const read = this.db.transaction(['snapshots', 'updates'], 'readonly');
    const [snapshot, updates] = await Promise.all([
      read.objectStore('snapshots').get(docId),
      read.objectStore('updates').index('docId').getAll(docId),
    ]);
    await read.done;
    if (updates.length === 0) {
      return snapshot
        ? { docId, bin: snapshot.bin, timestamp: snapshot.updatedAt }
        : null;
    }

    const sources = [
      ...(snapshot ? [snapshot.bin] : []),
      ...updates.map(update => update.bin),
    ];
    const record = {
      docId,
      bin: sources.length === 1 ? sources[0] : await this.mergeUpdates(sources),
      timestamp: new Date(
        Math.max(
          snapshot?.updatedAt.getTime() ?? 0,
          updates[updates.length - 1].createdAt.getTime()
        )
      ),
    };
    if (this.isReadonly) return record;

    const write = this.db.transaction(['snapshots', 'updates'], 'readwrite');
    const [currentSnapshot, currentUpdates] = await Promise.all([
      write.objectStore('snapshots').get(docId),
      Promise.all(
        updates.map(update =>
          write.objectStore('updates').get([docId, update.createdAt])
        )
      ),
    ]);
    if (
      currentSnapshot?.updatedAt.getTime() === snapshot?.updatedAt.getTime() &&
      isEqual(currentSnapshot?.bin, snapshot?.bin) &&
      updates.every((update, index) =>
        isEqual(currentUpdates[index]?.bin, update.bin)
      )
    ) {
      await write.objectStore('snapshots').put({
        docId,
        bin: record.bin,
        createdAt: currentSnapshot?.createdAt ?? record.timestamp,
        updatedAt: record.timestamp,
      });
      await Promise.all(
        updates.map(update =>
          write.objectStore('updates').delete([docId, update.createdAt])
        )
      );
    }
    await write.done;
    // A concurrent mutation can prevent compaction without invalidating the captured read.
    return record;
  }

  override async deleteDoc(docId: string) {
    const trx = this.db.transaction(
      ['snapshots', 'updates', 'clocks', 'peerClocks'],
      'readwrite'
    );

    const idx = trx.objectStore('updates').index('docId');
    const iter = idx.iterate(IDBKeyRange.only(docId));

    for await (const { value } of iter) {
      await trx.objectStore('updates').delete([value.docId, value.createdAt]);
    }

    await trx.objectStore('snapshots').delete(docId);
    await trx.objectStore('clocks').delete(docId);
    const peers = trx.objectStore('peerClocks');
    for (const record of await peers.getAll()) {
      if (record.docId !== docId || !record.pendingCreate) continue;
      await peers.put({ ...record, pendingCreate: false });
      const root =
        (await peers.get([record.peer, this.spaceId])) ??
        createPeerClock(record.peer, this.spaceId);
      await peers.put({ ...root, cacheToken: (root.cacheToken ?? 0) + 1 });
    }
    await trx.done;
    this.emit('delete', docId);
    this.channel.postMessage({
      type: 'delete',
      docId,
    } satisfies ChannelMessage);
  }

  override async getDocTimestamps(after: Date = new Date(0)) {
    const trx = this.db.transaction('clocks', 'readonly');

    const clocks = await trx.store.getAll();

    return clocks.reduce((ret, cur) => {
      if (cur.timestamp > after) {
        ret[cur.docId] = cur.timestamp;
      }
      return ret;
    }, {} as DocClocks);
  }

  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const trx = this.db.transaction('clocks', 'readonly');

    return (await trx.store.get(docId)) ?? null;
  }

  private docUpdateListener = 0;

  override subscribeDocUpdate(
    callback: (update: DocRecord, origin?: string) => void
  ): () => void {
    if (this.docUpdateListener === 0) {
      this.channel.addEventListener('message', this.handleChannelMessage);
    }
    this.docUpdateListener++;

    const dispose = super.subscribeDocUpdate(callback);

    return () => {
      dispose();
      this.docUpdateListener--;
      if (this.docUpdateListener === 0) {
        this.channel.removeEventListener('message', this.handleChannelMessage);
      }
    };
  }

  handleChannelMessage = (event: MessageEvent<ChannelMessage>) => {
    if (event.data.type === 'delete') {
      this.emit('delete', event.data.docId);
    } else if (event.data.type === 'update') {
      this.emit('update', event.data.update, event.data.origin);
    }
  };
}
