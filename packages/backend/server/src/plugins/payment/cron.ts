import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, JobQueue, OnJob } from '../../base';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from './types';

declare global {
  interface Jobs {
    'nightly.cleanExpiredOnetimeSubscriptions': {};
    'nightly.notifyAboutToExpireWorkspaceSubscriptions': {};
  }
}

@Injectable()
export class SubscriptionCronJobs {
  constructor(
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly queue: JobQueue
  ) {}

  private getDateRange(after: number, base: number | Date = Date.now()) {
    const start = new Date(base);
    start.setDate(start.getDate() + after);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredOnetimeSubscriptions',
      {},
      {
        jobId: 'nightly-payment-clean-expired-onetime-subscriptions',
      }
    );

    // FIXME(@forehalo): the strategy is totally wrong, for monthly plan. redesign required
    // await this.queue.add(
    //   'nightly.notifyAboutToExpireWorkspaceSubscriptions',
    //   {},
    //   {
    //     jobId: 'nightly-payment-notify-about-to-expire-workspace-subscriptions',
    //   }
    // );
  }

  @OnJob('nightly.notifyAboutToExpireWorkspaceSubscriptions')
  async notifyAboutToExpireWorkspaceSubscriptions() {
    const { start: after30DayStart, end: after30DayEnd } =
      this.getDateRange(30);
    const { start: todayStart, end: todayEnd } = this.getDateRange(0);
    const { start: before150DaysStart, end: before150DaysEnd } =
      this.getDateRange(-150);
    const { start: before180DaysStart, end: before180DaysEnd } =
      this.getDateRange(-180);

    const subscriptions = await this.db.subscription.findMany({
      where: {
        plan: SubscriptionPlan.Team,
        OR: [
          {
            // subscription will cancel after 30 days
            status: 'active',
            canceledAt: { not: null },
            end: { gte: after30DayStart, lte: after30DayEnd },
          },
          {
            // subscription will cancel today
            status: 'active',
            canceledAt: { not: null },
            end: { gte: todayStart, lte: todayEnd },
          },
          {
            // subscription has been canceled for 150 days
            // workspace becomes delete after 180 days
            status: 'canceled',
            canceledAt: { gte: before150DaysStart, lte: before150DaysEnd },
          },
          {
            // subscription has been canceled for 180 days
            // workspace becomes delete after 180 days
            status: 'canceled',
            canceledAt: { gte: before180DaysStart, lte: before180DaysEnd },
          },
        ],
      },
    });

    for (const subscription of subscriptions) {
      const end = subscription.end;
      if (!end) {
        // should not reach here
        continue;
      }

      if (!subscription.nextBillAt) {
        this.event.emit('workspace.subscription.notify', {
          workspaceId: subscription.targetId,
          expirationDate: end,
          deletionDate: this.getDateRange(180, end).end,
        });
      }
    }
  }

  @OnJob('nightly.cleanExpiredOnetimeSubscriptions')
  async cleanExpiredOnetimeSubscriptions() {
    const subscriptions = await this.db.subscription.findMany({
      where: {
        variant: SubscriptionVariant.Onetime,
        end: {
          lte: new Date(),
        },
      },
    });

    for (const subscription of subscriptions) {
      await this.db.subscription.delete({
        where: {
          targetId_plan: {
            targetId: subscription.targetId,
            plan: subscription.plan,
          },
        },
      });

      this.event.emit('user.subscription.canceled', {
        userId: subscription.targetId,
        plan: subscription.plan as SubscriptionPlan,
        recurring: subscription.variant as SubscriptionRecurring,
      });
    }
  }
}
