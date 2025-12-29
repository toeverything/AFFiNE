import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient, Provider } from '@prisma/client';

import { EventBus, JobQueue, OneHour, OnJob } from '../../base';
import { RevenueCatWebhookHandler } from './revenuecat';
import { SubscriptionService } from './service';
import { StripeFactory } from './stripe';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from './types';

declare global {
  interface Jobs {
    'nightly.cleanExpiredOnetimeSubscriptions': {};
    'nightly.notifyAboutToExpireWorkspaceSubscriptions': {};
    'nightly.reconcileRevenueCatSubscriptions': {};
    'nightly.reconcileStripeRefunds': {};
    'nightly.revenuecat.syncUser': { userId: string };
  }
}

@Injectable()
export class SubscriptionCronJobs {
  constructor(
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly queue: JobQueue,
    private readonly rcHandler: RevenueCatWebhookHandler,
    private readonly stripeFactory: StripeFactory,
    private readonly subscription: SubscriptionService
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

    await this.queue.add(
      'nightly.reconcileRevenueCatSubscriptions',
      {},
      { jobId: 'nightly-payment-reconcile-revenuecat-subscriptions' }
    );

    await this.queue.add(
      'nightly.reconcileStripeRefunds',
      {},
      { jobId: 'nightly-payment-reconcile-stripe-refunds' }
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

  @OnJob('nightly.reconcileRevenueCatSubscriptions')
  async reconcileRevenueCatSubscriptions() {
    // Find active/trialing/past_due RC subscriptions and resync via RC REST
    const subs = await this.db.subscription.findMany({
      where: {
        provider: Provider.revenuecat,
        status: {
          in: [
            SubscriptionStatus.Active,
            SubscriptionStatus.Trialing,
            SubscriptionStatus.PastDue,
          ],
        },
      },
      select: { targetId: true },
    });

    // de-duplicate targetIds
    const userIds = Array.from(new Set(subs.map(s => s.targetId)));
    for (const userId of userIds) {
      await this.queue.add(
        'nightly.revenuecat.syncUser',
        { userId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          jobId: `nightly-rc-sync-${userId}`,
        }
      );
    }
  }

  @OnJob('nightly.revenuecat.syncUser')
  async reconcileRevenueCatSubscriptionOfUser(payload: { userId: string }) {
    await this.rcHandler.syncAppUser(payload.userId);
  }

  @OnJob('nightly.reconcileStripeRefunds')
  async reconcileStripeRefunds() {
    const stripe = this.stripeFactory.stripe;
    const since = Math.floor((Date.now() - 36 * OneHour) / 1000);
    const seen = new Set<string>();

    const refunds = await stripe.refunds.list({
      created: { gte: since },
      limit: 100,
      expand: ['data.charge'],
    });

    for (const refund of refunds.data) {
      const charge = refund.charge;
      const invoiceId =
        typeof charge !== 'string'
          ? typeof charge?.invoice === 'string'
            ? charge.invoice
            : charge?.invoice?.id
          : undefined;
      if (invoiceId && !seen.has(invoiceId)) {
        seen.add(invoiceId);
        await this.subscription.handleRefundedInvoice(invoiceId, 'refund');
      }
    }

    const disputes = await stripe.disputes.list({
      created: { gte: since },
      limit: 100,
      expand: ['data.charge'],
    });

    for (const dispute of disputes.data) {
      const charge = dispute.charge;
      const invoiceId =
        typeof charge !== 'string'
          ? typeof charge?.invoice === 'string'
            ? charge.invoice
            : charge?.invoice?.id
          : undefined;

      if (!invoiceId || seen.has(invoiceId)) {
        continue;
      }

      seen.add(invoiceId);

      const reason =
        dispute.status === 'won'
          ? 'dispute_won'
          : dispute.status === 'lost'
            ? 'dispute_lost'
            : ('dispute_open' as const);

      await this.subscription.handleRefundedInvoice(invoiceId, reason);
    }
  }
}
