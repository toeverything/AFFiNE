import {
  applyUpdate,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  encodeStateVectorFromUpdate,
  mergeUpdates,
  UndoManager,
} from 'yjs';

import { Connection } from '../connection';
import { SingletonLocker } from '../lock';
import type {
  DocDiff,
  DocRecord,
  DocUpdate,
  Editor,
  HistoryFilter,
} from './types';

export type SpaceType = 'workspace' | 'userspace';
export interface DocStorageOptions {
  spaceType: string;
  spaceId: string;
  mergeUpdates?: (updates: Uint8Array[]) => Promise<Uint8Array> | Uint8Array;
}

export abstract class DocStorage<
  Opts extends DocStorageOptions = DocStorageOptions,
> extends Connection {
  abstract get name(): string;

  public readonly options: Opts;
  private readonly locker = new SingletonLocker();
  protected readonly updatesListeners = new Set<
    (docId: string, updates: Uint8Array[], timestamp: number) => void
  >();

  get spaceType() {
    return this.options.spaceType;
  }

  get spaceId() {
    return this.options.spaceId;
  }

  constructor(options: Opts) {
    super();
    this.options = options;
  }

  // REGION: open apis
  /**
   * Tell a binary is empty yjs binary or not.
   *
   * NOTE:
   *   `[0, 0]` is empty yjs update binary
   *   `[0]` is empty yjs state vector binary
   */
  isEmptyBin(bin: Uint8Array): boolean {
    return (
      bin.length === 0 ||
      // 0x0 for state vector
      (bin.length === 1 && bin[0] === 0) ||
      // 0x00 for update
      (bin.length === 2 && bin[0] === 0 && bin[1] === 0)
    );
  }

  /**
   * Get a doc record with latest binary.
   */
  async getDoc(docId: string): Promise<DocRecord | null> {
    await using _lock = await this.lockDocForUpdate(docId);

    const snapshot = await this.getDocSnapshot(docId);
    const updates = await this.getDocUpdates(docId);

    if (updates.length) {
      const { timestamp, bin, editor } = await this.squash(
        snapshot ? [snapshot, ...updates] : updates
      );

      const newSnapshot = {
        spaceId: this.spaceId,
        docId,
        bin,
        timestamp,
        editor,
      };

      const success = await this.setDocSnapshot(newSnapshot);
      // if there is old snapshot, create a new history record
      if (success && snapshot) {
        await this.createDocHistory(snapshot);
      }

      // always mark updates as merged unless throws
      await this.markUpdatesMerged(docId, updates);

      return newSnapshot;
    }

    return snapshot;
  }

  /**
   * Get a yjs binary diff with the given state vector.
   */
  async getDocDiff(
    docId: string,
    stateVector?: Uint8Array
  ): Promise<DocDiff | null> {
    const doc = await this.getDoc(docId);

    if (!doc) {
      return null;
    }

    const missing = stateVector ? diffUpdate(doc.bin, stateVector) : doc.bin;
    const state = encodeStateVectorFromUpdate(doc.bin);

    return {
      missing,
      state,
      timestamp: doc.timestamp,
    };
  }

  /**
   * Push updates into storage
   */
  abstract pushDocUpdates(
    docId: string,
    updates: Uint8Array[],
    editor?: string
  ): Promise<number>;

  /**
   * Listen to doc updates pushed event
   */
  onReceiveDocUpdates(
    listener: (docId: string, updates: Uint8Array[], timestamp: number) => void
  ): () => void {
    this.updatesListeners.add(listener);

    return () => {
      this.updatesListeners.delete(listener);
    };
  }

  /**
   * Delete a specific doc data with all snapshots and updates
   */
  abstract deleteDoc(docId: string): Promise<void>;
  /**
   * Delete the whole space data with all docs
   */
  abstract deleteSpace(): Promise<void>;

  /**
   * Get all docs timestamps info. especially for useful in sync process.
   */
  abstract getSpaceDocTimestamps(
    after?: number
  ): Promise<Record<string, number> | null>;

  /**
   * Rollback the doc in a update patch way using [yjs.UndoManager].
   */
  async rollbackDoc(
    docId: string,
    timestamp: number,
    editor?: string
  ): Promise<void> {
    await using _lock = await this.lockDocForUpdate(docId);
    const toSnapshot = await this.getDocHistory(docId, timestamp);
    if (!toSnapshot) {
      throw new Error('Can not find the version to rollback to.');
    }

    const fromSnapshot = await this.getDocSnapshot(docId);

    if (!fromSnapshot) {
      throw new Error('Can not find the current version of the doc.');
    }

    const change = this.generateChangeUpdate(fromSnapshot.bin, toSnapshot.bin);
    await this.pushDocUpdates(docId, [change], editor);
    // force create a new history record after rollback
    await this.createDocHistory(fromSnapshot, true);
  }

  /**
   * List all history snapshot of a doc.
   */
  abstract listDocHistories(
    docId: string,
    query: HistoryFilter
  ): Promise<{ timestamp: number; editor: Editor | null }[]>;

  /**
   * Get a history snapshot of a doc.
   */
  abstract getDocHistory(
    docId: string,
    timestamp: number
  ): Promise<DocRecord | null>;

  // ENDREGION

  // REGION: api for internal usage
  protected dispatchDocUpdatesListeners(
    docId: string,
    updates: Uint8Array[],
    timestamp: number
  ): void {
    this.updatesListeners.forEach(cb => {
      cb(docId, updates, timestamp);
    });
  }

  /**
   * Get a doc snapshot from storage
   */
  protected abstract getDocSnapshot(docId: string): Promise<DocRecord | null>;
  /**
   * Set the doc snapshot into storage
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
  protected abstract setDocSnapshot(snapshot: DocRecord): Promise<boolean>;
  /**
   * Get all updates of a doc that haven't been merged into snapshot.
   *
   * Updates queue design exists for a performace concern:
   * A huge amount of write time will be saved if we don't merge updates into snapshot immediately.
   * Updates will be merged into snapshot when the latest doc is requested.
   */
  protected abstract getDocUpdates(docId: string): Promise<DocUpdate[]>;

  /**
   * Mark updates as merged into snapshot.
   */
  protected abstract markUpdatesMerged(
    docId: string,
    updates: DocUpdate[]
  ): Promise<number>;

  /**
   * Create a new history record for a doc.
   * Will always be called after the doc snapshot is updated.
   */
  protected abstract createDocHistory(
    snapshot: DocRecord,
    force?: boolean
  ): Promise<boolean>;

  /**
   * Merge doc updates into a single update.
   */
  protected async squash(updates: DocUpdate[]): Promise<DocUpdate> {
    const merge = this.options?.mergeUpdates ?? mergeUpdates;
    const lastUpdate = updates.at(-1);
    if (!lastUpdate) {
      throw new Error('No updates to be squashed.');
    }

    // fast return
    if (updates.length === 1) {
      return lastUpdate;
    }

    const finalUpdate = await merge(updates.map(u => u.bin));

    return {
      bin: finalUpdate,
      timestamp: lastUpdate.timestamp,
      editor: lastUpdate.editor,
    };
  }

  protected generateChangeUpdate(newerBin: Uint8Array, olderBin: Uint8Array) {
    const newerDoc = new Doc();
    applyUpdate(newerDoc, newerBin);
    const olderDoc = new Doc();
    applyUpdate(olderDoc, olderBin);

    const newerState = encodeStateVector(newerDoc);
    const olderState = encodeStateVector(olderDoc);

    const diff = encodeStateAsUpdate(newerDoc, olderState);

    const undoManager = new UndoManager(Array.from(newerDoc.share.values()));

    applyUpdate(olderDoc, diff);

    undoManager.undo();

    return encodeStateAsUpdate(olderDoc, newerState);
  }

  protected async lockDocForUpdate(docId: string): Promise<AsyncDisposable> {
    return this.locker.lock(`workspace:${this.spaceId}:update`, docId);
  }
}
