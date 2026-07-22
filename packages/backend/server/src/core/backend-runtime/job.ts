import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnJob } from '../../base';
import { BackendRuntimeProvider } from './provider';

declare global {
  interface Jobs {
    'nightly.cleanExpiredBackendRuntimeHousekeeping': {};
  }
}

@Injectable()
export class BackendRuntimeHousekeepingJob {
  private readonly logger = new Logger(BackendRuntimeHousekeepingJob.name);

  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredBackendRuntimeHousekeeping',
      {},
      {
        jobId: 'nightly-backend-runtime-housekeeping',
      }
    );
  }

  @OnJob('nightly.cleanExpiredBackendRuntimeHousekeeping')
  async cleanExpiredRuntimeHousekeeping() {
    const states = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRuntimeStates(1000)
    );
    const gates = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRuntimeGates(1000)
    );
    const rollingQuota = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRollingQuota(1000)
    );

    this.logger.log(
      `cleaned runtime housekeeping states=${states} gates=${gates} rollingQuota=${rollingQuota}`
    );
  }

  private async cleanBatches(fn: () => Promise<number>) {
    let total = 0;
    for (;;) {
      const count = Number(await fn());
      total += count;
      if (count < 1000) {
        break;
      }
    }
    return total;
  }
}
