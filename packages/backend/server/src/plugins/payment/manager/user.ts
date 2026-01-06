import { Injectable } from '@nestjs/common';
import { PrismaClient, Provider, UserStripeCustomer } from '@prisma/client';
import { omit, pick } from 'lodash-es';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  Config,
  EventBus,
  InternalServerError,
  InvalidCheckoutParameters,
  ManagedByAppStoreOrPlay,
  Mutex,
  OneMonth,
  OnEvent,
  OneYear,
  SubscriptionAlreadyExists,
  SubscriptionPlanNotFound,
  TooManyRequest,
  URLHelper,
} from '../../../base';
import { EarlyAccessType, FeatureService } from '../../../core/features';
import { StripeFactory } from '../stripe';
import {
  CouponType,
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  retriveLookupKeyFromStripeSubscription,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from '../types';
import { CheckoutParams, Subscription, SubscriptionManager } from './common';

interface PriceStrategyStatus {
  proEarlyAccess: boolean;
  aiEarlyAccess: boolean;
  proSubscribed: boolean;
  aiSubscribed: boolean;
  onetime: boolean;
}

export const UserSubscriptionIdentity = z.object({
  plan: z.enum([SubscriptionPlan.Pro, SubscriptionPlan.AI]),
  userId: z.string(),
});

export const UserSubscriptionCheckoutArgs = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

@Injectable()
export class UserSubscriptionManager extends SubscriptionManager {
  constructor(
    stripeProvider: StripeFactory,
    db: PrismaClient,
    private readonly config: Config,
    private readonly feature: FeatureService,
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly mutex: Mutex
  ) {
    super(stripeProvider, db);
  }

  async filterPrices(
    prices: KnownStripePrice[],
    customer?: UserStripeCustomer
  ) {
    const strategyStatus = customer
      ? await this.strategyStatus(customer)
      : {
          proEarlyAccess: false,
          aiEarlyAccess: false,
          proSubscribed: false,
          aiSubscribed: false,
          onetime: false,
        };

    const availablePrices: KnownStripePrice[] = [];

    for (const price of prices) {
      if (await this.isPriceAvailable(price, strategyStatus)) {
        availablePrices.push(price);
      }
    }

    return availablePrices;
  }

  async checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    { user }: z.infer<typeof UserSubscriptionCheckoutArgs>
  ) {
    if (
      lookupKey.plan !== SubscriptionPlan.Pro &&
      lookupKey.plan !== SubscriptionPlan.AI
    ) {
      throw new InvalidCheckoutParameters();
    }

    const active = await this.getActiveSubscription({
      plan: lookupKey.plan,
      userId: user.id,
    });
    if (active?.provider === 'revenuecat') {
      throw new ManagedByAppStoreOrPlay();
    }

    const subscription = await this.getSubscription({
      plan: lookupKey.plan,
      userId: user.id,
    });

    if (
      subscription &&
      // do not allow to re-subscribe unless
      !(
        /* current subscription is a onetime subscription and so as the one that's checking out */
        (
          (subscription.variant === SubscriptionVariant.Onetime &&
            lookupKey.variant === SubscriptionVariant.Onetime) ||
          /* current subscription is normal subscription and is checking-out a lifetime subscription */
          (subscription.recurring !== SubscriptionRecurring.Lifetime &&
            subscription.variant !== SubscriptionVariant.Onetime &&
            lookupKey.recurring === SubscriptionRecurring.Lifetime)
        )
      )
    ) {
      throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
    }

    const customer = await this.getOrCreateCustomer(user.id);
    const strategy = await this.strategyStatus(customer);
    const price = await this.autoPrice(lookupKey, strategy);

    if (
      !price ||
      !(await this.isPriceAvailable(price, { ...strategy, onetime: true }))
    ) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const discounts = await (async () => {
      const coupon = await this.getBuildInCoupon(customer, price);
      if (coupon) {
        return { discounts: [{ coupon }] };
      } else if (params.coupon) {
        const couponId = await this.getCouponFromPromotionCode(
          params.coupon,
          customer
        );
        if (couponId) {
          return { discounts: [{ coupon: couponId }] };
        }
      }

      return { allow_promotion_codes: true };
    })();

    const trials = (() => {
      if (lookupKey.plan === SubscriptionPlan.AI && !strategy.aiSubscribed) {
        return {
          trial_period_days: 7,
        } as Stripe.Checkout.SessionCreateParams.SubscriptionData;
      }
      return undefined;
    })();

    // mode: 'subscription' or 'payment' for lifetime and onetime payment
    const mode =
      lookupKey.recurring === SubscriptionRecurring.Lifetime ||
      lookupKey.variant === SubscriptionVariant.Onetime
        ? {
            mode: 'payment' as const,
            invoice_creation: {
              enabled: true,
            },
          }
        : {
            mode: 'subscription' as const,
            subscription_data: {
              ...trials,
            },
          };

    return this.stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      line_items: [
        {
          price: price.price.id,
          quantity: 1,
        },
      ],
      ...mode,
      ...discounts,
      success_url: this.url.link(params.successCallbackLink),
    });
  }

  async getSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    return this.db.subscription.findFirst({
      where: {
        targetId: args.userId,
        plan: args.plan,
      },
    });
  }

  async getActiveSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    return this.db.subscription.findFirst({
      where: {
        targetId: args.userId,
        plan: args.plan,
        status: {
          in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
        },
      },
    });
  }

  async saveStripeSubscription(subscription: KnownStripeSubscription) {
    const { userId, lookupKey, stripeSubscription } = subscription;
    this.assertUserIdExists(userId);

    // update features first, features modify are idempotent
    // so there is no need to skip if a subscription already exists.
    if (
      stripeSubscription.status === SubscriptionStatus.Active ||
      stripeSubscription.status === SubscriptionStatus.Trialing
    ) {
      this.event.emit('user.subscription.activated', {
        userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    } else {
      this.event.emit('user.subscription.canceled', {
        userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const subscriptionData = this.transformSubscription(subscription);

    return this.db.subscription.upsert({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
      update: pick(subscriptionData, [
        'status',
        'stripeScheduleId',
        'nextBillAt',
        'canceledAt',
        'end',
      ]),
      create: {
        targetId: userId,
        ...omit(subscriptionData, ['provider', 'iapStore']),
      },
    });
  }

  async deleteStripeSubscription({
    userId,
    lookupKey,
    stripeSubscription,
  }: KnownStripeSubscription) {
    this.assertUserIdExists(userId);
    const result = await this.db.subscription.deleteMany({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    if (result.count > 0) {
      this.event.emit('user.subscription.canceled', {
        userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }
  }

  async cancelSubscription(subscription: Subscription) {
    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: new Date(),
        nextBillAt: null,
      },
    });
  }

  async resumeSubscription(subscription: Subscription) {
    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: null,
        nextBillAt: subscription.end,
      },
    });
  }

  async updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ) {
    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: { recurring },
    });
  }

  private async getBuildInCoupon(
    customer: UserStripeCustomer,
    price: KnownStripePrice
  ) {
    const strategyStatus = await this.strategyStatus(customer);

    // onetime price is allowed for checkout
    strategyStatus.onetime = true;

    if (!(await this.isPriceAvailable(price, strategyStatus))) {
      return null;
    }

    let coupon: CouponType | undefined;

    if (price.lookupKey.variant === SubscriptionVariant.EA) {
      if (price.lookupKey.plan === SubscriptionPlan.Pro) {
        coupon = CouponType.ProEarlyAccessOneYearFree;
      } else if (price.lookupKey.plan === SubscriptionPlan.AI) {
        coupon = CouponType.AIEarlyAccessOneYearFree;
      }
    } else if (price.lookupKey.plan === SubscriptionPlan.AI) {
      const { proEarlyAccess, aiSubscribed } = strategyStatus;
      if (proEarlyAccess && !aiSubscribed) {
        coupon = CouponType.ProEarlyAccessAIOneYearFree;
      }
    }

    return coupon;
  }

  async saveInvoice(knownInvoice: KnownStripeInvoice) {
    const { userId, lookupKey, stripeInvoice } = knownInvoice;
    this.assertUserIdExists(userId);

    const invoiceData = await this.transformInvoice(knownInvoice);

    const invoice = await this.db.invoice.upsert({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      update: omit(invoiceData, 'stripeInvoiceId'),
      create: {
        targetId: userId,
        ...invoiceData,
      },
    });

    // onetime and lifetime subscription is a special "subscription" that doesn't get involved with stripe subscription system
    // we track the deals by invoice only.
    if (stripeInvoice.status === 'paid') {
      await using lock = await this.mutex.acquire(
        `redeem-onetime-subscription:${stripeInvoice.id}`
      );

      if (!lock) {
        throw new TooManyRequest();
      }

      if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
        await this.saveLifetimeSubscription(knownInvoice);
      } else if (lookupKey.variant === SubscriptionVariant.Onetime) {
        await this.saveOnetimePaymentSubscription(knownInvoice);
      }
    }

    return invoice;
  }

  async saveLifetimeSubscription(knownInvoice: KnownStripeInvoice) {
    this.assertUserIdExists(knownInvoice.userId);

    // cancel previous non-lifetime subscription
    const prevSubscription = await this.db.subscription.findUnique({
      where: {
        targetId_plan: {
          targetId: knownInvoice.userId,
          plan: SubscriptionPlan.Pro,
        },
      },
    });

    if (prevSubscription) {
      if (prevSubscription.stripeSubscriptionId) {
        await this.db.subscription.update({
          where: {
            id: prevSubscription.id,
          },
          data: {
            stripeScheduleId: null,
            stripeSubscriptionId: null,
            plan: knownInvoice.lookupKey.plan,
            recurring: SubscriptionRecurring.Lifetime,
            start: new Date(),
            end: null,
            status: SubscriptionStatus.Active,
            nextBillAt: null,
          },
        });

        await this.stripe.subscriptions.cancel(
          prevSubscription.stripeSubscriptionId,
          {
            prorate: true,
          }
        );
      }
    } else {
      await this.db.subscription.create({
        data: {
          targetId: knownInvoice.userId,
          stripeSubscriptionId: null,
          plan: knownInvoice.lookupKey.plan,
          recurring: SubscriptionRecurring.Lifetime,
          start: new Date(),
          end: null,
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId: knownInvoice.userId,
      plan: knownInvoice.lookupKey.plan,
      recurring: SubscriptionRecurring.Lifetime,
    });
  }

  async saveOnetimePaymentSubscription(knownInvoice: KnownStripeInvoice) {
    this.assertUserIdExists(knownInvoice.userId);
    const { userId, lookupKey, stripeInvoice } = knownInvoice;

    const invoice = await this.db.invoice.findUnique({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
    });

    if (!invoice) {
      // never happens
      throw new InternalServerError('Invoice not found');
    }

    if (invoice.onetimeSubscriptionRedeemed) {
      return;
    }

    await this.db.invoice.update({
      select: {
        onetimeSubscriptionRedeemed: true,
      },
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      data: { onetimeSubscriptionRedeemed: true },
    });

    const existingSubscription = await this.db.subscription.findUnique({
      where: {
        targetId_plan: {
          targetId: userId,
          plan: lookupKey.plan,
        },
      },
    });

    const subscriptionTime =
      lookupKey.recurring === SubscriptionRecurring.Monthly
        ? OneMonth
        : OneYear;

    let subscription: Subscription;

    // extends the subscription time if exists
    if (existingSubscription) {
      if (!existingSubscription.end) {
        throw new InternalServerError(
          'Unexpected onetime subscription with no end date'
        );
      }

      const period =
        // expired, reset the period
        existingSubscription.end <= new Date()
          ? {
              start: new Date(),
              end: new Date(Date.now() + subscriptionTime),
            }
          : {
              end: new Date(
                existingSubscription.end.getTime() + subscriptionTime
              ),
            };

      subscription = await this.db.subscription.update({
        where: {
          id: existingSubscription.id,
        },
        data: period,
      });
    } else {
      subscription = await this.db.subscription.create({
        data: {
          targetId: userId,
          stripeSubscriptionId: null,
          ...lookupKey,
          start: new Date(),
          end: new Date(Date.now() + subscriptionTime),
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });

    return subscription;
  }

  async revokeOnetimeOrLifetime(knownInvoice: KnownStripeInvoice) {
    this.assertUserIdExists(knownInvoice.userId);
    const { userId, lookupKey } = knownInvoice;

    const subscription = await this.db.subscription.findFirst({
      where: {
        targetId: userId,
        plan: lookupKey.plan,
        provider: Provider.stripe,
      },
    });

    if (!subscription) {
      return;
    }

    await this.db.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.Canceled,
        nextBillAt: null,
        canceledAt: new Date(),
      },
    });

    this.event.emit('user.subscription.canceled', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });
  }

  async restoreOnetimeOrLifetime(knownInvoice: KnownStripeInvoice) {
    this.assertUserIdExists(knownInvoice.userId);
    const { userId, lookupKey, stripeInvoice } = knownInvoice;

    const subscription = await this.db.subscription.findFirst({
      where: {
        targetId: userId,
        plan: lookupKey.plan,
        provider: Provider.stripe,
      },
    });

    const start =
      stripeInvoice.lines.data[0]?.period?.start ??
      (typeof stripeInvoice.created === 'number'
        ? stripeInvoice.created
        : Date.now() / 1000);

    let end: Date | null = null;

    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      end = null;
    } else if (lookupKey.variant === SubscriptionVariant.Onetime) {
      const isMonthly = lookupKey.recurring === SubscriptionRecurring.Monthly;
      const duration = isMonthly ? OneMonth : OneYear;
      end = subscription?.end ?? new Date(start * 1000 + duration);
    } else {
      end = subscription?.end ?? null;
    }

    if (subscription) {
      await this.db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.Active,
          canceledAt: null,
          nextBillAt: null,
          start: subscription.start ?? new Date(start * 1000),
          end,
        },
      });
    } else {
      await this.db.subscription.create({
        data: {
          targetId: userId,
          stripeSubscriptionId: null,
          ...lookupKey,
          start: new Date(start * 1000),
          end,
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });
  }

  private async autoPrice(lookupKey: LookupKey, strategy: PriceStrategyStatus) {
    // auto select ea variant when available if not specified
    let variant: SubscriptionVariant | null = lookupKey.variant;

    if (!variant) {
      // make the if conditions separated, more readable
      // pro early access
      if (
        lookupKey.plan === SubscriptionPlan.Pro &&
        lookupKey.recurring === SubscriptionRecurring.Yearly &&
        strategy.proEarlyAccess &&
        !strategy.proSubscribed
      ) {
        variant = SubscriptionVariant.EA;
      }

      // ai early access
      if (
        lookupKey.plan === SubscriptionPlan.AI &&
        lookupKey.recurring === SubscriptionRecurring.Yearly &&
        strategy.aiEarlyAccess &&
        !strategy.aiSubscribed
      ) {
        variant = SubscriptionVariant.EA;
      }
    }

    return this.getPrice({
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
      variant,
    });
  }

  private async isPriceAvailable(
    price: KnownStripePrice,
    strategy: PriceStrategyStatus
  ) {
    if (price.lookupKey.plan === SubscriptionPlan.Pro) {
      return this.isProPriceAvailable(price, strategy);
    }

    if (price.lookupKey.plan === SubscriptionPlan.AI) {
      return this.isAIPriceAvailable(price, strategy);
    }

    return false;
  }

  private async isProPriceAvailable(
    { lookupKey }: KnownStripePrice,
    { proEarlyAccess, proSubscribed, onetime }: PriceStrategyStatus
  ) {
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return this.config.payment.showLifetimePrice;
    }

    if (lookupKey.variant === SubscriptionVariant.Onetime) {
      return onetime;
    }

    // no special price for monthly plan
    if (lookupKey.recurring === SubscriptionRecurring.Monthly) {
      return true;
    }

    // show EA price instead of normal price if early access is available
    return proEarlyAccess && !proSubscribed
      ? lookupKey.variant === SubscriptionVariant.EA
      : lookupKey.variant !== SubscriptionVariant.EA;
  }

  private async isAIPriceAvailable(
    { lookupKey }: KnownStripePrice,
    { aiEarlyAccess, aiSubscribed, onetime }: PriceStrategyStatus
  ) {
    // no lifetime price for AI
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return false;
    }

    // never show onetime prices
    if (lookupKey.variant === SubscriptionVariant.Onetime) {
      return onetime;
    }

    // show EA price instead of normal price if early access is available
    return aiEarlyAccess && !aiSubscribed
      ? lookupKey.variant === SubscriptionVariant.EA
      : lookupKey.variant !== SubscriptionVariant.EA;
  }

  private async strategyStatus(
    customer: UserStripeCustomer
  ): Promise<PriceStrategyStatus> {
    const proEarlyAccess = await this.feature.isEarlyAccessUser(
      customer.userId,
      EarlyAccessType.App
    );

    const aiEarlyAccess = await this.feature.isEarlyAccessUser(
      customer.userId,
      EarlyAccessType.AI
    );

    let proSubscribed = false;
    let aiSubscribed = false;

    const subscriptions = await this.stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: 'all',
    });

    // if the early access user had early access subscription in the past, but it got canceled or past due,
    // the user will lose the early access privilege
    for (const sub of subscriptions.data) {
      const lookupKey = retriveLookupKeyFromStripeSubscription(sub);
      if (!lookupKey) {
        continue;
      }

      if (lookupKey.plan === SubscriptionPlan.Pro) {
        proSubscribed = true;
      }

      if (lookupKey.plan === SubscriptionPlan.AI) {
        aiSubscribed = true;
      }
    }

    return {
      proEarlyAccess,
      aiEarlyAccess,
      proSubscribed,
      aiSubscribed,
      onetime: false,
    };
  }

  private assertUserIdExists(
    userId: string | undefined
  ): asserts userId is string {
    if (!userId) {
      throw new Error('user should exists for stripe subscription or invoice.');
    }
  }

  @OnEvent('user.deleted')
  async onUserDeleted({ id }: Events['user.deleted']) {
    const subscription = await this.db.subscription.findFirst({
      where: {
        targetId: id,
      },
    });

    if (subscription?.stripeSubscriptionId) {
      await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    }
  }
}
