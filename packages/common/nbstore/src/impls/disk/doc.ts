import { applyUpdate, Doc as YDoc } from 'yjs';

import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { type SpaceType } from '../../utils/universal-id';
import { DiskSyncConnection, type DiskSyncEvent } from './api';

export interface DiskDocStorageOptions {
  readonly flavour: string;
  readonly type: SpaceType;
  readonly id: string;
  readonly syncFolder: string;
}

export class DiskDocStorage extends DocStorageBase<DiskDocStorageOptions> {
  static readonly identifier = 'DiskDocStorage';

  readonly connection: DiskSyncConnection;

  private readonly snapshots = new Map<string, DocRecord>();
  private readonly pendingUpdates = new Map<string, DocRecord[]>();
  private readonly discoveredRootDocs = new Set<string>();

  constructor(options: DiskDocStorageOptions) {
    super(options);
    this.connection = new DiskSyncConnection(options, this.handleDiskEvent);
  }

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    const { timestamp } = await this.connection.apis.applyLocalUpdate(
      update,
      origin
    );
    const clock = normalizeDate(timestamp);
    const next: DocRecord = {
      docId: update.docId,
      bin: update.bin,
      timestamp: clock,
      editor: update.editor,
    };
    await this.applySnapshotUpdate(next, origin);
    return { docId: update.docId, timestamp: clock };
  }

  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const snapshot = this.snapshots.get(docId);
    if (!snapshot) {
      return null;
    }
    return {
      docId,
      timestamp: snapshot.timestamp,
    };
  }

  override async getDocTimestamps(after?: Date): Promise<DocClocks> {
    const timestamps: DocClocks = {};
    for (const [docId, snapshot] of this.snapshots.entries()) {
      if (after && snapshot.timestamp.getTime() <= after.getTime()) {
        continue;
      }
      timestamps[docId] = snapshot.timestamp;
    }
    return timestamps;
  }

  override async deleteDoc(docId: string): Promise<void> {
    this.snapshots.delete(docId);
    this.pendingUpdates.delete(docId);
  }

  protected override async getDocSnapshot(docId: string) {
    return this.snapshots.get(docId) ?? null;
  }

  protected override async setDocSnapshot(
    snapshot: DocRecord
  ): Promise<boolean> {
    const existing = this.snapshots.get(snapshot.docId);
    if (
      existing &&
      existing.timestamp.getTime() > snapshot.timestamp.getTime()
    ) {
      return false;
    }
    this.snapshots.set(snapshot.docId, snapshot);
    return true;
  }

  protected override async getDocUpdates(docId: string): Promise<DocRecord[]> {
    return this.pendingUpdates.get(docId) ?? [];
  }

  protected override async markUpdatesMerged(
    docId: string,
    updates: DocRecord[]
  ): Promise<number> {
    if (updates.length) {
      this.pendingUpdates.delete(docId);
    }
    return updates.length;
  }

  private readonly handleDiskEvent = (event: DiskSyncEvent) => {
    switch (event.type) {
      case 'doc-update': {
        let timestamp: Date;
        try {
          timestamp = normalizeDate(event.update.timestamp);
        } catch (error) {
          console.warn(
            '[disk] invalid doc-update timestamp, skip event',
            error
          );
          return;
        }

        let bin: Uint8Array;
        try {
          bin = normalizeBin(event.update.bin);
        } catch (error) {
          console.warn('[disk] invalid doc-update bin, skip event', error);
          return;
        }

        const update: DocRecord = {
          docId: event.update.docId,
          bin,
          timestamp,
          editor: event.update.editor,
        };
        void this.applySnapshotUpdate(update, event.origin).catch(error => {
          console.warn(
            '[disk] failed to apply remote doc-update, skip event',
            error
          );
        });
        return;
      }
      case 'doc-delete': {
        this.snapshots.delete(event.docId);
        this.pendingUpdates.delete(event.docId);
        return;
      }
      case 'error': {
        console.warn('[disk] session error', event.message);
        return;
      }
      default: {
        return;
      }
    }
  };

  private async applySnapshotUpdate(update: DocRecord, origin?: string) {
    await using _lock = await this.lockDocForUpdate(update.docId);
    try {
      await this.mergeIntoSnapshot(update);
    } catch (error) {
      // Snapshot cache is best-effort. A merge failure must not block upstream sync
      // forever (it can otherwise require a full app reload to recover).
      console.warn(
        '[disk] snapshot merge failed, reset in-memory snapshot cache',
        error
      );
      this.snapshots.set(update.docId, update);
    }
    this.emit('update', update, origin);
    if (update.docId === this.spaceId) {
      this.emitRootMetaDiscoveryUpdates();
    }
  }

  private async mergeIntoSnapshot(update: DocRecord) {
    const current = this.snapshots.get(update.docId);
    if (!current) {
      this.snapshots.set(update.docId, update);
      return;
    }

    const merged = await this.mergeUpdates([current.bin, update.bin]);
    this.snapshots.set(update.docId, {
      ...update,
      bin: merged,
      timestamp:
        current.timestamp.getTime() > update.timestamp.getTime()
          ? current.timestamp
          : update.timestamp,
      editor: update.editor ?? current.editor,
    });
  }

  private emitRootMetaDiscoveryUpdates() {
    const rootSnapshot = this.snapshots.get(this.spaceId);
    if (!rootSnapshot) {
      return;
    }

    const docIds = extractRootMetaDocIds(rootSnapshot.bin);
    // These discovery events are only meant to "introduce" doc ids to the sync
    // peer, so it can connect/pull/push them. They should NOT be treated as a
    // remote clock; otherwise switching sync folders (remote empty) can be
    // incorrectly seen as "remote newer than local" and skip the initial push.
    const discoveryTimestamp = new Date(0);
    for (const docId of docIds) {
      if (docId === this.spaceId || this.discoveredRootDocs.has(docId)) {
        continue;
      }
      this.discoveredRootDocs.add(docId);
      this.emit(
        'update',
        {
          docId,
          bin: new Uint8Array(),
          timestamp: discoveryTimestamp,
        },
        'disk:root-meta-discovery'
      );
    }
  }
}

