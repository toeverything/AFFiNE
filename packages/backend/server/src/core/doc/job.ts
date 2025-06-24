import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { Models } from '../../models';

declare global {
  interface Jobs {
    'nightly.cleanExpiredHistories': {};
  }
}

@Injectable()
export class DocStorageCronJob {
  constructor(
    private readonly models: Models,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredHistories',
      {},
      {
        jobId: 'nightly-doc-clean-expired-histories',
      }
    );
  }

  @OnJob('nightly.cleanExpiredHistories')
  async cleanExpiredHistories() {
    await this.models.history.cleanExpired();
  }
}
