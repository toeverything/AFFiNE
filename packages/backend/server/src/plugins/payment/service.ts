import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent as RawOnEvent } from '@nestjs/event-emitter';
import type {
  User,
  UserInvoice,
  UserStripeCustomer,
  UserSubscription,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

import { CurrentUser } from '../../core/auth';
import { EarlyAccessType, FeatureManagementService } from '../../core/features';
import {
  ActionForbidden,
  CantUpdateOnetimePaymentSubscription,
  Config,
  CustomerPortalCreateFailed,
  EventEmitter,
  InternalServerError,
  OnEvent,
  SameSubscriptionRecurring,
  SubscriptionAlreadyExists,
  SubscriptionExpired,
  SubscriptionHasBeenCanceled,
  SubscriptionNotExists,
  SubscriptionPlanNotFound,
  UserNotFound,
} from '../../fundamentals';
import { ScheduleManager } from './schedule';
import {
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from './types';

const OnStripeEvent = (
  event: Stripe.Event.Type,
  opts?: Parameters<typeof RawOnEvent>[1]
) => RawOnEvent(event, opts);

// Plan x Recurring make a stripe price lookup key
export function encodeLookupKey(
  plan: SubscriptionPlan,
  recurring: SubscriptionRecurring,
  variant?: SubscriptionVariant
): string {
  return `${plan}_${recurring}` + (variant ? `_${variant}` : '');
}

export function decodeLookupKey(
  key: string
): [SubscriptionPlan, SubscriptionRecurring, SubscriptionVariant?] {
  const [plan, recurring, variant] = key.split('_');

  return [
    plan as SubscriptionPlan,
    recurring as SubscriptionRecurring,
    variant as SubscriptionVariant | undefined,
  ];
}

const SubscriptionActivated: Stripe.Subscription.Status[] = [
  SubscriptionStatus.Active,
  SubscriptionStatus.Trialing,
];

export enum CouponType {
  ProEarlyAccessOneYearFree = 'pro_ea_one_year_free',
  AIEarlyAccessOneYearFree = 'ai_ea_one_year_free',
  ProEarlyAccessAIOneYearFree = 'ai_pro_ea_one_year_free',
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly config: Config,
    private readonly stripe: Stripe,
    private readonly db: PrismaClient,
    private readonly scheduleManager: ScheduleManager,
    private readonly event: EventEmitter,
    private readonly feature: FeatureManagementService
  ) {}

  async listPrices(user?: CurrentUser) {
    let canHaveEarlyAccessDiscount = false;
    let canHaveAIEarlyAccessDiscount = false;
    if (user) {
      canHaveEarlyAccessDiscount = await this.feature.isEarlyAccessUser(
        user.id
      );
      canHaveAIEarlyAccessDiscount = await this.feature.isEarlyAccessUser(
        user.id,
        EarlyAccessType.AI
      );

      const customer = await this.getOrCreateCustomer(
        'list-price:' + randomUUID(),
        user
      );
      const oldSubscriptions = await this.stripe.subscriptions.list({
        customer: customer.stripeCustomerId,
        status: 'all',
      });

      oldSubscriptions.data.forEach(sub => {
        if (sub.status === 'past_due' || sub.status === 'canceled') {
          const [oldPlan] = this.decodePlanFromSubscription(sub);
          if (oldPlan === SubscriptionPlan.Pro) {
            canHaveEarlyAccessDiscount = false;
          }
          if (oldPlan === SubscriptionPlan.AI) {
            canHaveAIEarlyAccessDiscount = false;
          }
        }
      });
    }

    const lifetimePriceEnabled = await this.config.runtime.fetch(
      'plugins.payment/showLifetimePrice'
    );

    const list = await this.stripe.prices.list({
      active: true,
      // only list recurring prices if lifetime price is not enabled
      ...(lifetimePriceEnabled ? {} : { type: 'recurring' }),
    });

    return list.data.filter(price => {
      if (!price.lookup_key) {
        return false;
      }

      const [plan, recurring, variant] = decodeLookupKey(price.lookup_key);

      // never return onetime payment price
      if (variant === SubscriptionVariant.Onetime) {
        return false;
      }

      // no variant price should be used for monthly or lifetime subscription
      if (
        recurring === SubscriptionRecurring.Monthly ||
        recurring === SubscriptionRecurring.Lifetime
      ) {
        return !variant;
      }

      if (plan === SubscriptionPlan.Pro) {
        return (
          (canHaveEarlyAccessDiscount && variant) ||
          (!canHaveEarlyAccessDiscount && !variant)
        );
      }

      if (plan === SubscriptionPlan.AI) {
        return (
          (canHaveAIEarlyAccessDiscount && variant) ||
          (!canHaveAIEarlyAccessDiscount && !variant)
        );
      }

      return false;
    });
  }

  async createCheckoutSession({
    user,
    recurring,
    plan,
    variant,
    promotionCode,
    redirectUrl,
    idempotencyKey,
  }: {
    user: CurrentUser;
    recurring: SubscriptionRecurring;
    plan: SubscriptionPlan;
    variant?: SubscriptionVariant;
    promotionCode?: string | null;
    redirectUrl: string;
    idempotencyKey: string;
  }) {
    if (
      this.config.deploy &&
      this.config.affine.canary &&
      !this.feature.isStaff(user.email)
    ) {
      throw new ActionForbidden();
    }

    // variant is not allowed for lifetime subscription
    if (recurring === SubscriptionRecurring.Lifetime) {
      variant = undefined;
    }

    const currentSubscription = await this.db.userSubscription.findFirst({
      where: {
        userId: user.id,
        plan,
        status: SubscriptionStatus.Active,
      },
    });

    if (
      currentSubscription &&
      // do not allow to re-subscribe unless
      !(
        /* current subscription is a onetime subscription and so as the one that's checking out */
        (
          (currentSubscription.variant === SubscriptionVariant.Onetime &&
            variant === SubscriptionVariant.Onetime) ||
          /* current subscription is normal subscription and is checking-out a lifetime subscription */
          (currentSubscription.recurring !== SubscriptionRecurring.Lifetime &&
            currentSubscription.variant !== SubscriptionVariant.Onetime &&
            recurring === SubscriptionRecurring.Lifetime)
        )
      )
    ) {
      throw new SubscriptionAlreadyExists({ plan });
    }

    const customer = await this.getOrCreateCustomer(
      `${idempotencyKey}-getOrCreateCustomer`,
      user
    );

    const { price, coupon } = await this.getAvailablePrice(
      customer,
      plan,
      recurring,
      variant
    );

    let discounts: Stripe.Checkout.SessionCreateParams['discounts'] = [];

    if (coupon) {
      discounts = [{ coupon }];
    } else if (promotionCode) {
      const code = await this.getAvailablePromotionCode(
        promotionCode,
        customer.stripeCustomerId
      );
      if (code) {
        discounts = [{ promotion_code: code }];
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
        // discount
        ...(discounts.length ? { discounts } : { allow_promotion_codes: true }),
        // mode: 'subscription' or 'payment' for lifetime and onetime payment
        ...(recurring === SubscriptionRecurring.Lifetime ||
        variant === SubscriptionVariant.Onetime
          ? {
              mode: 'payment',
              invoice_creation: {
                enabled: true,
              },
            }
          : {
              mode: 'subscription',
            }),
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
    userId: string,
    plan: SubscriptionPlan
  ): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscriptions: {
          where: {
            plan,
          },
        },
      },
    });

    if (!user) {
      throw new UserNotFound();
    }

    const subscriptionInDB = user?.subscriptions.find(s => s.plan === plan);
    if (!subscriptionInDB) {
      throw new SubscriptionNotExists({ plan });
    }

    if (!subscriptionInDB.stripeSubscriptionId) {
      throw new CantUpdateOnetimePaymentSubscription(
        'Onetime payment subscription cannot be canceled.'
      );
    }

    if (subscriptionInDB.canceledAt) {
      throw new SubscriptionHasBeenCanceled();
    }

    // should release the schedule first
    if (subscriptionInDB.stripeScheduleId) {
      const manager = await this.scheduleManager.fromSchedule(
        subscriptionInDB.stripeScheduleId
      );
      await manager.cancel(idempotencyKey);
      return this.saveSubscription(
        user,
        await this.stripe.subscriptions.retrieve(
          subscriptionInDB.stripeSubscriptionId
        )
      );
    } else {
      // let customer contact support if they want to cancel immediately
      // see https://stripe.com/docs/billing/subscriptions/cancel
      const subscription = await this.stripe.subscriptions.update(
        subscriptionInDB.stripeSubscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey }
      );
      return await this.saveSubscription(user, subscription);
    }
  }

  async resumeCanceledSubscription(
    idempotencyKey: string,
    userId: string,
    plan: SubscriptionPlan
  ): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscriptions: true,
      },
    });

    if (!user) {
      throw new UserNotFound();
    }

    const subscriptionInDB = user?.subscriptions.find(s => s.plan === plan);
    if (!subscriptionInDB) {
      throw new SubscriptionNotExists({ plan });
    }

    if (!subscriptionInDB.stripeSubscriptionId || !subscriptionInDB.end) {
      throw new CantUpdateOnetimePaymentSubscription(
        'Onetime payment subscription cannot be resumed.'
      );
    }

    if (!subscriptionInDB.canceledAt) {
      throw new SubscriptionHasBeenCanceled();
    }

    if (subscriptionInDB.end < new Date()) {
      throw new SubscriptionExpired();
    }

    if (subscriptionInDB.stripeScheduleId) {
      const manager = await this.scheduleManager.fromSchedule(
        subscriptionInDB.stripeScheduleId
      );
      await manager.resume(idempotencyKey);
      return this.saveSubscription(
        user,
        await this.stripe.subscriptions.retrieve(
          subscriptionInDB.stripeSubscriptionId
        )
      );
    } else {
      const subscription = await this.stripe.subscriptions.update(
        subscriptionInDB.stripeSubscriptionId,
        { cancel_at_period_end: false },
        { idempotencyKey }
      );

      return await this.saveSubscription(user, subscription);
    }
  }

  async updateSubscriptionRecurring(
    idempotencyKey: string,
    userId: string,
    plan: SubscriptionPlan,
    recurring: SubscriptionRecurring
  ): Promise<UserSubscription> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscriptions: true,
      },
    });

    if (!user) {
      throw new UserNotFound();
    }
    const subscriptionInDB = user?.subscriptions.find(s => s.plan === plan);
    if (!subscriptionInDB) {
      throw new SubscriptionNotExists({ plan });
    }

    if (!subscriptionInDB.stripeSubscriptionId) {
      throw new CantUpdateOnetimePaymentSubscription();
    }

    if (subscriptionInDB.canceledAt) {
      throw new SubscriptionHasBeenCanceled();
    }

    if (subscriptionInDB.recurring === recurring) {
      throw new SameSubscriptionRecurring({ recurring });
    }

    const price = await this.getPrice(
      subscriptionInDB.plan as SubscriptionPlan,
      recurring
    );

    const manager = await this.scheduleManager.fromSubscription(
      `${idempotencyKey}-fromSubscription`,
      subscriptionInDB.stripeSubscriptionId
    );

    await manager.update(`${idempotencyKey}-update`, price);

    return await this.db.userSubscription.update({
      where: {
        id: subscriptionInDB.id,
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
      throw new UserNotFound();
    }

    try {
      const portal = await this.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
      });

      return portal.url;
    } catch (e) {
      this.logger.error('Failed to create customer portal.', e);
      throw new CustomerPortalCreateFailed();
    }
  }

  @OnStripeEvent('invoice.created')
  @OnStripeEvent('invoice.updated')
  @OnStripeEvent('invoice.finalization_failed')
  @OnStripeEvent('invoice.payment_failed')
  @OnStripeEvent('invoice.payment_succeeded')
  async saveInvoice(stripeInvoice: Stripe.Invoice, event: string) {
    stripeInvoice = await this.stripe.invoices.retrieve(stripeInvoice.id);
    if (!stripeInvoice.customer) {
      throw new Error('Unexpected invoice with no customer');
    }

    const user = await this.retrieveUserFromCustomer(
      typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : stripeInvoice.customer.id
    );

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

    // create invoice
    const price = stripeInvoice.lines.data[0].price;

    if (!price) {
      throw new Error('Unexpected invoice with no price');
    }

    if (!price.lookup_key) {
      throw new Error('Unexpected subscription with no key');
    }

    const [plan, recurring, variant] = decodeLookupKey(price.lookup_key);

    const invoice = await this.db.userInvoice.upsert({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      update: data,
      create: {
        userId: user.id,
        stripeInvoiceId: stripeInvoice.id,
        plan,
        recurring,
        reason: stripeInvoice.billing_reason ?? 'subscription_update',
        ...(data as any),
      },
    });

    // handle one time payment, no subscription created by stripe
    if (
      event === 'invoice.payment_succeeded' &&
      stripeInvoice.status === 'paid'
    ) {
      if (recurring === SubscriptionRecurring.Lifetime) {
        await this.saveLifetimeSubscription(user, invoice);
      } else if (variant === SubscriptionVariant.Onetime) {
        await this.saveOnetimePaymentSubscription(user, invoice);
      }
    }
  }

  async saveLifetimeSubscription(user: User, invoice: UserInvoice) {
    // cancel previous non-lifetime subscription
    const savedSubscription = await this.db.userSubscription.findUnique({
      where: {
        userId_plan: {
          userId: user.id,
          plan: SubscriptionPlan.Pro,
        },
      },
    });

    if (savedSubscription && savedSubscription.stripeSubscriptionId) {
      await this.db.userSubscription.update({
        where: {
          id: savedSubscription.id,
        },
        data: {
          stripeScheduleId: null,
          stripeSubscriptionId: null,
          status: SubscriptionStatus.Active,
          recurring: SubscriptionRecurring.Lifetime,
          start: new Date(),
          end: null,
          nextBillAt: null,
        },
      });

      await this.stripe.subscriptions.cancel(
        savedSubscription.stripeSubscriptionId,
        {
          prorate: true,
        }
      );
    } else {
      await this.db.userSubscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: null,
          plan: invoice.plan,
          recurring: invoice.recurring,
          start: new Date(),
          end: null,
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId: user.id,
      plan: invoice.plan as SubscriptionPlan,
      recurring: SubscriptionRecurring.Lifetime,
    });
  }

  async saveOnetimePaymentSubscription(user: User, invoice: UserInvoice) {
    const savedSubscription = await this.db.userSubscription.findUnique({
      where: {
        userId_plan: {
          userId: user.id,
          plan: invoice.plan,
        },
      },
    });

    // TODO(@forehalo): time helper
    const subscriptionTime =
      (invoice.recurring === SubscriptionRecurring.Monthly ? 30 : 365) *
      24 *
      60 *
      60 *
      1000;

    // extends the subscription time if exists
    if (savedSubscription) {
      if (!savedSubscription.end) {
        throw new InternalServerError(
          'Unexpected onetime subscription with no end date'
        );
      }

      const period =
        // expired, reset the period
        savedSubscription.end <= new Date()
          ? {
              start: new Date(),
              end: new Date(Date.now() + subscriptionTime),
            }
          : {
              end: new Date(savedSubscription.end.getTime() + subscriptionTime),
            };

      await this.db.userSubscription.update({
        where: {
          id: savedSubscription.id,
        },
        data: period,
      });
    } else {
      await this.db.userSubscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: null,
          plan: invoice.plan,
          recurring: invoice.recurring,
          variant: SubscriptionVariant.Onetime,
          start: new Date(),
          end: new Date(Date.now() + subscriptionTime),
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId: user.id,
      plan: invoice.plan as SubscriptionPlan,
      recurring: invoice.recurring as SubscriptionRecurring,
    });
  }

  @OnStripeEvent('customer.subscription.created')
  @OnStripeEvent('customer.subscription.updated')
  async onSubscriptionChanges(subscription: Stripe.Subscription) {
    subscription = await this.stripe.subscriptions.retrieve(subscription.id);
    if (subscription.status === 'active') {
      const user = await this.retrieveUserFromCustomer(
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id
      );

      await this.saveSubscription(user, subscription);
    } else {
      await this.onSubscriptionDeleted(subscription);
    }
  }

  @OnStripeEvent('customer.subscription.deleted')
  async onSubscriptionDeleted(subscription: Stripe.Subscription) {
    const user = await this.retrieveUserFromCustomer(
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id
    );

    const [plan, recurring] = this.decodePlanFromSubscription(subscription);

    this.event.emit('user.subscription.canceled', {
      userId: user.id,
      plan,
      recurring,
    });

    await this.db.userSubscription.deleteMany({
      where: {
        stripeSubscriptionId: subscription.id,
      },
    });
  }

  private async saveSubscription(
    user: User,
    subscription: Stripe.Subscription
  ): Promise<UserSubscription> {
    const price = subscription.items.data[0].price;
    if (!price.lookup_key) {
      throw new Error('Unexpected subscription with no key');
    }

    const [plan, recurring, variant] =
      this.decodePlanFromSubscription(subscription);
    const planActivated = SubscriptionActivated.includes(subscription.status);

    // update features first, features modify are idempotent
    // so there is no need to skip if a subscription already exists.
    this.event.emit('user.subscription.activated', {
      userId: user.id,
      plan,
      recurring,
    });

    let nextBillAt: Date | null = null;
    if (planActivated && !subscription.canceled_at) {
      // get next bill date from upcoming invoice
      // see https://stripe.com/docs/api/invoices/upcoming
      nextBillAt = new Date(subscription.current_period_end * 1000);
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
      variant,
      status: subscription.status,
      stripeScheduleId: subscription.schedule as string | null,
    };

    return await this.db.userSubscription.upsert({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      update: commonData,
      create: {
        userId: user.id,
        ...commonData,
      },
    });
  }

  private async getOrCreateCustomer(
    idempotencyKey: string,
    user: CurrentUser
  ): Promise<UserStripeCustomer> {
    let customer = await this.db.userStripeCustomer.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (!customer) {
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

      customer = await this.db.userStripeCustomer.create({
        data: {
          userId: user.id,
          stripeCustomerId: stripeCustomer.id,
        },
      });
    }

    return customer;
  }

  @OnEvent('user.updated')
  async onUserUpdated(user: User) {
    const customer = await this.db.userStripeCustomer.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (customer) {
      const stripeCustomer = await this.stripe.customers.retrieve(
        customer.stripeCustomerId
      );
      if (!stripeCustomer.deleted && stripeCustomer.email !== user.email) {
        await this.stripe.customers.update(customer.stripeCustomerId, {
          email: user.email,
        });
      }
    }
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
    recurring: SubscriptionRecurring,
    variant?: SubscriptionVariant
  ): Promise<string> {
    if (recurring === SubscriptionRecurring.Lifetime) {
      const lifetimePriceEnabled = await this.config.runtime.fetch(
        'plugins.payment/showLifetimePrice'
      );

      if (!lifetimePriceEnabled) {
        throw new ActionForbidden();
      }
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [encodeLookupKey(plan, recurring, variant)],
    });

    if (!prices.data.length) {
      throw new SubscriptionPlanNotFound({
        plan,
        recurring,
      });
    }

    return prices.data[0].id;
  }

  /**
   * Get available for different plans with special early-access price and coupon
   */
  private async getAvailablePrice(
    customer: UserStripeCustomer,
    plan: SubscriptionPlan,
    recurring: SubscriptionRecurring,
    variant?: SubscriptionVariant
  ): Promise<{ price: string; coupon?: string }> {
    if (variant) {
      const price = await this.getPrice(plan, recurring, variant);
      return { price };
    }

    const isEaUser = await this.feature.isEarlyAccessUser(customer.userId);
    const oldSubscriptions = await this.stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: 'all',
    });

    const subscribed = oldSubscriptions.data.some(sub => {
      const [oldPlan] = this.decodePlanFromSubscription(sub);
      return (
        oldPlan === plan &&
        (sub.status === 'past_due' || sub.status === 'canceled')
      );
    });

    if (plan === SubscriptionPlan.Pro) {
      const canHaveEADiscount =
        isEaUser && !subscribed && recurring === SubscriptionRecurring.Yearly;
      const price = await this.getPrice(
        plan,
        recurring,
        canHaveEADiscount ? SubscriptionVariant.EA : undefined
      );
      return {
        price,
        coupon: canHaveEADiscount
          ? CouponType.ProEarlyAccessOneYearFree
          : undefined,
      };
    } else {
      const isAIEaUser = await this.feature.isEarlyAccessUser(
        customer.userId,
        EarlyAccessType.AI
      );

      const canHaveEADiscount =
        isAIEaUser && !subscribed && recurring === SubscriptionRecurring.Yearly;
      const price = await this.getPrice(
        plan,
        recurring,
        canHaveEADiscount ? SubscriptionVariant.EA : undefined
      );

      return {
        price,
        coupon: !subscribed
          ? isAIEaUser
            ? CouponType.AIEarlyAccessOneYearFree
            : isEaUser
              ? CouponType.ProEarlyAccessAIOneYearFree
              : undefined
          : undefined,
      };
    }
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

  private decodePlanFromSubscription(sub: Stripe.Subscription) {
    const price = sub.items.data[0].price;

    if (!price.lookup_key) {
      throw new Error('Unexpected subscription with no key');
    }

    return decodeLookupKey(price.lookup_key);
  }
}
