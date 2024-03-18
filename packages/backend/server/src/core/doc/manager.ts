import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient, Snapshot, Update } from '@prisma/client';
import { chunk } from 'lodash-es';
import { defer, retry } from 'rxjs';
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  transact,
} from 'yjs';

import {
  Cache,
  CallTimer,
  Config,
  EventEmitter,
  type EventPayload,
  mergeUpdatesInApplyWay as jwstMergeUpdates,
  metrics,
  OnEvent,
} from '../../fundamentals';

function compare(yBinary: Buffer, jwstBinary: Buffer, strict = false): boolean {
  if (yBinary.equals(jwstBinary)) {
    return true;
  }

  if (strict) {
    return false;
  }

  const doc = new Doc();
  applyUpdate(doc, jwstBinary);

  const yBinary2 = Buffer.from(encodeStateAsUpdate(doc));

  return compare(yBinary, yBinary2, true);
}

export function isEmptyBuffer(buf: Buffer): boolean {
  return (
    buf.length === 0 ||
    // 0x0000
    (buf.length === 2 && buf[0] === 0 && buf[1] === 0)
  );
}

const MAX_SEQ_NUM = 0x3fffffff; // u31
const UPDATES_QUEUE_CACHE_KEY = 'doc:manager:updates';

/**
 * Since we can't directly save all client updates into database, in which way the database will overload,
 * we need to buffer the updates and merge them to reduce db write.
 *
 * And also, if a new client join, it would be nice to see the latest doc asap,
 * so we need to at least store a snapshot of the doc and return quickly,
 * along side all the updates that have not been applies to that snapshot(timestamp).
 */
