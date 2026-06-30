import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { EventBus, JobQueue, OneDay, OnJob } from '../../base';
import { StorageRuntimeProvider } from '../storage-runtime';

declare global {
  interface Jobs {
    'nightly.cleanExpiredPendingBlobs': {};
  }
}

@Injectable()
export class BlobUploadCleanupJob {
  private readonly logger = new Logger(BlobUploadCleanupJob.name);

  constructor(
    private readonly rt: StorageRuntimeProvider,
    private readonly event: EventBus,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredPendingBlobs',
      {},
      {
        jobId: 'nightly-blob-clean-expired-pending',
      }
    );
  }

  @OnJob('nightly.cleanExpiredPendingBlobs')
  async cleanExpiredPendingBlobs() {
    const cutoff = Date.now() - OneDay;
    let scanned = 0;
    let deleted = 0;
    for (;;) {
      const result = await this.rt.cleanupExpiredPendingBlobs(cutoff, 1000);
      scanned += result.scanned;
      deleted += result.deleted;
      await Promise.all(
        result.workspaceIds.map(workspaceId =>
          this.event.emitAsync('workspace.blobs.updated', { workspaceId })
        )
      );
      if (result.scanned < 1000) {
        break;
      }
    }

    this.logger.log(
      `cleaned ${deleted} expired pending blobs, scanned ${scanned}`
    );
  }
}
