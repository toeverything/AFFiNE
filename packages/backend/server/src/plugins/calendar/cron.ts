import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue } from '../../base';
import { Models } from '../../models';

const CALENDAR_POLL_BATCH_SIZE = 200;

@Injectable()
export class CalendarCronJobs {
  constructor(
    private readonly models: Models,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollAccounts() {
    const subscriptions = await this.models.calendarSubscription.listDueForSync(
      new Date(),
      CALENDAR_POLL_BATCH_SIZE
    );

    await Promise.allSettled(
      subscriptions.map(({ id }) =>
        this.queue.add(
          'calendar.syncSubscription',
          { subscriptionId: id, reason: 'polling' },
          { jobId: id }
        )
      )
    );
  }
}
