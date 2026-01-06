import EventEmitter2 from 'eventemitter2';
import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';

import type { Connection } from '../connection';
import { isEmptyUpdate } from '../utils/is-empty-update';
import type { Locker } from './lock';
import { SingletonLocker } from './lock';
import { type Storage } from './storage';

export interface BlockInfo {
  blockId: string;
  flavour: string;
  content?: string[];
  blob?: string[];
  refDocId?: string[];
  refInfo?: string[];
  parentFlavour?: string;
  parentBlockId?: string;
  additional?: string;
}

export interface CrawlResult {
  blocks: BlockInfo[];
  title: string;
  summary: string;
}

export interface DocClock {
  docId: string;
  timestamp: Date;
}

export type DocClocks = Record<string, Date>;
export interface DocRecord extends DocClock {
  bin: Uint8Array;
  editor?: string;
}

export interface DocDiff extends DocClock {
  missing: Uint8Array;
  state: Uint8Array;
}

export interface DocUpdate {
  docId: string;
  bin: Uint8Array;
  editor?: string;
}

export interface Editor {
  name: string;
  avatarUrl: string | null;
}

export interface DocStorageOptions {
  mergeUpdates?: (updates: Uint8Array[]) => Promise<Uint8Array> | Uint8Array;
  id: string;

  /**
   * open as readonly mode.
   */
  readonlyMode?: boolean;
}

export interface DocStorage extends Storage {
  readonly storageType: 'doc';
  readonly isReadonly: boolean;
  readonly spaceId: string;
  /**
   * Get a doc record with latest binary.
   */
  getDoc(docId: string): Promise<DocRecord | null>;
  /**
   * Get a yjs binary diff with the given state vector.
   */
  getDocDiff(docId: string, state?: Uint8Array): Promise<DocDiff | null>;
  /**
   * Push updates into storage
   *
   * @param origin - Internal identifier to recognize the source in the "update" event. Will not be stored or transferred.
   */
  pushDocUpdate(update: DocUpdate, origin?: string): Promise<DocClock>;

  /**
   * Get the timestamp of the latest update of a doc.
   */
  getDocTimestamp(docId: string): Promise<DocClock | null>;

  /**
   * Get all docs timestamps info. especially for useful in sync process.
   */
  getDocTimestamps(after?: Date): Promise<DocClocks>;

  /**
   * Delete a specific doc data with all snapshots and updates
   */
  deleteDoc(docId: string): Promise<void>;

  /**
   * Subscribe on doc updates emitted from storage itself.
   *
   * NOTE:
   *
   *   There is not always update emitted from storage itself.
   *
   *   For example, in Sqlite storage, the update will only come from user's updating on docs,
   *   in other words, the update will never somehow auto generated in storage internally.
   *
   *   But for Cloud storage, there will be updates broadcasted from other clients,
   *   so the storage will emit updates to notify the client to integrate them.
   */
  subscribeDocUpdate(
    callback: (update: DocRecord, origin?: string) => void
  ): () => void;

  crawlDocData?(docId: string): Promise<CrawlResult | null>;
}

export abstract class DocStorageBase<Opts = {}> implements DocStorage {
  get isReadonly(): boolean {
    return this.options.readonlyMode ?? false;
  }
  private readonly event = new EventEmitter2();
  readonly storageType = 'doc';
  abstract readonly connection: Connection;
  protected readonly locker: Locker = new SingletonLocker();
  readonly spaceId = this.options.id;

  constructor(protected readonly options: Opts & DocStorageOptions) {}

  async getDoc(docId: string) {
    await using _lock = this.isReadonly
      ? undefined
      : await this.lockDocForUpdate(docId);

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

      // if is readonly, we will not set the new snapshot
      if (!this.isReadonly) {
        await this.setDocSnapshot(newSnapshot, snapshot);

        // always mark updates as merged unless throws
        await this.markUpdatesMerged(docId, updates);
      }

      return newSnapshot;
    }

    return snapshot;
  }

  async getDocDiff(docId: string, state?: Uint8Array) {
    const doc = await this.getDoc(docId);

    if (!doc) {
      return null;
    }

    return {
      docId,
      missing: state && state.length > 0 ? diffUpdate(doc.bin, state) : doc.bin,
      state: encodeStateVectorFromUpdate(doc.bin),
      timestamp: doc.timestamp,
    };
  }

  abstract pushDocUpdate(update: DocUpdate, origin?: string): Promise<DocClock>;

  abstract getDocTimestamp(docId: string): Promise<DocClock | null>;

  abstract getDocTimestamps(after?: Date): Promise<DocClocks>;

  abstract deleteDoc(docId: string): Promise<void>;

  subscribeDocUpdate(callback: (update: DocRecord, origin?: string) => void) {
    this.event.on('update', callback);

    return () => {
      this.event.off('update', callback);
    };
  }

  async crawlDocData(_docId: string): Promise<CrawlResult | null> {
    return null;
  }

  // REGION: api for internal usage
  protected on(
    event: 'update',
    callback: (update: DocRecord, origin: string) => void
  ): () => void;
  protected on(
    event: 'snapshot',
    callback: (snapshot: DocRecord, prevSnapshot: DocRecord | null) => void
  ): () => void;
  protected on(event: string, callback: (...args: any[]) => void): () => void {
    this.event.on(event, callback);
    return () => {
      this.event.off(event, callback);
    };
  }

  protected emit(event: 'update', update: DocRecord, origin?: string): void;
  protected emit(
    event: 'snapshot',
    snapshot: DocRecord,
    prevSnapshot: DocRecord | null
  ): void;
  protected emit(event: string, ...args: any[]): void {
    this.event.emit(event, ...args);
  }

  protected off(event: string, callback: (...args: any[]) => void): void {
    this.event.off(event, callback);
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
  protected abstract setDocSnapshot(
    snapshot: DocRecord,
    prevSnapshot: DocRecord | null
  ): Promise<boolean>;

  /**
   * Get all updates of a doc that haven't been merged into snapshot.
   *
   * Updates queue design exists for a performace concern:
   * A huge amount of write time will be saved if we don't merge updates into snapshot immediately.
   * Updates will be merged into snapshot when the latest doc is requested.
   */
  protected abstract getDocUpdates(docId: string): Promise<DocRecord[]>;

  /**
   * Mark updates as merged into snapshot.
   */
  protected abstract markUpdatesMerged(
    docId: string,
    updates: DocRecord[]
  ): Promise<number>;

  /**
   * Merge doc updates into a single update.
   */
  protected async squash(updates: DocRecord[]): Promise<DocRecord> {
    const lastUpdate = updates.at(-1);
    if (!lastUpdate) {
      throw new Error('No updates to be squashed.');
    }

    // fast return
    if (updates.length === 1) {
      return lastUpdate;
    }

    const finalUpdate = await this.mergeUpdates(updates.map(u => u.bin));

    return {
      docId: lastUpdate.docId,
      bin: finalUpdate,
      timestamp: lastUpdate.timestamp,
      editor: lastUpdate.editor,
    };
  }

  protected mergeUpdates(updates: Uint8Array[]) {
    const merge = this.options?.mergeUpdates ?? mergeUpdates;

    return merge(updates.filter(bin => !isEmptyUpdate(bin)));
  }

  protected async lockDocForUpdate(docId: string): Promise<AsyncDisposable> {
    return this.locker.lock(`workspace:${this.spaceId}:update`, docId);
  }
}
