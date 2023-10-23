import { Injectable, Logger } from '@nestjs/common';
import { OnEvent as RawOnEvent } from '@nestjs/event-emitter';
import type {
  Prisma,
  User,
  UserInvoice,
  UserStripeCustomer,
  UserSubscription,
} from '@prisma/client';
import Stripe from 'stripe';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

const OnEvent = (
  event: Stripe.Event.Type,
  opts?: Parameters<typeof RawOnEvent>[1]
) => RawOnEvent(event, opts);

// also used as lookup key for stripe prices
export enum SubscriptionRecurring {
  Monthly = 'monthly',
  Yearly = 'yearly',
}

export enum SubscriptionPlan {
  Free = 'free',
  Pro = 'pro',
  Team = 'team',
  Enterprise = 'enterprise',
}

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

  async listPrices() {
    return this.stripe.prices.list({
      lookup_keys: Object.values(SubscriptionRecurring),
    });
  }

  async createCheckoutSession({
    user,
    recurring,
    redirectUrl,
  }: {
    user: User;
    recurring: SubscriptionRecurring;
    redirectUrl: string;
  }) {
    const currentSubscription = await this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (currentSubscription && currentSubscription.end < new Date()) {
      throw new Error('You already have a subscription');
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [recurring],
    });

    if (!prices.data.length) {
      throw new Error(`Unknown subscription recurring: ${recurring}`);
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
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
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
      throw new Error('You do not have any subscription');
    }

    if (user.subscription.canceledAt) {
      throw new Error('Your subscription has already been canceled ');
    }

    // should release the schedule first
    if (user.subscription.stripeScheduleId) {
      await this.stripe.subscriptionSchedules.release(
        user.subscription.stripeScheduleId
      );
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
      throw new Error('You do not have any subscription');
    }

    if (!user.subscription.canceledAt) {
      throw new Error('Your subscription has not been canceled');
    }

    if (user.subscription.end < new Date()) {
      throw new Error('Your subscription is expired, please checkout again.');
    }

    const subscription = await this.stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    return await this.saveSubscription(user, subscription);
  }

  async updateSubscriptionRecurring(
    userId: string,
    recurring: string
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
      throw new Error('You do not have any subscription');
    }

    if (user.subscription.canceledAt) {
      throw new Error('Your subscription has already been canceled ');
    }

    if (user.subscription.recurring === recurring) {
      throw new Error('You have already subscribed to this plan');
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [recurring],
    });

    if (!prices.data.length) {
      throw new Error(`Unknown subscription recurring: ${recurring}`);
    }

    const newPrice = prices.data[0];

    // a schedule existing
    if (user.subscription.stripeScheduleId) {
      const schedule = await this.stripe.subscriptionSchedules.retrieve(
        user.subscription.stripeScheduleId
      );

      // a scheduled subscription's old price equals the change
      if (
        schedule.phases[0] &&
        (schedule.phases[0].items[0].price as string) === newPrice.id
      ) {
        await this.stripe.subscriptionSchedules.release(
          user.subscription.stripeScheduleId
        );

        return await this.db.userSubscription.update({
          where: {
            id: user.subscription.id,
          },
          data: {
            recurring,
          },
        });
      } else {
        throw new Error(
          'Unexpected subscription scheduled, please contact the supporters'
        );
      }
    } else {
      const schedule = await this.stripe.subscriptionSchedules.create({
        from_subscription: user.subscription.stripeSubscriptionId,
      });

      await this.stripe.subscriptionSchedules.update(schedule.id, {
        phases: [
          {
            items: [
              {
                price: schedule.phases[0].items[0].price as string,
                quantity: 1,
              },
            ],
            start_date: schedule.phases[0].start_date,
            end_date: schedule.phases[0].end_date,
          },
          {
            items: [
              {
                price: newPrice.id,
                quantity: 1,
              },
            ],
          },
        ],
      });

      return await this.db.userSubscription.update({
        where: {
          id: user.subscription.id,
        },
        data: {
          recurring,
          stripeScheduleId: schedule.id,
        },
      });
    }
  }

  async createCustomerPortal(id: string) {
    const user = await this.db.userStripeCustomer.findUnique({
      where: {
        userId: id,
      },
    });

    if (!user) {
      throw new Error('Unknown user');
    }

    try {
      const portal = await this.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
      });

      return portal.url;
    } catch (e) {
      this.logger.error('Failed to create customer portal.', e);
      throw new Error('Failed to create customer portal');
    }
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

    await this.db.userSubscription.deleteMany({
      where: {
        stripeSubscriptionId: subscription.id,
        userId: user.id,
      },
    });
  }

  @OnEvent('invoice.created')
  @OnEvent('invoice.paid')
  @OnEvent('invoice.finalization_failed')
  @OnEvent('invoice.payment_failed')
  async saveInvoice(stripeInvoice: Stripe.Invoice) {
    if (!stripeInvoice.customer) {
      throw new Error('Unexpected invoice with no customer');
    }

    const user = await this.retrieveUserFromCustomer(
      typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : stripeInvoice.customer.id
    );

    const invoice = await this.db.userInvoice.findUnique({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
    });

    const data: Partial<UserInvoice> = {
      currency: stripeInvoice.currency,
      amount: stripeInvoice.total,
      status: stripeInvoice.status ?? InvoiceStatus.Void,
      link: stripeInvoice.hosted_invoice_url,
    };

    // handle payment error
    if (stripeInvoice.attempt_count > 1) {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        stripeInvoice.payment_intent as string
      );

      if (paymentIntent.last_payment_error) {
        if (paymentIntent.last_payment_error.type === 'card_error') {
          data.lastPaymentError =
            paymentIntent.last_payment_error.message ?? 'Failed to pay';
        } else {
          data.lastPaymentError = 'Internal Payment error';
        }
      }
    } else if (stripeInvoice.last_finalization_error) {
      if (stripeInvoice.last_finalization_error.type === 'card_error') {
        data.lastPaymentError =
          stripeInvoice.last_finalization_error.message ??
          'Failed to finalize invoice';
      } else {
        data.lastPaymentError = 'Internal Payment error';
      }
    }

    // update invoice
    if (invoice) {
      await this.db.userInvoice.update({
        where: {
          stripeInvoiceId: stripeInvoice.id,
        },
        data,
      });
    } else {
      // create invoice
      const price = stripeInvoice.lines.data[0].price;

      if (!price || price.type !== 'recurring') {
        throw new Error('Unexpected invoice with no recurring price');
      }

      await this.db.userInvoice.create({
        data: {
          userId: user.id,
          stripeInvoiceId: stripeInvoice.id,
          plan: SubscriptionPlan.Pro,
          recurring: price.lookup_key ?? price.id,
          reason: stripeInvoice.billing_reason ?? 'contact support',
          ...(data as any),
        },
      });
    }
  }

  private async saveSubscription(
    user: User,
    subscription: Stripe.Subscription,
    fromWebhook = true
  ): Promise<UserSubscription> {
    // webhook events may not in sequential order
    // always fetch the latest subscription and save
    // see https://stripe.com/docs/webhooks#behaviors
    if (fromWebhook) {
      subscription = await this.stripe.subscriptions.retrieve(subscription.id);
    }

    // get next bill date from upcoming invoice
    // see https://stripe.com/docs/api/invoices/upcoming
    let nextBillAt: Date | null = null;
    if (
      (subscription.status === SubscriptionStatus.Active ||
        subscription.status === SubscriptionStatus.Trialing) &&
      !subscription.canceled_at
    ) {
      nextBillAt = new Date(subscription.current_period_end * 1000);
    }

    const price = subscription.items.data[0].price;

    const commonData = {
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
      stripeSubscriptionId: subscription.id,
      recurring: price.lookup_key ?? price.id,
      // TODO: dynamic plans
      plan: SubscriptionPlan.Pro,
      status: subscription.status,
      stripeScheduleId: subscription.schedule as string | null,
    };

    const currentSubscription = await this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (currentSubscription) {
      const update: Prisma.UserSubscriptionUpdateInput = {
        ...commonData,
      };

      // a schedule exists, update the recurring to scheduled one
      if (update.stripeScheduleId) {
        delete update.recurring;
      }

      return await this.db.userSubscription.update({
        where: {
          id: currentSubscription.id,
        },
        data: update,
      });
    } else {
      return await this.db.userSubscription.create({
        data: {
          userId: user.id,
          ...commonData,
        },
      });
    }
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

    const stripeCustomersList = await this.stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    let stripeCustomer: Stripe.Customer | undefined;
    if (stripeCustomersList.data.length) {
      stripeCustomer = stripeCustomersList.data[0];
    } else {
      stripeCustomer = await this.stripe.customers.create({
        email: user.email,
      });
    }

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
