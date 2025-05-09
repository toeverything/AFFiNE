import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { Models } from '../../models';

declare global {
  interface Jobs {
    'nightly.cleanExpiredUserSessions': {};
  }
}

@Injectable()
export class AuthCronJob {
  constructor(
    private readonly models: Models,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredUserSessions',
      {},
      {
        // avoid duplicated jobs
        jobId: 'nightly-auth-clean-expired-user-sessions',
      }
    );
  }

  @OnJob('nightly.cleanExpiredUserSessions')
  async cleanExpiredUserSessions() {
    await this.models.session.cleanExpiredUserSessions();
  }
}
