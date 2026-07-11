import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';
import { AuthSessionService } from './auth-session';

declare global {
  interface Jobs {
    'nightly.cleanExpiredUserSessions': {};
  }
}

@Injectable()
export class AuthCronJob {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly authSessions: AuthSessionService,
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
    for (;;) {
      const count = await this.rt.cleanupExpiredUserSessions(1000);
      if (count < 1000) break;
    }
    await this.authSessions.cleanup();
  }
}
