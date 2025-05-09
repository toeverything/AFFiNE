import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { JOB_SIGNAL, JobQueue, metrics, OnJob } from '../../base';
import { Models } from '../../models';
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
    private readonly job: JobQueue,
    private readonly models: Models
  ) {}

  @OnJob('doc.mergePendingDocUpdates')
  async mergePendingDocUpdates({
    workspaceId,
    docId,
  }: Jobs['doc.mergePendingDocUpdates']) {
    await this.workspace.getDoc(workspaceId, docId);
    const updatesLeft = await this.models.doc.getUpdateCount(
      workspaceId,
      docId
    );

    return updatesLeft > 100 ? JOB_SIGNAL.Repeat : JOB_SIGNAL.Done;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async schedule() {
    const group = await this.models.doc.groupedUpdatesCount();

    for (const update of group) {
      const jobId = `doc:merge-pending-updates:${update.workspaceId}:${update.id}`;

      const job = await this.job.get(jobId, 'doc.mergePendingDocUpdates');

      if (job && job.opts.priority !== 0 && update._count > 100) {
        // reschedule long pending doc with highest priority, 0 is the highest priority
        await this.job.remove(jobId, 'doc.mergePendingDocUpdates');
      }

      await this.job.add(
        'doc.mergePendingDocUpdates',
        {
          workspaceId: update.workspaceId,
          docId: update.id,
        },
        {
          jobId: `doc:merge-pending-updates:${update.workspaceId}:${update.id}`,
          priority: update._count > 100 ? 0 : 100,
          delay: 0,
        }
      );
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
