import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OneDay, OnJob } from '../../base';
import { Models } from '../../models';

declare global {
  interface Jobs {
    'copilot.session.cleanupEmptySessions': {};
    'copilot.session.generateMissingTitles': {};
    'copilot.workspace.cleanupTrashedDocEmbeddings': {};
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
  async cleanupTrashedDocEmbeddings() {
    const workspaces = await this.models.workspace.list(undefined, {
      id: true,
    });
    for (const { id: workspaceId } of workspaces) {
      await this.jobs.add(
        'copilot.embedding.cleanupTrashedDocEmbeddings',
        { workspaceId },
        { jobId: `cleanup-trashed-doc-embeddings-${workspaceId}` }
      );
    }
  }
}
