import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Snapshot, Update } from '@prisma/client';
import { defer, retry } from 'rxjs';
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from 'yjs';

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

  protected recoverDoc(...updates: Buffer[]): Doc {
    const doc = new Doc();

    updates.forEach((update, i) => {
      try {
        if (update.length) {
          applyUpdate(doc, update);
        }
      } catch (e) {
        this.logger.error(
          `Failed to apply updates, index: ${i}\nUpdate: ${updates
            .map(u => u.toString('hex'))
            .join('\n')}`
        );
      }
    });

    return doc;
  }

  protected applyUpdates(guid: string, ...updates: Buffer[]): Doc {
    const doc = this.recoverDoc(...updates);
    this.metrics.jwstCodecMerge(1, {});

    // test jwst codec
    if (this.config.doc.manager.experimentalMergeWithJwstCodec) {
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
  async push(workspaceId: string, guid: string, update: Buffer) {
    await new Promise<void>((resolve, reject) => {
      defer(async () => {
        const seq = await this.getUpdateSeq(workspaceId, guid);
        await this.db.update.create({
          data: {
            workspaceId,
            id: guid,
            seq,
            blob: update,
          },
        });
      })
        .pipe(retry(MAX_SEQ_NUM)) // retry until seq num not conflict
        .subscribe({
          next: () => {
            this.logger.verbose(
              `pushed update for workspace: ${workspaceId}, guid: ${guid}`
            );
            resolve();
          },
          error: reject,
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
  protected async getSnapshot(workspaceId: string, guid: string) {
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
  protected async getUpdates(workspaceId: string, guid: string) {
    return this.db.update.findMany({
      where: {
        workspaceId,
        id: guid,
      },
      orderBy: {
        seq: 'asc',
      },
    });
  }

  /**
   * apply pending updates to snapshot
   */
  protected async autoSquash() {
    // find the first update and batch process updates with same id
    const first = await this.db.update.findFirst({
      orderBy: {
        createdAt: 'asc',
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
    return this.db.snapshot.upsert({
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

    const doc = this.applyUpdates(
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

  private async getUpdateSeq(workspaceId: string, guid: string) {
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
            increment: 1,
          },
        },
      });

      // reset
      if (seq === MAX_SEQ_NUM) {
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
      const last = this.seqMap.get(workspaceId + guid) ?? 0;
      this.seqMap.set(workspaceId + guid, last + 1);
      return last + 1;
    }
  }
}
