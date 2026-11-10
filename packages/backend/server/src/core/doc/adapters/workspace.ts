import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import {
  EventBus,
  FailedToUpsertSnapshot,
  metrics,
  Mutex,
} from '../../../base';
import { Models } from '../../../models';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { DocStorageOptions } from '../options';
import {
  DocRecord,
  DocStorageAdapter,
  DocUpdate,
  HistoryFilter,
} from '../storage';

declare global {
  interface Events {
    'doc.snapshot.deleted': {
      workspaceId: string;
      docId: string;
    };
    'doc.snapshot.updated': {
      workspaceId: string;
      docId: string;
      blob: Buffer;
    };
  }
}

@Injectable()
export class PgWorkspaceDocStorageAdapter extends DocStorageAdapter {
  protected override readonly logger = new Logger(
    PgWorkspaceDocStorageAdapter.name
  );

  constructor(
    private readonly models: Models,
    private readonly mutex: Mutex,
    private readonly event: EventBus,
    protected override readonly options: DocStorageOptions,
    private readonly runtime: BackendRuntimeProvider
  ) {
    super(options);
  }

  override async getDoc(
    workspaceId: string,
    docId: string
  ): Promise<DocRecord | null> {
    if (workspaceId === docId) {
      const root = await this.runtime.getCurrentWorkspaceRootV1(workspaceId);
      return root
        ? {
            spaceId: workspaceId,
            docId,
            bin: root.bin,
            timestamp: root.timestamp,
          }
        : null;
    }
    await using _lock = await this.lockDocForUpdate(workspaceId, docId);
    const result = await this.getDocInTransaction(workspaceId, docId);
    if (result.snapshotUpdated && result.doc) {
      this.event.emitDetached('doc.snapshot.updated', {
        workspaceId,
        docId,
        blob: Buffer.from(result.doc.bin),
      });
    }
    return result.doc;
  }

  @Transactional<TransactionalAdapterPrisma>({ timeout: 60000 })
  private async getDocInTransaction(workspaceId: string, docId: string) {
    await this.models.doc.lockDocContent(workspaceId, docId);
    return await this.getDocUnderLock(workspaceId, docId);
  }

  async pushDocUpdates(
    workspaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId: string,
    expectedPermissionGeneration?: number,
    writeIntent: 'update_doc' | 'create_doc' = 'update_doc',
    permissionDocId?: string
  ) {
    return await this.pushDocUpdatesWithContract(
      workspaceId,
      docId,
      updates,
      editorId,
      {
        actorUserId: editorId,
        writeIntent,
        permissionDocId,
        expectedPermissionGeneration,
      }
    );
  }

  async pushDocUpdatesTrusted(
    workspaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId?: string
  ) {
    return await this.pushDocUpdatesWithContract(
      workspaceId,
      docId,
      updates,
      editorId,
      { trusted: true }
    );
  }

  private async pushDocUpdatesWithContract(
    workspaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId: string | undefined,
    contract:
      | {
          actorUserId: string;
          writeIntent: 'update_doc' | 'create_doc';
          permissionDocId?: string;
          expectedPermissionGeneration?: number;
        }
      | { trusted: true }
  ) {
    if (!updates.length) {
      return 0;
    }

    const isNewDoc = !(await this.models.doc.exists(workspaceId, docId));
    const input = {
      workspaceId,
      docId,
      updates: updates.map(update => Buffer.from(update)),
    };
    const timestamp =
      'trusted' in contract
        ? await this.runtime.appendWorkspaceDocUpdatesTrustedV1({
            ...input,
            editorId,
          })
        : await this.runtime.appendWorkspaceDocUpdatesV1({
            ...input,
            ...contract,
          });

    if (isNewDoc) {
      await this.event.emitDetachedAsync('doc.created', {
        workspaceId,
        docId,
        editor: editorId,
      });
    }
    return timestamp;
  }

  protected async getDocUpdates(workspaceId: string, docId: string) {
    const rows = await this.models.doc.findUpdates(workspaceId, docId);

    return rows.map(row => ({
      bin: row.blob,
      timestamp: row.timestamp,
      editor: row.editorId,
    }));
  }

  async deleteDoc(_workspaceId: string, _docId: string) {
    return;
  }

  async deleteSpace(workspaceId: string) {
    await this.models.doc.deleteAllByWorkspaceId(workspaceId);
  }

