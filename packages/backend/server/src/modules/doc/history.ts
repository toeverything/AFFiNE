import { isDeepStrictEqual } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Snapshot } from '@prisma/client';

import { Config } from '../../config';
import { metrics } from '../../metrics';
import { PrismaService } from '../../prisma';
import { SubscriptionStatus } from '../payment/service';
import { Permission } from '../workspaces/types';

@Injectable()
export class DocHistoryManager {
  private readonly logger = new Logger(DocHistoryManager.name);
  constructor(
    private readonly config: Config,
    private readonly db: PrismaService
  ) {}

  @OnEvent('doc:manager:snapshot:beforeUpdate')
  async onDocUpdated(snapshot: Snapshot, forceCreate = false) {
    const last = await this.last(snapshot.workspaceId, snapshot.id);

    let shouldCreateHistory = false;

    if (!last) {
      // never created
      shouldCreateHistory = true;
    } else if (last.timestamp === snapshot.updatedAt) {
      // no change
      shouldCreateHistory = false;
    } else if (
      // force
      forceCreate ||
      // last history created before interval in configs
      last.timestamp.getTime() <
        snapshot.updatedAt.getTime() - this.config.doc.history.interval
    ) {
      shouldCreateHistory = true;
    }

    if (shouldCreateHistory) {
      // skip the history recording when no actual update on snapshot happended
      if (last && isDeepStrictEqual(last.state, snapshot.state)) {
        this.logger.debug(
          `State matches, skip creating history record for ${snapshot.id} in workspace ${snapshot.workspaceId}`
        );
        return;
      }

      await this.db.snapshotHistory
        .create({
          select: {
            timestamp: true,
          },
          data: {
            workspaceId: snapshot.workspaceId,
            id: snapshot.id,
            timestamp: snapshot.updatedAt,
            blob: snapshot.blob,
            state: snapshot.state,
            expiredAt: await this.getExpiredDateFromNow(snapshot.workspaceId),
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
      this.logger.log(
        `History created for ${snapshot.id} in workspace ${snapshot.workspaceId}.`
      );
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
    await this.onDocUpdated(oldSnapshot, true);
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

  /**
   * @todo(@darkskygit) refactor with [Usage Control] system
   */
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

    const sub = await this.db.userSubscription.findFirst({
      select: {
        id: true,
      },
      where: {
        userId: permission.userId,
        status: SubscriptionStatus.Active,
      },
    });

    return new Date(
      Date.now() +
        1000 *
          60 *
          60 *
          24 *
          // 30 days for subscription user, 7 days for free user
          (sub ? 30 : 7)
    );
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