function normalizeDate(date: Date | string | number): Date {
  const normalized = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(normalized.getTime())) {
    throw new Error(`[disk] invalid timestamp: ${String(date)}`);
  }
  return normalized;
}

function extractRootMetaDocIds(rootBin: Uint8Array): string[] {
  const doc = new YDoc();
  try {
    applyUpdate(doc, rootBin);
  } catch {
    return [];
  }

  const meta = doc.getMap<unknown>('meta');
  const pages = meta.get('pages');
  const pagesJson =
    typeof pages === 'object' &&
    pages !== null &&
    'toJSON' in pages &&
    typeof pages.toJSON === 'function'
      ? pages.toJSON()
      : pages;

  if (!Array.isArray(pagesJson)) {
    return [];
  }

  const docIds: string[] = [];
  for (const page of pagesJson) {
    if (!page || typeof page !== 'object') {
      continue;
    }
    const id = (page as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) {
      docIds.push(id);
    }
  }
  return docIds;
}

function normalizeBin(bin: unknown): Uint8Array {
  // Native NAPI binding may send `number[]` for `Vec<u8>` fields.
  if (bin instanceof Uint8Array) {
    return bin;
  }
  if (Array.isArray(bin)) {
    return Uint8Array.from(bin);
  }
  // Some transports may serialize Buffer as `{ type: 'Buffer', data: number[] }`.
  if (
    bin &&
    typeof bin === 'object' &&
    'data' in bin &&
    Array.isArray((bin as { data?: unknown }).data)
  ) {
    return Uint8Array.from((bin as { data: number[] }).data);
  }
  throw new Error(
    `[disk] invalid update bin type: ${Object.prototype.toString.call(bin)}`
  );
}
