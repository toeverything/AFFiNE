import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { mergeUpdates } from 'yjs';

import { PrismaService } from '../../prisma';

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
export class UpdateManager implements OnModuleInit, OnModuleDestroy {
  protected logger = new Logger(UpdateManager.name);
  private job: NodeJS.Timeout | null = null;

  constructor(
    protected readonly db: PrismaService,
    @Inject('UPDATE_MANAGER_AUTOMATION')
    protected readonly automation: boolean
  ) {}

  onModuleInit() {
    if (this.automation) {
      this.setup();
    }
  }

  onModuleDestroy() {
    this.destroy();
  }

  static mergeUpdates(updates: Buffer[]): Buffer {
    return Buffer.from(
      mergeUpdates(updates.map(update => new Uint8Array(update)))
    );
  }

  /**
   * setup pending update processing loop
   */
  setup() {
    this.job = setInterval(() => {
      this.apply().catch(() => {
        /* we handle all errors in work itself */
      });
    }, 1000 /* make it configurable */);
    this.logger.log('update manager automation started');
  }

  /**
   * stop pending update processing loop
   */
  destroy() {
    if (this.job) {
      clearInterval(this.job);
      this.job = null;
      this.logger.log('update manager automation stopped');
    }
  }

  /**
   * add update to manager for later processing like fast merging.
   */
  async push(
    workspaceId: string,
    guid: string,
    update: Buffer
  ): Promise<boolean> {
    const row = await this.db.update.create({
      data: {
        workspaceId,
        id: guid,
        blob: update,
      },
    });

    return !!row;
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
  async getLatest(
    workspaceId: string,
    guid: string
  ): Promise<Buffer | undefined> {
    const snapshot = await this.getSnapshot(workspaceId, guid);
    const updates = await this.getUpdates(workspaceId, guid);

    if (!snapshot && !updates.length) {
      return;
    }

    return snapshot
      ? UpdateManager.mergeUpdates([snapshot, ...updates])
      : UpdateManager.mergeUpdates(updates);
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
        () => undefined
      );

    // we put update merging logic outside transaction will make the processing more complex,
    // but it's better to do so, since the merging may takes a lot of time,
    // which may slow down the whole db.
    if (!updates?.length) {
      return;
    }

    this.logger.log(`applying ${updates.length} updates`);

    const { id, workspaceId } = updates[0];

    try {
      const snapshot = await this.db.snapshot.findFirst({
        where: {
          workspaceId,
          id,
        },
      });

      // merge updates
      const merged = snapshot
        ? UpdateManager.mergeUpdates([
            snapshot.blob,
            ...updates.map(u => u.blob),
          ])
        : UpdateManager.mergeUpdates(updates.map(u => u.blob));

      // save snapshot
      await this.db.snapshot.upsert({
        where: {
          id,
        },
        create: {
          id,
          workspaceId,
          blob: merged,
        },
        update: {
          blob: merged,
        },
      });
    } catch (e) {
      // failed to merge updates, put them back
      await this.db.update
        .createMany({
          data: updates.map(u => ({
            id: u.id,
            workspaceId: u.workspaceId,
            blob: u.blob,
          })),
        })
        .catch(() => {
          // failed to recover, fallback TBD
        });
    }
  }
}
