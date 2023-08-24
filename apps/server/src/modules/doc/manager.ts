import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

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

/**
 * Since we can't directly save all client updates into database, in which way the database will overload,
 * we need to buffer the updates and merge them to reduce db write.
 *
 * And also, if a new client join, it would be nice to see the latest doc asap,
 * so we need to at least store a snapshot of the doc and return quickly,
 * along side all the updates that have not been applies to that snapshot(timestamp).
 *
 * @see [RedisUpdateManager](./redis-manager.ts) - redis backed manager
 */
@Injectable()
export class DocManager implements OnModuleInit, OnModuleDestroy {
  protected logger = new Logger(DocManager.name);
  private job: NodeJS.Timeout | null = null;
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

    updates.forEach(update => {
      applyUpdate(doc, update);
    });

    return doc;
  }

  protected yjsMergeUpdates(...updates: Buffer[]): Buffer {
    const doc = this.recoverDoc(...updates);

    return Buffer.from(encodeStateAsUpdate(doc));
  }

  protected mergeUpdates(guid: string, ...updates: Buffer[]): Buffer {
    const yjsResult = this.yjsMergeUpdates(...updates);
    this.metrics.jwstCodecMerge(1, {});
    let log = false;
    if (this.config.doc.manager.experimentalMergeWithJwstCodec) {
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
        this.logger.warn(`jwst apply update failed for :${guid}`, e);
        log = true;
      } finally {
        if (log) {
          this.logger.warn(
            'Updates:',
            updates.map(u => u.toString('hex'))
          );
        }
      }
    }

    return yjsResult;
  }

  /**
   * setup pending update processing loop
   */
  setup() {
    this.job = setInterval(() => {
      if (!this.busy) {
        this.busy = true;
        this.apply()
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
   * add update to manager for later processing like fast merging.
   */
  async push(workspaceId: string, guid: string, update: Buffer) {
    await this.db.update.create({
      data: {
        workspaceId,
        id: guid,
        blob: update,
      },
    });

    this.logger.verbose(
      `pushed update for workspace: ${workspaceId}, guid: ${guid}`
    );
  }

  /**
   * get the snapshot of the doc we've seen.
   */
  async getSnapshot(
    workspaceId: string,
    guid: string
  ): Promise<Buffer | undefined> {
    const snapshot = await this.db.snapshot.findFirst({
      where: {
        workspaceId,
        id: guid,
      },
    });

    return snapshot?.blob;
  }

  /**
   * get pending updates
   */
  async getUpdates(workspaceId: string, guid: string): Promise<Buffer[]> {
    const updates = await this.db.update.findMany({
      where: {
        workspaceId,
        id: guid,
      },
    });

    return updates.map(update => update.blob);
  }

  /**
   * get the latest doc with all update applied.
   *
   * latest = snapshot + updates
   */
  async getLatest(workspaceId: string, guid: string): Promise<Doc | undefined> {
    const snapshot = await this.getSnapshot(workspaceId, guid);
    const updates = await this.getUpdates(workspaceId, guid);

    if (updates.length) {
      if (snapshot) {
        return this.recoverDoc(snapshot, ...updates);
      } else {
        return this.recoverDoc(...updates);
      }
    }

    if (snapshot) {
      return this.recoverDoc(snapshot);
    }

    return undefined;
  }

  /**
   * get the latest doc and convert it to update binary
   */
  async getLatestUpdate(
    workspaceId: string,
    guid: string
  ): Promise<Buffer | undefined> {
    const doc = await this.getLatest(workspaceId, guid);

    return doc ? Buffer.from(encodeStateAsUpdate(doc)) : undefined;
  }

  /**
   * apply pending updates to snapshot
   */
  async apply() {
    const updates = await this.db
      .$transaction(async db => {
        // find the first update and batch process updates with same id
        const first = await db.update.findFirst({
          orderBy: {
            createdAt: 'asc',
          },
        });

        // no pending updates
        if (!first) {
          return;
        }

        const { id, workspaceId } = first;
        const updates = await db.update.findMany({
          where: {
            id,
            workspaceId,
          },
        });

        // no pending updates
        if (!updates.length) {
          return;
        }

        // remove update that will be merged later
        await db.update.deleteMany({
          where: {
            id,
            workspaceId,
          },
        });

        return updates;
      })
      .catch(
        // transaction failed, it's safe to ignore
        e => {
          this.logger.error('Failed to fetch updates', e);
        }
      );

    // we put update merging logic outside transaction will make the processing more complex,
    // but it's better to do so, since the merging may takes a lot of time,
    // which may slow down the whole db.
    if (!updates?.length) {
      return;
    }

    const { id, workspaceId } = updates[0];

    this.logger.verbose(
      `applying ${updates.length} updates for workspace: ${workspaceId}, guid: ${id}`
    );

    try {
      const snapshot = await this.db.snapshot.findFirst({
        where: {
          workspaceId,
          id,
        },
      });

      // merge updates
      const merged = snapshot
        ? this.mergeUpdates(id, snapshot.blob, ...updates.map(u => u.blob))
        : this.mergeUpdates(id, ...updates.map(u => u.blob));

      // save snapshot
      await this.upsert(workspaceId, id, merged);
    } catch (e) {
      // failed to merge updates, put them back
      this.logger.error('Failed to merge updates', e);

      await this.db.update
        .createMany({
          data: updates.map(u => ({
            id: u.id,
            workspaceId: u.workspaceId,
            blob: u.blob,
          })),
        })
        .catch(e => {
          // failed to recover, fallback TBD
          this.logger.error('Fetal: failed to put updates back to db', e);
        });
    }
  }

  protected async upsert(workspaceId: string, guid: string, blob: Buffer) {
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
      },
      update: {
        blob,
      },
    });
  }
}
