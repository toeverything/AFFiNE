import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Models } from '../../models';
import { CalendarService } from './service';

const CALENDAR_POLL_BATCH_SIZE = 200;

@Injectable()
export class CalendarCronJobs {
  constructor(
    private readonly models: Models,
    private readonly calendar: CalendarService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollAccounts() {
    const subscriptions =
      await this.models.calendarSubscription.claimDueForSync(
        new Date(),
        CALENDAR_POLL_BATCH_SIZE
      );

    await Promise.allSettled(
      subscriptions.map(({ id }) =>
        this.calendar.syncSubscription(id, { reason: 'polling' })
      )
    );
  }
}
