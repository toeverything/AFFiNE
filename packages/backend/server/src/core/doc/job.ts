import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import {
  CallMetric,
  Config,
  type EventPayload,
  metrics,
  OnEvent,
} from '../../fundamentals';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';

@Injectable()
export class DocStorageCronJob implements OnModuleInit {
  private readonly logger = new Logger(DocStorageCronJob.name);
  private busy = false;

  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    @Optional() private readonly registry?: SchedulerRegistry
  ) {}

  onModuleInit() {
    if (this.registry && this.config.doc.manager.enableUpdateAutoMerging) {
      this.registry.addInterval(
        this.autoMergePendingDocUpdates.name,
        // scheduler registry will clean up the interval when the app is stopped
        setInterval(() => {
          if (this.busy) {
            return;
          }
          this.busy = true;
          this.autoMergePendingDocUpdates()
            .catch(() => {
              /* never fail */
            })
            .finally(() => {
              this.busy = false;
            });
        }, this.config.doc.manager.updatePollInterval)
      );

      this.logger.log('Updates pending queue auto merging cron started');
    }
  }

  @CallMetric('doc', 'auto_merge_pending_doc_updates')
  async autoMergePendingDocUpdates() {
    try {
      const randomDoc = await this.workspace.randomDoc();
      if (!randomDoc) {
        return;
      }

      await this.workspace.getDoc(randomDoc.workspaceId, randomDoc.docId);
    } catch (e) {
      metrics.doc.counter('auto_merge_pending_doc_updates_error').add(1);
      this.logger.error('Failed to auto merge pending doc updates', e);
    }
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

  @Cron(CronExpression.EVERY_MINUTE)
  async reportUpdatesQueueCount() {
    metrics.doc
      .gauge('updates_queue_count')
      .record(await this.db.update.count());
  }

  @OnEvent('user.deleted')
  async clearUserWorkspaces(payload: EventPayload<'user.deleted'>) {
    for (const workspace of payload.ownedWorkspaces) {
      await this.workspace.deleteSpace(workspace);
    }
  }
}
