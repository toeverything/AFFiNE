import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { BaseModel } from './base';

export interface UpsertCalendarEventInput {
  subscriptionId: string;
  externalEventId: string;
  recurrenceId?: string | null;
  etag?: string | null;
  status?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  originalTimezone?: string | null;
  allDay: boolean;
  providerUpdatedAt?: Date | null;
  raw: Prisma.InputJsonValue;
}

@Injectable()
export class CalendarEventModel extends BaseModel {
  async upsert(input: UpsertCalendarEventInput) {
    const recurrenceId = input.recurrenceId ?? input.externalEventId;
    return await this.db.calendarEvent.upsert({
      where: {
        subscriptionId_externalEventId_recurrenceId: {
          subscriptionId: input.subscriptionId,
          externalEventId: input.externalEventId,
          recurrenceId,
        },
      },
      create: {
        subscriptionId: input.subscriptionId,
        externalEventId: input.externalEventId,
        recurrenceId,
        etag: input.etag ?? null,
        status: input.status ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        location: input.location ?? null,
        startAtUtc: input.startAtUtc,
        endAtUtc: input.endAtUtc,
        originalTimezone: input.originalTimezone ?? null,
        allDay: input.allDay,
        providerUpdatedAt: input.providerUpdatedAt ?? null,
        raw: input.raw,
      },
      update: {
        etag: input.etag ?? null,
        status: input.status ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        location: input.location ?? null,
        startAtUtc: input.startAtUtc,
        endAtUtc: input.endAtUtc,
        originalTimezone: input.originalTimezone ?? null,
        allDay: input.allDay,
        providerUpdatedAt: input.providerUpdatedAt ?? null,
        raw: input.raw,
      },
    });
  }

  async deleteBySubscription(subscriptionId: string) {
    return await this.db.calendarEvent.deleteMany({
      where: { subscriptionId },
    });
  }

  async deleteBySubscriptionIds(subscriptionIds: string[]) {
    return await this.db.calendarEvent.deleteMany({
      where: { subscriptionId: { in: subscriptionIds } },
    });
  }

  async deleteByIds(ids: string[]) {
    return await this.db.calendarEvent.deleteMany({
      where: { id: { in: ids } },
    });
  }

  async deleteByExternalIds(
    subscriptionId: string,
    externalEventIds: string[]
  ) {
    if (externalEventIds.length === 0) {
      return;
    }

    await this.db.calendarEvent.deleteMany({
      where: {
        subscriptionId,
        externalEventId: { in: externalEventIds },
      },
    });
  }

  async listBySubscriptionsInRange(
    subscriptionIds: string[],
    from: Date,
    to: Date
  ) {
    if (subscriptionIds.length === 0) {
      return [];
    }

    return await this.db.calendarEvent.findMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        startAtUtc: { lt: to },
        endAtUtc: { gt: from },
      },
      orderBy: [{ startAtUtc: 'asc' }, { endAtUtc: 'asc' }],
    });
  }
}
