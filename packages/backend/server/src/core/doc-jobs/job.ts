import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { JOB_SIGNAL, JobQueue, metrics, OnJob } from '../../base';
import { Models } from '../../models';
import { DatabaseDocReader, PgWorkspaceDocStorageAdapter } from '../doc';

declare global {
  interface Jobs {
    'doc.mergePendingDocUpdates': {
      workspaceId: string;
      docId: string;
    };
    'doc.recordPendingDocUpdatesCount': {};
    'doc.findEmptySummaryDocs': {
      lastFixedWorkspaceSid?: number;
    };
    'doc.autoFixedDocSummary': {
      workspaceId: string;
      docId: string;
    };
  }
}

@Injectable()
export class DocJobConsumer {
  private readonly logger = new Logger(DocJobConsumer.name);

  constructor(
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly docReader: DatabaseDocReader,
    private readonly prisma: PrismaClient,
    private readonly job: JobQueue,
    private readonly models: Models
  ) {}

  @OnJob('doc.mergePendingDocUpdates')
  async mergePendingDocUpdates({
    workspaceId,
    docId,
  }: Jobs['doc.mergePendingDocUpdates']) {
    const doc = await this.workspace.getDoc(workspaceId, docId);
    if (doc) {
      const snapshot = await this.models.doc.getSnapshot(workspaceId, docId, {
        select: { updatedAt: true },
      });
      if (!snapshot) {
        return JOB_SIGNAL.Done;
      }
      await this.job.add(
        'backendRuntime.projectWorkspaceDocBlobRefs',
        {
          workspaceId,
          docId,
          sourceRevision: snapshot.updatedAt.getTime(),
        },
        {
          jobId: `doc:blob-ref-projection:${workspaceId}:${docId}:${snapshot.updatedAt.getTime()}`,
          priority: 100,
        }
      );
    }
    const updatesLeft = await this.models.doc.getUpdateCount(
      workspaceId,
      docId
    );

    return updatesLeft > 100 ? JOB_SIGNAL.Repeat : JOB_SIGNAL.Done;
  }

  @OnJob('doc.recordPendingDocUpdatesCount')
  async recordPendingDocUpdatesCount() {
    const count = await this.prisma.update.count();
    metrics.doc.gauge('pending_updates').record(count);
  }

  @OnJob('doc.findEmptySummaryDocs')
  async findEmptySummaryDocs(payload: Jobs['doc.findEmptySummaryDocs']) {
    const startSid = payload.lastFixedWorkspaceSid ?? 0;
    const workspaces = await this.models.workspace.list(
      { sid: { gt: startSid } },
      { id: true, sid: true },
      100
    );

    if (workspaces.length === 0) {
      return JOB_SIGNAL.Repeat;
    }

    let addedCount = 0;
    for (const workspace of workspaces) {
      const docIds = await this.models.doc.findEmptySummaryDocIds(workspace.id);
      for (const docId of docIds) {
        // ignore root doc
        if (docId === workspace.id) {
          continue;
        }
        await this.job.add(
          'doc.autoFixedDocSummary',
          { workspaceId: workspace.id, docId },
          {
            jobId: `autoFixedDocSummary/${workspace.id}/${docId}`,
          }
        );
        addedCount++;
      }
    }

    const nextSid = workspaces[workspaces.length - 1].sid;
    this.logger.log(
      `Auto added ${addedCount} docs to queue, lastFixedWorkspaceSid: ${startSid} -> ${nextSid}`
    );

    // update the lastFixedWorkspaceSid in the payload and repeat the job after 30 seconds
    payload.lastFixedWorkspaceSid = nextSid;
    return JOB_SIGNAL.Repeat;
  }

  @OnJob('doc.autoFixedDocSummary')
  async autoFixedDocSummary(payload: Jobs['doc.autoFixedDocSummary']) {
    const { workspaceId, docId } = payload;
    const content = await this.docReader.getDocContent(workspaceId, docId);
    if (!content) {
      this.logger.warn(
        `Summary for doc ${docId} in workspace ${workspaceId} not found`
      );
      return;
    }

    await this.models.doc.upsertMeta(workspaceId, docId, content);
    return;
  }
}

@Injectable()
export class DocJobScheduler {
  constructor(
    private readonly job: JobQueue,
    private readonly models: Models
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async schedule() {
    const group = await this.models.doc.groupedUpdatesCount();

    for (const update of group) {
      const jobId = `doc:merge-pending-updates:${update.workspaceId}:${update.id}`;
      const job = await this.job.get(jobId, 'doc.mergePendingDocUpdates');

      if (job && job.opts.priority !== 0 && update._count > 100) {
        await this.job.remove(jobId, 'doc.mergePendingDocUpdates');
      }

      await this.job.add(
        'doc.mergePendingDocUpdates',
        {
          workspaceId: update.workspaceId,
          docId: update.id,
        },
        {
          jobId,
          priority: update._count > 100 ? 0 : 100,
          delay: 0,
        }
      );
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduleRecordPendingDocUpdatesCount() {
    await this.job.add(
      'doc.recordPendingDocUpdatesCount',
      {},
      {
        delay: 30 * 1000,
        jobId: 'doc:record-pending-updates-count',
      }
    );
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduleFindEmptySummaryDocs() {
    await this.job.add(
      'doc.findEmptySummaryDocs',
      {},
      {
        delay: 30 * 1000,
        jobId: 'findEmptySummaryDocs',
      }
    );
  }
}
