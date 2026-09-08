import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { CalendarSubscription, Prisma } from '@prisma/client';

import { BaseModel } from './base';

export interface UpsertCalendarSubscriptionInput {
  accountId: string;
  provider: string;
  externalCalendarId: string;
  displayName?: string | null;
  timezone?: string | null;
  color?: string | null;
  enabled?: boolean;
}

export interface UpdateCalendarSubscriptionSyncInput {
  syncToken?: string | null;
  lastSyncAt?: Date | null;
  nextSyncAt?: Date;
  syncRetryCount?: number;
}

const SYNC_CLAIM_MS = 30 * 60 * 1000;

export interface UpdateCalendarSubscriptionChannelInput {
  customChannelId?: string | null;
  customResourceId?: string | null;
  channelExpiration?: Date | null;
}

@Injectable()
export class CalendarSubscriptionModel extends BaseModel {
  async listByAccount(accountId: string) {
    return await this.db.calendarSubscription.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listByAccountIds(accountIds: string[]) {
    return await this.db.calendarSubscription.findMany({
      where: { accountId: { in: accountIds } },
    });
  }

  async get(id: string) {
    return await this.db.calendarSubscription.findUnique({
      where: { id },
    });
  }

  async getByChannelId(customChannelId: string) {
    return await this.db.calendarSubscription.findFirst({
      where: { customChannelId },
    });
  }

  async upsert(input: UpsertCalendarSubscriptionInput) {
    const data: Prisma.CalendarSubscriptionUncheckedCreateInput = {
      accountId: input.accountId,
      provider: input.provider,
      externalCalendarId: input.externalCalendarId,
      displayName: input.displayName ?? null,
      timezone: input.timezone ?? null,
      color: input.color ?? null,
      enabled: input.enabled ?? true,
    };

    return await this.db.calendarSubscription.upsert({
      where: {
        accountId_externalCalendarId: {
          accountId: input.accountId,
          externalCalendarId: input.externalCalendarId,
        },
      },
      create: data,
      update: {
        displayName: data.displayName,
        timezone: data.timezone,
        color: data.color,
        enabled: data.enabled,
      },
    });
  }

  async updateSync(id: string, input: UpdateCalendarSubscriptionSyncInput) {
    const data: Prisma.CalendarSubscriptionUncheckedUpdateInput = {};
    if (input.syncToken !== undefined) {
      data.syncToken = input.syncToken ?? null;
    }
    if (input.lastSyncAt !== undefined) {
      data.lastSyncAt = input.lastSyncAt ?? null;
    }
    if (input.nextSyncAt !== undefined) {
      data.nextSyncAt = input.nextSyncAt;
    }
    if (input.syncRetryCount !== undefined) {
      data.syncRetryCount = input.syncRetryCount;
    }

    return await this.db.calendarSubscription.update({ where: { id }, data });
  }

  async completeSync(
    id: string,
    claimedUntil: Date,
    input: Required<
      Pick<
        UpdateCalendarSubscriptionSyncInput,
        'lastSyncAt' | 'nextSyncAt' | 'syncRetryCount'
      >
    >
  ) {
    return await this.db.$executeRaw`
      UPDATE calendar_subscriptions
      SET last_sync_at = ${input.lastSyncAt},
          next_sync_at = CASE
            WHEN sync_claimed_until IS NOT NULL AND next_sync_at < sync_claimed_until
              THEN next_sync_at
            ELSE ${input.nextSyncAt}
          END,
          sync_retry_count = ${input.syncRetryCount},
          sync_claimed_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
        AND sync_claimed_until = ${claimedUntil}
        AND sync_claimed_until > ${new Date(Date.now())}
    `;
  }

  async updateChannel(
    id: string,
    input: UpdateCalendarSubscriptionChannelInput
  ) {
    return await this.db.calendarSubscription.update({
      where: { id },
      data: {
        customChannelId: input.customChannelId ?? null,
        customResourceId: input.customResourceId ?? null,
        channelExpiration: input.channelExpiration ?? null,
      },
    });
  }

  async updateEnabled(id: string, enabled: boolean) {
    return await this.db.calendarSubscription.update({
      where: { id },
      data: { enabled, ...(enabled ? {} : { syncClaimedUntil: null }) },
    });
  }

  async deleteByAccount(accountId: string) {
    return await this.db.calendarSubscription.deleteMany({
      where: { accountId },
    });
  }

  async deleteByIds(ids: string[]) {
    return await this.db.calendarSubscription.deleteMany({
      where: { id: { in: ids } },
    });
  }

  async listActiveByAccount(accountId: string) {
    return await this.db.calendarSubscription.findMany({
      where: { accountId, enabled: true },
    });
  }

  async listWithAccount(id: string) {
    return await this.db.calendarSubscription.findUnique({
      where: { id },
      include: { account: true },
    });
  }

  async listWithAccounts(ids: string[]) {
    return await this.db.calendarSubscription.findMany({
      where: { id: { in: ids } },
      include: { account: true },
    });
  }

  async listAccountSubscriptions(
    accountId: string,
    subscriptionIds?: string[]
  ) {
    return await this.db.calendarSubscription.findMany({
      where: {
        accountId,
        ...(subscriptionIds ? { id: { in: subscriptionIds } } : undefined),
      },
    });
  }

  @Transactional()
  async claimDueForSync(now: Date, limit: number, subscriptionId?: string) {
    return await this.db.$queryRaw<{ id: string; claimedUntil: Date }[]>`
      WITH candidates AS (
        SELECT subscription.id
        FROM calendar_subscriptions subscription
        JOIN calendar_accounts account ON account.id = subscription.account_id
        WHERE subscription.enabled
          AND (${subscriptionId ?? null}::text IS NOT NULL OR subscription.next_sync_at <= ${now})
          AND (${subscriptionId ?? null}::text IS NULL OR subscription.id = ${subscriptionId ?? null})
          AND (
            subscription.sync_claimed_until IS NULL
            OR subscription.sync_claimed_until <= ${now}
          )
          AND account.status = 'active'
        ORDER BY subscription.next_sync_at
        FOR UPDATE OF subscription SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE calendar_subscriptions subscription
      SET next_sync_at = ${new Date(now.getTime() + SYNC_CLAIM_MS)},
          sync_claimed_until = ${new Date(now.getTime() + SYNC_CLAIM_MS)}
      FROM candidates
      WHERE subscription.id = candidates.id
      RETURNING subscription.id, subscription.sync_claimed_until AS "claimedUntil"
    `;
  }

  @Transactional()
  async withSyncClaim<T>(
    id: string,
    claimedUntil: Date,
    write: () => Promise<T>
  ) {
    const accounts = await this.db.$queryRaw<{ id: string }[]>`
      SELECT account.id FROM calendar_accounts account
      JOIN calendar_subscriptions subscription ON subscription.account_id = account.id
      WHERE subscription.id = ${id} AND account.status = 'active'
      FOR UPDATE OF account
    `;
    if (!accounts.length) return;
    const claims = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM calendar_subscriptions
      WHERE id = ${id} AND enabled
        AND sync_claimed_until = ${claimedUntil}
        AND sync_claimed_until > ${new Date(Date.now())}
      FOR UPDATE
    `;
    if (!claims.length) return;
    return await write();
  }

  async listByAccountForSync(accountId: string) {
    return await this.db.calendarSubscription.findMany({
      where: { accountId, enabled: true },
      include: { account: true },
    });
  }

  async clearSyncTokensByAccount(accountId: string) {
    return await this.db.calendarSubscription.updateMany({
      where: { accountId },
      data: { syncToken: null, syncClaimedUntil: null },
    });
  }

  async updateManyStatus(
    ids: string[],
    data: Partial<Pick<CalendarSubscription, 'enabled'>>
  ) {
    return await this.db.calendarSubscription.updateMany({
      where: { id: { in: ids } },
      data: {
        ...data,
        ...(data.enabled === false ? { syncClaimedUntil: null } : {}),
      },
    });
  }

  @Transactional()
  async disableAndPurge(subscriptionId: string) {
    await this.db.calendarSubscription.update({
      where: { id: subscriptionId },
      data: {
        enabled: false,
        syncToken: null,
        syncRetryCount: 0,
        customChannelId: null,
        customResourceId: null,
        channelExpiration: null,
        syncClaimedUntil: null,
      },
    });

    await this.models.calendarEvent.deleteBySubscriptionIds([subscriptionId]);
  }
}
