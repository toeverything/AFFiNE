import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { chunk } from 'lodash-es';

import { Mutex } from '../../base';
import { Models } from '../../models';
import { CalendarService } from './service';

const CALENDAR_POLL_LOCK_KEY = 'calendar:poll-accounts';
const CALENDAR_POLL_BATCH_SIZE = 10;

@Injectable()
export class CalendarCronJobs {
  constructor(
    private readonly models: Models,
    private readonly calendar: CalendarService,
    private readonly mutex: Mutex
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollAccounts() {
    await using lock = await this.mutex.acquire(CALENDAR_POLL_LOCK_KEY);
    if (!lock) return;

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
    const dueAccountIds = Array.from(accountDueAt.entries())
      .filter(
        ([, info]) =>
          !info.lastSyncAt ||
          now - info.lastSyncAt.getTime() >= info.refreshInterval * 60 * 1000
      )
      .map(([accountId]) => accountId);

    for (const accountIds of chunk(dueAccountIds, CALENDAR_POLL_BATCH_SIZE)) {
      await Promise.allSettled(
        accountIds.map(accountId => this.calendar.syncAccount(accountId))
      );
    }
  }
}
