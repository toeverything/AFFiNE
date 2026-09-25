import { noop } from 'lodash-es';
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

import {
  type DocRecord,
  type DocStorageOptions,
  SnapshotDocStorageBase,
} from './doc';

export interface HistoryFilter {
  before?: Date;
  limit?: Date;
}

export interface ListedHistory {
  userId: string | null;
  timestamp: Date;
}

export abstract class HistoricalDocStorage<
  Options extends DocStorageOptions = DocStorageOptions,
> extends SnapshotDocStorageBase<Options> {
  constructor(opts: Options) {
    super(opts);

    this.on('snapshot', snapshot => {
      this.createHistory(snapshot.docId, snapshot).catch(noop);
    });
  }

  override async setDocSnapshot(
    snapshot: DocRecord,
    prevSnapshot: DocRecord | null
  ): Promise<boolean> {
    const success = await this.upsertDocSnapshot(snapshot, prevSnapshot);
    if (success) {
      this.emit('snapshot', snapshot, prevSnapshot);
    }
    return success;
  }

  /**
   * Update the doc snapshot in storage or create a new one if not exists.
   *
   * @safety
   * be careful when implementing this method.
   *
   * It might be called with outdated snapshot when running in multi-thread environment.
   *
   * A common solution is update the snapshot record is DB only when the coming one's timestamp is newer.
   *
   * @example
   * ```ts
   * await using _lock = await this.lockDocForUpdate(docId);
   * // set snapshot
   *
   * ```
   */
  abstract upsertDocSnapshot(
    snapshot: DocRecord,
    prevSnapshot: DocRecord | null
  ): Promise<boolean>;

  abstract listHistories(
    docId: string,
    filter?: HistoryFilter
  ): Promise<ListedHistory[]>;
  abstract getHistory(
    docId: string,
    timestamp: Date
  ): Promise<DocRecord | null>;
  abstract deleteHistory(docId: string, timestamp: Date): Promise<void>;

  async rollbackDoc(docId: string, timestamp: Date, editor?: string) {
    const toSnapshot = await this.getHistory(docId, timestamp);
    if (!toSnapshot) {
      throw new Error('Can not find the version to rollback to.');
    }

    const fromSnapshot = await this.getDoc(docId);

    if (!fromSnapshot) {
      throw new Error('Can not find the current version of the doc.');
    }

    const change = this.generateRevertUpdate(fromSnapshot.bin, toSnapshot.bin);
    await this.pushDocUpdate({ docId, bin: change, editor }, 'rollback');
    // force create a new history record after rollback
    await this.createHistory(docId, fromSnapshot);
  }

  // history can only be created upon update pushing.
  protected abstract createHistory(
    docId: string,
    snapshot: DocRecord
  ): Promise<void>;

  protected generateRevertUpdate(
    fromNewerBin: Uint8Array,
    toOlderBin: Uint8Array
  ): Uint8Array {
    const newerDoc = new Doc();
    applyUpdate(newerDoc, fromNewerBin);
    const olderDoc = new Doc();
    applyUpdate(olderDoc, toOlderBin);

    const newerState = encodeStateVector(newerDoc);
    const olderState = encodeStateVector(olderDoc);

    const diff = encodeStateAsUpdate(newerDoc, olderState);

    const undoManager = new UndoManager(Array.from(olderDoc.share.values()));

    applyUpdate(olderDoc, diff);

    undoManager.undo();

    return encodeStateAsUpdate(olderDoc, newerState);
  }
}
