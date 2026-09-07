import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';

declare global {
  interface Jobs {
    'backendRuntime.cleanExpiredPendingBlobs': {};
  }
}

@Injectable()
export class BlobUploadCleanupJob {
  private readonly logger = new Logger(BlobUploadCleanupJob.name);

  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'backendRuntime.cleanExpiredPendingBlobs',
      {},
      {
        jobId: 'nightly-blob-clean-expired-pending',
      }
    );
  }

  @OnJob('backendRuntime.cleanExpiredPendingBlobs')
  async cleanExpiredPendingBlobs() {
    let deleted = 0;
    for (;;) {
      const count = await this.rt.cleanupExpiredStorageReservationsV1(1000);
      deleted += count;
      if (count < 1000) {
        break;
      }
    }

    this.logger.log(`cleaned ${deleted} expired storage reservations`);
  }
}
