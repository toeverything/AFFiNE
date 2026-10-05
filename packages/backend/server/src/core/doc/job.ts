import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BackendRuntimeProvider } from '../backend-runtime';

const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

@Injectable()
export class DocStorageCronJob {
  constructor(private readonly rt: BackendRuntimeProvider) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const count =
        await this.rt.cleanupExpiredSnapshotHistories(CLEANUP_BATCH_SIZE);
      if (count < CLEANUP_BATCH_SIZE) break;
    }
  }
}
