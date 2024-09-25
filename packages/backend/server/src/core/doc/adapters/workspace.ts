import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { chunk } from 'lodash-es';

import {
  Cache,
  DocHistoryNotFound,
  DocNotFound,
  EventEmitter,
  FailedToSaveUpdates,
  FailedToUpsertSnapshot,
  metrics,
  Mutex,
} from '../../../fundamentals';
import { retryable } from '../../../fundamentals/utils/promise';
import { DocStorageOptions } from '../options';
import {
  DocRecord,
  DocStorageAdapter,
  DocUpdate,
  HistoryFilter,
} from '../storage';

const UPDATES_QUEUE_CACHE_KEY = 'doc:manager:updates';

@Injectable()
export class PgWorkspaceDocStorageAdapter extends DocStorageAdapter {
  private readonly logger = new Logger(PgWorkspaceDocStorageAdapter.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly mutex: Mutex,
    private readonly cache: Cache,
    private readonly event: EventEmitter,
    protected override readonly options: DocStorageOptions
  ) {
    super(options);
  }

  async pushDocUpdates(
    workspaceId: string,
    docId: string,
    updates: Uint8Array[],
    editorId?: string
  ) {
    if (!updates.length) {
      return 0;
    }

    let pendings = updates;
    let done = 0;
    let timestamp = Date.now();
    try {
      await retryable(async () => {
        if (done !== 0) {
          pendings = pendings.slice(done);
        }

        // TODO(@forehalo): remove in next release
        const lastSeq = await this.getUpdateSeq(
          workspaceId,
          docId,
          updates.length
        );

        let turn = 0;
        const batchCount = 10;
        for (const batch of chunk(pendings, batchCount)) {
          const now = Date.now();
          await this.db.update.createMany({
            data: batch.map((update, i) => {
              const subSeq = turn * batchCount + i + 1;
              // `seq` is the last seq num of the batch
              // example for 11 batched updates, start from seq num 20
              // seq for first update in the batch should be:
              // 31             - 11                + subSeq(0        * 10          + 0 + 1) = 21
              // ^ last seq num   ^ updates.length           ^ turn     ^ batchCount  ^i
              const seq = lastSeq - updates.length + subSeq;
              const createdAt = now + subSeq;
              timestamp = Math.max(timestamp, createdAt);

              return {
                workspaceId,
                id: docId,
                blob: Buffer.from(update),
                seq,
                createdAt: new Date(createdAt),
                createdBy: editorId || null,
              };
            }),
          });
          turn++;
          done += batch.length;
          await this.updateCachedUpdatesCount(workspaceId, docId, batch.length);
        }
      });
    } catch (e) {
      this.logger.error('Failed to insert doc updates', e);
      metrics.doc.counter('doc_update_insert_failed').add(1);
      throw new FailedToSaveUpdates();
    }
    return timestamp;
  }

