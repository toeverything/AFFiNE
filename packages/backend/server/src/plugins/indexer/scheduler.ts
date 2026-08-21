import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue } from '../../base';

@Injectable()
export class IndexerScheduler {
  constructor(private readonly queue: JobQueue) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoIndexWorkspaces() {
    await this.queue.add(
      'indexer.autoIndexWorkspaces',
      {},
      {
        // make sure only one job is running at a time
        delay: 30 * 1000,
        jobId: 'autoIndexWorkspaces',
      }
    );
  }
}
