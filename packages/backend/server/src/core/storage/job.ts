import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BackendRuntimeProvider } from '../backend-runtime';

const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

@Injectable()
export class BlobUploadCleanupJob {
  private readonly logger = new Logger(BlobUploadCleanupJob.name);

  constructor(private readonly rt: BackendRuntimeProvider) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredPendingBlobs() {
    let deleted = 0;
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const count =
        await this.rt.cleanupExpiredStorageReservationsV1(CLEANUP_BATCH_SIZE);
      deleted += count;
      if (count < CLEANUP_BATCH_SIZE) {
        break;
      }
    }

    this.logger.log(`cleaned ${deleted} expired storage reservations`);
  }
}
