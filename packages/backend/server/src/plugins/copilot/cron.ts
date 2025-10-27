import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JOB_SIGNAL, JobQueue, OneDay, OnJob } from '../../base';
import { Models } from '../../models';

const CLEANUP_EMBEDDING_JOB_BATCH_SIZE = 100;

declare global {
  interface Jobs {
    'copilot.session.cleanupEmptySessions': {};
    'copilot.session.generateMissingTitles': {};
    'copilot.workspace.cleanupTrashedDocEmbeddings': {
      nextSid?: number;
    };
  }
}

@Injectable()
export class CopilotCronJobs {
  private readonly logger = new Logger(CopilotCronJobs.name);

  constructor(
    private readonly models: Models,
    private readonly jobs: JobQueue
  ) {}

  async triggerCleanupTrashedDocEmbeddings() {
    await this.jobs.add(
      'copilot.workspace.cleanupTrashedDocEmbeddings',
      {},
      { jobId: 'daily-copilot-cleanup-trashed-doc-embeddings' }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyCleanupJob() {
    await this.jobs.add(
      'copilot.session.cleanupEmptySessions',
      {},
      { jobId: 'daily-copilot-cleanup-empty-sessions' }
    );

    await this.jobs.add(
      'copilot.session.generateMissingTitles',
      {},
      { jobId: 'daily-copilot-generate-missing-titles' }
    );

    await this.jobs.add(
      'copilot.workspace.cleanupTrashedDocEmbeddings',
      {},
      { jobId: 'daily-copilot-cleanup-trashed-doc-embeddings' }
    );
  }

  async triggerGenerateMissingTitles() {
    await this.jobs.add(
      'copilot.session.generateMissingTitles',
      {},
      { jobId: 'trigger-copilot-generate-missing-titles' }
    );
  }

  @OnJob('copilot.session.cleanupEmptySessions')
  async cleanupEmptySessions() {
    const { removed, cleaned } =
      await this.models.copilotSession.cleanupEmptySessions(
        new Date(Date.now() - OneDay)
      );

    this.logger.log(
      `Cleanup completed: ${removed} sessions deleted, ${cleaned} sessions marked as deleted`
    );
  }

  @OnJob('copilot.session.generateMissingTitles')
  async generateMissingTitles() {
    const sessions = await this.models.copilotSession.toBeGenerateTitle();

    for (const session of sessions) {
      await this.jobs.add('copilot.session.generateTitle', {
        sessionId: session.id,
      });
    }
    this.logger.log(
      `Scheduled title generation for ${sessions.length} sessions`
    );
  }

  @OnJob('copilot.workspace.cleanupTrashedDocEmbeddings')
  async cleanupTrashedDocEmbeddings(
    params: Jobs['copilot.workspace.cleanupTrashedDocEmbeddings']
  ) {
    const nextSid = params.nextSid ?? 0;
    // only consider workspaces that cleared their embeddings more than 24 hours ago
    const oneDayAgo = new Date(Date.now() - OneDay);
    const workspaces = await this.models.workspace.list(
      { sid: { gt: nextSid }, lastCheckEmbeddings: { lt: oneDayAgo } },
      { id: true, sid: true },
      CLEANUP_EMBEDDING_JOB_BATCH_SIZE
    );
    if (!workspaces.length) {
      return JOB_SIGNAL.Done;
    }
    for (const { id: workspaceId } of workspaces) {
      await this.jobs.add(
        'copilot.embedding.cleanupTrashedDocEmbeddings',
        { workspaceId },
        { jobId: `cleanup-trashed-doc-embeddings-${workspaceId}` }
      );
    }
    params.nextSid = workspaces[workspaces.length - 1].sid;
    return JOB_SIGNAL.Repeat;
  }
}