  protected async getDocUpdates(workspaceId: string, docId: string) {
    const rows = await this.db.update.findMany({
      where: {
        workspaceId,
        id: docId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return rows.map(row => ({
      bin: row.blob,
      timestamp: row.createdAt.getTime(),
      editor: row.createdBy || undefined,
    }));
  }

  async deleteDoc(workspaceId: string, docId: string) {
    const ident = { where: { workspaceId, id: docId } };
    await this.db.$transaction([
      this.db.snapshot.deleteMany(ident),
      this.db.update.deleteMany(ident),
      this.db.snapshotHistory.deleteMany(ident),
    ]);
  }

  async deleteSpace(workspaceId: string) {
    const ident = { where: { workspaceId } };
    await this.db.$transaction([
      this.db.snapshot.deleteMany(ident),
      this.db.update.deleteMany(ident),
      this.db.snapshotHistory.deleteMany(ident),
    ]);
  }

  async getSpaceDocTimestamps(workspaceId: string, after?: number) {
    const snapshots = await this.db.snapshot.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      where: {
        workspaceId,
        ...(after
          ? {
              updatedAt: {
                gt: new Date(after),
              },
            }
          : {}),
      },
    });

    const updates = await this.db.update.groupBy({
      where: {
        workspaceId,
        ...(after
          ? {
              // [createdAt] in updates table is indexed, so it's fast
              createdAt: {
                gt: new Date(after),
              },
            }
          : {}),
      },
      by: ['id'],
      _max: {
        createdAt: true,
      },
    });

    const result: Record<string, number> = {};

    snapshots.forEach(s => {
      result[s.id] = s.updatedAt.getTime();
    });

    updates.forEach(u => {
      if (u._max.createdAt) {
        result[u.id] = u._max.createdAt.getTime();
      }
    });

    return result;
  }

  protected async markUpdatesMerged(
    workspaceId: string,
    docId: string,
    updates: DocUpdate[]
  ) {
    const result = await this.db.update.deleteMany({
      where: {
        workspaceId,
        id: docId,
        createdAt: {
          in: updates.map(u => new Date(u.timestamp)),
        },
      },
    });

    await this.updateCachedUpdatesCount(workspaceId, docId, -result.count);
    return result.count;
  }

  async listDocHistories(
    workspaceId: string,
    docId: string,
    query: HistoryFilter
  ) {
    const histories = await this.db.snapshotHistory.findMany({
      select: {
        timestamp: true,
        createdByUser: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
      },
      where: {
        workspaceId,
        id: docId,
        timestamp: {
          lt: query.before ? new Date(query.before) : new Date(),
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: query.limit,
    });

    return histories.map(h => ({
      timestamp: h.timestamp.getTime(),
      editor: h.createdByUser,
    }));
  }

  async getDocHistory(workspaceId: string, docId: string, timestamp: number) {
    const history = await this.db.snapshotHistory.findUnique({
      where: {
        workspaceId_id_timestamp: {
          workspaceId,
          id: docId,
          timestamp: new Date(timestamp),
        },
      },
    });

    if (!history) {
      return null;
    }

    return {
      spaceId: workspaceId,
      docId,
      bin: history.blob,
      timestamp,
      editor: history.createdBy || undefined,
    };
  }

  override async rollbackDoc(
    spaceId: string,
    docId: string,
    timestamp: number,
    editorId?: string
  ): Promise<void> {
    await using _lock = await this.lockDocForUpdate(spaceId, docId);
    const toSnapshot = await this.getDocHistory(spaceId, docId, timestamp);
    if (!toSnapshot) {
      throw new DocHistoryNotFound({ spaceId, docId, timestamp });
    }

    const fromSnapshot = await this.getDocSnapshot(spaceId, docId);

    if (!fromSnapshot) {
      throw new DocNotFound({ spaceId, docId });
    }

    // force create a new history record after rollback
    await this.createDocHistory(
      {
        ...fromSnapshot,
        // override the editor to the one who requested the rollback
        editor: editorId,
      },
      true
    );
    // WARN:
    //  we should never do the snapshot updating in recovering,
    //  which is not the solution in CRDT.
    //  let user revert in client and update the data in sync system
    //    const change = this.generateChangeUpdate(fromSnapshot.bin, toSnapshot.bin);
    //    await this.pushDocUpdates(spaceId, docId, [change]);

    metrics.doc
      .counter('history_recovered_counter', {
        description: 'How many times history recovered request happened',
      })
      .add(1);
  }

  protected async createDocHistory(snapshot: DocRecord, force = false) {
    const last = await this.lastDocHistory(snapshot.spaceId, snapshot.docId);

    let shouldCreateHistory = false;

    if (!last) {
      // never created
      shouldCreateHistory = true;
    } else {
      const lastHistoryTimestamp = last.timestamp.getTime();
      if (lastHistoryTimestamp === snapshot.timestamp) {
        // no change
        shouldCreateHistory = false;
      } else if (
        // force
        force ||
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

      await this.db.snapshotHistory
        .create({
          select: {
            timestamp: true,
          },
          data: {
            workspaceId: snapshot.spaceId,
            id: snapshot.docId,
            timestamp: new Date(snapshot.timestamp),
            blob: Buffer.from(snapshot.bin),
            createdBy: snapshot.editor,
            expiredAt: new Date(Date.now() + historyMaxAge),
          },
        })
        .catch(() => {
          // safe to ignore
          // only happens when duplicated history record created in multi processes
        });

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
    const snapshot = await this.db.snapshot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: docId,
        },
      },
    });

    if (!snapshot) {
      return null;
    }

    return {
      spaceId: workspaceId,
      docId,
      bin: snapshot.blob,
      timestamp: snapshot.updatedAt.getTime(),
      // creator and editor may null if their account is deleted
      editor: snapshot.updatedBy || snapshot.createdBy || undefined,
    };
  }

  protected async setDocSnapshot(snapshot: DocRecord) {
    const { spaceId, docId, bin, timestamp } = snapshot;

    if (this.isEmptyBin(bin)) {
      return false;
    }

    const updatedAt = new Date(timestamp);

    // CONCERNS:
    //   i. Because we save the real user's last seen action time as `updatedAt`,
    //      it's possible to simply compare the `updatedAt` to determine if the snapshot is older than the one we are going to save.
    //
    //  ii. Prisma doesn't support `upsert` with additional `where` condition along side unique constraint.
    //      In our case, we need to manually check the `updatedAt` to avoid overriding the newer snapshot.
    //      where: { workspaceId_id: {}, updatedAt: { lt: updatedAt } }
    //                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    try {
      const result: { updatedAt: Date }[] = await this.db.$queryRaw`
        INSERT INTO "snapshots" ("workspace_id", "guid", "blob", "created_at", "updated_at", "created_by", "updated_by")
        VALUES (${spaceId}, ${docId}, ${bin}, DEFAULT, ${updatedAt}, ${snapshot.editor}, ${snapshot.editor})
        ON CONFLICT ("workspace_id", "guid")
        DO UPDATE SET "blob" = ${bin}, "updated_at" = ${updatedAt}, "updated_by" = ${snapshot.editor}
        WHERE "snapshots"."workspace_id" = ${spaceId} AND "snapshots"."guid" = ${docId} AND "snapshots"."updated_at" <= ${updatedAt}
        RETURNING "snapshots"."workspace_id" as "workspaceId", "snapshots"."guid" as "id", "snapshots"."updated_at" as "updatedAt"
      `;

      // const result = await this.db.snapshot.upsert({
      //   select: {
      //     updatedAt: true,
      //     seq: true,
      //   },
      //   where: {
      //     workspaceId_id: {
      //       workspaceId,
      //       id: guid,
      //     },
      //     ⬇️ NOT SUPPORTED BY PRISMA YET
      //     updatedAt: {
      //       lt: updatedAt,
      //     },
      //   },
      //   update: {
      //     blob,
      //     state,
      //     updatedAt,
      //   },
      //   create: {
      //     workspaceId,
      //     id: guid,
      //     blob,
      //     state,
      //     updatedAt,
      //     seq,
      //   },
      // });

      // if the condition `snapshot.updatedAt > updatedAt` is true, by which means the snapshot has already been updated by other process,
      // the updates has been applied to current `doc` must have been seen by the other process as well.
      // The `updatedSnapshot` will be `undefined` in this case.
      const updatedSnapshot = result.at(0);

      if (updatedSnapshot) {
        this.event.emit('snapshot.updated', {
          workspaceId: snapshot.spaceId,
          id: snapshot.docId,
        });
      }

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
    const lock = await this.mutex.lock(`doc:update:${workspaceId}:${docId}`);

    if (!lock) {
      throw new Error('Too many concurrent writings');
    }

    return lock;
  }

  protected async lastDocHistory(workspaceId: string, id: string) {
    return this.db.snapshotHistory.findFirst({
      where: {
        workspaceId,
        id,
      },
      select: {
        timestamp: true,
        state: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  // for auto merging
  async randomDoc() {
    const key = await this.cache.mapRandomKey(UPDATES_QUEUE_CACHE_KEY);

    if (key) {
      const cachedCount = await this.cache.mapIncrease(
        UPDATES_QUEUE_CACHE_KEY,
        key,
        0
      );

      if (cachedCount > 0) {
        const [workspaceId, id] = key.split('::');
        const count = await this.db.update.count({
          where: {
            workspaceId,
            id,
          },
        });

        // FIXME(@forehalo): somehow the update count in cache is not accurate
        if (count === 0) {
          metrics.doc
            .counter('doc_update_count_inconsistent_with_cache')
            .add(1);
          await this.cache.mapDelete(UPDATES_QUEUE_CACHE_KEY, key);
          return null;
        }

        return { workspaceId, docId: id };
      }
    }

    return null;
  }

  private async updateCachedUpdatesCount(
    workspaceId: string,
    guid: string,
    count: number
  ) {
    const result = await this.cache.mapIncrease(
      UPDATES_QUEUE_CACHE_KEY,
      `${workspaceId}::${guid}`,
      count
    );

    if (result <= 0) {
      await this.cache.mapDelete(
        UPDATES_QUEUE_CACHE_KEY,
        `${workspaceId}::${guid}`
      );
    }
  }

  /**
   * @deprecated
   */
  private readonly seqMap = new Map<string, number>();
  /**
   *
   * @deprecated updates do not rely on seq number anymore
   *
   * keep in next release to avoid downtime when upgrading instances
   */
  private async getUpdateSeq(workspaceId: string, guid: string, batch = 1) {
    const MAX_SEQ_NUM = 0x3fffffff; // u31

    try {
      const { seq } = await this.db.snapshot.update({
        select: {
          seq: true,
        },
        where: {
          workspaceId_id: {
            workspaceId,
            id: guid,
          },
        },
        data: {
          seq: {
            increment: batch,
          },
        },
      });

      if (!seq) {
        return batch;
      }

      // reset
      if (seq >= MAX_SEQ_NUM) {
        await this.db.snapshot.update({
          select: {
            seq: true,
          },
          where: {
            workspaceId_id: {
              workspaceId,
              id: guid,
            },
          },
          data: {
            seq: 0,
          },
        });
      }

      return seq;
    } catch {
      // not existing snapshot just count it from 1
      const last = this.seqMap.get(workspaceId + guid) ?? 0;
      this.seqMap.set(workspaceId + guid, last + batch);
      return last + batch;
    }
  }
}
