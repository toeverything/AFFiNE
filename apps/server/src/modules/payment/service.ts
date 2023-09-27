import { Injectable, Logger } from '@nestjs/common';
import { OnEvent as RawOnEvent } from '@nestjs/event-emitter';
import type {
  User,
  UserStripeCustomer,
  UserSubscription,
} from '@prisma/client';
import Stripe from 'stripe';

import { Config, SubscriptionPlan } from '../../config';
import { PrismaService } from '../../prisma';

const OnEvent = (
  event: Stripe.Event.Type,
  opts?: Parameters<typeof RawOnEvent>[1]
) => RawOnEvent(event, opts);

// see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Unpaid = 'unpaid',
  Canceled = 'canceled',
  Incomplete = 'incomplete',
  Paused = 'paused',
  IncompleteExpired = 'incomplete_expired',
  Trialing = 'trialing',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Open = 'open',
  Void = 'void',
  Paid = 'paid',
  Uncollectible = 'uncollectible',
}

@Injectable()
export class SubscriptionService {
  private readonly paymentConfig: Config['payment'];
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    config: Config,
    private readonly stripe: Stripe,
    private readonly db: PrismaService
  ) {
    this.paymentConfig = config.payment;

    if (
      !this.paymentConfig.stripe.keys.APIKey ||
      !this.paymentConfig.stripe.keys.webhookKey /* default empty string */
    ) {
      this.logger.warn('Stripe API key not set, Stripe will be disabled');
      this.logger.warn('Set STRIPE_API_KEY to enable Stripe');
    }
  }

  async createCheckoutSession({
    user,
    plan,
    redirectUrl,
  }: {
    user: User;
    plan: SubscriptionPlan;
    redirectUrl: string;
  }) {
    const currentSubscription = await this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (currentSubscription && currentSubscription.end < new Date()) {
      throw new Error('User already has a subscription');
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [plan],
    });

    if (!prices.data.length) {
      throw new Error(`Unknown subscription plan: ${plan}`);
    }

    const customer = await this.getOrCreateCustomer(user);
    return await this.stripe.checkout.sessions.create({
      line_items: [
        {
          price: prices.data[0].id,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      tax_id_collection: {
        enabled: true,
      },
      mode: 'subscription',
      success_url: redirectUrl,
      customer: customer.stripeCustomerId,
    });
  }

  async cancelSubscription(userId: string): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscription: true,
      },
    });

    if (!user?.subscription) {
      throw new Error('User has no subscription');
    }

    if (user.subscription.canceledAt) {
      throw new Error('User subscription has already been canceled ');
    }

    // let customer contact support if they want to cancel immediately
    // see https://stripe.com/docs/billing/subscriptions/cancel
    const subscription = await this.stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    return await this.saveSubscription(user, subscription);
  }

  async resumeCanceledSubscriptin(userId: string): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscription: true,
      },
    });

    if (!user?.subscription) {
      throw new Error('User has no subscription');
    }

    if (!user.subscription.canceledAt) {
      throw new Error('User subscription is not canceled');
    }

    if (user.subscription.end < new Date()) {
      throw new Error(
        'User subscription has already expired, please checkout again.'
      );
    }

    const subscription = await this.stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    return await this.saveSubscription(user, subscription);
  }

  async updateSubscriptionPlan(
    userId: string,
    plan: string
  ): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscription: true,
      },
    });

    if (!user?.subscription) {
      throw new Error('User has no subscription');
    }

    if (user.subscription.plan === plan) {
      throw new Error('User has already subscribed to this plan');
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [plan],
    });

    if (!prices.data.length) {
      throw new Error(`Unknown subscription plan: ${plan}`);
    }

    const subscriptionItem = await this.stripe.subscriptionItems.list({
      subscription: user.subscription.id,
    });

    const newSubscription = await this.stripe.subscriptions.update(
      user.subscription.id,
      {
        items: [
          {
            // delete the old subscription item
            id: subscriptionItem.data[0].id,
            deleted: true,
          },
          {
            // add new one
            price: prices.data[0].id,
            quantity: 1,
          },
        ],
        off_session: true,
      }
    );

    return this.saveSubscription(user, newSubscription);
  }

  @OnEvent('customer.subscription.created')
  @OnEvent('customer.subscription.updated')
  async onSubscriptionChanges(subscription: Stripe.Subscription) {
    const user = await this.retrieveUserFromCustomer(
      subscription.customer as string
    );

    await this.saveSubscription(user, subscription);
  }

  @OnEvent('customer.subscription.deleted')
  async onSubscriptionDeleted(subscription: Stripe.Subscription) {
    const user = await this.retrieveUserFromCustomer(
      subscription.customer as string
    );

    await this.db.userSubscription.delete({
      where: {
        userId: user.id,
      },
    });
  }

  private async saveSubscription(
    user: User,
    subscription: Stripe.Subscription
  ): Promise<UserSubscription> {
    // get next bill date from upcoming invoice
    // see https://stripe.com/docs/api/invoices/upcoming
    let nextBillAt: Date | null = null;
    if (
      (subscription.status === SubscriptionStatus.Active ||
        subscription.status === SubscriptionStatus.Trialing) &&
      !subscription.canceled_at
    ) {
      try {
        const nextInvoice = await this.stripe.invoices.retrieveUpcoming({
          customer: subscription.customer as string,
          subscription: subscription.id,
        });

        nextBillAt = new Date(nextInvoice.created * 1000);
      } catch (e) {
        // no upcoming invoice
        // safe to ignore
      }
    }

    const price = subscription.items.data[0].price;

    const update = {
      stripeSubscriptionId: subscription.id,
      plan: price.lookup_key ?? price.id,
      status: subscription.status,
      start: new Date(subscription.current_period_start * 1000),
      end: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      nextBillAt,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    };

    return await this.db.userSubscription.upsert({
      where: {
        userId: user.id,
      },
      update,
      create: {
        userId: user.id,
        ...update,
      },
    });
  }

  private async getOrCreateCustomer(user: User): Promise<UserStripeCustomer> {
    const customer = await this.db.userStripeCustomer.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (customer) {
      return customer;
    }

    const stripeCustomer = await this.stripe.customers.create({
      email: user.email,
    });

    return await this.db.userStripeCustomer.create({
      data: {
        userId: user.id,
        stripeCustomerId: stripeCustomer.id,
      },
    });
  }

  private async retrieveUserFromCustomer(customerId: string) {
    const customer = await this.db.userStripeCustomer.findUnique({
      where: {
        stripeCustomerId: customerId,
      },
      include: {
        user: true,
      },
    });

    if (customer?.user) {
      return customer.user;
    }

    // customer may not saved is db, check it with stripe
    const stripeCustomer = await this.stripe.customers.retrieve(customerId);

    if (stripeCustomer.deleted) {
      throw new Error('Unexpected subscription created with deleted customer');
    }

    if (!stripeCustomer.email) {
      throw new Error('Unexpected subscription created with no email customer');
    }

    const user = await this.db.user.findUnique({
      where: {
        email: stripeCustomer.email,
      },
    });

    if (!user) {
      throw new Error(
        `Unexpected subscription created with unknown customer ${stripeCustomer.email}`
      );
    }

    await this.db.userStripeCustomer.create({
      data: {
        userId: user.id,
        stripeCustomerId: stripeCustomer.id,
      },
    });

    return user;
  }
}
