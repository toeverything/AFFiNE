import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { JobQueue, metrics, OnJob } from '../../base';
import { PgWorkspaceDocStorageAdapter } from '../doc';

declare global {
  interface Jobs {
    'doc.mergePendingDocUpdates': {
      workspaceId: string;
      docId: string;
    };
    'doc.recordPendingDocUpdatesCount': {};
  }
}

@Injectable()
export class DocServiceCronJob {
  constructor(
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly prisma: PrismaClient,
    private readonly job: JobQueue
  ) {}

  @OnJob('doc.mergePendingDocUpdates')
  async mergePendingDocUpdates({
    workspaceId,
    docId,
  }: Jobs['doc.mergePendingDocUpdates']) {
    await this.workspace.getDoc(workspaceId, docId);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async schedule() {
    const group = await this.prisma.update.groupBy({
      by: ['workspaceId', 'id'],
      _count: true,
    });

    for (const update of group) {
      if (update._count > 100) {
        await this.job.add(
          'doc.mergePendingDocUpdates',
          {
            workspaceId: update.workspaceId,
            docId: update.id,
          },
          {
            jobId: `doc:merge-pending-updates:${update.workspaceId}:${update.id}`,
            priority: update._count,
            delay: 0,
          }
        );
      }
    }
  }

  @OnJob('doc.recordPendingDocUpdatesCount')
  async recordPendingDocUpdatesCount() {
    const count = await this.prisma.update.count();
    metrics.doc.gauge('pending_updates').record(count);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduleRecordPendingDocUpdatesCount() {
    await this.job.add(
      'doc.recordPendingDocUpdatesCount',
      {},
      {
        // make sure only one job is running at a time
        delay: 30 * 1000,
        jobId: 'doc:record-pending-updates-count',
      }
    );
  }
}
