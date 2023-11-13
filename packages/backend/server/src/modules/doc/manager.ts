import {
  Inject,
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
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  transact,
} from 'yjs';

import { Config } from '../../config';
import { Metrics } from '../../metrics/metrics';
import { PrismaService } from '../../prisma';
import { mergeUpdatesInApplyWay as jwstMergeUpdates } from '../../storage';

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

function isEmptyBuffer(buf: Buffer): boolean {
  return (
    buf.length == 0 ||
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
  protected logger = new Logger(DocManager.name);
  private job: NodeJS.Timeout | null = null;
  private seqMap = new Map<string, number>();
  private busy = false;

  constructor(
    protected readonly db: PrismaService,
    @Inject('DOC_MANAGER_AUTOMATION')
    protected readonly automation: boolean,
    protected readonly config: Config,
    protected readonly metrics: Metrics
  ) {}

  onModuleInit() {
    if (this.automation) {
      this.logger.log('Use Database');
      this.setup();
    }
  }

  onModuleDestroy() {
    this.destroy();
  }

  protected recoverDoc(...updates: Buffer[]): Promise<Doc> {
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
                this.logger.error(
                  `Failed to apply update: ${updates
                    .map(u => u.toString('hex'))
                    .join('\n')}`
                );
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

  protected async applyUpdates(
    guid: string,
    ...updates: Buffer[]
  ): Promise<Doc> {
    const doc = await this.recoverDoc(...updates);

    // test jwst codec
    if (
      this.config.doc.manager.experimentalMergeWithJwstCodec &&
      updates.length < 100 /* avoid overloading */
    ) {
      this.metrics.jwstCodecMerge(1, {});
      const yjsResult = Buffer.from(encodeStateAsUpdate(doc));
      let log = false;
      try {
        const jwstResult = jwstMergeUpdates(updates);
        if (!compare(yjsResult, jwstResult)) {
          this.metrics.jwstCodecDidnotMatch(1, {});
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
        this.metrics.jwstCodecFail(1, {});
        this.logger.warn(`jwst apply update failed for ${guid}: ${e}`);
        log = true;
      } finally {
        if (log) {
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
            this.logger.verbose(
              `pushed update for workspace: ${workspaceId}, guid: ${guid}`
            );
            resolve();
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
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
            this.logger.verbose(
              `pushed updates for workspace: ${workspaceId}, guid: ${guid}`
            );
            resolve();
          },
          error: e => {
            this.logger.error('Failed to push updates', e);
            reject(new Error('Failed to push update'));
          },
        });
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
  protected async autoSquash() {
    // find the first update and batch process updates with same id
    const first = await this.db.update.findFirst({
      select: {
        id: true,
        workspaceId: true,
      },
    });

    // no pending updates
    if (!first) {
      return;
    }

    const { id, workspaceId } = first;

    try {
      await this._get(workspaceId, id);
    } catch (e) {
      this.logger.error(
        `Failed to apply updates for workspace: ${workspaceId}, guid: ${id}`
      );
      this.logger.error(e);
    }
  }

  protected async upsert(
    workspaceId: string,
    guid: string,
    doc: Doc,
    seq?: number
  ) {
    const blob = Buffer.from(encodeStateAsUpdate(doc));
    const state = Buffer.from(encodeStateVector(doc));

    if (isEmptyBuffer(blob)) {
      return;
    }

    await this.db.snapshot.upsert({
      select: {
        seq: true,
      },
      where: {
        id_workspaceId: {
          id: guid,
          workspaceId,
        },
      },
      create: {
        id: guid,
        workspaceId,
        blob,
        state,
        seq,
      },
      update: {
        blob,
        state,
      },
    });
  }

  protected async _get(
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
  protected async squash(updates: Update[], snapshot: Snapshot | null) {
    if (!updates.length) {
      throw new Error('No updates to squash');
    }
    const first = updates[0];
    const last = updates[updates.length - 1];

    const doc = await this.applyUpdates(
      first.id,
      snapshot ? snapshot.blob : Buffer.from([0, 0]),
      ...updates.map(u => u.blob)
    );

    const { id, workspaceId } = first;

    await this.upsert(workspaceId, id, doc, last.seq);
    await this.db.update.deleteMany({
      where: {
        id,
        workspaceId,
        seq: {
          in: updates.map(u => u.seq),
        },
      },
    });
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
}
