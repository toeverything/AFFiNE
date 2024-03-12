import { Injectable, Logger } from '@nestjs/common';
import { OnEvent as RawOnEvent } from '@nestjs/event-emitter';
import type {
  Prisma,
  User,
  UserInvoice,
  UserStripeCustomer,
  UserSubscription,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

import { CurrentUser } from '../../core/auth';
import { FeatureManagementService } from '../../core/features';
import { EventEmitter } from '../../fundamentals';
import { ScheduleManager } from './schedule';
import {
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from './types';

const OnEvent = (
  event: Stripe.Event.Type,
  opts?: Parameters<typeof RawOnEvent>[1]
) => RawOnEvent(event, opts);

// Plan x Recurring make a stripe price lookup key
export function encodeLookupKey(
  plan: SubscriptionPlan,
  recurring: SubscriptionRecurring
): string {
  return plan + '_' + recurring;
}

export function decodeLookupKey(
  key: string
): [SubscriptionPlan, SubscriptionRecurring] {
  const [plan, recurring] = key.split('_');

  return [plan as SubscriptionPlan, recurring as SubscriptionRecurring];
}

const SubscriptionActivated: Stripe.Subscription.Status[] = [
  SubscriptionStatus.Active,
  SubscriptionStatus.Trialing,
];

export enum CouponType {
  EarlyAccess = 'earlyaccess',
  EarlyAccessRenew = 'earlyaccessrenew',
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly stripe: Stripe,
    private readonly db: PrismaClient,
    private readonly scheduleManager: ScheduleManager,
    private readonly event: EventEmitter,
    private readonly features: FeatureManagementService
  ) {}

  async listPrices() {
    return this.stripe.prices.list();
  }

  async createCheckoutSession({
    user,
    recurring,
    plan,
    promotionCode,
    redirectUrl,
    idempotencyKey,
  }: {
    user: CurrentUser;
    recurring: SubscriptionRecurring;
    plan: SubscriptionPlan;
    promotionCode?: string | null;
    redirectUrl: string;
    idempotencyKey: string;
  }) {
    const currentSubscription = await this.db.userSubscription.findFirst({
      where: {
        userId: user.id,
        status: SubscriptionStatus.Active,
      },
    });

    if (currentSubscription) {
      throw new Error('You already have a subscription');
    }

    const price = await this.getPrice(plan, recurring);
    const customer = await this.getOrCreateCustomer(
      `${idempotencyKey}-getOrCreateCustomer`,
      user
    );

    let discount: { coupon?: string; promotion_code?: string } | undefined;

    if (promotionCode) {
      const code = await this.getAvailablePromotionCode(
        promotionCode,
        customer.stripeCustomerId
      );
      if (code) {
        discount ??= {};
        discount.promotion_code = code;
      }
    } else {
      const coupon = await this.getAvailableCoupon(
        user,
        CouponType.EarlyAccess
      );
      if (coupon) {
        discount ??= {};
        discount.coupon = coupon;
      }
    }

    return await this.stripe.checkout.sessions.create(
      {
        line_items: [
          {
            price,
            quantity: 1,
          },
        ],
        tax_id_collection: {
          enabled: true,
        },
        ...(discount
          ? {
              discounts: [discount],
            }
          : { allow_promotion_codes: true }),
        mode: 'subscription',
        success_url: redirectUrl,
        customer: customer.stripeCustomerId,
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
      },
      { idempotencyKey: `${idempotencyKey}-checkoutSession` }
    );
  }

  async cancelSubscription(
    idempotencyKey: string,
    userId: string
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
      throw new Error('Your subscription has already been canceled');
    }

    // should release the schedule first
    if (user.subscription.stripeScheduleId) {
      const manager = await this.scheduleManager.fromSchedule(
        user.subscription.stripeScheduleId
      );
      await manager.cancel(idempotencyKey);
      return this.saveSubscription(
        user,
        await this.stripe.subscriptions.retrieve(
          user.subscription.stripeSubscriptionId
        ),
        false
      );
    } else {
      // let customer contact support if they want to cancel immediately
      // see https://stripe.com/docs/billing/subscriptions/cancel
      const subscription = await this.stripe.subscriptions.update(
        user.subscription.stripeSubscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey }
      );
      return await this.saveSubscription(user, subscription);
    }
  }

  async resumeCanceledSubscription(
    idempotencyKey: string,
    userId: string
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

    if (!user.subscription.canceledAt) {
      throw new Error('Your subscription has not been canceled');
    }

    if (user.subscription.end < new Date()) {
      throw new Error('Your subscription is expired, please checkout again.');
    }

    if (user.subscription.stripeScheduleId) {
      const manager = await this.scheduleManager.fromSchedule(
        user.subscription.stripeScheduleId
      );
      await manager.resume(idempotencyKey);
      return this.saveSubscription(
        user,
        await this.stripe.subscriptions.retrieve(
          user.subscription.stripeSubscriptionId
        ),
        false
      );
    } else {
      const subscription = await this.stripe.subscriptions.update(
        user.subscription.stripeSubscriptionId,
        { cancel_at_period_end: false },
        { idempotencyKey }
      );

      return await this.saveSubscription(user, subscription);
    }
  }

  async updateSubscriptionRecurring(
    idempotencyKey: string,
    userId: string,
    recurring: SubscriptionRecurring
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

    const price = await this.getPrice(
      user.subscription.plan as SubscriptionPlan,
      recurring
    );

    const manager = await this.scheduleManager.fromSubscription(
      `${idempotencyKey}-fromSubscription`,
      user.subscription.stripeSubscriptionId
    );

    await manager.update(
      `${idempotencyKey}-update`,
      price,
      // if user is early access user, use early access coupon
      manager.currentPhase?.coupon === CouponType.EarlyAccess ||
        manager.currentPhase?.coupon === CouponType.EarlyAccessRenew ||
        manager.nextPhase?.coupon === CouponType.EarlyAccessRenew
        ? CouponType.EarlyAccessRenew
        : undefined
    );

    return await this.db.userSubscription.update({
      where: {
        id: user.subscription.id,
      },
      data: {
        stripeScheduleId: manager.schedule?.id ?? null, // update schedule id or set to null(undefined means untouched)
        recurring,
      },
    });
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

  @OnEvent('invoice.paid')
  async onInvoicePaid(stripeInvoice: Stripe.Invoice) {
    await this.saveInvoice(stripeInvoice);

    const line = stripeInvoice.lines.data[0];

    if (!line.price || line.price.type !== 'recurring') {
      throw new Error('Unknown invoice with no recurring price');
    }

    // deal with early access user
    if (stripeInvoice.discount?.coupon.id === CouponType.EarlyAccess) {
      const idempotencyKey = stripeInvoice.id + '_earlyaccess';
      const manager = await this.scheduleManager.fromSubscription(
        `${idempotencyKey}-fromSubscription`,
        line.subscription as string
      );
      await manager.update(
        `${idempotencyKey}-update`,
        line.price.id,
        CouponType.EarlyAccessRenew
      );
    }
  }

  @OnEvent('invoice.created')
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

      if (!price.lookup_key) {
        throw new Error('Unexpected subscription with no key');
      }

      const [plan, recurring] = decodeLookupKey(price.lookup_key);

      await this.db.userInvoice.create({
        data: {
          userId: user.id,
          stripeInvoiceId: stripeInvoice.id,
          plan,
          recurring,
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

    const price = subscription.items.data[0].price;
    if (!price.lookup_key) {
      throw new Error('Unexpected subscription with no key');
    }

    const [plan, recurring] = decodeLookupKey(price.lookup_key);
    const planActivated = SubscriptionActivated.includes(subscription.status);

    let nextBillAt: Date | null = null;
    if (planActivated) {
      this.event.emit('user.subscription.activated', {
        userId: user.id,
        plan,
      });

      // get next bill date from upcoming invoice
      // see https://stripe.com/docs/api/invoices/upcoming
      if (!subscription.canceled_at) {
        nextBillAt = new Date(subscription.current_period_end * 1000);
      }
    } else {
      this.event.emit('user.subscription.canceled', user.id);
    }

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
      plan,
      recurring,
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

  private async getOrCreateCustomer(
    idempotencyKey: string,
    user: CurrentUser
  ): Promise<UserStripeCustomer> {
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
      stripeCustomer = await this.stripe.customers.create(
        { email: user.email },
        { idempotencyKey }
      );
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

  private async getPrice(
    plan: SubscriptionPlan,
    recurring: SubscriptionRecurring
  ): Promise<string> {
    const prices = await this.stripe.prices.list({
      lookup_keys: [encodeLookupKey(plan, recurring)],
    });

    if (!prices.data.length) {
      throw new Error(
        `Unknown subscription plan ${plan} with recurring ${recurring}`
      );
    }

    return prices.data[0].id;
  }

  private async getAvailableCoupon(
    user: CurrentUser,
    couponType: CouponType
  ): Promise<string | null> {
    const earlyAccess = await this.features.isEarlyAccessUser(user.email);
    if (earlyAccess) {
      try {
        const coupon = await this.stripe.coupons.retrieve(couponType);
        return coupon.valid ? coupon.id : null;
      } catch (e) {
        this.logger.error('Failed to get early access coupon', e);
        return null;
      }
    }

    return null;
  }

  private async getAvailablePromotionCode(
    userFacingPromotionCode: string,
    customer?: string
  ) {
    const list = await this.stripe.promotionCodes.list({
      code: userFacingPromotionCode,
      active: true,
      limit: 1,
    });

    const code = list.data[0];
    if (!code) {
      return null;
    }

    let available = false;

    if (code.customer) {
      available =
        typeof code.customer === 'string'
          ? code.customer === customer
          : code.customer.id === customer;
    } else {
      available = true;
    }

    return available ? code.id : null;
  }
}
