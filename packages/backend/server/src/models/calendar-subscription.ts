import { Injectable } from '@nestjs/common';
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
}

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
    return await this.db.calendarSubscription.update({
      where: { id },
      data: {
        syncToken: input.syncToken ?? null,
        lastSyncAt: input.lastSyncAt ?? null,
      },
    });
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
      data: { enabled },
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

  async listAllWithAccountForSync() {
    return await this.db.calendarSubscription.findMany({
      where: { enabled: true },
      include: { account: true },
    });
  }

  async listByAccountForSync(accountId: string) {
    return await this.db.calendarSubscription.findMany({
      where: { accountId, enabled: true },
      include: { account: true },
    });
  }

  async updateLastSyncAt(id: string, lastSyncAt: Date) {
    return await this.db.calendarSubscription.update({
      where: { id },
      data: { lastSyncAt },
    });
  }

  async clearSyncTokensByAccount(accountId: string) {
    return await this.db.calendarSubscription.updateMany({
      where: { accountId },
      data: { syncToken: null },
    });
  }

  async updateManyStatus(
    ids: string[],
    data: Partial<Pick<CalendarSubscription, 'enabled'>>
  ) {
    return await this.db.calendarSubscription.updateMany({
      where: { id: { in: ids } },
      data,
    });
  }
}
