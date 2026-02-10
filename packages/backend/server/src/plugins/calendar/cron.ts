import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Models } from '../../models';
import { CalendarService } from './service';

@Injectable()
export class CalendarCronJobs {
  constructor(
    private readonly models: Models,
    private readonly calendar: CalendarService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollAccounts() {
    const subscriptions =
      await this.models.calendarSubscription.listAllWithAccountForSync();

    const accountDueAt = new Map<
      string,
      { refreshInterval: number; lastSyncAt: Date | null }
    >();

    for (const subscription of subscriptions) {
      const interval = subscription.account.refreshIntervalMinutes ?? 60;
      const lastSyncAt = subscription.lastSyncAt ?? null;
      const existing = accountDueAt.get(subscription.accountId);
      if (!existing) {
        accountDueAt.set(subscription.accountId, {
          refreshInterval: interval,
          lastSyncAt,
        });
        continue;
      }

      const earliest =
        existing.lastSyncAt && lastSyncAt
          ? existing.lastSyncAt < lastSyncAt
            ? existing.lastSyncAt
            : lastSyncAt
          : (existing.lastSyncAt ?? lastSyncAt);
      accountDueAt.set(subscription.accountId, {
        refreshInterval: interval,
        lastSyncAt: earliest,
      });
    }

    const now = Date.now();
    await Promise.allSettled(
      Array.from(accountDueAt.entries()).map(([accountId, info]) => {
        if (
          !info.lastSyncAt ||
          now - info.lastSyncAt.getTime() >= info.refreshInterval * 60 * 1000
        ) {
          return this.calendar.syncAccount(accountId);
        }
        return Promise.resolve();
      })
    );
  }
}
