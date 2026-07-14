import { Injectable } from '@nestjs/common';
import { PrismaClient, Provider, UserStripeCustomer } from '@prisma/client';
import { omit } from 'lodash-es';
import { z } from 'zod';

import {
  EventBus,
  OnEvent,
  SubscriptionAlreadyExists,
  SubscriptionPlanNotFound,
  URLHelper,
} from '../../../base';
import { EntitlementService } from '../../../core/entitlement';
import { Models } from '../../../models';
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
  Invoice,
  Subscription,
  SubscriptionManager,
} from './common';

export const WorkspaceSubscriptionIdentity = z.object({
  plan: z.literal(SubscriptionPlan.Team),
  workspaceId: z.string(),
});

export const WorkspaceSubscriptionCheckoutArgs = z.object({
  plan: z.literal(SubscriptionPlan.Team),
  workspaceId: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

@Injectable()
export class WorkspaceSubscriptionManager extends SubscriptionManager {
  constructor(
    stripeProvider: StripeFactory,
    db: PrismaClient,
    private readonly url: URLHelper,
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly entitlement: EntitlementService
  ) {
    super(stripeProvider, db);
  }

  filterPrices(
    prices: KnownStripePrice[],
    _customer?: UserStripeCustomer
  ): KnownStripePrice[] {
    return prices.filter(
      price => price.lookupKey.plan === SubscriptionPlan.Team
    );
  }

  async checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    args: z.infer<typeof WorkspaceSubscriptionCheckoutArgs>
  ) {
    const subscription = await this.getActiveSubscription({
      plan: SubscriptionPlan.Team,
      workspaceId: args.workspaceId,
    });

    if (subscription) {
      throw new SubscriptionAlreadyExists({ plan: SubscriptionPlan.Team });
    }

    const price = await this.getPrice(lookupKey);

    if (!price) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const customer = await this.getOrCreateCustomer(args.user.id);

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

    const count = await this.models.workspaceUser.count(args.workspaceId);

    return this.stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      line_items: [
        {
          price: price.price.id,
          quantity: count,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          workspaceId: args.workspaceId,
        },
      },
      ...discounts,
      success_url: this.url.safeLink(params.successCallbackLink || '/'),
    });
  }

  async saveStripeSubscription(subscription: KnownStripeSubscription) {
    const { lookupKey, stripeSubscription } = subscription;

    const workspaceId = stripeSubscription.metadata.workspaceId;

    if (!workspaceId) {
      throw new Error(
        'Workspace ID is required in workspace subscription metadata'
      );
    }

    const subscriptionData = this.transformSubscription(subscription);
    const saved = await this.upsertStripeProviderSubscription(
      workspaceId,
      subscription,
      subscriptionData
    );

    if (
      stripeSubscription.status === SubscriptionStatus.Active ||
      stripeSubscription.status === SubscriptionStatus.Trialing
    ) {
      this.event.emit('workspace.subscription.activated', {
        workspaceId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
        quantity: subscriptionData.quantity,
      });
    } else {
      this.event.emit('workspace.subscription.canceled', {
        workspaceId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
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
    lookupKey,
    stripeSubscription,
  }: KnownStripeSubscription) {
    const workspaceId = stripeSubscription.metadata.workspaceId;

    if (!workspaceId) {
      throw new Error(
        'Workspace ID is required in workspace subscription metadata'
      );
    }

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
        targetId: workspaceId,
        plan: lookupKey.plan,
        stripeSubscriptionId: stripeSubscription.id,
      });
      this.event.emit('workspace.subscription.canceled', {
        workspaceId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }
  }

  getSubscription(identity: z.infer<typeof WorkspaceSubscriptionIdentity>) {
    return this.db.providerSubscription
      .findFirst({
        where: {
          targetType: 'workspace',
          targetId: identity.workspaceId,
          plan: identity.plan,
        },
        orderBy: { updatedAt: 'desc' },
      })
      .then(subscription =>
        subscription ? this.transformProviderSubscription(subscription) : null
      );
  }

  getActiveSubscription(
    identity: z.infer<typeof WorkspaceSubscriptionIdentity>
  ) {
    return this.db.providerSubscription
      .findFirst({
        where: {
          targetType: 'workspace',
          targetId: identity.workspaceId,
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

  async saveInvoice(knownInvoice: KnownStripeInvoice): Promise<Invoice> {
    const { metadata, stripeInvoice } = knownInvoice;

    const workspaceId = metadata.workspaceId;

    if (!workspaceId) {
      throw new Error('Workspace ID is required in workspace invoice metadata');
    }

    const invoiceData = await this.transformInvoice(knownInvoice);

    return this.db.invoice.upsert({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      update: omit(invoiceData, 'stripeInvoiceId'),
      create: {
        targetId: workspaceId,
        ...invoiceData,
      },
    });
  }

  @OnEvent('workspace.members.updated')
  async onMembersUpdated({ workspaceId }: Events['workspace.members.updated']) {
    const count = await this.models.workspaceUser.chargedCount(workspaceId);
    const subscription = await this.getActiveSubscription({
      plan: SubscriptionPlan.Team,
      workspaceId,
    });

    if (
      !subscription ||
      !subscription.stripeSubscriptionId ||
      count === subscription.quantity
    ) {
      return;
    }

    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const lookupKey =
      retriveLookupKeyFromStripeSubscription(stripeSubscription);

    await this.stripe.subscriptions.update(stripeSubscription.id, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          quantity: count,
        },
      ],
      payment_behavior: 'pending_if_incomplete',
      proration_behavior:
        lookupKey?.recurring === SubscriptionRecurring.Yearly
          ? 'always_invoice'
          : 'none',
    });

    if (subscription.stripeScheduleId) {
      const schedule = await this.scheduleManager.fromSchedule(
        subscription.stripeScheduleId
      );
      await schedule.updateQuantity(count);
    }
  }

  private async upsertStripeProviderSubscription(
    workspaceId: string,
    known: KnownStripeSubscription,
    subscriptionData: Subscription
  ) {
    const { lookupKey, stripeSubscription } = known;
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
        targetType: 'workspace',
        targetId: workspaceId,
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
        targetType: 'workspace',
        targetId: workspaceId,
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
}
