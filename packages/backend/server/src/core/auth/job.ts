import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BackendRuntimeProvider } from '../backend-runtime';

const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

@Injectable()
export class AuthCronJob {
  constructor(private readonly rt: BackendRuntimeProvider) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredUserSessions() {
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const count =
        await this.rt.cleanupExpiredUserSessions(CLEANUP_BATCH_SIZE);
      if (count < CLEANUP_BATCH_SIZE) break;
    }
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const count = await this.rt.executeAuthSessionCommandV1<number>({
        action: 'cleanup',
        limit: CLEANUP_BATCH_SIZE,
      });
      if (count < CLEANUP_BATCH_SIZE) break;
    }
  }
}
