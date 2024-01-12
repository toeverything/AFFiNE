import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Snapshot, Update } from '@prisma/client';
import { chunk } from 'lodash-es';
import { defer, retry } from 'rxjs';
import {
  applyUpdate,
  decodeStateVector,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  transact,
} from 'yjs';

import {
  Cache,
  Config,
  EventEmitter,
  type EventPayload,
  mergeUpdatesInApplyWay as jwstMergeUpdates,
  metrics,
  OnEvent,
  PrismaService,
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

/**
 * Detect whether rhs state is newer than lhs state.
 *
 * How could we tell a state is newer:
 *
 *   i. if the state vector size is larger, it's newer
 *  ii. if the state vector size is same, compare each client's state
 */
function isStateNewer(lhs: Buffer, rhs: Buffer): boolean {
  const lhsVector = decodeStateVector(lhs);
  const rhsVector = decodeStateVector(rhs);

  if (lhsVector.size < rhsVector.size) {
    return true;
  }

  for (const [client, state] of lhsVector) {
    const rstate = rhsVector.get(client);
    if (!rstate) {
      return false;
    }

    if (state < rstate) {
      return true;
    }
  }

  return false;
}

export function isEmptyBuffer(buf: Buffer): boolean {
  return (
    buf.length === 0 ||
    // 0x0000
    (buf.length === 2 && buf[0] === 0 && buf[1] === 0)
  );
}

const MAX_SEQ_NUM = 0x3fffffff; // u31

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
    private readonly db: PrismaService,
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
    if (
      this.config.affine.canary &&
      this.config.doc.manager.experimentalMergeWithJwstCodec &&
      updates.length < 100 /* avoid overloading */
    ) {
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
    if (this.config.doc.manager.experimentalMergeWithJwstCodec) {
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
    await new Promise<void>((resolve, reject) => {
      defer(async () => {
        const seq = await this.getUpdateSeq(workspaceId, guid);
        await this.db.update.create({
          select: {
            seq: true,
          },
          data: {
            workspaceId,
            id: guid,
            seq,
            blob: update,
          },
        });
      })
        .pipe(retry(retryTimes)) // retry until seq num not conflict
        .subscribe({
          next: () => {
            this.logger.debug(
              `pushed 1 update for ${guid} in workspace ${workspaceId}`
            );
            resolve();
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
    }).then(() => {
      return this.updateCachedUpdatesCount(workspaceId, guid, 1);
    });
  }

  async batchPush(
    workspaceId: string,
    guid: string,
    updates: Buffer[],
    retryTimes = 10
  ) {
    await new Promise<void>((resolve, reject) => {
      defer(async () => {
        const seq = await this.getUpdateSeq(workspaceId, guid, updates.length);
        let turn = 0;
        const batchCount = 10;
        for (const batch of chunk(updates, batchCount)) {
          await this.db.update.createMany({
            data: batch.map((update, i) => ({
              workspaceId,
              id: guid,
              // `seq` is the last seq num of the batch
              // example for 11 batched updates, start from seq num 20
              // seq for first update in the batch should be:
              // 31             - 11                + 0        * 10          + 0 + 1 = 21
              // ^ last seq num   ^ updates.length    ^ turn     ^ batchCount  ^i
              seq: seq - updates.length + turn * batchCount + i + 1,
              blob: update,
            })),
          });
          turn++;
        }
      })
        .pipe(retry(retryTimes)) // retry until seq num not conflict
        .subscribe({
          next: () => {
            this.logger.debug(
              `pushed ${updates.length} updates for ${guid} in workspace ${workspaceId}`
            );
            resolve();
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
    }).then(() => {
      return this.updateCachedUpdatesCount(workspaceId, guid, updates.length);
    });
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
      const doc = await this.squash(updates, snapshot);
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
      take: 100,
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

  private async upsert(
    workspaceId: string,
    guid: string,
    doc: Doc,
    // we always delay the snapshot update to avoid db overload,
    // so the value of `updatedAt` will not be accurate to user's real action time
    updatedAt: Date,
    initialSeq?: number
  ) {
    return this.lockSnapshotForUpsert(workspaceId, guid, async () => {
      const blob = Buffer.from(encodeStateAsUpdate(doc));

      if (isEmptyBuffer(blob)) {
        return false;
      }

      const state = Buffer.from(encodeStateVector(doc));

      return await this.db.$transaction(async db => {
        const snapshot = await db.snapshot.findUnique({
          where: {
            id_workspaceId: {
              id: guid,
              workspaceId,
            },
          },
        });

        // update
        if (snapshot) {
          // only update if state is newer
          if (isStateNewer(snapshot.state ?? Buffer.from([0]), state)) {
            await db.snapshot.update({
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
                blob,
                state,
                updatedAt,
              },
            });

            return true;
          } else {
            return false;
          }
        } else {
          // create
          await db.snapshot.create({
            select: {
              seq: true,
            },
            data: {
              id: guid,
              workspaceId,
              blob,
              state,
              seq: initialSeq,
              createdAt: updatedAt,
              updatedAt,
            },
          });

          return true;
        }
      });
    });
  }

  private async _get(
    workspaceId: string,
    guid: string
  ): Promise<{ doc: Doc } | { snapshot: Buffer } | null> {
    const snapshot = await this.getSnapshot(workspaceId, guid);
    const updates = await this.getUpdates(workspaceId, guid);

    if (updates.length) {
      return {
        doc: await this.squash(updates, snapshot),
      };
    }

    return snapshot ? { snapshot: snapshot.blob } : null;
  }

  /**
   * Squash updates into a single update and save it as snapshot,
   * and delete the updates records at the same time.
   */
  private async squash(updates: Update[], snapshot: Snapshot | null) {
    if (!updates.length) {
      throw new Error('No updates to squash');
    }
    const first = updates[0];
    const last = updates[updates.length - 1];

    const { id, workspaceId } = first;

    const doc = await this.applyUpdates(
      first.id,
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
      `doc:manager:updates`,
      `${workspaceId}::${guid}`,
      count
    );

    if (result <= 0) {
      await this.cache.mapDelete(
        `doc:manager:updates`,
        `${workspaceId}::${guid}`
      );
    }
  }

  private async getAutoSquashCandidateFromCache() {
    const key = await this.cache.mapRandomKey('doc:manager:updates');

    if (key) {
      const count = await this.cache.mapGet<number>('doc:manager:updates', key);
      if (typeof count === 'number' && count > 0) {
        const [workspaceId, id] = key.split('::');
        return { id, workspaceId };
      }
    }

    return null;
  }

  private async doWithLock<T>(lock: string, job: () => Promise<T>) {
    const acquired = await this.cache.setnx(lock, 1, {
      ttl: 60 * 1000,
    });

    if (!acquired) {
      return;
    }

    try {
      return await job();
    } finally {
      await this.cache.delete(lock).catch(e => {
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
      `doc:manager:updates-lock:${workspaceId}::${guid}`,
      job
    );
  }

  async lockSnapshotForUpsert<T>(
    workspaceId: string,
    guid: string,
    job: () => Promise<T>
  ) {
    return this.doWithLock(
      `doc:manager:snapshot-lock:${workspaceId}::${guid}`,
      job
    );
  }
}
