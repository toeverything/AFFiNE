import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  Provider,
  UserStripeCustomer,
} from '@prisma/client';
import { omit } from 'lodash-es';
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
import { resolveProductMapping, RevenueCatService } from '../revenuecat';
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
  visibleSubscriptionWhere,
} from './common';

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
  private readonly logger = new Logger(UserSubscriptionManager.name);

  constructor(
    stripeProvider: StripeFactory,
    db: PrismaClient,
    private readonly config: Config,
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly mutex: Mutex,
    private readonly entitlement: EntitlementService,
    private readonly revenueCat: RevenueCatService
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

    const active = await this.getVisibleSubscription({
      plan: lookupKey.plan,
      userId: user.id,
    });
    await this.assertNoActiveLocalEntitlement(user.id, lookupKey);
    if (active?.provider === 'revenuecat') {
      throw new ManagedByAppStoreOrPlay();
    }

    if (
      active &&
      !this.canCheckoutWithExistingSubscription(active.recurring, lookupKey)
    ) {
      throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
    }

    const customer = await this.getOrCreateCustomer(user.id);
    const stripeSubscriptions = await this.stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: 'all',
    });
    this.assertNoActiveStripeSubscription(stripeSubscriptions.data, lookupKey);
    await this.assertNoActiveRevenueCatSubscription(user.id, lookupKey);
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

    const subscriptionData = await (async () => {
      if (
        lookupKey.plan === SubscriptionPlan.AI &&
        !(await this.hasUsedTrial(user.id, lookupKey.plan))
      ) {
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
            subscription_data: subscriptionData,
          };

    const session = await this.stripe.checkout.sessions.create({
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

    if (subscriptionData?.trial_period_days) {
      await this.recordTrialUsage({
        userId: user.id,
        provider: Provider.stripe,
        externalRef: session.id,
        metadata: { source: 'checkout_session' },
      });
    }

    return session;
  }

  async getSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    const subscription = await this.db.providerSubscription.findFirst({
      where: {
        targetType: 'user',
        targetId: args.userId,
        plan: args.plan,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return subscription
      ? this.transformProviderSubscription(subscription)
      : null;
  }

  async getActiveSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    const subscription = await this.db.providerSubscription.findFirst({
      where: {
        targetType: 'user',
        targetId: args.userId,
        plan: args.plan,
        ...activeSubscriptionWhere(),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return subscription
      ? this.transformProviderSubscription(subscription)
      : null;
  }

  async getVisibleSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    const subscription = await this.db.providerSubscription.findFirst({
      where: {
        targetType: 'user',
        targetId: args.userId,
        plan: args.plan,
        ...visibleSubscriptionWhere(),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return subscription
      ? this.transformProviderSubscription(subscription)
      : null;
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
    const saved = await this.upsertStripeProviderSubscription(
      subscription,
      subscriptionData
    );

    if (
      lookupKey.plan === SubscriptionPlan.AI &&
      (stripeSubscription.status === SubscriptionStatus.Trialing ||
        stripeSubscription.trial_start ||
        stripeSubscription.trial_end)
    ) {
      await this.recordTrialUsage({
        userId,
        provider: Provider.stripe,
        externalRef: stripeSubscription.id,
        metadata: { source: 'stripe_subscription' },
      });
    }

    const result = this.transformProviderSubscription(saved);
    await this.entitlement.upsertFromCloudSubscription({
      ...result,
      targetId: saved.targetId,
      subscriptionId: saved.id,
    });
    return result;
  }

  async deleteStripeSubscription({
    userId,
    lookupKey,
    stripeSubscription,
  }: KnownStripeSubscription) {
    this.assertUserIdExists(userId);
    const result = await this.db.providerSubscription.updateMany({
      where: {
        provider: Provider.stripe,
        externalSubscriptionId: stripeSubscription.id,
      },
      data: {
        status: SubscriptionStatus.Canceled,
        canceledAt: new Date(),
        periodEnd: new Date(),
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
    const current = await this.db.providerSubscription.findUniqueOrThrow({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.requireStripeSubscriptionId(
            subscription.stripeSubscriptionId
          ),
        },
      },
    });
    await this.db.providerSubscription.update({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.requireStripeSubscriptionId(
            subscription.stripeSubscriptionId
          ),
        },
      },
      data: {
        canceledAt: new Date(),
      },
    });
    const saved = await this.patchProviderSubscriptionMetadata(current.id, {
      variant: subscription.variant,
      stripeScheduleId: subscription.stripeScheduleId,
      nextBillAt: null,
    });
    return this.transformProviderSubscription(saved);
  }

  async resumeSubscription(subscription: Subscription) {
    const current = await this.db.providerSubscription.findUniqueOrThrow({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.requireStripeSubscriptionId(
            subscription.stripeSubscriptionId
          ),
        },
      },
    });
    await this.db.providerSubscription.update({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.requireStripeSubscriptionId(
            subscription.stripeSubscriptionId
          ),
        },
      },
      data: {
        canceledAt: null,
      },
    });
    const saved = await this.patchProviderSubscriptionMetadata(current.id, {
      variant: subscription.variant,
      stripeScheduleId: subscription.stripeScheduleId,
      nextBillAt: subscription.end?.toISOString() ?? null,
    });
    return this.transformProviderSubscription(saved);
  }

  async updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ) {
    const saved = await this.db.providerSubscription.update({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.requireStripeSubscriptionId(
            subscription.stripeSubscriptionId
          ),
        },
      },
      data: { recurring },
    });
    return this.transformProviderSubscription(saved);
  }

  async saveInvoice(knownInvoice: KnownStripeInvoice) {
    const { userId, lookupKey, stripeInvoice } = knownInvoice;
    this.assertUserIdExists(userId);

    const invoiceData = await this.transformInvoice(knownInvoice);
    await this.upsertStripePaymentEvent(knownInvoice, invoiceData);

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

    const prevSubscription = await this.db.providerSubscription.findFirst({
      where: {
        provider: Provider.stripe,
        targetType: 'user',
        targetId: knownInvoice.userId,
        plan: SubscriptionPlan.Pro,
        recurring: { not: SubscriptionRecurring.Lifetime },
        ...activeSubscriptionWhere(),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (prevSubscription?.externalSubscriptionId) {
      await this.stripe.subscriptions.cancel(
        prevSubscription.externalSubscriptionId,
        { prorate: true },
        {
          idempotencyKey: `lifetime:${knownInvoice.stripeInvoice.id}:cancel:${prevSubscription.id}`,
        }
      );
      const now = new Date();
      await this.db.providerSubscription.update({
        where: { id: prevSubscription.id },
        data: {
          status: SubscriptionStatus.Canceled,
          canceledAt: now,
          periodEnd: now,
        },
      });
      await this.patchProviderSubscriptionMetadata(prevSubscription.id, {
        nextBillAt: null,
      });
      await this.entitlement.revokeCloudSubscription({
        targetId: knownInvoice.userId,
        plan: prevSubscription.plan,
        subscriptionId: prevSubscription.id,
        stripeSubscriptionId: prevSubscription.externalSubscriptionId,
      });
    }

    const saved = await this.upsertLifetimeProviderSubscription(knownInvoice);
    await this.entitlement.upsertFromCloudSubscription({
      ...this.transformProviderSubscription(saved),
      targetId: saved.targetId,
      subscriptionId: saved.id,
      stripeSubscriptionId: saved.externalSubscriptionId,
    });

    this.event.emit('user.subscription.activated', {
      userId: knownInvoice.userId,
      plan: knownInvoice.lookupKey.plan,
      recurring: SubscriptionRecurring.Lifetime,
    });
  }

  async revokeLifetime(knownInvoice: KnownStripeInvoice) {
    this.assertUserIdExists(knownInvoice.userId);
    const { userId, lookupKey } = knownInvoice;

    const subscription = await this.db.providerSubscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: this.lifetimeExternalId(knownInvoice),
        },
      },
    });

    if (!subscription) {
      return;
    }

    await this.db.providerSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.Canceled,
        canceledAt: new Date(),
      },
    });
    const saved = await this.patchProviderSubscriptionMetadata(
      subscription.id,
      { nextBillAt: null }
    );
    await this.entitlement.revokeCloudSubscription({
      targetId: userId,
      plan: lookupKey.plan,
      subscriptionId: saved.id,
      stripeSubscriptionId: saved.externalSubscriptionId,
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

    const start =
      stripeInvoice.lines.data[0]?.period?.start ??
      (typeof stripeInvoice.created === 'number'
        ? stripeInvoice.created
        : Date.now() / 1000);

    const saved = await this.upsertLifetimeProviderSubscription(
      knownInvoice,
      new Date(start * 1000)
    );
    await this.entitlement.upsertFromCloudSubscription({
      ...this.transformProviderSubscription(saved),
      targetId: saved.targetId,
      subscriptionId: saved.id,
      stripeSubscriptionId: saved.externalSubscriptionId,
    });

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

  private async assertNoActiveLocalEntitlement(
    userId: string,
    lookupKey: LookupKey
  ) {
    const entitlements = await this.entitlement.getActiveEntitlements(
      'user',
      userId
    );
    const existing = entitlements.find(entitlement => {
      if (lookupKey.plan === SubscriptionPlan.Pro) {
        return (
          entitlement.plan === 'pro' || entitlement.plan === 'lifetime_pro'
        );
      }
      if (lookupKey.plan === SubscriptionPlan.AI) {
        return entitlement.plan === 'ai';
      }
      return false;
    });
    if (!existing) {
      return;
    }

    const metadata = existing.metadata as { provider?: string | null };
    if (metadata.provider === Provider.revenuecat) {
      throw new ManagedByAppStoreOrPlay();
    }
    if (
      !this.canCheckoutWithExistingSubscription(
        (existing.metadata as { recurring?: string | null }).recurring ??
          SubscriptionRecurring.Monthly,
        lookupKey
      )
    ) {
      throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
    }
  }

  private async hasUsedTrial(userId: string, plan: SubscriptionPlan) {
    return !!(await this.db.subscriptionTrialUsage.findUnique({
      where: {
        targetType_targetId_plan: {
          targetType: 'user',
          targetId: userId,
          plan,
        },
      },
      select: { id: true },
    }));
  }

  private async recordTrialUsage(input: {
    userId: string;
    provider: Provider;
    externalRef: string | null;
    metadata: Record<string, unknown>;
  }) {
    await this.db.subscriptionTrialUsage.upsert({
      where: {
        targetType_targetId_plan: {
          targetType: 'user',
          targetId: input.userId,
          plan: SubscriptionPlan.AI,
        },
      },
      update: {
        provider: input.provider,
        externalRef: input.externalRef,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      create: {
        targetType: 'user',
        targetId: input.userId,
        plan: SubscriptionPlan.AI,
        provider: input.provider,
        externalRef: input.externalRef,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
    });
  }

  private async upsertStripeProviderSubscription(
    known: KnownStripeSubscription,
    subscriptionData: Subscription
  ) {
    const { userId, lookupKey, stripeSubscription } = known;
    this.assertUserIdExists(userId);
    const price = stripeSubscription.items.data[0]?.price;
    const metadata = {
      ...known.metadata,
      variant: lookupKey.variant,
      stripeScheduleId: subscriptionData.stripeScheduleId,
      nextBillAt: subscriptionData.nextBillAt?.toISOString() ?? null,
    };

    return this.db.providerSubscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: stripeSubscription.id,
        },
      },
      update: {
        targetType: 'user',
        targetId: userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
        status: stripeSubscription.status,
        externalCustomerId:
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer.id,
        externalProductId:
          typeof price?.product === 'string'
            ? price.product
            : price?.product?.id,
        externalPriceId: price?.id,
        currency: price?.currency,
        amount: price?.unit_amount ?? null,
        quantity: known.quantity,
        periodStart: subscriptionData.start,
        periodEnd: subscriptionData.end,
        trialStart: subscriptionData.trialStart,
        trialEnd: subscriptionData.trialEnd,
        canceledAt: subscriptionData.canceledAt,
        metadata,
      },
      create: {
        provider: Provider.stripe,
        targetType: 'user',
        targetId: userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
        status: stripeSubscription.status,
        externalCustomerId:
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer.id,
        externalSubscriptionId: stripeSubscription.id,
        externalProductId:
          typeof price?.product === 'string'
            ? price.product
            : price?.product?.id,
        externalPriceId: price?.id,
        currency: price?.currency,
        amount: price?.unit_amount ?? null,
        quantity: known.quantity,
        periodStart: subscriptionData.start,
        periodEnd: subscriptionData.end,
        trialStart: subscriptionData.trialStart,
        trialEnd: subscriptionData.trialEnd,
        canceledAt: subscriptionData.canceledAt,
        metadata,
      },
    });
  }

  private lifetimeExternalId(knownInvoice: KnownStripeInvoice) {
    return `stripe_invoice:${knownInvoice.stripeInvoice.id}`;
  }

  private upsertLifetimeProviderSubscription(
    knownInvoice: KnownStripeInvoice,
    start = new Date()
  ) {
    const { userId, lookupKey } = knownInvoice;
    this.assertUserIdExists(userId);
    const externalSubscriptionId = this.lifetimeExternalId(knownInvoice);
    const metadata = {
      ...knownInvoice.metadata,
      variant: lookupKey.variant,
      stripeScheduleId: null,
      nextBillAt: null,
      lifetimeInvoiceId: knownInvoice.stripeInvoice.id,
    };

    return this.db.providerSubscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId,
        },
      },
      update: {
        targetType: 'user',
        targetId: userId,
        plan: lookupKey.plan,
        recurring: SubscriptionRecurring.Lifetime,
        status: SubscriptionStatus.Active,
        quantity: 1,
        periodStart: start,
        periodEnd: null,
        canceledAt: null,
        metadata,
      },
      create: {
        provider: Provider.stripe,
        targetType: 'user',
        targetId: userId,
        plan: lookupKey.plan,
        recurring: SubscriptionRecurring.Lifetime,
        status: SubscriptionStatus.Active,
        externalSubscriptionId,
        quantity: 1,
        periodStart: start,
        periodEnd: null,
        metadata,
      },
    });
  }

  private async upsertStripePaymentEvent(
    known: KnownStripeInvoice,
    invoiceData: Awaited<
      ReturnType<UserSubscriptionManager['transformInvoice']>
    >
  ) {
    const { userId, lookupKey, stripeInvoice } = known;
    this.assertUserIdExists(userId);

    await this.db.paymentEvent.upsert({
      where: {
        provider_externalEventId: {
          provider: Provider.stripe,
          externalEventId: `stripe_invoice:${stripeInvoice.id}`,
        },
      },
      update: {
        eventType: `invoice.${invoiceData.status}`,
        targetType: 'user',
        targetId: userId,
        externalInvoiceId: stripeInvoice.id,
        plan: lookupKey.plan,
        amount: invoiceData.amount,
        currency: invoiceData.currency,
        occurredAt:
          typeof stripeInvoice.created === 'number'
            ? new Date(stripeInvoice.created * 1000)
            : undefined,
        processingStatus: 'processed',
        processedAt: new Date(),
        metadata: known.metadata,
      },
      create: {
        provider: Provider.stripe,
        eventType: `invoice.${invoiceData.status}`,
        externalEventId: `stripe_invoice:${stripeInvoice.id}`,
        targetType: 'user',
        targetId: userId,
        externalInvoiceId: stripeInvoice.id,
        plan: lookupKey.plan,
        amount: invoiceData.amount,
        currency: invoiceData.currency,
        occurredAt:
          typeof stripeInvoice.created === 'number'
            ? new Date(stripeInvoice.created * 1000)
            : undefined,
        processingStatus: 'processed',
        processedAt: new Date(),
        metadata: known.metadata,
      },
    });
  }

  private isCurrentStripeSubscription(subscription: Stripe.Subscription) {
    return [
      SubscriptionStatus.Active,
      SubscriptionStatus.Trialing,
      SubscriptionStatus.PastDue,
    ].includes(subscription.status as SubscriptionStatus);
  }

  private canCheckoutWithExistingSubscription(
    existingRecurring: string,
    lookupKey: LookupKey
  ) {
    return (
      existingRecurring !== SubscriptionRecurring.Lifetime &&
      lookupKey.recurring === SubscriptionRecurring.Lifetime
    );
  }

  private assertNoActiveStripeSubscription(
    subscriptions: Stripe.Subscription[],
    lookupKey: LookupKey
  ) {
    for (const subscription of subscriptions) {
      if (!this.isCurrentStripeSubscription(subscription)) {
        continue;
      }

      const activeLookupKey =
        retriveLookupKeyFromStripeSubscription(subscription);
      if (
        activeLookupKey?.plan === lookupKey.plan &&
        !this.canCheckoutWithExistingSubscription(
          activeLookupKey.recurring,
          lookupKey
        )
      ) {
        throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
      }
    }
  }

  private async assertNoActiveRevenueCatSubscription(
    userId: string,
    lookupKey: LookupKey
  ) {
    if (!this.config.payment.revenuecat?.enabled) {
      return;
    }

    let subscriptions: Awaited<
      ReturnType<RevenueCatService['getSubscriptions']>
    >;
    try {
      subscriptions = await this.revenueCat.getSubscriptions(userId);
    } catch (e) {
      this.logger.warn(
        `Failed to fetch RevenueCat subscriptions for ${userId}`,
        e
      );
      return;
    }

    const productMap = this.config.payment.revenuecat?.productMap;
    if (
      subscriptions?.some(subscription => {
        if (!subscription.isActive) return false;
        const mapping = resolveProductMapping(subscription, productMap);
        return mapping?.plan === lookupKey.plan;
      })
    ) {
      throw new ManagedByAppStoreOrPlay();
    }
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
    const subscriptions = await this.db.providerSubscription.findMany({
      where: {
        provider: Provider.stripe,
        targetType: 'user',
        targetId: id,
        recurring: { not: SubscriptionRecurring.Lifetime },
        externalSubscriptionId: { not: null },
        ...activeSubscriptionWhere(),
      },
    });

    await Promise.all(
      subscriptions.map(subscription =>
        this.stripe.subscriptions.cancel(
          this.requireStripeSubscriptionId(subscription.externalSubscriptionId)
        )
      )
    );
    await this.db.providerSubscription.deleteMany({
      where: { targetType: 'user', targetId: id },
    });
  }
}
