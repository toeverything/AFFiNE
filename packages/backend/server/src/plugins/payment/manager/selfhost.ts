import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  Provider,
  UserStripeCustomer,
} from '@prisma/client';
import { z } from 'zod';

import { SubscriptionPlanNotFound, URLHelper } from '../../../base';
import { Mailer } from '../../../core/mail';
import { StripeFactory } from '../stripe';
import {
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';
import {
  activeSubscriptionWhere,
  CheckoutParams,
  Invoice,
  Subscription,
  SubscriptionManager,
} from './common';

export const SelfhostTeamCheckoutArgs = z.object({
  quantity: z.number(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
    })
    .optional()
    .nullable(),
});

export const SelfhostTeamSubscriptionIdentity = z.object({
  plan: z.literal(SubscriptionPlan.SelfHostedTeam),
  key: z.string(),
});

@Injectable()
export class SelfhostTeamSubscriptionManager extends SubscriptionManager {
  constructor(
    stripeProvider: StripeFactory,
    db: PrismaClient,
    private readonly url: URLHelper,
    private readonly mailer: Mailer
  ) {
    super(stripeProvider, db);
  }

  filterPrices(
    prices: KnownStripePrice[],
    _customer?: UserStripeCustomer
  ): KnownStripePrice[] {
    return prices.filter(
      price => price.lookupKey.plan === SubscriptionPlan.SelfHostedTeam
    );
  }

  async checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    args: z.infer<typeof SelfhostTeamCheckoutArgs>
  ) {
    const { quantity } = args;

    const price = await this.getPrice(lookupKey);

    if (!price) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const discounts = await (async () => {
      if (params.coupon) {
        const couponId = await this.getCouponFromPromotionCode(params.coupon);
        if (couponId) {
          return { discounts: [{ coupon: couponId }] };
        }
      }

      return { allow_promotion_codes: true };
    })();

    let successUrl = this.url.safeLink(params.successCallbackLink || '/');
    // stripe only accept unescaped '{CHECKOUT_SESSION_ID}' as query
    successUrl = this.url.addSimpleQuery(
      successUrl,
      'session_id',
      '{CHECKOUT_SESSION_ID}',
      false
    );

    return this.stripe.checkout.sessions.create({
      line_items: [
        {
          price: price.price.id,
          quantity,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
          },
        },
      ],
      tax_id_collection: {
        enabled: true,
      },
      ...discounts,
      mode: 'subscription',
      success_url: successUrl,
    });
  }

  async saveStripeSubscription(subscription: KnownStripeSubscription) {
    const { stripeSubscription, userEmail } = subscription;
    const subscriptionData = this.transformSubscription(subscription);
    const existingSubscription = await this.db.providerSubscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: stripeSubscription.id,
        },
      },
    });
    const key = existingSubscription?.targetId ?? randomUUID();
    const saved = await this.db.$transaction(async db => {
      const saved = await this.upsertStripeProviderSubscription(
        key,
        subscription,
        subscriptionData,
        db
      );
      await db.license.upsert({
        where: { key: saved.targetId },
        update: {},
        create: { key: saved.targetId },
      });
      return saved;
    });

    if (!existingSubscription) {
      await this.mailer.send({
        name: 'TeamLicense',
        to: userEmail,
        props: { license: saved.targetId },
        metadata: {
          dedupeKey: `selfhost-license:${saved.targetId}`,
          source: { trusted: false },
        },
      });
    }

    return this.transformProviderSubscription(saved);
  }

  async deleteStripeSubscription({
    stripeSubscription,
  }: KnownStripeSubscription) {
    await this.db.providerSubscription.updateMany({
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
  }

  async getSubscription(
    identity: z.infer<typeof SelfhostTeamSubscriptionIdentity>
  ) {
    const subscription = await this.db.providerSubscription.findFirst({
      where: {
        provider: Provider.stripe,
        targetType: 'instance',
        targetId: identity.key,
        plan: identity.plan,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return subscription
      ? this.transformProviderSubscription(subscription)
      : null;
  }

  getActiveSubscription(
    identity: z.infer<typeof SelfhostTeamSubscriptionIdentity>
  ) {
    return this.db.providerSubscription
      .findFirst({
        where: {
          provider: Provider.stripe,
          targetType: 'instance',
          targetId: identity.key,
          plan: identity.plan,
          ...activeSubscriptionWhere(),
        },
        orderBy: { updatedAt: 'desc' },
      })
      .then(subscription =>
        subscription ? this.transformProviderSubscription(subscription) : null
      );
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
      where: { id: current.id },
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
      where: { id: current.id },
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

  updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ) {
    return this.db.providerSubscription
      .update({
        where: {
          provider_externalSubscriptionId: {
            provider: Provider.stripe,
            externalSubscriptionId: this.requireStripeSubscriptionId(
              subscription.stripeSubscriptionId
            ),
          },
        },
        data: { recurring },
      })
      .then(subscription => this.transformProviderSubscription(subscription));
  }

  async saveInvoice(knownInvoice: KnownStripeInvoice): Promise<Invoice> {
    const invoiceData = await this.transformInvoice(knownInvoice);

    return invoiceData;
  }

  private async upsertStripeProviderSubscription(
    targetId: string,
    known: KnownStripeSubscription,
    subscriptionData: Subscription,
    db: Prisma.TransactionClient = this.db
  ) {
    const { lookupKey, stripeSubscription } = known;
    const price = stripeSubscription.items.data[0]?.price;

    return db.providerSubscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: Provider.stripe,
          externalSubscriptionId: stripeSubscription.id,
        },
      },
      update: {
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
        metadata: {
          ...known.metadata,
          variant: subscriptionData.variant,
          stripeScheduleId: subscriptionData.stripeScheduleId,
          nextBillAt: subscriptionData.nextBillAt?.toISOString() ?? null,
        },
      },
      create: {
        provider: Provider.stripe,
        targetType: 'instance',
        targetId,
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
        metadata: {
          ...known.metadata,
          variant: subscriptionData.variant,
          stripeScheduleId: subscriptionData.stripeScheduleId,
          nextBillAt: subscriptionData.nextBillAt?.toISOString() ?? null,
        },
      },
    });
  }
}
