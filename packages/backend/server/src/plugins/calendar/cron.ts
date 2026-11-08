import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Models } from '../../models';
import { CalendarService } from './service';

const CALENDAR_SYNC_CONCURRENCY = 8;
const CALENDAR_POLL_BATCHES = 25;

@Injectable()
export class CalendarCronJobs {
  constructor(
    private readonly models: Models,
    private readonly calendar: CalendarService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async pollAccounts() {
    for (let batch = 0; batch < CALENDAR_POLL_BATCHES; batch++) {
      const subscriptions =
        await this.models.calendarSubscription.claimDueForSync(
          new Date(),
          CALENDAR_SYNC_CONCURRENCY
        );

      await Promise.allSettled(
        subscriptions.map(({ id, claimedUntil }) =>
          this.calendar.syncSubscription(id, {
            reason: 'polling',
            claimedUntil,
          })
        )
      );
      if (subscriptions.length < CALENDAR_SYNC_CONCURRENCY) break;
    }
  }
}
