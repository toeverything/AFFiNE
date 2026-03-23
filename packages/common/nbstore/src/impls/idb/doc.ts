import { share } from '../../connection';
import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { IDBConnection, type IDBConnectionOptions } from './db';
import { IndexedDBLocker } from './lock';

interface ChannelMessage {
  type: 'update';
  update: DocRecord;
  origin?: string;
}

export class IndexedDBDocStorage extends DocStorageBase<IDBConnectionOptions> {
  static readonly identifier = 'IndexedDBDocStorage';

  readonly connection = share(new IDBConnection(this.options));

  get db() {
    return this.connection.inner.db;
  }

  get channel() {
    return this.connection.inner.channel;
  }

  override locker = new IndexedDBLocker(this.connection);

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    let timestamp = new Date();

    let retry = 0;

    while (true) {
      try {
        const trx = this.db.transaction(['updates', 'clocks'], 'readwrite');

        await trx.objectStore('updates').add({
          ...update,
          createdAt: timestamp,
        });

        await trx.objectStore('clocks').put({ docId: update.docId, timestamp });

        trx.commit();
      } catch (e) {
        if (e instanceof Error && e.name === 'ConstraintError') {
          retry++;
          if (retry < 10) {
            timestamp = new Date(timestamp.getTime() + 1);
            continue;
          }
        }
        throw e;
      }
      break;
    }

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

    this.channel.postMessage({
      type: 'update',
      update: {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
      },
      origin,
    } satisfies ChannelMessage);

    return { docId: update.docId, timestamp };
  }

  protected override async getDocSnapshot(docId: string) {
    const trx = this.db.transaction('snapshots', 'readonly');
    const record = await trx.store.get(docId);

    if (!record) {
      return null;
    }

    return {
      docId,
      bin: record.bin,
      timestamp: record.updatedAt,
    };
  }

  override async deleteDoc(docId: string) {
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

  protected override async setDocSnapshot(
    snapshot: DocRecord
  ): Promise<boolean> {
    const trx = this.db.transaction('snapshots', 'readwrite');
    const record = await trx.store.get(snapshot.docId);

    if (!record || record.updatedAt < snapshot.timestamp) {
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

  protected override async getDocUpdates(docId: string): Promise<DocRecord[]> {
    const trx = this.db.transaction('updates', 'readonly');
    const updates = await trx.store.index('docId').getAll(docId);

    return updates.map(update => ({
      docId,
      bin: update.bin,
      timestamp: update.createdAt,
    }));
  }

  protected override async markUpdatesMerged(
    docId: string,
    updates: DocRecord[]
  ): Promise<number> {
    const trx = this.db.transaction('updates', 'readwrite');

    await Promise.all(
      updates.map(update => trx.store.delete([docId, update.timestamp]))
    );

    trx.commit();
    return updates.length;
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
    if (event.data.type === 'update') {
      this.emit('update', event.data.update, event.data.origin);
    }
  };
}
