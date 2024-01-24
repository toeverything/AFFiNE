import { isDeepStrictEqual } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  Config,
  type EventPayload,
  metrics,
  OnEvent,
  PrismaService,
} from '../../fundamentals';
import { QuotaService } from '../quota';
import { Permission } from '../workspaces/types';
import { isEmptyBuffer } from './manager';

@Injectable()
export class DocHistoryManager {
  private readonly logger = new Logger(DocHistoryManager.name);
  constructor(
    private readonly config: Config,
    private readonly db: PrismaService,
    private readonly quota: QuotaService
  ) {}

  @OnEvent('workspace.deleted')
  onWorkspaceDeleted(workspaceId: EventPayload<'workspace.deleted'>) {
    return this.db.snapshotHistory.deleteMany({
      where: {
        workspaceId,
      },
    });
  }

  @OnEvent('snapshot.deleted')
  onSnapshotDeleted({ workspaceId, id }: EventPayload<'snapshot.deleted'>) {
    return this.db.snapshotHistory.deleteMany({
      where: {
        workspaceId,
        id,
      },
    });
  }

  @OnEvent('snapshot.updated')
  async onDocUpdated(
    { workspaceId, id, previous }: EventPayload<'snapshot.updated'>,
    forceCreate = false
  ) {
    const last = await this.last(workspaceId, id);

    let shouldCreateHistory = false;

    if (!last) {
      // never created
      shouldCreateHistory = true;
    } else if (last.timestamp === previous.updatedAt) {
      // no change
      shouldCreateHistory = false;
    } else if (
      // force
      forceCreate ||
      // last history created before interval in configs
      last.timestamp.getTime() <
        previous.updatedAt.getTime() - this.config.doc.history.interval
    ) {
      shouldCreateHistory = true;
    }

    if (shouldCreateHistory) {
      // skip the history recording when no actual update on snapshot happended
      if (last && isDeepStrictEqual(last.state, previous.state)) {
        this.logger.debug(
          `State matches, skip creating history record for ${id} in workspace ${workspaceId}`
        );
        return;
      }

      if (isEmptyBuffer(previous.blob)) {
        this.logger.debug(
          `Doc is empty, skip creating history record for ${id} in workspace ${workspaceId}`
        );
        return;
      }

      await this.db.snapshotHistory
        .create({
          select: {
            timestamp: true,
          },
          data: {
            workspaceId,
            id,
            timestamp: previous.updatedAt,
            blob: previous.blob,
            state: previous.state,
            expiredAt: await this.getExpiredDateFromNow(workspaceId),
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
      this.logger.log(`History created for ${id} in workspace ${workspaceId}.`);
    }
  }

  async list(
    workspaceId: string,
    id: string,
    before: Date = new Date(),
    take: number = 10
  ) {
    return this.db.snapshotHistory.findMany({
      select: {
        timestamp: true,
      },
      where: {
        workspaceId,
        id,
        timestamp: {
          lt: before,
        },
        // only include the ones has not expired
        expiredAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take,
    });
  }

  async count(workspaceId: string, id: string) {
    return this.db.snapshotHistory.count({
      where: {
        workspaceId,
        id,
        expiredAt: {
          gt: new Date(),
        },
      },
    });
  }

  async get(workspaceId: string, id: string, timestamp: Date) {
    return this.db.snapshotHistory.findUnique({
      where: {
        workspaceId_id_timestamp: {
          workspaceId,
          id,
          timestamp,
        },
        expiredAt: {
          gt: new Date(),
        },
      },
    });
  }

  async last(workspaceId: string, id: string) {
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

  async recover(workspaceId: string, id: string, timestamp: Date) {
    const history = await this.db.snapshotHistory.findUnique({
      where: {
        workspaceId_id_timestamp: {
          workspaceId,
          id,
          timestamp,
        },
      },
    });

    if (!history) {
      throw new Error('Given history not found');
    }

    const oldSnapshot = await this.db.snapshot.findUnique({
      where: {
        id_workspaceId: {
          id,
          workspaceId,
        },
      },
    });

    if (!oldSnapshot) {
      // unreachable actually
      throw new Error('Given Doc not found');
    }

    // save old snapshot as one history record
    await this.onDocUpdated({ workspaceId, id, previous: oldSnapshot }, true);
    // WARN:
    //  we should never do the snapshot updating in recovering,
    //  which is not the solution in CRDT.
    //  let user revert in client and update the data in sync system
    //    `await this.db.snapshot.update();`
    metrics.doc
      .counter('history_recovered_counter', {
        description: 'How many times history recovered request happened',
      })
      .add(1);

    return history.timestamp;
  }

  async getExpiredDateFromNow(workspaceId: string) {
    const permission = await this.db.workspaceUserPermission.findFirst({
      select: {
        userId: true,
      },
      where: {
        workspaceId,
        type: Permission.Owner,
      },
    });

    if (!permission) {
      // unreachable actually
      throw new Error('Workspace owner not found');
    }

    const quota = await this.quota.getUserQuota(permission.userId);
    return quota.feature.historyPeriodFromNow;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT /* everyday at 12am */)
  async cleanupExpiredHistory() {
    await this.db.snapshotHistory.deleteMany({
      where: {
        expiredAt: {
          lte: new Date(),
        },
      },
    });
  }
}