  async getSpaceDocTimestamps(workspaceId: string, after?: number) {
    return await this.models.doc.findTimestampsByWorkspaceId(
      workspaceId,
      after
    );
  }

  protected async markUpdatesMerged(
    workspaceId: string,
    docId: string,
    updates: DocUpdate[]
  ) {
    return await this.models.doc.deleteUpdates(
      workspaceId,
      docId,
      updates.map(u => u.timestamp)
    );
  }

  async listDocHistories(
    workspaceId: string,
    docId: string,
    query: HistoryFilter
  ) {
    return await this.models.history.findMany(workspaceId, docId, {
      before: query.before,
      take: query.limit,
    });
  }

  async getDocHistory(workspaceId: string, docId: string, timestamp: number) {
    const history = await this.models.history.get(
      workspaceId,
      docId,
      timestamp
    );

    if (!history) {
      return null;
    }

    return {
      spaceId: workspaceId,
      docId,
      bin: history.blob,
      timestamp: history.timestamp,
      editor: history.editor?.id,
    };
  }

  protected async createDocHistory(snapshot: DocRecord) {
    const last = await this.lastDocHistory(snapshot.spaceId, snapshot.docId);

    let shouldCreateHistory = false;

    if (!last) {
      // never created
      shouldCreateHistory = true;
    } else {
      const lastHistoryTimestamp = last.timestamp;
      if (lastHistoryTimestamp === snapshot.timestamp) {
        // no change
        shouldCreateHistory = false;
      } else if (
        // last history created before interval in configs
        lastHistoryTimestamp <
        snapshot.timestamp - this.options.historyMinInterval(snapshot.spaceId)
      ) {
        shouldCreateHistory = true;
      }
    }

    if (shouldCreateHistory) {
      if (this.isEmptyBin(snapshot.bin)) {
        this.logger.debug(
          `Doc is empty, skip creating history record for ${snapshot.docId} in workspace ${snapshot.spaceId}`
        );
        return false;
      }

      const historyMaxAge = await this.options
        .historyMaxAge(snapshot.spaceId)
        .catch(
          () =>
            0 /* edgecase: user deleted but owned workspaces not handled correctly */
        );

      if (historyMaxAge === 0) {
        return false;
      }

      await this.models.history.create(
        {
          spaceId: snapshot.spaceId,
          docId: snapshot.docId,
          timestamp: snapshot.timestamp,
          blob: Buffer.from(snapshot.bin),
          editorId: snapshot.editor,
        },
        historyMaxAge
      );

      metrics.doc
        .counter('history_created_counter', {
          description: 'How many times the snapshot history created',
        })
        .add(1);
      this.logger.debug(
        `History created for ${snapshot.docId} in workspace ${snapshot.spaceId}.`
      );
      return true;
    }

    return false;
  }

  protected async getDocSnapshot(workspaceId: string, docId: string) {
    const snapshot = await this.models.doc.get(workspaceId, docId);

    if (!snapshot) {
      return null;
    }

    return {
      spaceId: snapshot.spaceId,
      docId: snapshot.docId,
      bin: snapshot.blob,
      timestamp: snapshot.timestamp,
      // creator and editor may null if their account is deleted
      editor: snapshot.editorId,
    };
  }

  protected async setDocSnapshot(snapshot: DocRecord) {
    if (this.isEmptyBin(snapshot.bin)) {
      return false;
    }

    try {
      const blob = Buffer.from(snapshot.bin);
      const updatedSnapshot = await this.models.doc.upsert({
        spaceId: snapshot.spaceId,
        docId: snapshot.docId,
        blob,
        timestamp: snapshot.timestamp,
        editorId: snapshot.editor,
      });

      return !!updatedSnapshot;
    } catch (e) {
      metrics.doc.counter('snapshot_upsert_failed').add(1);
      this.logger.error('Failed to upsert snapshot', e);
      throw new FailedToUpsertSnapshot();
    }
  }

  protected override async lockDocForUpdate(
    workspaceId: string,
    docId: string
  ) {
    const lock = await this.mutex.acquire(`doc:update:${workspaceId}:${docId}`);

    if (!lock) {
      throw new Error('Too many concurrent writings');
    }

    return lock;
  }

  protected async lastDocHistory(workspaceId: string, id: string) {
    return this.models.history.getLatest(workspaceId, id);
  }
}
