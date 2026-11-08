import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  type DocUpdate,
  SnapshotDocStorageBase,
} from '../../storage';
import { type SpaceType } from '../../utils/universal-id';
import { DiskSyncConnection, type DiskSyncEvent } from './api';

export interface DiskDocStorageOptions {
  readonly flavour: string;
  readonly type: SpaceType;
  readonly id: string;
  readonly syncFolder: string;
}

export class DiskDocStorage extends SnapshotDocStorageBase<DiskDocStorageOptions> {
  static readonly identifier = 'DiskDocStorage';

  readonly syncMetadataScope = 'connection';

  readonly connection: DiskSyncConnection;

  private readonly snapshots = new Map<string, DocRecord>();
  private readonly discoveredRootDocs = new Set<string>();
  private readonly pendingRootDocs = new Set<string>();
  private readonly discoveredSources = new Map<string, Date>();
  private rootSnapshotTask: Promise<void> = Promise.resolve();
  private localRootInFlight = false;

  constructor(options: DiskDocStorageOptions) {
    super(options);
    this.connection = new DiskSyncConnection(options, this.handleDiskEvent);
  }

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    const isRoot = update.docId === this.spaceId;
    if (isRoot) {
      this.localRootInFlight = true;
    }
    let applied = false;
    try {
      const { timestamp, reviewRequired, exportError } =
        await this.connection.applyLocalUpdate(update);
      if (exportError) {
        const error = new Error(exportError);
        error.name = 'DISK_SOURCE_EXPORT_FAILED';
        throw error;
      }
      const next: DocRecord = {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
      };
      await this.applySnapshotUpdate(next, origin);
      applied = true;
      if (reviewRequired) {
        const error = new Error(
          `Review Markdown source candidate: ${reviewRequired}`
        );
        error.name = 'DISK_SOURCE_REVIEW_REQUIRED';
        throw error;
      }
      return { docId: update.docId, timestamp };
    } finally {
      if (isRoot) {
        this.localRootInFlight = false;
        if (applied) {
          this.flushRootDiscovery();
        }
      }
    }
  }

  async acknowledgeDocUpdate(docId: string, localSnapshot: Uint8Array) {
    await this.connection.acknowledgeSourceUpdate(docId, localSnapshot);
  }

  async prepareDocImport(
    docId: string,
    localSnapshot: Uint8Array | null,
    localRoot: Uint8Array | null
  ) {
    const snapshot = await this.connection.prepareSourceDoc(
      docId,
      localSnapshot ?? undefined,
      localRoot ?? undefined
    );
    if (snapshot) {
      this.discoveredSources.delete(docId);
      await this.applySnapshotUpdate({
        docId,
        bin: snapshot,
        timestamp: new Date(),
      });
    }
  }

  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const snapshot = this.snapshots.get(docId);
    if (!snapshot) {
      const discovered = this.discoveredSources.get(docId);
      return discovered ? { docId, timestamp: discovered } : null;
    }
    return {
      docId,
      timestamp: snapshot.timestamp,
    };
  }

  override async getDocTimestamps(after?: Date): Promise<DocClocks> {
    const timestamps: DocClocks = {};
    for (const [docId, timestamp] of this.discoveredSources) {
      if (!after || timestamp.getTime() > after.getTime()) {
        timestamps[docId] = timestamp;
      }
    }
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
    this.discoveredSources.delete(docId);
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

  protected override async getDocUpdates(_docId: string): Promise<DocRecord[]> {
    return [];
  }

  protected override async markUpdatesMerged(
    _docId: string,
    updates: DocRecord[]
  ): Promise<number> {
    return updates.length;
  }

  private readonly handleDiskEvent = (event: DiskSyncEvent) => {
    switch (event.type) {
      case 'source-discovered': {
        const timestamp = new Date();
        this.discoveredSources.set(event.docId, timestamp);
        this.emit(
          'update',
          { docId: event.docId, bin: new Uint8Array([0, 0]), timestamp },
          'disk:source-discovered'
        );
        return;
      }
      case 'root-doc-discovered': {
        this.pendingRootDocs.add(event.docId);
        this.rootSnapshotTask
          .then(() => this.flushRootDiscovery())
          .catch(error => {
            console.warn('[disk] failed to flush root discovery', error);
          });
        return;
      }
      case 'doc-update': {
        const update: DocRecord = {
          docId: event.update.docId,
          bin: event.update.bin,
          timestamp: event.update.timestamp,
          editor: event.update.editor,
        };
        const task = this.applySnapshotUpdate(update, event.origin).catch(
          error => {
            console.warn(
              '[disk] failed to apply remote doc-update, skip event',
              error
            );
          }
        );
        if (update.docId === this.spaceId) {
          this.rootSnapshotTask = task;
        }
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
    await this.mergeIntoSnapshot(update);
    this.emit('update', update, origin);
    if (update.docId === this.spaceId) {
      this.flushRootDiscovery();
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

  private flushRootDiscovery() {
    if (this.localRootInFlight || !this.snapshots.has(this.spaceId)) {
      return;
    }
    for (const docId of this.pendingRootDocs) {
      if (docId !== this.spaceId && !this.discoveredRootDocs.has(docId)) {
        this.discoveredRootDocs.add(docId);
        this.emit(
          'update',
          { docId, bin: new Uint8Array(), timestamp: new Date(0) },
          'disk:root-meta-discovery'
        );
      }
    }
    this.pendingRootDocs.clear();
  }
}
