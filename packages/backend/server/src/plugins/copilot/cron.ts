import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OneDay } from '../../base';
import { Models } from '../../models';
import { ChatSessionService } from './session';
import { CopilotTranscriptionRetryService } from './transcript/retry';
import { CopilotTranscriptionService } from './transcript/service';

@Injectable()
export class CopilotCronJobs {
  private readonly logger = new Logger(CopilotCronJobs.name);

  constructor(
    private readonly models: Models,
    private readonly sessions: ChatSessionService,
    private readonly transcript: CopilotTranscriptionService,
    private readonly transcriptRetry: CopilotTranscriptionRetryService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileTranscriptDispatches() {
    const dispatches = await this.transcriptRetry.collectPendingDispatches();
    const results = await Promise.allSettled(
      dispatches.map(dispatch => this.transcript.transcriptTask(dispatch))
    );
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) {
      this.logger.warn(
        `Transcript dispatch failures: ${failed.length}/${dispatches.length}`
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyCleanupJob() {
    await this.cleanupEmptySessions();
  }

  async cleanupEmptySessions() {
    const { removed, cleaned } =
      await this.models.copilotSession.cleanupEmptySessions(
        new Date(Date.now() - OneDay)
      );

    this.logger.log(
      `Cleanup completed: ${removed} sessions deleted, ${cleaned} sessions marked as deleted`
    );
  }

  @Cron('*/10 * * * *')
  async generateMissingTitles() {
    const sessions = await this.models.copilotSession.toBeGenerateTitle();
    const results = await Promise.allSettled(
      sessions.map(session =>
        this.sessions.generateSessionTitle({
          sessionId: session.id,
          userId: session.userId,
          workspaceId: session.workspaceId,
        })
      )
    );
    const failed = results.filter(result => result.status === 'rejected');
    this.logger.log(
      `Generated titles for ${sessions.length - failed.length}/${sessions.length} sessions`
    );
  }
}
