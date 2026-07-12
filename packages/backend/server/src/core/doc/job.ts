import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';

declare global {
  interface Jobs {
    'nightly.cleanExpiredHistories': {};
  }
}

@Injectable()
export class DocStorageCronJob {
  constructor(
    private readonly rt: BackendRuntimeProvider,
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
    for (;;) {
      const count = await this.rt.cleanupExpiredSnapshotHistories(1000);
      if (count < 1000) break;
    }
  }
}