@Injectable()
export class DocManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocManager.name);
  private job: NodeJS.Timeout | null = null;
  private readonly seqMap = new Map<string, number>();
  private busy = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly config: Config,
    private readonly cache: Cache,
    private readonly event: EventEmitter
  ) {}

  onModuleInit() {
    if (this.config.doc.manager.enableUpdateAutoMerging) {
      this.logger.log('Use Database');
      this.setup();
    }
  }

  onModuleDestroy() {
    this.destroy();
  }

  @CallTimer('doc', 'yjs_recover_updates_to_doc')
  private recoverDoc(...updates: Buffer[]): Promise<Doc> {
    const doc = new Doc();
    const chunks = chunk(updates, 10);

    return new Promise(resolve => {
      const next = () => {
        const updates = chunks.shift();
        if (updates?.length) {
          transact(doc, () => {
            updates.forEach(u => {
              try {
                applyUpdate(doc, u);
              } catch (e) {
                this.logger.error('Failed to apply update', e);
              }
            });
          });

          // avoid applying too many updates in single round which will take the whole cpu time like dead lock
          setImmediate(() => {
            next();
          });
        } else {
          resolve(doc);
        }
      };

      next();
    });
  }

  private async applyUpdates(guid: string, ...updates: Buffer[]): Promise<Doc> {
    const doc = await this.recoverDoc(...updates);

    // test jwst codec
    if (this.config.doc.manager.experimentalMergeWithYOcto) {
      metrics.jwst.counter('codec_merge_counter').add(1);
      const yjsResult = Buffer.from(encodeStateAsUpdate(doc));
      let log = false;
      try {
        const jwstResult = jwstMergeUpdates(updates);
        if (!compare(yjsResult, jwstResult)) {
          metrics.jwst.counter('codec_not_match').add(1);
          this.logger.warn(
            `jwst codec result doesn't match yjs codec result for: ${guid}`
          );
          log = true;
          if (this.config.node.dev) {
            this.logger.warn(`Expected:\n  ${yjsResult.toString('hex')}`);
            this.logger.warn(`Result:\n  ${jwstResult.toString('hex')}`);
          }
        }
      } catch (e) {
        metrics.jwst.counter('codec_fails_counter').add(1);
        this.logger.warn(`jwst apply update failed for ${guid}: ${e}`);
        log = true;
      } finally {
        if (log && this.config.node.dev) {
          this.logger.warn(
            `Updates: ${updates.map(u => u.toString('hex')).join('\n')}`
          );
        }
      }
    }

    return doc;
  }

  /**
   * setup pending update processing loop
   */
  setup() {
    this.job = setInterval(() => {
      if (!this.busy) {
        this.busy = true;
        this.autoSquash()
          .catch(() => {
            /* we handle all errors in work itself */
          })
          .finally(() => {
            this.busy = false;
          });
      }
    }, this.config.doc.manager.updatePollInterval);

    this.logger.log('Automation started');
    if (this.config.doc.manager.experimentalMergeWithYOcto) {
      this.logger.warn(
        'Experimental feature enabled: merge updates with jwst codec is enabled'
      );
    }
  }

  /**
   * stop pending update processing loop
   */
  destroy() {
    if (this.job) {
      clearInterval(this.job);
      this.job = null;
      this.logger.log('Automation stopped');
    }
  }

  @OnEvent('workspace.deleted')
  async onWorkspaceDeleted(workspaceId: string) {
    await this.db.snapshot.deleteMany({
      where: {
        workspaceId,
      },
    });
    await this.db.update.deleteMany({
      where: {
        workspaceId,
      },
    });
  }

  @OnEvent('snapshot.deleted')
  async onSnapshotDeleted({
    id,
    workspaceId,
  }: EventPayload<'snapshot.deleted'>) {
    await this.db.update.deleteMany({
      where: {
        id,
        workspaceId,
      },
    });
  }

  /**
   * add update to manager for later processing.
   */
  async push(
    workspaceId: string,
    guid: string,
    update: Buffer,
    retryTimes = 10
  ) {
    const timestamp = await new Promise<number>((resolve, reject) => {
      defer(async () => {
        const seq = await this.getUpdateSeq(workspaceId, guid);
        const { createdAt } = await this.db.update.create({
          select: {
            createdAt: true,
          },
          data: {
            workspaceId,
            id: guid,
            seq,
            blob: update,
          },
        });

        return createdAt.getTime();
      })
        .pipe(retry(retryTimes)) // retry until seq num not conflict
        .subscribe({
          next: timestamp => {
            this.logger.debug(
              `pushed 1 update for ${guid} in workspace ${workspaceId}`
            );
            resolve(timestamp);
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
    });

    await this.updateCachedUpdatesCount(workspaceId, guid, 1);

    return timestamp;
  }

  async batchPush(
    workspaceId: string,
    guid: string,
    updates: Buffer[],
    retryTimes = 10
  ) {
    const timestamp = await new Promise<number>((resolve, reject) => {
      defer(async () => {
        const lastSeq = await this.getUpdateSeq(
          workspaceId,
          guid,
          updates.length
        );
        const now = Date.now();
        let timestamp = now;
        let turn = 0;
        const batchCount = 10;
        for (const batch of chunk(updates, batchCount)) {
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
                id: guid,
                blob: update,
                seq,
                createdAt: new Date(createdAt), // make sure the updates can be ordered by create time
              };
            }),
          });
          turn++;
        }

        return timestamp;
      })
        .pipe(retry(retryTimes)) // retry until seq num not conflict
        .subscribe({
          next: timestamp => {
            this.logger.debug(
              `pushed ${updates.length} updates for ${guid} in workspace ${workspaceId}`
            );
            resolve(timestamp);
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
    });
    await this.updateCachedUpdatesCount(workspaceId, guid, updates.length);

    return timestamp;
  }

  /**
   * Get latest timestamp of all docs in the workspace.
   */
  @CallTimer('doc', 'get_stats')
  async getStats(workspaceId: string, after: number | undefined = 0) {
    const snapshots = await this.db.snapshot.findMany({
      where: {
        workspaceId,
        updatedAt: {
          gt: new Date(after),
        },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    const updates = await this.db.update.groupBy({
      where: {
        workspaceId,
        createdAt: {
          gt: new Date(after),
        },
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

  /**
   * get the latest doc with all update applied.
   */
  async get(workspaceId: string, guid: string): Promise<Doc | null> {
    const result = await this._get(workspaceId, guid);
    if (result) {
      if ('doc' in result) {
        return result.doc;
      } else if ('snapshot' in result) {
        return this.recoverDoc(result.snapshot);
      }
    }

    return null;
  }

  /**
   * get the latest doc binary with all update applied.
   */
  async getBinary(workspaceId: string, guid: string): Promise<Buffer | null> {
    const result = await this._get(workspaceId, guid);
    if (result) {
      if ('doc' in result) {
        return Buffer.from(encodeStateAsUpdate(result.doc));
      } else if ('snapshot' in result) {
        return result.snapshot;
      }
    }

    return null;
  }

  /**
   * get the latest doc state vector with all update applied.
   */
  async getState(workspaceId: string, guid: string): Promise<Buffer | null> {
    const snapshot = await this.getSnapshot(workspaceId, guid);
    const updates = await this.getUpdates(workspaceId, guid);

    if (updates.length) {
      const doc = await this.squash(snapshot, updates);
      return Buffer.from(encodeStateVector(doc));
    }

    return snapshot ? snapshot.state : null;
  }

  /**
   * get the snapshot of the doc we've seen.
   */
  async getSnapshot(workspaceId: string, guid: string) {
    return this.db.snapshot.findUnique({
      where: {
        id_workspaceId: {
          workspaceId,
          id: guid,
        },
      },
    });
  }

  /**
   * get pending updates
   */
  async getUpdates(workspaceId: string, guid: string) {
    const updates = await this.db.update.findMany({
      where: {
        workspaceId,
        id: guid,
      },
      // take it ease, we don't want to overload db and or cpu
      // if we limit the taken number here,
      // user will never see the latest doc if there are too many updates pending to be merged.
      take: this.config.doc.manager.maxUpdatesPullCount,
    });

    // perf(memory): avoid sorting in db
    return updates.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  /**
   * apply pending updates to snapshot
   */
  private async autoSquash() {
    // find the first update and batch process updates with same id
    const candidate = await this.getAutoSquashCandidate();

    // no pending updates
    if (!candidate) {
      return;
    }

    const { id, workspaceId } = candidate;

    await this.lockUpdatesForAutoSquash(workspaceId, id, async () => {
      try {
        await this._get(workspaceId, id);
      } catch (e) {
        this.logger.error(
          `Failed to apply updates for workspace: ${workspaceId}, guid: ${id}`
        );
        this.logger.error(e);
      }
    });
  }

  private async getAutoSquashCandidate() {
    const cache = await this.getAutoSquashCandidateFromCache();

    if (cache) {
      return cache;
    }

    return this.db.update.findFirst({
      select: {
        id: true,
        workspaceId: true,
      },
    });
  }

  /**
   * @returns whether the snapshot is updated to the latest, `undefined` means the doc to be upserted is outdated.
   */
  @CallTimer('doc', 'upsert')
  private async upsert(
    workspaceId: string,
    guid: string,
    doc: Doc,
    // we always delay the snapshot update to avoid db overload,
    // so the value of auto updated `updatedAt` by db will never be accurate to user's real action time
    updatedAt: Date,
    seq: number
  ) {
    const blob = Buffer.from(encodeStateAsUpdate(doc));

    if (isEmptyBuffer(blob)) {
      return undefined;
    }

    const state = Buffer.from(encodeStateVector(doc));

    // CONCERNS:
    //   i. Because we save the real user's last seen action time as `updatedAt`,
    //      it's possible to simply compare the `updatedAt` to determine if the snapshot is older than the one we are going to save.
    //
    //  ii. Prisma doesn't support `upsert` with additional `where` condition along side unique constraint.
    //      In our case, we need to manually check the `updatedAt` to avoid overriding the newer snapshot.
    //      where: { id_workspaceId: {}, updatedAt: { lt: updatedAt } }
    //                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //
    // iii. Only set the seq number when creating the snapshot.
    //      For updating scenario, the seq number will be updated when updates pushed to db.
    try {
      const result: { updatedAt: Date }[] = await this.db.$queryRaw`
        INSERT INTO "snapshots" ("workspace_id", "guid", "blob", "state", "seq", "created_at", "updated_at")
        VALUES (${workspaceId}, ${guid}, ${blob}, ${state}, ${seq}, DEFAULT, ${updatedAt})
        ON CONFLICT ("workspace_id", "guid")
        DO UPDATE SET "blob" = ${blob}, "state" = ${state}, "updated_at" = ${updatedAt}, "seq" = ${seq}
        WHERE "snapshots"."workspace_id" = ${workspaceId} AND "snapshots"."guid" = ${guid} AND "snapshots"."updated_at" <= ${updatedAt}
        RETURNING "snapshots"."workspace_id" as "workspaceId", "snapshots"."guid" as "id", "snapshots"."updated_at" as "updatedAt"
      `;

      // const result = await this.db.snapshot.upsert({
      //   select: {
      //     updatedAt: true,
      //     seq: true,
      //   },
      //   where: {
      //     id_workspaceId: {
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

      if (!updatedSnapshot) {
        return undefined;
      }

      return true;
    } catch (e) {
      this.logger.error('Failed to upsert snapshot', e);
      return false;
    }
  }

  private async _get(
    workspaceId: string,
    guid: string
  ): Promise<{ doc: Doc } | { snapshot: Buffer } | null> {
    const snapshot = await this.getSnapshot(workspaceId, guid);
    const updates = await this.getUpdates(workspaceId, guid);

    if (updates.length) {
      return {
        doc: await this.squash(snapshot, updates),
      };
    }

    return snapshot ? { snapshot: snapshot.blob } : null;
  }

  /**
   * Squash updates into a single update and save it as snapshot,
   * and delete the updates records at the same time.
   */
  @CallTimer('doc', 'squash')
  private async squash(snapshot: Snapshot | null, updates: Update[]) {
    if (!updates.length) {
      throw new Error('No updates to squash');
    }

    const last = updates[updates.length - 1];
    const { id, workspaceId } = last;

    const doc = await this.applyUpdates(
      id,
      snapshot ? snapshot.blob : Buffer.from([0, 0]),
      ...updates.map(u => u.blob)
    );

    const done = await this.upsert(
      workspaceId,
      id,
      doc,
      last.createdAt,
      last.seq
    );

    if (done) {
      if (snapshot) {
        this.event.emit('snapshot.updated', {
          id,
          workspaceId,
          previous: {
            blob: snapshot.blob,
            state: snapshot.state,
            updatedAt: snapshot.updatedAt,
          },
        });
      }

      this.logger.debug(
        `Squashed ${updates.length} updates for ${id} in workspace ${workspaceId}`
      );
    }

    // we will keep the updates only if the upsert failed on unknown reason
    // `done === undefined` means the updates is outdated(have already been merged by other process), safe to be deleted
    // `done === true` means the upsert is successful, safe to be deleted
    if (done !== false) {
      // always delete updates
      // the upsert will return false if the state is not newer, so we don't need to worry about it
      const { count } = await this.db.update.deleteMany({
        where: {
          id,
          workspaceId,
          seq: {
            in: updates.map(u => u.seq),
          },
        },
      });

      await this.updateCachedUpdatesCount(workspaceId, id, -count);
    }

    return doc;
  }

  private async getUpdateSeq(workspaceId: string, guid: string, batch = 1) {
    try {
      const { seq } = await this.db.snapshot.update({
        select: {
          seq: true,
        },
        where: {
          id_workspaceId: {
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

      // reset
      if (seq >= MAX_SEQ_NUM) {
        await this.db.snapshot.update({
          select: {
            seq: true,
          },
          where: {
            id_workspaceId: {
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

  private async getAutoSquashCandidateFromCache() {
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
          await this.cache.mapDelete(UPDATES_QUEUE_CACHE_KEY, key);

          return null;
        }
        return { id, workspaceId };
      }
    }

    return null;
  }

  private async doWithLock<T>(
    lockScope: string,
    lockResource: string,
    job: () => Promise<T>
  ) {
    const lock = `lock:${lockScope}:${lockResource}`;
    const acquired = await this.cache.setnx(lock, 1, {
      ttl: 60 * 1000,
    });
    metrics.doc.counter('lock').add(1, { scope: lockScope });

    if (!acquired) {
      metrics.doc.counter('lock_failed').add(1, { scope: lockScope });
      return;
    }
    metrics.doc.counter('lock_required').add(1, { scope: lockScope });

    try {
      return await job();
    } finally {
      await this.cache
        .delete(lock)
        .then(() => {
          metrics.doc.counter('lock_released').add(1, { scope: lockScope });
        })
        .catch(e => {
          metrics.doc
            .counter('lock_release_failed')
            .add(1, { scope: lockScope });
          // safe, the lock will be expired when ttl ends
          this.logger.error(`Failed to release lock ${lock}`, e);
        });
    }
  }

  private async lockUpdatesForAutoSquash<T>(
    workspaceId: string,
    guid: string,
    job: () => Promise<T>
  ) {
    return this.doWithLock(
      'doc:manager:updates',
      `${workspaceId}::${guid}`,
      job
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reportUpdatesQueueCount() {
    metrics.doc
      .gauge('updates_queue_count')
      .record(await this.db.update.count());
  }
}
