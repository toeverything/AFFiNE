import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OneDay, OnJob } from '../../base';
import { Models } from '../../models';
import { WorkspaceBlobStorage } from './wrappers/blob';

declare global {
  interface Jobs {
    'nightly.cleanExpiredPendingBlobs': {};
  }
}

@Injectable()
export class BlobUploadCleanupJob {
  private readonly logger = new Logger(BlobUploadCleanupJob.name);

  constructor(
    private readonly models: Models,
    private readonly storage: WorkspaceBlobStorage,
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
    const cutoff = new Date(Date.now() - OneDay);
    const pending = await this.models.blob.listPendingExpired(cutoff);

    for (const blob of pending) {
      if (blob.uploadId) {
        await this.storage.abortMultipartUpload(
          blob.workspaceId,
          blob.key,
          blob.uploadId
        );
      }

      await this.storage.delete(blob.workspaceId, blob.key, true);
    }

    this.logger.log(`cleaned ${pending.length} expired pending blobs`);
  }
}
