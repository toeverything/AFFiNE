import { Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { diffUpdate, encodeStateVectorFromUpdate } from 'yjs';

import {
  CallMetric,
  DocUpdateInvalid,
  DocUpdateTooLarge,
  DocValidationUnavailable,
} from '../../../base';
import { validateDocUpdate } from '../../../native';
import { applyUpdatesWithNative, mergeUpdatesWithYjs } from '../merge-updates';
import { Connection } from './connection';
import { SingletonLocker } from './lock';

const DOC_UPDATE_VALIDATE_TIMEOUT_MS = 1000;
const DOC_UPDATE_VALIDATE_MAX_BYTES = 32 * 1024 * 1024;

async function nativeApplyUpdates(updates: Uint8Array[]): Promise<Uint8Array> {
  return applyUpdatesWithNative(updates, 'doc.storage.squash.native');
}

async function yjsMergeUpdates(updates: Uint8Array[]): Promise<Uint8Array> {
  return mergeUpdatesWithYjs(updates, 'doc.storage.squash.yjs');
}

export interface DocRecord {
  spaceId: string;
  docId: string;
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface DocDiff {
  missing: Uint8Array;
  state: Uint8Array;
  timestamp: number;
}

export interface DocUpdate {
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface HistoryFilter {
  before?: number;
  limit?: number;
}

export interface Editor {
  name: string;
  avatarUrl: string | null;
}

export interface DocStorageOptions {
  mergeUpdates?: (updates: Uint8Array[]) => Promise<Uint8Array> | Uint8Array;
}

export abstract class DocStorageAdapter extends Connection {
  private readonly locker = new SingletonLocker();
  protected readonly logger = new Logger(DocStorageAdapter.name);

  constructor(
    protected readonly options: DocStorageOptions = {
      mergeUpdates: yjsMergeUpdates,
    }
  ) {
    super();
  }

  // open apis
  isEmptyBin(bin: Uint8Array): boolean {
    return (
      bin.length === 0 ||
      // 0x0 for state vector
      (bin.length === 1 && bin[0] === 0) ||
      // 0x00 for update
      (bin.length === 2 && bin[0] === 0 && bin[1] === 0)
    );
  }

  protected async assertValidDocUpdates(updates: Uint8Array[]) {
    for (const update of updates) {
      if (update.length > DOC_UPDATE_VALIDATE_MAX_BYTES) {
        throw new DocUpdateTooLarge();
      }
      let valid: boolean;
      try {
        valid = await validateDocUpdate(Buffer.from(update), {
          timeoutMs: DOC_UPDATE_VALIDATE_TIMEOUT_MS,
        });
      } catch (error) {
        const unavailable = new DocValidationUnavailable();
        unavailable.cause = error;
        throw unavailable;
      }
      if (!valid) {
        throw new DocUpdateInvalid();
      }
    }
  }

  async getDoc(spaceId: string, docId: string): Promise<DocRecord | null> {
    await using _lock = await this.lockDocForUpdate(spaceId, docId);

    return (await this.getDocUnderLock(spaceId, docId)).doc;
  }

  protected async getDocUnderLock(
    spaceId: string,
    docId: string
  ): Promise<{ doc: DocRecord | null; snapshotUpdated: boolean }> {
    const snapshot = await this.getDocSnapshot(spaceId, docId);
    const updates = await this.getDocUpdates(spaceId, docId);

    if (updates.length) {
      const docUpdate = await this.squash(
        snapshot ? [snapshot, ...updates] : updates
      );
      return await this.squashUpdatesToSnapshot(
        spaceId,
        docId,
        updates,
        snapshot,
        docUpdate
      );
    }

    return { doc: snapshot, snapshotUpdated: false };
  }

  /// get final binary only but not updating the snapshot in database
  async getDocBinNative(
    spaceId: string,
    docId: string
  ): Promise<Uint8Array | undefined> {
    await using _lock = await this.lockDocForUpdate(spaceId, docId);

    const snapshot = await this.getDocSnapshot(spaceId, docId);
    const updates = await this.getDocUpdates(spaceId, docId);

    if (updates.length) {
      const docUpdate = await this.squash(
        snapshot ? [snapshot, ...updates] : updates,
        nativeApplyUpdates
      );
      return docUpdate.bin;
    }

    return snapshot?.bin;
  }

  @Transactional<TransactionalAdapterPrisma>({ timeout: 60000 })
  protected async squashUpdatesToSnapshot(
    spaceId: string,
    docId: string,
    updates: DocUpdate[],
    snapshot: DocRecord | null,
    finalUpdate: DocUpdate
  ) {
    this.logger.verbose(
      `Squashing updates, spaceId: ${spaceId}, docId: ${docId}, updates: ${updates.length}`
    );

    const { bin, editor } = finalUpdate;
    const timestamp = snapshot
      ? Math.max(finalUpdate.timestamp, snapshot.timestamp + 1)
      : finalUpdate.timestamp;
    const newSnapshot: DocRecord = {
      spaceId,
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

    if (success) {
      const count = await this.markUpdatesMerged(spaceId, docId, updates);
      this.logger.verbose(
        `Marked ${count} updates as merged, spaceId: ${spaceId}, docId: ${docId}, timestamp: ${timestamp}`
      );
    }

    return { doc: newSnapshot, snapshotUpdated: success };
  }

  async getDocDiff(
    spaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ): Promise<DocDiff | null> {
    const doc = await this.getDoc(spaceId, docId);

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

  abstract pushDocUpdates(
    spaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId: string,
    expectedPermissionGeneration?: number,
    writeIntent?: 'update_doc' | 'create_doc',
    permissionDocId?: string
  ): Promise<number>;

  abstract pushDocUpdatesTrusted(
    spaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId?: string
  ): Promise<number>;

  abstract deleteDoc(spaceId: string, docId: string): Promise<void>;
  abstract deleteSpace(spaceId: string): Promise<void>;
  abstract getSpaceDocTimestamps(
    spaceId: string,
    after?: number
  ): Promise<Record<string, number> | null>;
  abstract listDocHistories(
    spaceId: string,
    docId: string,
    query: { skip?: number; limit?: number }
  ): Promise<{ timestamp: number; editor: Editor | null }[]>;
  abstract getDocHistory(
    spaceId: string,
    docId: string,
    timestamp: number
  ): Promise<DocRecord | null>;

  // api for internal usage
  protected abstract getDocSnapshot(
    spaceId: string,
    docId: string
  ): Promise<DocRecord | null>;
  protected abstract setDocSnapshot(snapshot: DocRecord): Promise<boolean>;
  protected abstract getDocUpdates(
    spaceId: string,
    docId: string
  ): Promise<DocUpdate[]>;
  protected abstract markUpdatesMerged(
    spaceId: string,
    docId: string,
    updates: DocUpdate[]
  ): Promise<number>;

  protected abstract createDocHistory(snapshot: DocRecord): Promise<boolean>;

  @CallMetric('doc', 'squash')
  protected async squash(
    updates: DocUpdate[],
    merge?: (updates: Uint8Array[]) => Promise<Uint8Array>
  ): Promise<DocUpdate> {
    const mergeFn = merge ?? this.options?.mergeUpdates ?? yjsMergeUpdates;
    const lastUpdate = updates.at(-1);
    if (!lastUpdate) {
      throw new Error('No updates to be squashed.');
    }

    // fast return
    if (updates.length === 1) {
      return lastUpdate;
    }

    const finalUpdate = await mergeFn(updates.map(u => u.bin));

    return {
      bin: finalUpdate,
      timestamp: lastUpdate.timestamp,
      editor: lastUpdate.editor,
    };
  }

  protected async lockDocForUpdate(
    spaceId: string,
    docId: string
  ): Promise<AsyncDisposable> {
    return this.locker.lock(`workspace:${spaceId}:update`, docId);
  }
}
