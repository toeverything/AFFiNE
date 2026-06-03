import { Injectable } from '@nestjs/common';
import { PrismaClient, Provider, UserStripeCustomer } from '@prisma/client';
import { omit, pick } from 'lodash-es';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  Config,
  EventBus,
  InvalidCheckoutParameters,
  ManagedByAppStoreOrPlay,
  Mutex,
  OnEvent,
  SubscriptionAlreadyExists,
  SubscriptionPlanNotFound,
  TooManyRequest,
  URLHelper,
} from '../../../base';
import { EntitlementService } from '../../../core/entitlement';
import { StripeFactory } from '../stripe';
import {
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  retriveLookupKeyFromStripeSubscription,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';
import {
  activeSubscriptionWhere,
  CheckoutParams,
  Subscription,
  SubscriptionManager,
} from './common';

interface PriceStrategyStatus {
  proSubscribed: boolean;
  aiSubscribed: boolean;
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
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly mutex: Mutex,
    private readonly entitlement: EntitlementService
  ) {
    super(stripeProvider, db);
  }

  async filterPrices(
    prices: KnownStripePrice[],
    _customer?: UserStripeCustomer
  ) {
    const availablePrices: KnownStripePrice[] = [];

    for (const price of prices) {
      if (await this.isPriceAvailable(price)) {
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
      (lookupKey.plan !== SubscriptionPlan.Pro &&
        lookupKey.plan !== SubscriptionPlan.AI) ||
      lookupKey.variant !== null
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

    if (
      active &&
      // do not allow to re-subscribe unless
      !(
        active.recurring !== SubscriptionRecurring.Lifetime &&
        lookupKey.recurring === SubscriptionRecurring.Lifetime
      )
    ) {
      throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
    }

    const customer = await this.getOrCreateCustomer(user.id);
    const strategy = await this.strategyStatus(customer);
    const price = await this.getPrice(lookupKey);

    if (!price || !(await this.isPriceAvailable(price))) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const discounts = await (async () => {
      if (params.coupon) {
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

    // mode: 'subscription' or 'payment' for lifetime payment
    const mode =
      lookupKey.recurring === SubscriptionRecurring.Lifetime
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
      success_url: this.url.safeLink(params.successCallbackLink || '/'),
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
        ...activeSubscriptionWhere(),
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

    const saved = await this.db.subscription.upsert({
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
    await this.entitlement.upsertFromCloudSubscription(saved);
    return saved;
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
      await this.entitlement.revokeCloudSubscription({
        targetId: userId,
        plan: lookupKey.plan,
        stripeSubscriptionId: stripeSubscription.id,
      });
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

    // Lifetime subscription does not get involved with the Stripe subscription system.
    // We track the deal by invoice only.
    if (stripeInvoice.status === 'paid') {
      await using lock = await this.mutex.acquire(
        `redeem-lifetime-subscription:${stripeInvoice.id}`
      );

      if (!lock) {
        throw new TooManyRequest();
      }

      if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
        await this.saveLifetimeSubscription(knownInvoice);
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
        const subscription = await this.db.subscription.update({
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
        await this.entitlement.upsertFromCloudSubscription(subscription);

        await this.stripe.subscriptions.cancel(
          prevSubscription.stripeSubscriptionId,
          {
            prorate: true,
          }
        );
      }
    } else {
      const subscription = await this.db.subscription.create({
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
      await this.entitlement.upsertFromCloudSubscription(subscription);
    }

    this.event.emit('user.subscription.activated', {
      userId: knownInvoice.userId,
      plan: knownInvoice.lookupKey.plan,
      recurring: SubscriptionRecurring.Lifetime,
    });
  }

  async revokeLifetime(knownInvoice: KnownStripeInvoice) {
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
    await this.entitlement.revokeCloudSubscription({
      targetId: userId,
      plan: lookupKey.plan,
      subscriptionId: subscription.id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    this.event.emit('user.subscription.canceled', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });
  }

  async restoreLifetime(knownInvoice: KnownStripeInvoice) {
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

    if (subscription) {
      const saved = await this.db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.Active,
          canceledAt: null,
          nextBillAt: null,
          start: subscription.start ?? new Date(start * 1000),
          end: null,
        },
      });
      await this.entitlement.upsertFromCloudSubscription(saved);
    } else {
      const saved = await this.db.subscription.create({
        data: {
          targetId: userId,
          stripeSubscriptionId: null,
          ...lookupKey,
          start: new Date(start * 1000),
          end: null,
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
      await this.entitlement.upsertFromCloudSubscription(saved);
    }

    this.event.emit('user.subscription.activated', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });
  }

  private async isPriceAvailable(price: KnownStripePrice) {
    if (price.lookupKey.plan === SubscriptionPlan.Pro) {
      return this.isProPriceAvailable(price);
    }

    if (price.lookupKey.plan === SubscriptionPlan.AI) {
      return this.isAIPriceAvailable(price);
    }

    return false;
  }

  private async isProPriceAvailable({ lookupKey }: KnownStripePrice) {
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return this.config.payment.showLifetimePrice;
    }

    // no special price for monthly plan
    if (lookupKey.recurring === SubscriptionRecurring.Monthly) {
      return true;
    }

    return lookupKey.variant === null;
  }

  private async isAIPriceAvailable({ lookupKey }: KnownStripePrice) {
    // no lifetime price for AI
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return false;
    }

    return lookupKey.variant === null;
  }

  private async strategyStatus(
    customer: UserStripeCustomer
  ): Promise<PriceStrategyStatus> {
    let proSubscribed = false;
    let aiSubscribed = false;

    const subscriptions = await this.stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: 'all',
    });

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

    return { proSubscribed, aiSubscribed };
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
